// MARKLEY points + achievements engine (Phase 6, server-side only).
// Teachers define per-class rules; auto-awards dedupe via dedupe_key.
import { notifyUsers } from './email.js';

export const DEFAULT_RULES = [
  { code: 'assignment_submit', name: 'Assignment submitted', points: 10 },
  { code: 'perfect_score', name: 'Perfect score', points: 50 },
  { code: 'attendance', name: 'Attendance', points: 5 },
  { code: 'participation', name: 'Participation', points: 10 },
];

export async function seedDefaultRules(admin, class_id, created_by) {
  const rows = DEFAULT_RULES.map((r) => ({ ...r, class_id, created_by }));
  await admin.from('point_rules').upsert(rows, { onConflict: 'class_id,code', ignoreDuplicates: true });
}

export async function classTotal(admin, class_id, user_id) {
  const { data } = await admin.from('points').select('points').eq('class_id', class_id).eq('user_id', user_id);
  return (data || []).reduce((n, r) => n + Number(r.points), 0);
}

// Award an active rule by code. Idempotent per dedupe_key. Returns { awarded, total }.
export async function awardRule(admin, { class_id, user_id, code, dedupe_key, awarded_by }) {
  const { data: rule } = await admin.from('point_rules').select('id,points').eq('class_id', class_id).eq('code', code).eq('active', true).single();
  if (!rule) return { awarded: false };
  const { error } = await admin.from('points').insert({
    class_id, user_id, rule_id: rule.id, points: rule.points,
    reason: code, dedupe_key, awarded_by: awarded_by || null,
  });
  if (error) return { awarded: false }; // duplicate dedupe or otherwise invalid
  const total = await classTotal(admin, class_id, user_id);
  await maybeAchievements(admin, class_id, user_id, total);
  return { awarded: true, total };
}

export async function grantAchievement(admin, class_id, user_id, code, metadata = {}) {
  const { error } = await admin.from('student_achievements').insert({
    achievement_code: code, user_id, class_id, metadata,
  });
  if (error) return false; // already earned
  await notifyUsers(admin, {
    user_ids: [user_id], type: 'achievement', title: 'Achievement unlocked!',
    body: code.replace(/_/g, ' '), link: `/dashboard.html?tab=classes&class=${class_id}`,
  });
  return true;
}

export async function maybeAchievements(admin, class_id, user_id, total = null) {
  const awarded = [];
  const totalPts = total ?? await classTotal(admin, class_id, user_id);

  const { count: subCount } = await admin.from('assignment_submissions')
    .select('id', { count: 'exact', head: true }).eq('student_id', user_id);
  if ((subCount ?? 0) > 0) {
    // Count submissions in THIS class.
    const { data: asgs } = await admin.from('assignments').select('id').eq('class_id', class_id).is('deleted_at', null);
    const aids = (asgs || []).map((a) => a.id);
    if (aids.length) {
      const { count: inClass } = await admin.from('assignment_submissions')
        .select('id', { count: 'exact', head: true }).eq('student_id', user_id).in('assignment_id', aids);
      if ((inClass ?? 0) > 0 && await grantAchievement(admin, class_id, user_id, 'first_assignment')) awarded.push('first_assignment');
    }
  }
  if (totalPts >= 100 && await grantAchievement(admin, class_id, user_id, 'points_100', { total: totalPts })) awarded.push('points_100');
  if (totalPts >= 500 && await grantAchievement(admin, class_id, user_id, 'points_500', { total: totalPts })) awarded.push('points_500');

  // 7-day submission streak (distinct days, consecutive, ending today or yesterday).
  const { data: subs } = await admin.from('assignment_submissions').select('submitted_at').eq('student_id', user_id).order('submitted_at', { ascending: false }).limit(60);
  const days = [...new Set((subs || []).map((s) => new Date(s.submitted_at).toISOString().slice(0, 10)))].sort().reverse();
  let streak = 0;
  const cursor = new Date();
  if (!days.includes(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (days.includes(cursor.toISOString().slice(0, 10))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  if (streak >= 7 && await grantAchievement(admin, class_id, user_id, 'streak_7', { streak })) awarded.push('streak_7');

  const { count: present } = await admin.from('attendance').select('id', { count: 'exact', head: true })
    .eq('class_id', class_id).eq('student_id', user_id).in('status', ['present', 'late']);
  if ((present ?? 0) >= 10 && await grantAchievement(admin, class_id, user_id, 'attendance_star', { sessions: present })) awarded.push('attendance_star');

  return awarded;
}
