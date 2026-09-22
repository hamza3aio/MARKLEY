// Single-function router (Vercel Hobby caps at 12 functions; we ship 1).
// All logic lives in /server (same handlers, same req/res signature).
// Dynamic segments are mapped back onto req.query so handlers work unchanged.
import activityHandler from '../server/activity.js';
import calendarHandler from '../server/calendar.js';
import configHandler from '../server/config.js';
import meHandler from '../server/me.js';
import notificationsHandler from '../server/notifications.js';
import profileHandler from '../server/profile.js';
import classesHandler from '../server/classes/index.js';
import classHandler from '../server/classes/[id].js';
import classMembersHandler from '../server/classes/[id]/members.js';
import classInviteHandler from '../server/classes/[id]/invite.js';
import classAssignmentsHandler from '../server/classes/[id]/assignments.js';
import classAttendanceHandler from '../server/classes/[id]/attendance.js';
import classAnalyticsHandler from '../server/classes/[id]/analytics.js';
import classExportHandler from '../server/classes/[id]/export.js';
import classSessionsHandler from '../server/classes/[id]/sessions.js';
import classEventsHandler from '../server/classes/[id]/events.js';
import classLeaderboardHandler from '../server/classes/[id]/leaderboard.js';
import classAchievementsHandler from '../server/classes/[id]/achievements.js';
import pointRulesHandler from '../server/classes/[id]/points/rules.js';
import pointRuleHandler from '../server/classes/[id]/points/rules/[ruleId].js';
import pointAwardHandler from '../server/classes/[id]/points/award.js';
import pointResetHandler from '../server/classes/[id]/points/reset.js';
import pointDefaultsHandler from '../server/classes/[id]/points/defaults.js';
import invitationsHandler from '../server/invitations/index.js';
import invitationAcceptHandler from '../server/invitations/accept.js';
import invitationRevokeHandler from '../server/invitations/[id]/revoke.js';
import parentLinksHandler from '../server/parent-links/index.js';
import filesHandler from '../server/files/index.js';
import fileUploadUrlHandler from '../server/files/upload-url.js';
import fileHandler from '../server/files/[id].js';
import assignmentHandler from '../server/assignments/[id].js';
import assignmentAttachmentsHandler from '../server/assignments/[id]/attachments.js';
import assignmentSubmissionsHandler from '../server/assignments/[id]/submissions.js';
import assignmentMySubmissionHandler from '../server/assignments/[id]/my-submission.js';
import assignmentGradesHandler from '../server/assignments/[id]/grades.js';
import assignmentMyGradeHandler from '../server/assignments/[id]/my-grade.js';
import sessionHandler from '../server/sessions/[id].js';
import examsHandler from '../server/exams/index.js';
import examHandler from '../server/exams/[id].js';
import examResourcesHandler from '../server/exams/[id]/resources.js';
import examUploadUrlHandler from '../server/exams/upload-url.js';
import examMetaHandler from '../server/exams/meta.js';
import quizzesHandler from '../server/quizzes/index.js';
import quizHandler from '../server/quizzes/[id].js';
import quizAttemptsHandler from '../server/quizzes/[id]/attempts.js';
import aiQuizHandler from '../server/ai/quiz.js';
import aiAssignmentHandler from '../server/ai/assignment.js';
import aiGradeHandler from '../server/ai/grade.js';
import aiSuggestionsHandler from '../server/ai/suggestions.js';
import aiResolveHandler from '../server/ai/suggestions/[id]/resolve.js';
import plansHandler from '../server/plans/index.js';
import planHandler from '../server/plans/[id].js';
import planFeaturesHandler from '../server/plans/[id]/features.js';
import userPlansHandler from '../server/user-plans/index.js';
import planRequestsHandler from '../server/plan-requests/index.js';
import planRequestHandler from '../server/plan-requests/[id].js';
import cronRemindersHandler from '../server/cron/session-reminders.js';

