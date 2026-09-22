// MARKLEY dashboard controller (Phase 1 + Phase 2: classes, invitations, parent links).
import { requireAuth, signOut } from './auth.js';
import { applyTheme } from './app.js';
import { esc, stateRow, toast } from './ui.js';
import { createClassesApi } from './classes.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const params = new URLSearchParams(location.search);

const TITLES = {
  admin: 'Admin dashboard', teacher: 'Teacher dashboard', assistant: 'Assistant dashboard',
  student: 'Student dashboard', parent: 'Parent dashboard',
};

document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');
document.getElementById('logout').onclick = signOut;

let ctx;
try {
  ctx = await requireAuth();
} catch { throw new Error('redirect'); }

const { session, profile, permissions } = ctx;
const api = createClassesApi(session);
const can = (p) => permissions.includes(p);

document.getElementById('who').textContent = `${profile.full_name || profile.email} · ${profile.role}`;
applyTheme(profile.theme);
try { localStorage.setItem('markley.theme', JSON.stringify(profile.theme)); } catch { /* ignore */ }

const tabs = [
  { id: 'overview', label: 'Dashboard' },
  { id: 'classes', label: 'Classes' },
  { id: 'invitations', label: 'Invitations' },
];
if (['parent', 'teacher', 'admin'].includes(profile.role)) tabs.push({ id: 'students', label: 'Students' });
tabs.push(
  { id: 'activity', label: profile.role === 'admin' ? 'Activity log (global)' : 'My activity' },
  { id: 'settings', label: 'Settings' },
);

let current = params.get('tab') || 'overview';
if (!tabs.some((t) => t.id === current)) current = 'overview';
let openClassId = params.get('class') || null;

function renderNav() {
  nav.innerHTML = tabs.map((t) => `<a href="#" data-t="${t.id}" class="${t.id === current ? 'active' : ''}">${esc(t.label)}</a>`).join('');
  nav.querySelectorAll('a').forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    current = a.dataset.t; openClassId = null; renderNav(); render();
  }));
}
renderNav();

async function authed(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, ...(opts.headers || {}) },
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || 'Something went wrong. Please try again.');
  return b;
}

async function render() {
  if (current === 'overview') return renderOverview();
  if (current === 'classes') return renderClasses();
  if (current === 'invitations') return renderInvitations();
  if (current === 'students') return renderStudents();
  if (current === 'activity') return renderActivity();
  return renderSettings();
}

function renderOverview() {
  main.innerHTML = `
    <section class="card"><h1 style="margin:0 0 4px">${esc(TITLES[profile.role] || 'Dashboard')}</h1>
    <p style="color:var(--muted);margin:0">Signed in as ${esc(profile.email)} · status <span class="badge success">${esc(profile.status)}</span></p></section>
    <section class="grid cols-2">
      <div class="card"><h3 style="margin-top:0">My permissions (server-verified)</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${permissions.map((p) => `<span class="badge">${esc(p)}</span>`).join('') || '<span style="color:var(--muted)">No extra permissions</span>'}</div>
        <p style="color:var(--muted);font-size:13px">UI gating only. Every protected action is re-checked in /api and RLS.</p></div>
      <div class="card"><h3 style="margin-top:0">Getting started</h3>
        <p style="color:var(--muted);font-size:14px;margin:0">${profile.role === 'teacher' || profile.role === 'admin' ? 'Create a class, then invite students and assistants by email. Share the invitation link.' : profile.role === 'parent' ? 'View your linked students under Students, and their classes under Classes.' : 'Open Invitations to accept your class invite. Students join by invitation only.'}</p></div>
    </section>`;
}

// ---- Classes ---------------------------------------------------------------
async function renderClasses() {
  if (openClassId) return renderClassDetail(openClassId);
  main.innerHTML = stateRow('loading', 'Loading classes…');
  try {
    const { classes } = await api.list();
    const canCreate = can('class.create');
    main.innerHTML = `
      <section class="card" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div><h2 style="margin:0">Classes</h2><p style="color:var(--muted);margin:0">${classes.length} class${classes.length === 1 ? '' : 'es'}</p></div>
        <div style="flex:1"></div>
        ${canCreate ? '<button class="btn" id="newClass">New class</button>' : ''}
      </section>
      ${classes.length ? `<section class="grid cols-3">${classes.map((c) => `
        <div class="card"><h3 style="margin:0 0 4px">${esc(c.name)}</h3>
        <p style="color:var(--muted);margin:0 0 12px">${esc(c.subject)}</p>
        <button class="btn secondary" data-open="${esc(c.id)}">Open</button></div>`).join('')}</section>`
        : stateRow('empty', profile.role === 'parent' ? 'No classes for your linked students yet.' : 'No classes yet.')}`;
    main.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { openClassId = b.dataset.open; render(); }));
    document.getElementById('newClass')?.addEventListener('click', showCreateClass);
  } catch (e) { main.innerHTML = stateRow('error', e.message); }
}

