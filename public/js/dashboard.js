// MARKLEY dashboard controller (Phase 1–3: auth, classes, content, assignments).
import { requireAuth, signOut } from './auth.js';
import { applyTheme } from './app.js';
import { esc, stateRow, toast } from './ui.js';
import { createClassesApi } from './classes.js';
import { uploadOne, uploadMany, formatBytes } from './files.js';

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
  { id: 'assignments', label: 'Assignments' },
  { id: 'calendar', label: 'Calendar' },
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
let openAssignmentId = params.get('open') || null;

function renderNav() {
  nav.innerHTML = tabs.map((t) => `<a href="#" data-t="${t.id}" class="${t.id === current ? 'active' : ''}">${esc(t.label)}</a>`).join('');
  nav.querySelectorAll('a').forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    current = a.dataset.t; openClassId = null; openAssignmentId = null; renderNav(); render();
  }));
}
renderNav();

// ---- Notifications bell --------------------------------------------------------
const bellBtn = document.getElementById('bell');
const bellPanel = document.getElementById('bellPanel');
const bellCount = document.getElementById('bellCount');
async function refreshBell() {
  try {
    const { notifications, unread } = await api.notifications();
    bellCount.style.display = unread ? '' : 'none';
    bellCount.textContent = String(Math.min(unread, 99));
    bellPanel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><b>Notifications</b><div style="flex:1"></div>
      ${unread ? '<button class="btn secondary" id="markAll">Mark all read</button>' : ''}</div>
      ${notifications.length ? notifications.map((n) => `
        <div style="padding:8px;border-top:1px solid var(--border);${n.read_at ? 'opacity:.65' : ''}">
          <div><b>${esc(n.title)}</b></div>
          ${n.body ? `<div style="font-size:13px;color:var(--muted)">${esc(n.body)}</div>` : ''}
          <div style="font-size:12px;color:var(--muted)">${esc(new Date(n.created_at).toLocaleString())}</div>
          <div style="display:flex;gap:8px;margin-top:4px">
            ${n.link && n.link.startsWith('/') ? `<a href="${esc(n.link)}">Open</a>` : ''}
            ${!n.read_at ? `<a href="#" data-read="${esc(n.id)}">Mark read</a>` : ''}
          </div></div>`).join('') : '<div class="empty">No notifications.</div>'}`;
    bellPanel.querySelector('#markAll')?.addEventListener('click', async () => {
      await api.notifRead({ all: true }).catch((e) => toast(e.message));
      refreshBell();
    });
    bellPanel.querySelectorAll('[data-read]').forEach((a) => (a.onclick = async (e) => {
      e.preventDefault();
      await api.notifRead({ ids: [a.dataset.read] }).catch((err) => toast(err.message));
      refreshBell();
    }));
  } catch { /* offline-safe */ }
}
bellBtn.onclick = (e) => {
  e.stopPropagation();
  const open = bellPanel.style.display !== 'none';
  bellPanel.style.display = open ? 'none' : 'block';
  if (!open) refreshBell();
};
document.addEventListener('click', (e) => {
  if (!bellPanel.contains(e.target)) bellPanel.style.display = 'none';
});
refreshBell();
setInterval(refreshBell, 120000);

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
  if (current === 'assignments') return renderAssignmentsHome();
  if (current === 'calendar') return renderCalendar();
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
        <p style="color:var(--muted);font-size:14px;margin:0">${profile.role === 'teacher' || profile.role === 'admin' ? 'Create a class, invite students, upload content and post assignments.' : profile.role === 'parent' ? 'View your linked students under Students, and their classes under Classes.' : 'Open Invitations to accept class invites, then submit work under Assignments.'}</p></div>
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
    const isStaff = ['admin', 'teacher', 'assistant'].includes(my_role || '');
    const canUpload = inviter || (my_role === 'assistant' && can('content.upload'));
    let filesCount = 0;
    try { filesCount = (await api.filesList(id)).files.length; } catch { /* shown in section */ }
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
      <section class="card"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 style="margin:0">Content</h3><div style="flex:1"></div>
        <span class="badge">${esc(String(filesCount))} files</span></div>
        ${canUpload ? `<form id="upf" class="form" style="margin-top:12px"><div class="grid cols-3">
          <label class="field">File<input class="input" id="upfile" type="file" required></label>
          <label class="field">Visibility<select class="input" id="upvis"><option value="class">Whole class</option><option value="teachers">Teachers only</option></select></label>
          <label class="field">Description<input class="input" id="updesc" maxlength="1000" placeholder="Optional"></label>
        </div><button class="btn" type="submit" id="upbtn">Upload</button></form><div id="upmsg" style="margin-top:8px"></div>` : ''}
        <div id="contentBox" style="margin-top:8px"></div></section>
      <section class="card"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 style="margin:0">Assignments</h3><div style="flex:1"></div>
        ${isStaff && can('assignment.create') ? '<button class="btn" id="newAsg">New assignment</button>' : ''}</div>
        <div id="asgBox" style="margin-top:8px"></div></section>
      <section class="card"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 style="margin:0">Attendance</h3><div style="flex:1"></div>
        ${isStaff ? `<input class="input" id="attdate" type="date" style="width:auto" value="${esc(new Date().toISOString().slice(0, 10))}">` : ''}</div>
        <div id="attBox" style="margin-top:8px"></div></section>
      <section class="card"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 style="margin:0">Analytics</h3><div style="flex:1"></div>
        ${isStaff && can('reports.export') ? `<button class="btn secondary" id="expG">Grades .xlsx</button>
        <button class="btn secondary" id="expA">Attendance .xlsx</button>
        <button class="btn secondary" id="expR">Full report</button>` : ''}</div>
        <div id="anaBox" style="margin-top:8px"></div></section>
      <section class="card"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 style="margin:0">Live sessions</h3><div style="flex:1"></div>
        ${isStaff ? '<button class="btn" id="newSes">New session</button>' : ''}</div>
        <div id="sesBox" style="margin-top:8px"></div></section>
      <section class="card"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 style="margin:0">Events</h3><div style="flex:1"></div>
        ${isStaff ? '<button class="btn secondary" id="newEv">New event</button>' : ''}</div>
        <div id="evBox" style="margin-top:8px"></div></section>
      <section class="card"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 style="margin:0">Points & achievements</h3><div style="flex:1"></div>
        <span id="myPts"></span></div>
        <div id="gameBox" style="margin-top:8px"></div></section>`;
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
    document.getElementById('upf')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = document.getElementById('upfile').files[0];
      if (!file) return;
      const btn = document.getElementById('upbtn');
      btn.disabled = true;
      try {
        const ref = await uploadOne(session, { purpose: 'content', class_id: c.id, file });
        await api.fileConfirm({
          class_id: c.id, path: ref.path, name: ref.name, mime: ref.mime, size: ref.size,
          description: document.getElementById('updesc').value, visibility: document.getElementById('upvis').value,
        });
        toast('File uploaded.');
        render();
      } catch (err) { toast(err.message); }
      finally { btn.disabled = false; }
    });
    document.getElementById('newAsg')?.addEventListener('click', () => showNewAssignment(c.id));
    loadContentSection(c.id, my_role);
    loadClassAssignments(c.id, isStaff);
    loadAttendanceSection(c.id, my_role, members);
    loadAnalyticsSection(c.id);
    const dl = (type) => async () => {
      try {
        const r = await fetch(`/api/classes/${encodeURIComponent(c.id)}/export?type=${type}`, {
          headers: { Authorization: 'Bearer ' + session.access_token },
        });
        if (!r.ok) throw new Error('Export failed. Please try again.');
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `markley-${type}.xlsx`;
        a.click();
      } catch (e) { toast(e.message); }
    };
    document.getElementById('expG')?.addEventListener('click', dl('grades'));
    document.getElementById('expA')?.addEventListener('click', dl('attendance'));
    document.getElementById('expR')?.addEventListener('click', dl('report'));
    document.getElementById('newSes')?.addEventListener('click', () => showNewSession(c.id));
    document.getElementById('newEv')?.addEventListener('click', () => showNewEvent(c.id));
    loadSessionsSection(c.id, isStaff);
    loadEventsSection(c.id);
    loadGamification(c, my_role, members);
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

