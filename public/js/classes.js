// MARKLEY Phase 2 client: classes, invitations, parent links.
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
  };
}
