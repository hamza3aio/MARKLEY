import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { myClassIds } from "@/lib/classes";

const TITLES: Record<string, string> = {
  admin: "Admin dashboard",
  teacher: "Teacher dashboard",
  assistant: "Assistant dashboard",
  student: "Student dashboard",
  parent: "Parent dashboard",
};

export default async function DashboardPage() {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: logs } = await admin
    .from("activity_logs")
    .select("action,created_at")
    .eq("actor_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const classIds = await myClassIds(admin, viewer);
  let upcoming: { id: string; title: string; due_date: string; class_name: string }[] = [];
  let unread = 0;
  let myPoints = 0;
  if (classIds.length) {
    const { data: classes } = await admin.from("classes").select("id,name").in("id", classIds);
    const names = Object.fromEntries(((classes ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    const { data: asgs } = await admin
      .from("assignments")
      .select("id,title,due_date,class_id")
      .in("class_id", classIds)
      .is("deleted_at", null)
      .eq("status", "published")
      .not("due_date", "is", null)
      .gte("due_date", new Date().toISOString())
      .order("due_date", { ascending: true })
      .limit(5);
    upcoming = ((asgs ?? []) as { id: string; title: string; due_date: string; class_id: string }[]).map((a) => ({
      id: a.id, title: a.title, due_date: a.due_date, class_name: names[a.class_id] ?? "",
    }));
    const { data: allPts } = await admin.from("points").select("points").eq("user_id", viewer.id).limit(2000);
    myPoints = ((allPts ?? []) as { points: number }[]).reduce((n, r) => n + Number(r.points), 0);
  }
  const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", viewer.id).is("read_at", null);
  unread = count ?? 0;

  const stats = [
    { n: classIds.length, l: classIds.length === 1 ? "Class" : "Classes", href: "/dashboard/classes" },
    { n: unread, l: "Unread notifications", href: "/dashboard" },
    { n: myPoints, l: "Total points", href: "/dashboard/classes" },
  ];

  return (
    <>
      <section className="card">
        <h1 style={{ margin: "0 0 4px" }}>{TITLES[viewer.profile.role] ?? "Dashboard"}</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Signed in as {viewer.profile.email} · status <span className="badge success">{viewer.profile.status}</span>
        </p>
      </section>
      <section className="grid cols-3">
        {stats.map((s) => (
          <Link key={s.l} href={s.href} className="card stat" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="num">{s.n}</div>
            <div className="lbl">{s.l}</div>
          </Link>
        ))}
      </section>
      <section className="grid cols-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Upcoming deadlines</h3>
          {upcoming.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              {upcoming.map((a) => (
                <li key={a.id}>
                  <Link href={`/dashboard/assignments/${a.id}`}>{a.title}</Link>
                  <br /><small style={{ color: "var(--muted)" }}>{a.class_name} · {new Date(a.due_date).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--muted)" }}>Nothing due soon.</p>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>My permissions (server-verified)</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {viewer.permissions.length
              ? viewer.permissions.map((p) => <span key={p} className="badge">{p}</span>)
              : <span style={{ color: "var(--muted)" }}>No extra permissions</span>}
          </div>
          <h3 style={{ marginBottom: 4 }}>Recent activity</h3>
          {(logs ?? []).length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              {(logs ?? []).map((l, i) => (
                <li key={i}>{(l as { action: string }).action} · {new Date((l as { created_at: string }).created_at).toLocaleString()}</li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--muted)" }}>No activity yet.</p>
          )}
        </div>
      </section>
    </>
  );
}