function showCreateClass() {
  const isAdmin = profile.role === 'admin';
  main.innerHTML = `
    <section class="card"><h2 style="margin-top:0">New class</h2>
      <form id="cf" class="form">
        <label class="field">Class name<input class="input" id="cname" required minlength="3" maxlength="120" placeholder="IGCSE Physics — Year 10"></label>
        <label class="field">Subject<input class="input" id="csubj" required minlength="2" maxlength="80" placeholder="Physics"></label>
        <label class="field">Description<textarea class="input" id="cdesc" maxlength="2000" rows="3"></textarea></label>
        ${isAdmin ? '<label class="field">Owner teacher email (optional)<input class="input" id="cteach" type="email" placeholder="teacher@school.edu"></label>' : ''}
        <div style="display:flex;gap:8px"><button class="btn" type="submit">Create</button>
        <button class="btn secondary" type="button" id="cancel">Cancel</button></div>
      </form></section>`;
  document.getElementById('cancel').onclick = () => renderClasses();
  document.getElementById('cf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const body = {
        name: document.getElementById('cname').value,
        subject: document.getElementById('csubj').value,
        description: document.getElementById('cdesc').value,
      };
      const t = document.getElementById('cteach');
      if (t && t.value.trim()) body.teacher_email = t.value.trim();
      const { class: cls } = await api.create(body);
      toast('Class created.');
      openClassId = cls.id;
      render();
    } catch (err) { toast(err.message); }
  };
}

async function renderClassDetail(id) {
  main.innerHTML = stateRow('loading', 'Loading class…');
  try {
    const { class: c, teacher, my_role } = await api.detail(id);
    const { members } = await api.members(id);
    const inviter = my_role === 'admin' || my_role === 'teacher' || (my_role === 'assistant' && can('class.invite'));
    const editor = my_role === 'admin' || (my_role === 'teacher' && (can('class.edit') || can('class.delete') || c.teacher_id === profile.id));
    main.innerHTML = `
      <section class="card">
        <button class="btn ghost" id="back">← Classes</button>
        <h2 style="margin:8px 0 4px">${esc(c.name)}</h2>
        <p style="color:var(--muted);margin:0">${esc(c.subject)} · Teacher: ${esc(teacher?.full_name || teacher?.email || '—')} · ${members.length} member${members.length === 1 ? '' : 's'} · You: <span class="badge">${esc(my_role || '')}</span></p>
        ${c.description ? `<p>${esc(c.description)}</p>` : ''}
        ${editor ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="btn secondary" id="editBtn">Edit</button>
          <button class="btn danger" id="delBtn">Delete</button></div>` : ''}
      </section>
      <section class="card"><h3 style="margin-top:0">Members</h3>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Class role</th><th>Joined</th></tr></thead>
        <tbody>${members.map((m) => `<tr><td>${esc(m.profile?.full_name || '—')}</td><td>${esc(m.profile?.email || '')}</td><td><span class="badge">${esc(m.role_in_class)}</span></td><td>${esc(new Date(m.joined_at).toLocaleDateString())}</td></tr>`).join('') || '<tr><td colspan="4">No members.</td></tr>'}</tbody></table></div></section>
      ${inviter ? `<section class="card"><h3 style="margin-top:0">Invite by email</h3>
        <form id="inv" class="form">
          <div class="grid cols-3">
            <label class="field">Email<input class="input" id="iemail" type="email" required></label>
            <label class="field">Role<select class="input" id="irole"><option value="student">Student</option><option value="assistant">Assistant</option></select></label>
            <label class="field">Expires in (days)<input class="input" id="iexp" type="number" min="1" max="30" value="7"></label>
          </div>
          <button class="btn" type="submit">Send invite</button>
        </form>
        <div id="invLink" style="margin-top:8px"></div></section>` : ''}
      <section class="card"><p style="color:var(--muted);font-size:13px;margin:0">Assignments, content and attendance land in Phases 3–4.</p></section>`;
    document.getElementById('back').onclick = () => { openClassId = null; render(); };
    document.getElementById('editBtn')?.addEventListener('click', () => showEditClass(c));
    document.getElementById('delBtn')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${c.name}"? Members lose access.`)) return;
      try { await api.remove(c.id); toast('Class deleted.'); openClassId = null; render(); }
      catch (e) { toast(e.message); }
    });
    document.getElementById('inv')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const { token } = await api.invite(c.id, {
          email: document.getElementById('iemail').value,
          role_in_class: document.getElementById('irole').value,
          expires_in_days: Number(document.getElementById('iexp').value) || 7,
        });
        const link = location.origin + '/invite.html?token=' + token;
        document.getElementById('invLink').innerHTML = `<div class="alert ok">Invite created. Share this link: <br><a href="${esc(link)}">${esc(link)}</a></div>`;
        toast('Invitation created.');
      } catch (err) { toast(err.message); }
    });
  } catch (e) { main.innerHTML = stateRow('error', e.message); }
}

