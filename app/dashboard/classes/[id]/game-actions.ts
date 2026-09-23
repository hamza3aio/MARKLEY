"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassAccess } from "@/lib/classes";
import { logActivity } from "@/lib/activity";
import { classTotal, maybeAchievements, seedDefaults } from "@/lib/points-engine";

async function managerOf(classId: string) {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: cls } = await admin.from("classes").select("id,teacher_id").eq("id", classId).single();
  if (!cls) throw new Error("Class not found.");
  if (!isAdmin(viewer) && cls.teacher_id !== viewer.id) {
    throw new Error("Only the class teacher can manage gamification.");
  }
  return { viewer, admin };
}

export interface GameData {
  rules: { id: string; code: string; name: string; points: number; active: boolean }[];
  leaderboard: { enabled: boolean; show_names: boolean; entries: { rank: number; total: number; mine: boolean; name: string }[] };
  catalogue: { code: string; name: string; description: string; icon: string }[];
  earned: Record<string, number>;
  myTotal: number | null;
  myRank: number | null;
  students: { user_id: string; name: string }[];
  lbEnabled: boolean;
  lbNames: boolean;
}

export async function getGameData(classId: string): Promise<GameData> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const access = await getClassAccess(admin, viewer, classId);
  if (!access) throw new Error("Class not found.");
  const staffView = isAdmin(viewer) || access.cls.teacher_id === viewer.id ||
    (access.member && (access.member.role_in_class === "teacher" || access.member.role_in_class === "assistant"));

  const [rulesRes, studentsRes, catalogueRes, linksRes] = await Promise.all([
    admin.from("point_rules").select("*").eq("class_id", classId).order("created_at", { ascending: true }),
    admin.from("class_members").select("user_id").eq("class_id", classId).eq("role_in_class", "student").eq("status", "active").limit(500),
    admin.from("achievements").select("*"),
    viewer.profile.role === "parent"
      ? admin.from("parent_student_links").select("student_id").eq("parent_id", viewer.id).eq("status", "active")
      : Promise.resolve({ data: [] as { student_id: string }[] }),
  ]);
  let rules = (rulesRes.data ?? []) as GameData["rules"];
  if (!rules.length && (isAdmin(viewer) || access.cls.teacher_id === viewer.id)) {
    // Self-heal classes created before default rules existed (or outside the UI).
    const { seedDefaults } = await import("@/lib/points-engine");
    await seedDefaults(admin, classId, viewer.id);
    const { data: reseeded } = await admin.from("point_rules").select("*").eq("class_id", classId).order("created_at", { ascending: true });
    rules = (reseeded ?? []) as GameData["rules"];
  }
  const sids = ((studentsRes.data ?? []) as { user_id: string }[]).map((s) => s.user_id);
  const linked = ((linksRes.data ?? []) as { student_id: string }[]).map((l) => l.student_id);
  const scopeIds = staffView ? sids : viewer.profile.role === "parent" ? linked : [viewer.id];

  const [pointRowsRes, profsRes, earnedRes] = await Promise.all([
    sids.length
      ? admin.from("points").select("user_id,points").eq("class_id", classId).in("user_id", sids).limit(5000)
      : Promise.resolve({ data: [] as { user_id: string; points: number }[] }),
    sids.length
      ? admin.from("profiles").select("id,full_name").in("id", sids)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    scopeIds.length
      ? admin.from("student_achievements").select("achievement_code,user_id").eq("class_id", classId).in("user_id", scopeIds).limit(500)
      : Promise.resolve({ data: [] as { achievement_code: string; user_id: string }[] }),
  ]);
  const totals: Record<string, number> = {};
  ((pointRowsRes.data ?? []) as { user_id: string; points: number }[]).forEach((r) => { totals[r.user_id] = (totals[r.user_id] || 0) + Number(r.points); });
  const names = Object.fromEntries(
    ((profsRes.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name || "Student"])
  );
  const ranked = sids.map((sid) => ({ user_id: sid, total: totals[sid] || 0 })).sort((a, b) => b.total - a.total);
  const showNames = staffView || access.cls.leaderboard_show_names;
  const entries = ranked.map((r, i) => {
    const mine = r.user_id === viewer.id || linked.includes(r.user_id);
    return { rank: i + 1, total: r.total, mine, name: showNames || mine ? names[r.user_id] || "Student" : `Student ${i + 1}` };
  });
  const mineEntry = entries.find((e) => e.mine && ranked.find((r) => r.user_id === viewer.id && r.total === e.total));

  const counts: Record<string, number> = {};
  ((earnedRes.data ?? []) as { achievement_code: string }[]).forEach((e) => { counts[e.achievement_code] = (counts[e.achievement_code] || 0) + 1; });
  const catalogue = catalogueRes.data ?? [];

  return {
    rules: (staffView ? (rules ?? []) : (rules ?? []).filter((r) => (r as { active: boolean }).active)) as GameData["rules"],
    leaderboard: { enabled: !!access.cls.leaderboard_enabled, show_names: !!access.cls.leaderboard_show_names, entries: entries.slice(0, 20) },
    catalogue: (catalogue ?? []) as GameData["catalogue"],
    earned: counts,
    myTotal: mineEntry?.total ?? (viewer.profile.role === "student" ? totals[viewer.id] ?? 0 : null),
    myRank: mineEntry?.rank ?? null,
    students: sids.map((sid) => ({ user_id: sid, name: names[sid] || "Student" })),
    lbEnabled: !!access.cls.leaderboard_enabled,
    lbNames: access.cls.leaderboard_show_names !== false,
  };
}

