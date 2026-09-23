"use server";

import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
}

export async function getNotificationsAction(): Promise<{ notifications: Notification[]; unread: number }> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  // Single roundtrip: unread first, so the visible page carries the exact unread count.
  const { data } = await admin
    .from("notifications")
    .select("*")
    .eq("user_id", viewer.id)
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(50);
  const notes = (data ?? []) as Notification[];
  return { notifications: notes, unread: notes.filter((n) => !n.read_at).length };
}

export async function markNotificationsAction(ids: string[] | "all"): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  if (ids === "all") {
    await admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", viewer.id).is("read_at", null);
    return;
  }
  if (!Array.isArray(ids) || !ids.length || ids.length > 50) throw new Error("Invalid request.");
  await admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", viewer.id).in("id", ids);
}