function showEditClass(c) {
  main.innerHTML = `
    <section class="card"><h2 style="margin-top:0">Edit class</h2>
      <form id="ef" class="form">
        <label class="field">Class name<input class="input" id="ename" required minlength="3" maxlength="120" value="${esc(c.name)}"></label>
        <label class="field">Subject<input class="input" id="esubj" required minlength="2" maxlength="80" value="${esc(c.subject)}"></label>
        <label class="field">Description<textarea class="input" id="edesc" maxlength="2000" rows="3">${esc(c.description || '')}</textarea></label>
        <label class="field">Leaderboard<select class="input" id="elb"><option value="on" ${c.leaderboard_enabled ? 'selected' : ''}>Enabled</option><option value="off" ${c.leaderboard_enabled ? 'selected' : ''}>Disabled</option></select></label>
        <div style="display:flex;gap:8px"><button class="btn" type="submit">Save</button>
        <button class="btn secondary" type="button" id="cancel">Cancel</button></div>
      </form></section>`;
  document.getElementById('cancel').onclick = () => render();
  document.getElementById('ef').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.update(c.id, {
        name: document.getElementById('ename').value,
        subject: document.getElementById('esubj').value,
        description: document.getElementById('edesc').value,
        leaderboard_enabled: document.getElementById('elb').value === 'on',
      });
      toast('Class updated.');
      render();
    } catch (err) { toast(err.message); }
  };
}

// ---- Invitations -------------------------------------------------------------
async function renderInvitations() {
  main.innerHTML = stateRow('loading', 'Loading invitations…');
  const highlight = params.get('token');
  try {
    const { received, sent } = await api.invitations();
    main.innerHTML = `
      ${highlight ? `<section class="card"><h3 style="margin-top:0">Accept invitation</h3>
        <p style="color:var(--muted)">You opened an invitation link. Click accept to join.</p>
        <button class="btn" id="acceptLink">Accept invitation</button></section>` : ''}
      <section class="card"><h2 style="margin-top:0">Received</h2>
        ${received.length ? `<div class="table-wrap"><table><thead><tr><th>Class</th><th>Role</th><th>Expires</th><th></th></tr></thead><tbody>
        ${received.map((i) => `<tr><td>${esc(i.class?.name || i.class_id)}</td><td><span class="badge">${esc(i.role_in_class)}</span></td><td>${esc(new Date(i.expires_at).toLocaleDateString())}</td><td><button class="btn" data-acc="${esc(i.class_id)}" data-tok-find="1">Accept</button></td></tr>`).join('')}</tbody></table></div>`
        : stateRow('empty', 'No pending invitations. Students join by invitation only — ask your teacher for a link.')}</section>
      ${sent.length || profile.role === 'teacher' || profile.role === 'admin' ? `<section class="card"><h2 style="margin-top:0">Sent (pending)</h2>
        ${sent.length ? `<div class="table-wrap"><table><thead><tr><th>Class</th><th>Email</th><th>Role</th><th>Expires</th><th></th></tr></thead><tbody>
        ${sent.map((i) => `<tr><td>${esc(i.class?.name || i.class_id)}</td><td>${esc(i.email)}</td><td>${esc(i.role_in_class)}</td><td>${esc(new Date(i.expires_at).toLocaleDateString())}</td><td><button class="btn secondary" data-revoke="${esc(i.id)}">Revoke</button></td></tr>`).join('')}</tbody></table></div>` : stateRow('empty', 'No pending sent invitations.')}
      </section>` : ''}`;
    document.getElementById('acceptLink')?.addEventListener('click', async () => {
      try {
        const { class_id } = await api.accept(highlight);
        toast('Joined class.');
        openClassId = class_id; current = 'classes'; renderNav(); render();
      } catch (e) { toast(e.message); }
    });
    main.querySelectorAll('[data-revoke]').forEach((b) => (b.onclick = async () => {
      try { await api.revoke(b.dataset.revoke); toast('Invitation revoked.'); render(); }
      catch (e) { toast(e.message); }
    }));
    // Per-row accept needs the raw token which we deliberately do not expose in listings.
    main.querySelectorAll('[data-tok-find]').forEach((b) => (b.onclick = () => {
      toast('Open your invitation link to accept (tokens are single-use secrets).');
    }));
  } catch (e) { main.innerHTML = stateRow('error', e.message); }
}