export async function createRuleAction(classId: string, input: { code: string; name: string; points: number }): Promise<void> {
  const { viewer, admin } = await managerOf(classId);
  if (!/^[a-z0-9_]{2,40}$/.test(input.code.trim())) throw new Error("Code must be 2-40 lowercase letters, numbers or _.");
  if (input.name.trim().length < 2 || input.name.trim().length > 80) throw new Error("Name must be 2-80 characters.");
  if (!Number.isInteger(input.points) || input.points < -1000 || input.points > 1000 || input.points === 0) {
    throw new Error("Points must be a non-zero integer.");
  }
  const { error } = await admin.from("point_rules").insert({
    class_id: classId, code: input.code.trim(), name: input.name.trim(), points: input.points, created_by: viewer.id,
  });
  if (error) throw new Error("A rule with this code already exists.");
  await logActivity(admin, viewer, "points.rule", "class", classId, { code: input.code });
  revalidatePath(`/dashboard/classes/${classId}`);
}

export async function updateRuleAction(classId: string, ruleId: string, input: { points?: number; active?: boolean }): Promise<void> {
  const { admin } = await managerOf(classId);
  const patch: Record<string, unknown> = {};
  if (input.points !== undefined) {
    if (!Number.isInteger(input.points) || input.points < -1000 || input.points > 1000 || input.points === 0) {
      throw new Error("Points must be a non-zero integer.");
    }
    patch.points = input.points;
  }
  if (input.active !== undefined) patch.active = !!input.active;
  if (!Object.keys(patch).length) throw new Error("Nothing to update.");
  await admin.from("point_rules").update(patch).eq("id", ruleId).eq("class_id", classId);
  revalidatePath(`/dashboard/classes/${classId}`);
}

export async function deleteRuleAction(classId: string, ruleId: string): Promise<{ deactivated: boolean }> {
  const { admin } = await managerOf(classId);
  const { count } = await admin.from("points").select("id", { count: "exact", head: true }).eq("rule_id", ruleId);
  if ((count ?? 0) > 0) {
    await admin.from("point_rules").update({ active: false }).eq("id", ruleId);
    revalidatePath(`/dashboard/classes/${classId}`);
    return { deactivated: true };
  }
  await admin.from("point_rules").delete().eq("id", ruleId);
  revalidatePath(`/dashboard/classes/${classId}`);
  return { deactivated: false };
}

export async function restoreDefaultsAction(classId: string): Promise<void> {
  const { viewer, admin } = await managerOf(classId);
  await seedDefaults(admin, classId, viewer.id);
  revalidatePath(`/dashboard/classes/${classId}`);
}

export async function awardPointsAction(classId: string, input: { user_id: string; rule_id?: string; points?: number; reason?: string }): Promise<{ total: number }> {
  const { viewer, admin } = await managerOf(classId);
  const { data: mem } = await admin.from("class_members").select("id").eq("class_id", classId).eq("user_id", input.user_id).eq("role_in_class", "student").eq("status", "active").single();
  if (!mem) throw new Error("User is not an active student in this class.");
  let pts: number;
  let rid: string | null = null;
  if (input.rule_id) {
    const { data: rule } = await admin.from("point_rules").select("id,points,active").eq("id", input.rule_id).eq("class_id", classId).single();
    if (!rule || !rule.active) throw new Error("Rule not found or disabled.");
    pts = (rule as { points: number }).points;
    rid = (rule as { id: string }).id;
  } else {
    pts = Number(input.points);
    if (!Number.isInteger(pts) || pts < -1000 || pts > 1000 || pts === 0) throw new Error("Points must be a non-zero integer.");
  }
  const { error } = await admin.from("points").insert({
    class_id: classId, user_id: input.user_id, rule_id: rid, points: pts,
    reason: (input.reason ?? "").slice(0, 300), awarded_by: viewer.id,
  });
  if (error) throw new Error("Something went wrong. Please try again.");
  const total = await classTotal(admin, classId, input.user_id);
  await maybeAchievements(admin, classId, input.user_id);
  await logActivity(admin, viewer, "points.award", "class", classId, { user_id: input.user_id, points: pts });
  revalidatePath(`/dashboard/classes/${classId}`);
  return { total };
}

export async function resetPointsAction(classId: string): Promise<void> {
  const { viewer, admin } = await managerOf(classId);
  await admin.from("points").delete().eq("class_id", classId);
  await logActivity(admin, viewer, "points.reset", "class", classId, { all: true });
  revalidatePath(`/dashboard/classes/${classId}`);
}

export async function updateLeaderboardAction(classId: string, enabled: boolean, showNames: boolean): Promise<void> {
  const { viewer, admin } = await managerOf(classId);
  if (!viewer.permissions.includes("leaderboard.manage") && viewer.profile.role !== "admin") {
    const { data: cls } = await admin.from("classes").select("teacher_id").eq("id", classId).single();
    if (cls?.teacher_id !== viewer.id) throw new Error("You do not have permission to manage the leaderboard.");
  }
  await admin.from("classes").update({ leaderboard_enabled: enabled, leaderboard_show_names: showNames }).eq("id", classId);
  revalidatePath(`/dashboard/classes/${classId}`);
}
