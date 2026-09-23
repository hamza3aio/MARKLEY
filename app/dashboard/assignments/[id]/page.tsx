import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassAccess } from "@/lib/classes";
import { PURPOSE, signedDownload } from "@/lib/files";
import { SubmitForm } from "./submit-form";
import { AttachForm, DeleteAssignmentButton } from "./manage";
import { Gradebook } from "./gradebook";

export default async function AssignmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: asg } = await admin.from("assignments").select("*").eq("id", id).is("deleted_at", null).single();
  if (!asg) notFound();
  const access = await getClassAccess(admin, viewer, asg.class_id as string);
  if (!access) notFound();
  const member = access.member;
  const staff =
    isAdmin(viewer) || access.cls.teacher_id === viewer.id ||
    (!!member && (member.role_in_class === "teacher" || member.role_in_class === "assistant"));
  if (!staff && asg.status !== "published") notFound();

  const { data: atts } = await admin.from("assignment_attachments").select("*").eq("assignment_id", id).order("created_at", { ascending: true });
  interface Att { id: string; name: string; storage_path: string; }
  const attachments = await Promise.all(((atts ?? []) as Att[]).map(async (a) => ({
    id: a.id, name: a.name,
    downloadUrl: await signedDownload(admin, PURPOSE.assignment.bucket, a.storage_path),
  })));

  let submissionCount = 0;
  let mySubmission: Record<string, unknown> | null = null;
  let myFiles: Record<string, unknown>[] = [];
  let myGrade: Record<string, unknown> | null = null;
  let submissions: Record<string, unknown>[] = [];
  if (staff) {
    const [{ data: subs }, { data: profiles }] = await (async () => {
      const s = await admin.from("assignment_submissions").select("*").eq("assignment_id", id).order("submitted_at", { ascending: false }).limit(200);
      const sids = [...new Set(((s.data ?? []) as Record<string, unknown>[]).map((x) => x.student_id as string))];
      const p = sids.length
        ? await admin.from("profiles").select("id,full_name,email").in("id", sids)
        : { data: [] as Record<string, unknown>[] };
      return [s, p] as const;
    })();
    submissionCount = (subs ?? []).length;
    const profs: Record<string, { full_name?: string; email?: string }> = Object.fromEntries(
      ((profiles ?? []) as Record<string, unknown>[]).map((p) => [p.id as string, p as never])
    );
    submissions = await Promise.all(((subs ?? []) as Record<string, unknown>[]).map(async (s) => {
      const { data: files } = await admin.from("submission_files").select("*").eq("submission_id", s.id as string);
      const withUrls = await Promise.all(((files ?? []) as Record<string, unknown>[]).map(async (f) => ({
        ...(f as object),
        downloadUrl: await signedDownload(admin, PURPOSE.submission.bucket, (f as { storage_path: string }).storage_path),
      })));
      return { ...(s as object), student: profs[s.student_id as string] ?? null, files: withUrls };
    }));
  } else if (member?.role_in_class === "student") {
    const [mineRes, gradeRes] = await Promise.all([
      admin.from("assignment_submissions").select("*").eq("assignment_id", id).eq("student_id", viewer.id).single(),
      admin.from("grades").select("score,max_points,feedback").eq("assignment_id", id).eq("student_id", viewer.id).single(),
    ]);
    mySubmission = (mineRes.data as Record<string, unknown> | null) ?? null;
    myGrade = (gradeRes.data as Record<string, unknown> | null) ?? null;
    if (mySubmission) {
      const { data: files } = await admin.from("submission_files").select("*").eq("submission_id", mySubmission.id as string);
      myFiles = (files ?? []) as Record<string, unknown>[];
    }
  }

  const due = asg.due_date ? new Date(asg.due_date as string).toLocaleString() : "No due date";
  const manager = isAdmin(viewer) || access.cls.teacher_id === viewer.id;

  return (
    <>
      <section className="card">
        <Link className="btn ghost" href="/dashboard/assignments">← Assignments</Link>
        <h2 style={{ margin: "8px 0 4px" }}>{asg.title as string}</h2>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          {access.cls.name} · <span className="badge">{asg.type as string}</span> <span className="badge">{asg.status as string}</span> · Due: {due} · {String(asg.max_points)} pts{asg.allow_late ? " · late allowed" : ""}
        </p>
        {asg.description ? <p>{asg.description as string}</p> : null}
        {asg.instructions ? <><h4>Instructions</h4><p>{asg.instructions as string}</p></> : null}
        {manager ? <div style={{ marginTop: 8 }}><DeleteAssignmentButton assignmentId={id} classId={asg.class_id as string} /></div> : null}
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Attachments ({attachments.length})</h3>
        {attachments.length ? (
          <div className="table-wrap"><table><tbody>
            {attachments.map((t) => (
              <tr key={t.id as string}>
                <td>{t.name as string}</td>
                <td>{(t.downloadUrl as string | null) ? <a className="btn secondary" href={t.downloadUrl as string} target="_blank" rel="noopener">Open</a> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <div className="empty">No attachments.</div>}
        {manager ? <AttachForm assignmentId={id} classId={asg.class_id as string} /> : null}
      </section>
      {staff ? (
        <>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Submissions ({submissionCount})</h3>
          {submissions.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Student</th><th>Status</th><th>Answer</th><th>Files</th><th>Submitted</th></tr></thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id as string}>
                    <td>{((s.student ?? {}) as { full_name?: string; email?: string }).full_name || ((s.student ?? {}) as { email?: string }).email || "—"}</td>
                    <td><span className="badge">{s.status as string}</span></td>
                    <td>{String(s.text_content ?? "").slice(0, 160)}</td>
                    <td>{((s.files ?? []) as Record<string, unknown>[]).map((f) => (f.downloadUrl ? <a key={f.id as string} href={f.downloadUrl as string} target="_blank" rel="noopener">{f.name as string}</a> : <span key={f.id as string}>{f.name as string}</span>)).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, <br key={`b${i}`} />, el] : [el]), [])}</td>
                    <td>{new Date(s.submitted_at as string).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <div className="empty">No submissions yet.</div>}
        </section>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Gradebook</h3>
          <Gradebook
            assignmentId={id}
            maxPoints={asg.max_points as number}
            students={submissions.map((s) => ({
              student_id: s.student_id as string,
              studentName: ((((s.student ?? {}) as { full_name?: string }).full_name) || ((s.student ?? {}) as { email?: string }).email || '---') as string,
              status: s.status as string,
            }))}
          />
        </section>
        </>
      ) : member?.role_in_class === "student" ? (
        <SubmitForm
          assignmentId={id}
          classId={asg.class_id as string}
          type={asg.type as string}
          existing={mySubmission ? { status: mySubmission.status as string, submitted_at: mySubmission.submitted_at as string, text_content: mySubmission.text_content as string, files: myFiles.map((f) => ({ name: f.name as string })) } : null}
          grade={myGrade ? { score: String(myGrade.score), max_points: String(myGrade.max_points), feedback: myGrade.feedback as string } : null}
        />
      ) : null}
    </>
  );
}