// ---- Content (Phase 3) -----------------------------------------------------------
async function loadContentSection(classId, myRole) {
  const box = document.getElementById('contentBox');
  if (!box) return;
  box.innerHTML = stateRow('loading', 'Loading files…');
  try {
    const { files } = await api.filesList(classId);
    const manageable = ['admin', 'teacher', 'assistant'].includes(myRole || '');
    if (!files.length) { box.innerHTML = stateRow('empty', 'No files yet.'); return; }
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Size</th><th>Visibility</th><th></th></tr></thead><tbody>
      ${files.map((f) => `<tr><td>${esc(f.name)}<br><small style="color:var(--muted)">${esc(f.description || '')}</small></td>
      <td>${esc(formatBytes(f.size_bytes))}</td><td>${esc(f.visibility)}</td>
      <td style="white-space:nowrap">${f.downloadUrl ? `<a class="btn secondary" href="${esc(f.downloadUrl)}" target="_blank" rel="noopener">Open</a>` : ''}
      ${manageable ? ` <button class="btn ghost" data-ren="${esc(f.id)}" data-nm="${esc(f.name)}">Rename</button> <button class="btn ghost" data-del="${esc(f.id)}">Delete</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
    box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Delete this file?')) return;
      try { await api.fileDelete(b.dataset.del); toast('File deleted.'); render(); }
      catch (e) { toast(e.message); }
    }));
    box.querySelectorAll('[data-ren]').forEach((b) => (b.onclick = async () => {
      const name = prompt('File name', b.dataset.nm || '');
      if (!name) return;
      try { await api.fileRename(b.dataset.del, { name }); toast('Renamed.'); render(); }
      catch (e) { toast(e.message); }
    }));
  } catch (e) { box.innerHTML = stateRow('error', e.message); }
}

// ---- Assignments (Phase 3) -------------------------------------------------------
async function loadClassAssignments(classId, isStaff) {
  const box = document.getElementById('asgBox');
  if (!box) return;
  box.innerHTML = stateRow('loading', 'Loading assignments…');
  try {
    const { assignments, submittedIds = [] } = await api.assignments(classId);
    if (!assignments.length) { box.innerHTML = stateRow('empty', 'No assignments yet.'); return; }
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Title</th><th>Type</th><th>Due</th><th>Points</th><th></th></tr></thead><tbody>
      ${assignments.map((a) => `<tr><td>${esc(a.title)} ${a.status === 'draft' ? '<span class="badge">draft</span>' : ''} ${submittedIds.includes(a.id) ? '<span class="badge success">submitted</span>' : ''}</td>
      <td>${esc(a.type)}</td><td>${a.due_date ? esc(new Date(a.due_date).toLocaleString()) : '—'}</td><td>${esc(String(a.max_points))}</td>
      <td><button class="btn secondary" data-asg="${esc(a.id)}">Open</button></td></tr>`).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-asg]').forEach((b) => (b.onclick = () => { openAssignmentId = b.dataset.asg; current = 'assignments'; renderNav(); render(); }));
  } catch (e) { box.innerHTML = stateRow('error', e.message); }
}

function showNewAssignment(classId) {
  main.innerHTML = `
    <section class="card"><h2 style="margin-top:0">New assignment</h2>
      <form id="af" class="form">
        <label class="field">Title<input class="input" id="atitle" required minlength="3" maxlength="200"></label>
        <div class="grid cols-3">
          <label class="field">Type<select class="input" id="atype"><option value="normal">Normal (file upload)</option><option value="guided">Guided (written + file)</option></select></label>
          <label class="field">Status<select class="input" id="astatus"><option value="published">Published</option><option value="draft">Draft</option></select></label>
          <label class="field">Max points<input class="input" id="apoints" type="number" min="1" max="1000" value="100"></label>
        </div>
        <div class="grid cols-2">
          <label class="field">Due date (optional)<input class="input" id="adue" type="datetime-local"></label>
          <label class="field">Late submissions<select class="input" id="alate"><option value="no">Not allowed</option><option value="yes">Allowed</option></select></label>
        </div>
        <label class="field">Description<textarea class="input" id="adesc" rows="2" maxlength="5000"></textarea></label>
        <label class="field">Instructions<textarea class="input" id="ainst" rows="3" maxlength="5000"></textarea></label>
        <div style="display:flex;gap:8px"><button class="btn" type="submit">Create</button>
        <button class="btn secondary" type="button" id="cancel">Cancel</button></div>
      </form></section>`;
  document.getElementById('cancel').onclick = () => render();
  document.getElementById('af').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const due = document.getElementById('adue').value;
      const { assignment } = await api.assignmentCreate(classId, {
        title: document.getElementById('atitle').value,
        type: document.getElementById('atype').value,
        status: document.getElementById('astatus').value,
        max_points: Number(document.getElementById('apoints').value) || 100,
        due_date: due ? new Date(due).toISOString() : null,
        allow_late: document.getElementById('alate').value === 'yes',
        description: document.getElementById('adesc').value,
        instructions: document.getElementById('ainst').value,
      });
      toast('Assignment created. Attach files from its page.');
      openAssignmentId = assignment.id;
      current = 'assignments';
      renderNav();
      render();
    } catch (err) { toast(err.message); }
  };
}