const routes = [
  ['activity', /^\/api\/activity\/?$/, activityHandler, []],
  ['calendar', /^\/api\/calendar\/?$/, calendarHandler, []],
  ['config', /^\/api\/config\/?$/, configHandler, []],
  ['me', /^\/api\/me\/?$/, meHandler, []],
  ['notifications', /^\/api\/notifications\/?$/, notificationsHandler, []],
  ['profile', /^\/api\/profile\/?$/, profileHandler, []],
  ['classes', /^\/api\/classes\/?$/, classesHandler, []],
  ['class', /^\/api\/classes\/([^/]+)\/?$/, classHandler, ['id']],
  ['class-members', /^\/api\/classes\/([^/]+)\/members\/?$/, classMembersHandler, ['id']],
  ['class-invite', /^\/api\/classes\/([^/]+)\/invite\/?$/, classInviteHandler, ['id']],
  ['class-assignments', /^\/api\/classes\/([^/]+)\/assignments\/?$/, classAssignmentsHandler, ['id']],
  ['class-attendance', /^\/api\/classes\/([^/]+)\/attendance\/?$/, classAttendanceHandler, ['id']],
  ['class-analytics', /^\/api\/classes\/([^/]+)\/analytics\/?$/, classAnalyticsHandler, ['id']],
  ['class-export', /^\/api\/classes\/([^/]+)\/export\/?$/, classExportHandler, ['id']],
  ['class-sessions', /^\/api\/classes\/([^/]+)\/sessions\/?$/, classSessionsHandler, ['id']],
  ['class-events', /^\/api\/classes\/([^/]+)\/events\/?$/, classEventsHandler, ['id']],
  ['class-leaderboard', /^\/api\/classes\/([^/]+)\/leaderboard\/?$/, classLeaderboardHandler, ['id']],
  ['class-achievements', /^\/api\/classes\/([^/]+)\/achievements\/?$/, classAchievementsHandler, ['id']],
  ['point-rules', /^\/api\/classes\/([^/]+)\/points\/rules\/?$/, pointRulesHandler, ['id']],
  ['point-rule', /^\/api\/classes\/([^/]+)\/points\/rules\/([^/]+)\/?$/, pointRuleHandler, ['id', 'ruleId']],
  ['point-award', /^\/api\/classes\/([^/]+)\/points\/award\/?$/, pointAwardHandler, ['id']],
  ['point-reset', /^\/api\/classes\/([^/]+)\/points\/reset\/?$/, pointResetHandler, ['id']],
  ['point-defaults', /^\/api\/classes\/([^/]+)\/points\/defaults\/?$/, pointDefaultsHandler, ['id']],
  ['invitations', /^\/api\/invitations\/?$/, invitationsHandler, []],
  ['invitation-accept', /^\/api\/invitations\/accept\/?$/, invitationAcceptHandler, []],
  ['invitation-revoke', /^\/api\/invitations\/([^/]+)\/revoke\/?$/, invitationRevokeHandler, ['id']],
  ['parent-links', /^\/api\/parent-links\/?$/, parentLinksHandler, []],
  ['files', /^\/api\/files\/?$/, filesHandler, []],
  ['file-upload-url', /^\/api\/files\/upload-url\/?$/, fileUploadUrlHandler, []],
  ['file', /^\/api\/files\/([^/]+)\/?$/, fileHandler, ['id']],
  ['assignment', /^\/api\/assignments\/([^/]+)\/?$/, assignmentHandler, ['id']],
  ['assignment-attachments', /^\/api\/assignments\/([^/]+)\/attachments\/?$/, assignmentAttachmentsHandler, ['id']],
  ['assignment-submissions', /^\/api\/assignments\/([^/]+)\/submissions\/?$/, assignmentSubmissionsHandler, ['id']],
  ['assignment-my-submission', /^\/api\/assignments\/([^/]+)\/my-submission\/?$/, assignmentMySubmissionHandler, ['id']],
  ['assignment-grades', /^\/api\/assignments\/([^/]+)\/grades\/?$/, assignmentGradesHandler, ['id']],
  ['assignment-my-grade', /^\/api\/assignments\/([^/]+)\/my-grade\/?$/, assignmentMyGradeHandler, ['id']],
  ['session', /^\/api\/sessions\/([^/]+)\/?$/, sessionHandler, ['id']],
  ['exams', /^\/api\/exams\/?$/, examsHandler, []],
  ['exam', /^\/api\/exams\/([^/]+)\/?$/, examHandler, ['id']],
  ['exam-resources', /^\/api\/exams\/([^/]+)\/resources\/?$/, examResourcesHandler, ['id']],
  ['exam-upload-url', /^\/api\/exams\/upload-url\/?$/, examUploadUrlHandler, []],
  ['exam-meta', /^\/api\/exams\/meta\/?$/, examMetaHandler, []],
  ['quizzes', /^\/api\/quizzes\/?$/, quizzesHandler, []],
  ['quiz', /^\/api\/quizzes\/([^/]+)\/?$/, quizHandler, ['id']],
  ['quiz-attempts', /^\/api\/quizzes\/([^/]+)\/attempts\/?$/, quizAttemptsHandler, ['id']],
  ['ai-quiz', /^\/api\/ai\/quiz\/?$/, aiQuizHandler, []],
  ['ai-assignment', /^\/api\/ai\/assignment\/?$/, aiAssignmentHandler, []],
  ['ai-grade', /^\/api\/ai\/grade\/?$/, aiGradeHandler, []],
  ['ai-suggestions', /^\/api\/ai\/suggestions\/?$/, aiSuggestionsHandler, []],
  ['ai-resolve', /^\/api\/ai\/suggestions\/([^/]+)\/resolve\/?$/, aiResolveHandler, ['id']],
  ['plans', /^\/api\/plans\/?$/, plansHandler, []],
  ['plan', /^\/api\/plans\/([^/]+)\/?$/, planHandler, ['id']],
  ['plan-features', /^\/api\/plans\/([^/]+)\/features\/?$/, planFeaturesHandler, ['id']],
  ['user-plans', /^\/api\/user-plans\/?$/, userPlansHandler, []],
  ['plan-requests', /^\/api\/plan-requests\/?$/, planRequestsHandler, []],
  ['plan-request', /^\/api\/plan-requests\/([^/]+)\/?$/, planRequestHandler, ['id']],
  ['cron-reminders', /^\/api\/cron\/session-reminders\/?$/, cronRemindersHandler, []],
];

export default async function handler(req, res) {
  const path = String(req.url || '').split('?')[0];
  for (const [, pattern, fn, params] of routes) {
    const m = path.match(pattern);
    if (!m) continue;
    try {
      req.query = req.query && typeof req.query === 'object' ? req.query : {};
      delete req.query.route;
      params.forEach((name, i) => { req.query[name] = decodeURIComponent(m[i + 1]); });
    } catch { req.query = {}; }
    return fn(req, res);
  }
  return res.status(404).json({ error: 'Not found.' });
}