// ---- Students (parent links) ---------------------------------------------------
async function renderStudents() {
  main.innerHTML = stateRow('loading', 'Loading…');
  try {
    if (profile.role === 'parent') {
      const { students } = await api.parentLinks();
      main.innerHTML = `<section class="card"><h2 style="margin-top:0">My students</h2>
        ${students.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th></tr></thead><tbody>
        ${students.map((s) => `<tr><td>${esc(s.full_name || '—')}</td><td>${esc(s.email)}</td></tr>`).join('')}</tbody></table></div>`
        : stateRow('empty', 'No linked students yet. Ask your school admin to link your account.')}</section>`;
      return;
    }
    // teacher / admin: lookup + create
    main.innerHTML = `
      <section class="card"><h2 style="margin-top:0">Link parent to student</h2>
        <form id="lf" class="form"><div class="grid cols-2">
          <label class="field">Parent email<input class="input" id="pemail" type="email" required></label>
          <label class="field">Student email<input class="input" id="semail" type="email" required></label>
        </div><button class="btn" type="submit">Create link</button></form></section>
      <section class="card"><h2 style="margin-top:0">Look up links</h2>
        <form id="qf" class="form"><label class="field">Student email<input class="input" id="qemail" type="email" required></label>
        <button class="btn secondary" type="submit">Search</button></form><div id="qres" style="margin-top:8px"></div></section>`;
    document.getElementById('lf').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.parentLinkCreate({ parent_email: document.getElementById('pemail').value, student_email: document.getElementById('semail').value });
        toast('Parent linked.');
      } catch (err) { toast(err.message); }
    };
    document.getElementById('qf').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const b = await api.parentLinks('?student_email=' + encodeURIComponent(document.getElementById('qemail').value));
        document.getElementById('qres').innerHTML = (b.links || []).length
          ? `<div class="table-wrap"><table><thead><tr><th>Parent</th><th>Since</th></tr></thead><tbody>${b.links.map((l) => {
            const p = (b.parents || []).find((x) => x.id === l.parent_id);
            return `<tr><td>${esc(p?.full_name || p?.email || l.parent_id)}</td><td>${esc(new Date(l.created_at).toLocaleDateString())}</td></tr>`;
          }).join('')}</tbody></table></div>`
          : stateRow('empty', 'No links for this student.');
      } catch (err) { toast(err.message); }
    };
  } catch (e) { main.innerHTML = stateRow('error', e.message); }
}

// ---- Activity / settings (Phase 1, unchanged) ----------------------------------
async function renderActivity() {
  main.innerHTML = stateRow('loading', 'Loading activity…');
  try {
    const { logs } = await authed('/api/activity');
    if (!logs.length) { main.innerHTML = stateRow('empty', 'No activity yet.'); return; }
    main.innerHTML = `<section class="card"><h2 style="margin-top:0">Recent activity</h2>
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Role</th><th>Target</th></tr></thead>
      <tbody>${logs.map((l) => `<tr><td>${esc(new Date(l.created_at).toLocaleString())}</td><td>${esc(l.action)}</td><td>${esc(l.actor_role || '')}</td><td>${esc(l.target_type || '')}</td></tr>`).join('')}</tbody></table></div></section>`;
  } catch (e) { main.innerHTML = stateRow('error', e.message); }
}

function renderSettings() {
  const t = profile.theme || { primary: '#2563eb', secondary: '#0ea5e9', mode: 'light' };
  main.innerHTML = `
    <section class="card"><h2 style="margin-top:0">Personalization</h2>
      <form id="themeForm" class="form">
        <label class="field">Display name<input class="input" id="fullName" maxlength="120" value="${esc(profile.full_name || '')}"></label>
        <div class="grid cols-3">
          <label class="field">Primary color<input class="input" id="c1" type="color" value="${esc(t.primary)}"></label>
          <label class="field">Secondary color<input class="input" id="c2" type="color" value="${esc(t.secondary)}"></label>
          <label class="field">Mode<select class="input" id="mode"><option value="light" ${t.mode === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${t.mode === 'dark' ? 'selected' : ''}>Dark</option></select></label>
        </div>
        <button class="btn" type="submit">Save</button>
      </form></section>`;
  document.getElementById('themeForm').onsubmit = async (e) => {
    e.preventDefault();
    const theme = { primary: document.getElementById('c1').value, secondary: document.getElementById('c2').value, mode: document.getElementById('mode').value };
    try {
      const b = await authed('/api/profile', { method: 'PATCH', body: JSON.stringify({ full_name: document.getElementById('fullName').value, theme }) });
      Object.assign(profile, b.profile);
      applyTheme(theme);
      try { localStorage.setItem('markley.theme', JSON.stringify(theme)); } catch { /* ignore */ }
      toast('Settings saved.');
    } catch (err) { toast(err.message); }
  };
}

await render();