async function renderAssignmentsHome() {
  if (openAssignmentId) return renderAssignmentDetail(openAssignmentId);
  main.innerHTML = stateRow('loading', 'Loading assignments…');
  try {
    const { classes } = await api.list();
    if (!classes.length) { main.innerHTML = stateRow('empty', 'Join a class to see assignments.'); return; }
    const groups = await Promise.all(classes.map(async (c) => {
      try {
        const b = await api.assignments(c.id);
        return { class: c, items: b.assignments || [], submittedIds: b.submittedIds || [] };
      } catch { return { class: c, items: [], submittedIds: [], failed: true }; }
    }));
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    main.innerHTML = `
      <section class="card"><h2 style="margin:0">Assignments</h2>
      <p style="color:var(--muted);margin:0">${total} assignment${total === 1 ? '' : 's'} across ${classes.length} class${classes.length === 1 ? '' : 'es'}</p></section>
      ${groups.map((g) => `<section class="card"><h3 style="margin-top:0">${esc(g.class.name)} <small style="color:var(--muted)">${esc(g.class.subject)}</small></h3>
        ${g.failed ? stateRow('error', 'Could not load.') : !g.items.length ? stateRow('empty', 'No assignments.') : `
        <div class="table-wrap"><table><thead><tr><th>Title</th><th>Type</th><th>Due</th><th></th></tr></thead><tbody>
        ${g.items.map((a) => `<tr><td>${esc(a.title)} ${a.status === 'draft' ? '<span class="badge">draft</span>' : ''} ${g.submittedIds.includes(a.id) ? '<span class="badge success">submitted</span>' : ''}</td>
        <td>${esc(a.type)}</td><td>${a.due_date ? esc(new Date(a.due_date).toLocaleString()) : '—'}</td>
        <td><button class="btn secondary" data-asg="${esc(a.id)}">Open</button></td></tr>`).join('')}</tbody></table></div>`}
      </section>`).join('')}`;
    main.querySelectorAll('[data-asg]').forEach((b) => (b.onclick = () => { openAssignmentId = b.dataset.asg; render(); }));
  } catch (e) { main.innerHTML = stateRow('error', e.message); }
}

async function renderAssignmentDetail(id) {
  main.innerHTML = stateRow('loading', 'Loading assignment…');
  try {
    const { assignment: a, attachments, submission_count, my_submission } = await api.assignment(id);
    const { class: cls } = await api.detail(a.class_id).catch(() => ({ class: null }));
    const staffView = submission_count !== undefined;
    const due = a.due_date ? new Date(a.due_date).toLocaleString() : 'No due date';
    main.innerHTML = `
      <section class="card">
        <button class="btn ghost" id="backA">← Assignments</button>
        <h2 style="margin:8px 0 4px">${esc(a.title)}</h2>
        <p style="color:var(--muted);margin:0">${esc(cls?.name || '')} · <span class="badge">${esc(a.type)}</span> <span class="badge">${esc(a.status)}</span> · Due: ${esc(due)} · ${esc(String(a.max_points))} pts${a.allow_late ? ' · late allowed' : ''}</p>
        ${a.description ? `<p>${esc(a.description)}</p>` : ''}
        ${a.instructions ? `<h4>Instructions</h4><p>${esc(a.instructions)}</p>` : ''}
        ${staffView ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn secondary" id="editA">Edit</button><button class="btn danger" id="delA">Delete</button></div>` : ''}
      </section>
      <section class="card"><h3 style="margin-top:0">Attachments (${attachments.length})</h3>
        ${attachments.length ? `<div class="table-wrap"><table><tbody>
        ${attachments.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(formatBytes(t.size_bytes))}</td>
        <td>${t.downloadUrl ? `<a class="btn secondary" href="${esc(t.downloadUrl)}" target="_blank" rel="noopener">Open</a>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : stateRow('empty', 'No attachments.')}
        ${staffView ? `<form id="attf" class="form" style="margin-top:12px"><label class="field">Attach file (teacher only)<input class="input" id="attfile" type="file" required></label>
        <button class="btn secondary" type="submit">Upload attachment</button></form>` : ''}</section>
      <div id="roleSection"></div>`;
    document.getElementById('backA').onclick = () => { openAssignmentId = null; render(); };
    document.getElementById('editA')?.addEventListener('click', () => showEditAssignment(a));
    document.getElementById('delA')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${a.title}"?`)) return;
      try { await api.assignmentDelete(a.id); toast('Assignment deleted.'); openAssignmentId = null; current = 'classes'; openClassId = a.class_id; renderNav(); render(); }
      catch (e) { toast(e.message); }
    });
    document.getElementById('attf')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = document.getElementById('attfile').files[0];
      if (!file) return;
      try {
        const ref = await uploadOne(session, { purpose: 'assignment', class_id: a.class_id, assignment_id: a.id, file });
        await api.attachmentConfirm(a.id, ref);
        toast('Attachment added.');
        render();
      } catch (err) { toast(err.message); }
    });
    if (staffView) return renderSubmissionsTable(a);
    if (my_submission !== undefined) return renderSubmitForm(a, my_submission);
  } catch (e) { main.innerHTML = stateRow('error', e.message); }
}

