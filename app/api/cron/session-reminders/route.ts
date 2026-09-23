import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers, sendEmail } from "@/lib/email";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const admin = createAdminClient();
  const start = new Date(Date.now() + 23 * 3600000).toISOString();
  const end = new Date(Date.now() + 25 * 3600000).toISOString();
  const { data: sessions } = await admin.from("sessions").select("id,class_id,title,start_at").is("deleted_at", null).gte("start_at", start).lte("start_at", end).limit(200);
  let notified = 0;
  for (const s of ((sessions ?? []) as { id: string; class_id: string; title: string; start_at: string }[])) {
    const { data: members } = await admin.from("class_members").select("user_id").eq("class_id", s.class_id).eq("status", "active");
    const ids = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id);
    notified += await notifyUsers(admin, {
      user_ids: ids, type: "session_reminder", title: `Starting soon: ${s.title}`,
      body: new Date(s.start_at).toLocaleString(), link: `/dashboard/classes/${s.class_id}`,
    });
    sendEmail(admin, ids, `Reminder: ${s.title}`, `Session starting soon: ${s.title}`, `<p><b>${s.title}</b> — ${new Date(s.start_at).toLocaleString()}</p>`).catch(() => {});
  }
  return NextResponse.json({ ok: true, notified });
}
