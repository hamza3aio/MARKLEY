// MARKLEY Phase 2 client: classes, invitations, parent links.
// Phase 3: files, assignments, submissions.
export function createClassesApi(session) {
  async function call(path, opts = {}) {
    const r = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, ...(opts.headers || {}) },
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || 'Something went wrong. Please try again.');
    return b;
  }
  return {
    list: () => call('/api/classes'),
    create: (body) => call('/api/classes', { method: 'POST', body: JSON.stringify(body) }),
    detail: (id) => call('/api/classes/' + encodeURIComponent(id)),
    update: (id, body) => call('/api/classes/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id) => call('/api/classes/' + encodeURIComponent(id), { method: 'DELETE' }),
    members: (id) => call(`/api/classes/${encodeURIComponent(id)}/members`),
    invite: (id, body) => call(`/api/classes/${encodeURIComponent(id)}/invite`, { method: 'POST', body: JSON.stringify(body) }),
    invitations: () => call('/api/invitations'),
    accept: (token) => call('/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) }),
    revoke: (inviteId) => call(`/api/invitations/${encodeURIComponent(inviteId)}/revoke`, { method: 'POST' }),
    parentLinks: (qs = '') => call('/api/parent-links' + qs),
    parentLinkCreate: (body) => call('/api/parent-links', { method: 'POST', body: JSON.stringify(body) }),
    filesList: (classId) => call('/api/files?class_id=' + encodeURIComponent(classId)),
    fileConfirm: (body) => call('/api/files', { method: 'POST', body: JSON.stringify(body) }),
    fileRename: (id, body) => call('/api/files/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(body) }),
    fileDelete: (id) => call('/api/files/' + encodeURIComponent(id), { method: 'DELETE' }),
    assignments: (classId) => call(`/api/classes/${encodeURIComponent(classId)}/assignments`),
    assignmentCreate: (classId, body) => call(`/api/classes/${encodeURIComponent(classId)}/assignments`, { method: 'POST', body: JSON.stringify(body) }),
    assignment: (id) => call('/api/assignments/' + encodeURIComponent(id)),
    assignmentUpdate: (id, body) => call('/api/assignments/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(body) }),
    assignmentDelete: (id) => call('/api/assignments/' + encodeURIComponent(id), { method: 'DELETE' }),
    attachments: (id) => call(`/api/assignments/${encodeURIComponent(id)}/attachments`),
    attachmentConfirm: (id, body) => call(`/api/assignments/${encodeURIComponent(id)}/attachments`, { method: 'POST', body: JSON.stringify(body) }),
    attachmentDelete: (id, attachmentId) => call(`/api/assignments/${encodeURIComponent(id)}/attachments`, { method: 'DELETE', body: JSON.stringify({ attachment_id: attachmentId }) }),
    submissions: (id) => call(`/api/assignments/${encodeURIComponent(id)}/submissions`),
    submit: (id, body) => call(`/api/assignments/${encodeURIComponent(id)}/submissions`, { method: 'POST', body: JSON.stringify(body) }),
    mySubmission: (id) => call(`/api/assignments/${encodeURIComponent(id)}/my-submission`),
    grades: (id) => call(`/api/assignments/${encodeURIComponent(id)}/grades`),
    saveGrade: (id, body) => call(`/api/assignments/${encodeURIComponent(id)}/grades`, { method: 'POST', body: JSON.stringify(body) }),
    myGrade: (id) => call(`/api/assignments/${encodeURIComponent(id)}/my-grade`),
    attendance: (classId, qs = '') => call(`/api/classes/${encodeURIComponent(classId)}/attendance` + qs),
    attendanceMark: (classId, body) => call(`/api/classes/${encodeURIComponent(classId)}/attendance`, { method: 'POST', body: JSON.stringify(body) }),
    analytics: (classId, qs = '') => call(`/api/classes/${encodeURIComponent(classId)}/analytics` + qs),
  };
}