async function renderSubmissionsTable(a) {
  const box = document.getElementById('roleSection');
  try {
    const [{ submissions }, { grades }] = await Promise.all([api.submissions(a.id), api.grades(a.id)]);
    const gMap = Object.fromEntries((grades || []).map((g) => [g.student_id, g]));
    box.innerHTML = `<section class="card"><h3 style="margin-top:0">Submissions (${submissions.length})</h3>
      ${submissions.length ? `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Status</th><th>Answer</th><th>Files</th><th>Grade / ${esc(String(a.max_points))}</th><th></th></tr></thead><tbody>
      ${submissions.map((s) => { const g = gMap[s.student_id]; return `<tr><td>${esc(s.student?.full_name || s.student?.email || '—')}</td>
      <td><span class="badge ${s.status === 'late' ? 'warn' : s.status === 'graded' ? 'success' : ''}">${esc(s.status)}</span></td>
      <td>${esc((s.text_content || '').slice(0, 160))}${(s.text_content || '').length > 160 ? '…' : ''}</td>
      <td>${(s.files || []).map((f) => f.downloadUrl ? `<a href="${esc(f.downloadUrl)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)).join('<br>') || '—'}</td>
      <td><input class="input" style="width:80px" type="number" min="0" max="${esc(String(a.max_points))}" step="0.5" data-score="${esc(s.student_id)}" value="${g ? esc(String(g.score)) : ''}" aria-label="Score">
      <input class="input" style="margin-top:4px;min-width:140px" data-fb="${esc(s.student_id)}" maxlength="2000" placeholder="Feedback" value="${g ? esc(g.feedback || '') : ''}" aria-label="Feedback"></td>
      <td><button class="btn secondary" data-grade="${esc(s.student_id)}">Save</button></td></tr>`; }).join('')}</tbody></table></div>
      <p style="color:var(--muted);font-size:13px">Grades are manual in this phase. AI-assisted grading arrives in Phase 8 with teacher approval.</p>` : stateRow('empty', 'No submissions yet.')}</section>`;
    box.querySelectorAll('[data-grade]').forEach((b) => (b.onclick = async () => {
      const sid = b.dataset.grade;
      const score = box.querySelector(`[data-score="${CSS.escape(sid)}"]`).value;
      const feedback = box.querySelector(`[data-fb="${CSS.escape(sid)}"]`).value;
      b.disabled = true;
      try {
        await api.saveGrade(a.id, { student_id: sid, score: Number(score), feedback });
        toast('Grade saved.');
        render();
      } catch (e) { toast(e.message); b.disabled = false; }
    }));
  } catch (e) { box.innerHTML = stateRow('error', e.message); }
}

async function renderSubmitForm(a, existing) {
  const box = document.getElementById('roleSection');
  let mine = existing, myFiles = [];
  try {
    if (existing) {
      const b = await api.mySubmission(a.id);
      mine = b.submission; myFiles = b.files || [];
    }
  } catch (e) { box.innerHTML = stateRow('error', e.message); return; }
  let staged = null;
  try { staged = JSON.parse(sessionStorage.getItem('markley.staged') || 'null'); } catch { /* ignore */ }
  if (staged && staged.assignment_id !== a.id) staged = null;
  let myGrade = null;
  try { myGrade = (await api.myGrade(a.id)).grade; } catch { /* ungraded */ }
  box.innerHTML = `<section class="card"><h3 style="margin-top:0">My submission ${mine ? `<span class="badge success">${esc(mine.status)}</span>` : ''}</h3>
    ${myGrade ? `<div class="alert ok"><b>Grade: ${esc(String(myGrade.score))} / ${esc(String(myGrade.max_points))}</b>${myGrade.feedback ? `<br>${esc(myGrade.feedback)}` : ''}</div>` : ''}
    ${mine ? `<p style="color:var(--muted);font-size:13px">Submitted ${esc(new Date(mine.submitted_at).toLocaleString())}. Submitting again replaces it.</p>` : ''}
    ${myFiles.length ? `<p>Current files:<br>${myFiles.map((f) => esc(f.name)).join('<br>')}</p>` : ''}
    ${staged ? `<div class="alert ok">Scanned PDF ready: ${esc(staged.name)} (${esc(formatBytes(staged.size))}) — it will be attached on submit.</div>` : ''}
    <form id="subf" class="form">
      ${a.type === 'guided' ? `<label class="field">Written answer (required)<textarea class="input" id="stext" rows="6" maxlength="20000" required>${esc(mine?.text_content || '')}</textarea></label>`
        : `<label class="field">Notes (optional)<textarea class="input" id="stext" rows="3" maxlength="20000">${esc(mine?.text_content || '')}</textarea></label>`}
      <label class="field">Files ${a.type === 'normal' ? '(at least one required)' : '(optional, up to 10)'}<input class="input" id="sfiles" type="file" multiple ${a.type === 'normal' && !myFiles.length && !staged ? 'required' : ''}></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" type="submit">Submit</button>
        <a class="btn secondary" href="/scan.html?class=${esc(a.class_id)}&assignment=${esc(a.id)}">Scan with camera</a>
      </div>
    </form></section>`;
  document.getElementById('subf').onsubmit = async (e) => {
    e.preventDefault();
    const picked = [...document.getElementById('sfiles').files];
    try {
      const refs = await uploadMany(session, { purpose: 'submission', class_id: a.class_id, assignment_id: a.id }, picked);
      if (staged) refs.push({ path: staged.path, name: staged.name, mime: staged.mime, size: staged.size });
      await api.submit(a.id, { text_content: document.getElementById('stext').value, files: refs });
      sessionStorage.removeItem('markley.staged');
      toast('Submitted.');
      render();
    } catch (err) { toast(err.message); }
  };
}

function showEditAssignment(a) {
  const dueLocal = a.due_date ? new Date(a.due_date).toISOString().slice(0, 16) : '';
  main.innerHTML = `
    <section class="card"><h2 style="margin-top:0">Edit assignment</h2>
      <form id="ef2" class="form">
        <label class="field">Title<input class="input" id="etitle" required minlength="3" maxlength="200" value="${esc(a.title)}"></label>
        <div class="grid cols-3">
          <label class="field">Type<select class="input" id="etype"><option value="normal" ${a.type === 'normal' ? 'selected' : ''}>Normal</option><option value="guided" ${a.type === 'guided' ? 'selected' : ''}>Guided</option></select></label>
          <label class="field">Status<select class="input" id="estatus"><option value="published" ${a.status === 'published' ? 'selected' : ''}>Published</option><option value="draft" ${a.status === 'draft' ? 'selected' : ''}>Draft</option></select></label>
          <label class="field">Max points<input class="input" id="epoints" type="number" min="1" max="1000" value="${esc(String(a.max_points))}"></label>
        </div>
        <div class="grid cols-2">
          <label class="field">Due date<input class="input" id="edue" type="datetime-local" value="${esc(dueLocal)}"></label>
          <label class="field">Late submissions<select class="input" id="elate"><option value="no" ${a.allow_late ? '' : 'selected'}>Not allowed</option><option value="yes" ${a.allow_late ? 'selected' : ''}>Allowed</option></select></label>
        </div>
        <label class="field">Description<textarea class="input" id="edesc" rows="2" maxlength="5000">${esc(a.description || '')}</textarea></label>
        <label class="field">Instructions<textarea class="input" id="einst" rows="3" maxlength="5000">${esc(a.instructions || '')}</textarea></label>
        <div style="display:flex;gap:8px"><button class="btn" type="submit">Save</button>
        <button class="btn secondary" type="button" id="cancel">Cancel</button></div>
      </form></section>`;
  document.getElementById('cancel').onclick = () => render();
  document.getElementById('ef2').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const due = document.getElementById('edue').value;
      await api.assignmentUpdate(a.id, {
        title: document.getElementById('etitle').value,
        type: document.getElementById('etype').value,
        status: document.getElementById('estatus').value,
        max_points: Number(document.getElementById('epoints').value) || 100,
        due_date: due ? new Date(due).toISOString() : null,
        allow_late: document.getElementById('elate').value === 'yes',
        description: document.getElementById('edesc').value,
        instructions: document.getElementById('einst').value,
      });
      toast('Assignment updated.');
      render();
    } catch (err) { toast(err.message); }
  };
}

// ---- Gamification (Phase 6) ---------------------------------------------------------------
async function loadGamification(c, myRole, members) {
  const box = document.getElementById('gameBox');
  if (!box) return;
  const staff = ['admin', 'teacher', 'assistant'].includes(myRole || '');
  const manager = myRole === 'admin' || c.teacher_id === profile.id;
  box.innerHTML = stateRow('loading', 'Loading points…');
  try {
    const { rules } = await api.pointRules(c.id).then((r) => r, () => ({ rules: [] }));
    const lb = await api.leaderboard(c.id).catch(() => ({ enabled: false, entries: [] }));
    const ach = await api.achievements(c.id).catch(() => ({ catalogue: [], users: [] }));
    const mine = (lb.entries || []).find((e) => e.mine);
    document.getElementById('myPts').innerHTML = mine ? `<span class="badge">My points: ${mine.total} (#${mine.rank})</span>` : '';
    const isStaffAch = myRole === 'admin' || myRole === 'teacher' || myRole === 'assistant';
    const earnedCount = {};
    (ach.users || []).forEach((u) => (u.earned || []).forEach((e) => { earnedCount[e.achievement_code] = (earnedCount[e.achievement_code] || 0) + 1; }));
    const myCodes = new Set();
    if (!isStaffAch) (ach.users || []).forEach((u) => (u.earned || []).forEach((e) => myCodes.add(e.achievement_code)));
    const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);

    let html = `
      <h4>${isStaffAch ? 'Achievements (earned counts)' : 'My achievements'}</h4>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${(ach.catalogue || []).map((a) => {
          const on = isStaffAch ? (earnedCount[a.code] || 0) > 0 : myCodes.has(a.code);
          const extra = isStaffAch ? ` ×${earnedCount[a.code] || 0}` : '';
          return `<span class="badge ${on ? 'success' : ''}" title="${esc(a.description)}">${esc(a.icon)} ${esc(a.name)}${extra}</span>`;
        }).join('')}
      </div>
      <h4>Leaderboard ${lb.enabled ? '' : '(disabled)'}</h4>`;
    if (!lb.enabled && !staff) {
      html += stateRow('empty', 'The leaderboard is disabled for this class.');
    } else {
      html += !lb.entries.length ? stateRow('empty', 'No points yet.') : `
        <div class="table-wrap"><table><thead><tr><th>Rank</th><th>Student</th><th>Points</th></tr></thead><tbody>
        ${lb.entries.slice(0, 20).map((e) => `<tr${e.mine ? ' style="background:#eef2ff"' : ''}><td>${medal(e.rank)}</td><td>${esc(e.name)}</td><td><b>${e.total}</b></td></tr>`).join('')}
        </tbody></table></div>`;
    }

    if (manager) {
      const students = (members || []).filter((m) => m.role_in_class === 'student');
      html += `
        <h4>Leaderboard settings</h4>
        <label style="font-size:14px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="lbOn" ${c.leaderboard_enabled ? 'checked' : ''}> Leaderboard enabled</label>
        <label style="font-size:14px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="lbNames" ${c.leaderboard_show_names !== false ? 'checked' : ''}> Show student names (off = anonymous)</label>
        <h4>Point rules (your system — no global defaults imposed)</h4>
        <div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Points</th><th>Active</th><th></th></tr></thead><tbody>
        ${(rules || []).map((r) => `<tr><td><code>${esc(r.code)}</code></td><td>${esc(r.name)}</td>
        <td><input class="input" style="width:80px" type="number" data-rpts="${esc(r.id)}" value="${r.points}"></td>
        <td><input type="checkbox" data-ron="${esc(r.id)}" ${r.active ? 'checked' : ''}></td>
        <td style="white-space:nowrap"><button class="btn secondary" data-rsave="${esc(r.id)}">Save</button>
        <button class="btn ghost" data-rdel="${esc(r.id)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5">No rules.</td></tr>'}
        </tbody></table></div>
        <form id="ruleF" class="form" style="margin-top:8px"><div class="grid cols-3">
          <label class="field">Code<input class="input" id="rcode" required pattern="[a-z0-9_]{2,40}" placeholder="helpful_peer"></label>
          <label class="field">Name<input class="input" id="rname" required maxlength="80"></label>
          <label class="field">Points<input class="input" id="rpts" type="number" required></label>
        </div><div style="display:flex;gap:8px"><button class="btn secondary" type="submit">Add rule</button>
        <button class="btn ghost" type="button" id="rdef">Restore defaults</button></div></form>
        <h4>Award points</h4>
        <form id="awardF" class="form"><div class="grid cols-3">
          <label class="field">Student<select class="input" id="awho">${students.map((m) => `<option value="${esc(m.user_id)}">${esc(m.profile?.full_name || m.profile?.email || '')}</option>`).join('')}</select></label>
          <label class="field">Rule<select class="input" id="arule"><option value="">Custom</option>${(rules || []).filter((r) => r.active).map((r) => `<option value="${esc(r.id)}">${esc(r.name)} (${r.points})</option>`).join('')}</select></label>
          <label class="field">Custom points<input class="input" id="apts" type="number" placeholder="e.g. 5"></label>
        </div><label class="field">Reason<input class="input" id="area" maxlength="300"></label>
        <div style="display:flex;gap:8px"><button class="btn secondary" type="submit">Award</button>
        <button class="btn ghost" type="button" id="preset">Reset class points</button></div></form>`;
    } else {
      html += `<h4>How points work here</h4>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${(rules || []).map((r) => `<span class="badge">${esc(r.name)}: +${r.points}</span>`).join('') || '<span style="color:var(--muted)">No rules published.</span>'}</div>`;
    }
    box.innerHTML = html;

    if (manager) {
      document.getElementById('lbOn').onchange = async (e) => {
        try { Object.assign(c, (await api.update(c.id, { leaderboard_enabled: e.target.checked })).class); toast('Leaderboard updated.'); }
        catch (err) { toast(err.message); e.target.checked = !e.target.checked; }
      };
      document.getElementById('lbNames').onchange = async (e) => {
        try { Object.assign(c, (await api.update(c.id, { leaderboard_show_names: e.target.checked })).class); toast('Privacy updated.'); }
        catch (err) { toast(err.message); e.target.checked = !e.target.checked; }
      };
      box.querySelectorAll('[data-rsave]').forEach((b) => (b.onclick = async () => {
        try {
          await api.ruleUpdate(c.id, b.dataset.rsave, {
            points: Number(box.querySelector(`[data-rpts="${CSS.escape(b.dataset.rsave)}"]`).value),
            active: box.querySelector(`[data-ron="${CSS.escape(b.dataset.rsave)}"]`).checked,
          });
          toast('Rule saved.'); render();
        } catch (e) { toast(e.message); }
      }));
      box.querySelectorAll('[data-rdel]').forEach((b) => (b.onclick = async () => {
        if (!confirm('Delete this rule? (Used rules are deactivated instead.)')) return;
        try { const r = await api.ruleDelete(c.id, b.dataset.rdel); toast(r.deactivated ? 'Rule deactivated (has history).' : 'Rule deleted.'); render(); }
        catch (e) { toast(e.message); }
      }));
      document.getElementById('ruleF').onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api.ruleCreate(c.id, { code: document.getElementById('rcode').value, name: document.getElementById('rname').value, points: Number(document.getElementById('rpts').value) });
          toast('Rule added.'); render();
        } catch (err) { toast(err.message); }
      };
      document.getElementById('rdef').onclick = async () => {
        try { await api.rulesDefaults(c.id); toast('Defaults restored.'); render(); }
        catch (e) { toast(e.message); }
      };
      document.getElementById('awardF').onsubmit = async (e) => {
        e.preventDefault();
        try {
          const ruleId = document.getElementById('arule').value;
          const body = { user_id: document.getElementById('awho').value, reason: document.getElementById('area').value };
          if (ruleId) body.rule_id = ruleId; else body.points = Number(document.getElementById('apts').value);
          const r = await api.awardPoints(c.id, body);
          toast(`Awarded. Total: ${r.total}.`);
          render();
        } catch (err) { toast(err.message); }
      };
      document.getElementById('preset').onclick = async () => {
        if (!confirm('Reset ALL points in this class?')) return;
        try { await api.pointsReset(c.id); toast('Points reset.'); render(); }
        catch (e) { toast(e.message); }
      };
    }
  } catch (e) { box.innerHTML = stateRow('error', e.message); }
}

// ---- Sessions + events (Phase 5) ------------------------------------------------------
async function loadSessionsSection(classId, isStaff) {
  const box = document.getElementById('sesBox');
  if (!box) return;
  box.innerHTML = stateRow('loading', 'Loading sessions…');
  try {
    const { sessions } = await api.sessions(classId);
    if (!sessions.length) { box.innerHTML = stateRow('empty', 'No sessions scheduled.'); return; }
    const now = Date.now();
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Session</th><th>Starts</th><th>Provider</th><th></th></tr></thead><tbody>
      ${sessions.map((s) => {
        const live = new Date(s.start_at).getTime() <= now && now <= new Date(s.end_at).getTime();
        return `<tr><td>${esc(s.title)} ${live ? '<span class="badge success">live now</span>' : ''}<br><small style="color:var(--muted)">${esc(s.description || '')}</small></td>
        <td>${esc(new Date(s.start_at).toLocaleString())}</td><td>${esc(s.provider)}</td>
        <td style="white-space:nowrap">${s.meeting_url ? `<a class="btn" href="${esc(s.meeting_url)}" target="_blank" rel="noopener">Join session</a>` : '<span style="color:var(--muted)">No link</span>'}
        ${isStaff ? ` <button class="btn ghost" data-delses="${esc(s.id)}">Delete</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-delses]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Delete this session?')) return;
      try { await api.sessionDelete(b.dataset.delses); toast('Session deleted.'); render(); }
      catch (e) { toast(e.message); }
    }));
  } catch (e) { box.innerHTML = stateRow('error', e.message); }
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function showNewSession(classId) {
  const start = new Date(Date.now() + 3600000);
  const end = new Date(Date.now() + 2 * 3600000);
  main.innerHTML = `
    <section class="card"><h2 style="margin-top:0">New live session</h2>
      <p style="color:var(--muted)">Video runs on your meeting provider (Zoom, Teams, Meet). Students click Join session to open your link.</p>
      <form id="sf" class="form">
        <label class="field">Title<input class="input" id="stitle" required minlength="3" maxlength="200"></label>
        <label class="field">Description<textarea class="input" id="sdesc" rows="2" maxlength="2000"></textarea></label>
        <div class="grid cols-3">
          <label class="field">Starts<input class="input" id="sstart" type="datetime-local" required value="${toLocalInput(start.toISOString())}"></label>
          <label class="field">Ends<input class="input" id="send" type="datetime-local" required value="${toLocalInput(end.toISOString())}"></label>
          <label class="field">Provider<select class="input" id="sprov"><option value="zoom">Zoom</option><option value="teams">Microsoft Teams</option><option value="meet">Google Meet</option><option value="other">Other</option></select></label>
        </div>
        <label class="field">Meeting link (https://)<input class="input" id="surl" type="url" placeholder="https://…"></label>
        <div style="display:flex;gap:8px"><button class="btn" type="submit">Create</button>
        <button class="btn secondary" type="button" id="cancel">Cancel</button></div>
      </form></section>`;
  document.getElementById('cancel').onclick = () => render();
  document.getElementById('sf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.sessionCreate(classId, {
        title: document.getElementById('stitle').value,
        description: document.getElementById('sdesc').value,
        start_at: new Date(document.getElementById('sstart').value).toISOString(),
        end_at: new Date(document.getElementById('send').value).toISOString(),
        provider: document.getElementById('sprov').value,
        meeting_url: document.getElementById('surl').value,
      });
      toast('Session created. Members were notified.');
      render();
    } catch (err) { toast(err.message); }
  };
}

async function loadEventsSection(classId) {
  const box = document.getElementById('evBox');
  if (!box) return;
  box.innerHTML = stateRow('loading', 'Loading events…');
  try {
    const { events } = await api.events(classId);
    box.innerHTML = !events.length ? stateRow('empty', 'No events.') : `
      <div class="table-wrap"><table><thead><tr><th>Event</th><th>Type</th><th>Starts</th><th></th></tr></thead><tbody>
      ${events.map((v) => `<tr><td>${esc(v.title)}</td><td><span class="badge">${esc(v.type)}</span></td>
      <td>${esc(new Date(v.start_at).toLocaleString())}</td>
      <td>${v.link ? `<a href="${esc(v.link)}" target="_blank" rel="noopener">Open</a>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
  } catch (e) { box.innerHTML = stateRow('error', e.message); }
}

function showNewEvent(classId) {
  main.innerHTML = `
    <section class="card"><h2 style="margin-top:0">New event</h2>
      <form id="vf" class="form">
        <label class="field">Title<input class="input" id="vtitle" required minlength="3" maxlength="200"></label>
        <div class="grid cols-3">
          <label class="field">Type<select class="input" id="vtype"><option value="event">Event</option><option value="exam">Exam</option><option value="deadline">Deadline</option></select></label>
          <label class="field">Starts<input class="input" id="vstart" type="datetime-local" required></label>
          <label class="field">Ends (optional)<input class="input" id="vend" type="datetime-local"></label>
        </div>
        <label class="field">Link (optional)<input class="input" id="vlink" type="url" placeholder="https://…"></label>
        <label class="field">Description<textarea class="input" id="vdesc" rows="2" maxlength="2000"></textarea></label>
        <div style="display:flex;gap:8px"><button class="btn" type="submit">Create</button>
        <button class="btn secondary" type="button" id="cancel">Cancel</button></div>
      </form></section>`;
  document.getElementById('cancel').onclick = () => render();
  document.getElementById('vf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const endV = document.getElementById('vend').value;
      await api.eventCreate(classId, {
        title: document.getElementById('vtitle').value,
        type: document.getElementById('vtype').value,
        start_at: new Date(document.getElementById('vstart').value).toISOString(),
        end_at: endV ? new Date(endV).toISOString() : null,
        link: document.getElementById('vlink').value,
        description: document.getElementById('vdesc').value,
      });
      toast('Event created.');
      render();
    } catch (err) { toast(err.message); }
  };
}

// ---- Calendar (Phase 5) ----------------------------------------------------------------
let calCursor = new Date();
function renderCalendar() {
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  const first = new Date(y, m, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday-first
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  const monthName = first.toLocaleString('en', { month: 'long', year: 'numeric' });
  main.innerHTML = `
    <section class="card" style="display:flex;align-items:center;gap:8px">
      <button class="btn secondary" id="calPrev">←</button>
      <h2 style="margin:0;flex:1;text-align:center">${esc(monthName)}</h2>
      <button class="btn secondary" id="calNext">→</button></section>
    <section class="card"><div id="calGrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">
      ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<b style="font-size:12px;color:var(--muted)">${d}</b>`).join('')}
      ${cells.map((d) => d ? `<div data-day="${d.toISOString().slice(0, 10)}" style="min-height:88px;border:1px solid var(--border);border-radius:8px;padding:4px;font-size:12px"><b>${d.getDate()}</b><div class="cev"></div></div>` : '<div></div>').join('')}
    </div></section>
    <section class="card"><h3 style="margin-top:0">Upcoming</h3><div id="calUp"></div></section>`;
  document.getElementById('calPrev').onclick = () => { calCursor = new Date(y, m - 1, 1); render(); };
  document.getElementById('calNext').onclick = () => { calCursor = new Date(y, m + 1, 1); render(); };
  loadCalendarItems(new Date(y, m, 1).toISOString(), new Date(y, m + 1, 0, 23, 59, 59).toISOString());
}

const KIND_COLOR = { session: '#2563eb', event: '#0ea5e9', exam: '#d97706', deadline: '#dc2626' };
async function loadCalendarItems(from, to) {
  try {
    const { items } = await api.calendar(from, to);
    const byDay = {};
    items.forEach((it) => {
      const k = new Date(it.start).toISOString().slice(0, 10);
      (byDay[k] = byDay[k] || []).push(it);
    });
    document.querySelectorAll('#calGrid [data-day]').forEach((cell) => {
      const list = (byDay[cell.dataset.day] || []).slice(0, 3);
      cell.querySelector('.cev').innerHTML = list.map((it) =>
        `<div title="${esc(it.title)}" style="border-left:3px solid ${KIND_COLOR[it.kind] || '#64748b'};padding-left:4px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.title)}</div>`).join('')
        + ((byDay[cell.dataset.day] || []).length > 3 ? `<div style="color:var(--muted)">+${(byDay[cell.dataset.day] || []).length - 3} more</div>` : '');
    });
    const up = items.filter((it) => new Date(it.start).getTime() >= Date.now() - 86400000).slice(0, 20);
    document.getElementById('calUp').innerHTML = up.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>What</th><th>Class</th></tr></thead><tbody>
      ${up.map((it) => `<tr><td>${esc(new Date(it.start).toLocaleString())}</td>
      <td><span class="badge">${esc(it.kind)}</span> ${it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : esc(it.title)}</td>
      <td>${esc(it.class_name)}</td></tr>`).join('')}</tbody></table></div>` : stateRow('empty', 'Nothing upcoming.');
  } catch (e) {
    document.getElementById('calUp').innerHTML = stateRow('error', e.message);
  }
}

// ---- Attendance + analytics (Phase 4) ------------------------------------------------
async function loadAttendanceSection(classId, myRole, members) {
  const box = document.getElementById('attBox');
  if (!box) return;
  const staffView = ['admin', 'teacher', 'assistant'].includes(myRole || '');
  const students = (members || []).filter((m) => m.role_in_class === 'student');
  if (!staffView) {
    box.innerHTML = stateRow('loading', 'Loading attendance…');
    try {
      const { records } = await api.attendance(classId);
      if (!records.length) { box.innerHTML = stateRow('empty', 'No attendance records yet.'); return; }
      const pres = records.filter((r) => r.status === 'present' || r.status === 'late').length;
      box.innerHTML = `<p><b>Attendance: ${Math.round((pres / records.length) * 1000) / 10}%</b> (${pres}/${records.length} sessions)</p>
        <div class="table-wrap"><table><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>
        ${records.slice(0, 60).map((r) => `<tr><td>${esc(r.date)}</td><td><span class="badge">${esc(r.status)}</span></td></tr>`).join('')}
        </tbody></table></div>`;
    } catch (e) { box.innerHTML = stateRow('error', e.message); }
    return;
  }
  async function paint(date) {
    box.innerHTML = stateRow('loading', 'Loading attendance…');
    try {
      const { records } = await api.attendance(classId, `?from=${date}&to=${date}`);
      const bySid = Object.fromEntries(records.map((r) => [r.student_id, r.status]));
      box.innerHTML = !students.length ? stateRow('empty', 'No students enrolled.') : `
        <div class="table-wrap"><table><thead><tr><th>Student</th><th>Status on ${esc(date)}</th></tr></thead><tbody>
        ${students.map((m) => `<tr><td>${esc(m.profile?.full_name || m.profile?.email || '—')}</td>
        <td><select class="input" data-att="${esc(m.user_id)}">
        ${['present', 'absent', 'late', 'excused'].map((s) => `<option value="${s}" ${bySid[m.user_id] === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></td></tr>`).join('')}</tbody></table></div>
        <button class="btn" id="attSave" style="margin-top:8px">Save attendance</button>`;
      document.getElementById('attSave').onclick = async (e) => {
        e.target.disabled = true;
        try {
          const recs = [...box.querySelectorAll('[data-att]')].map((s) => ({ student_id: s.dataset.att, status: s.value }));
          await api.attendanceMark(classId, { date, records: recs });
          toast('Attendance saved.');
        } catch (err) { toast(err.message); }
        finally { e.target.disabled = false; }
      };
    } catch (e) { box.innerHTML = stateRow('error', e.message); }
  }
  const input = document.getElementById('attdate');
  input.onchange = () => paint(input.value);
  paint(input.value);
}

let chartLoaded = false;
async function ensureChart() {
  if (window.Chart) return true;
  if (chartLoaded) return !!window.Chart;
  chartLoaded = true;
  await new Promise((res) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = res; s.onerror = res;
    document.head.appendChild(s);
  });
  return !!window.Chart;
}

async function loadAnalyticsSection(classId) {
  const box = document.getElementById('anaBox');
  if (!box) return;
  box.innerHTML = stateRow('loading', 'Loading analytics…');
  try {
    const { rows, assignments, summary } = await api.analytics(classId);
    if (!summary) { box.innerHTML = stateRow('empty', 'No data yet.'); return; }
    box.innerHTML = `
      <section class="grid cols-4">
        <div class="card stat"><div class="num">${summary.avg_score ?? '—'}</div><div class="lbl">Avg score %</div></div>
        <div class="card stat"><div class="num">${summary.submission_rate ?? '—'}%</div><div class="lbl">Submission rate</div></div>
        <div class="card stat"><div class="num">${summary.attendance_rate ?? '—'}%</div><div class="lbl">Attendance rate</div></div>
        <div class="card stat"><div class="num">${summary.students}</div><div class="lbl">Students</div></div>
      </section>
      <div class="card" style="margin-top:12px"><h4 style="margin-top:0">Average score per assignment</h4>
      <canvas id="anaChart" height="120"></canvas></div>
      <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Student</th><th>Avg %</th><th>Graded</th><th>Submitted</th><th>Late</th><th>Attendance</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.avg_pct ?? '—'}</td><td>${r.graded_count}</td><td>${r.submitted_count}</td><td>${r.late_count}</td><td>${r.attendance_pct ?? '—'}${r.attendance_pct !== null ? '%' : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
    if (await ensureChart()) {
      try {
        new window.Chart(document.getElementById('anaChart'), {
          type: 'bar',
          data: {
            labels: assignments.map((x) => x.title.slice(0, 24)),
            datasets: [{ data: assignments.map((x) => x.avg_pct ?? 0) }],
          },
          options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } },
        });
      } catch { /* table remains the source of truth */ }
    }
  } catch (e) { box.innerHTML = stateRow('error', e.message); }
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
        <label style="font-size:14px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="emailNotif" ${profile.email_notifications === false ? '' : 'checked'}> Email notifications</label>
      </form></section>`;
  document.getElementById('themeForm').onsubmit = async (e) => {
    e.preventDefault();
    const theme = { primary: document.getElementById('c1').value, secondary: document.getElementById('c2').value, mode: document.getElementById('mode').value };
    try {
      const b = await authed('/api/profile', { method: 'PATCH', body: JSON.stringify({ full_name: document.getElementById('fullName').value, theme, email_notifications: document.getElementById('emailNotif').checked }) });
      Object.assign(profile, b.profile);
      applyTheme(theme);
      try { localStorage.setItem('markley.theme', JSON.stringify(theme)); } catch { /* ignore */ }
      toast('Settings saved.');
    } catch (err) { toast(err.message); }
  };
}

await render();
