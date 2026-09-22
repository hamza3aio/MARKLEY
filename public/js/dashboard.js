// MARKLEY dashboard controller (Phase 1–3: auth, classes, content, assignments).
import { requireAuth, signOut } from './auth.js';
import { applyTheme } from './app.js';
import { esc, stateRow, toast } from './ui.js';
import { createClassesApi } from './classes.js';
import { uploadOne, uploadMany, uploadExamFile, formatBytes } from './files.js';

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
  { id: 'quizzes', label: 'Quizzes' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'exams', label: 'Exams' },
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
let openExamId = params.get('exam') || null;
let openQuizId = params.get('quiz') || null;

function renderNav() {
  nav.innerHTML = tabs.map((t) => `<a href="#" data-t="${t.id}" class="${t.id === current ? 'active' : ''}">${esc(t.label)}</a>`).join('');
  nav.querySelectorAll('a').forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    current = a.dataset.t; openClassId = null; openAssignmentId = null; openExamId = null; openQuizId = null; renderNav(); render();
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
  if (current === 'exams') return renderExamsHome();
  if (current === 'quizzes') return renderQuizzesHome();
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

// ---- Exams library (Phase 7) -----------------------------------------------------------------
let examMetaCache = null;
async function getExamMeta() {
  if (!examMetaCache) examMetaCache = await api.examMeta();
  return examMetaCache;
}
const examFilters = { search: '', subject: '', board: '', year: '', session: '', paper: '', page: 0 };

async function renderExamsHome() {
  if (openExamId) return renderExamDetail(openExamId);
  main.innerHTML = stateRow('loading', 'Loading exams…');
  try {
    const { subjects, boards } = await getExamMeta();
    const qs = new URLSearchParams({ limit: '25', offset: String(examFilters.page * 25) });
    ['search', 'subject', 'board', 'year', 'session', 'paper'].forEach((k) => { if (examFilters[k]) qs.set(k, examFilters[k]); });
    const { exams, total, canManage } = await api.examsList('?' + qs.toString());
    const pages = Math.max(1, Math.ceil(total / 25));
    const years = [];
    for (let y = new Date().getFullYear() + 1; y >= 2015; y--) years.push(y);
    main.innerHTML = `
      <section class="card" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div><h2 style="margin:0">Exams & mark schemes</h2>
        <p style="color:var(--muted);margin:0">${total} paper${total === 1 ? '' : 's'}</p></div>
        <div style="flex:1"></div>
        ${canManage ? '<button class="btn" id="newExam">Add exam</button>' : ''}
      </section>
      <section class="card"><form id="xf" class="form">
        <div class="grid cols-3">
          <label class="field">Search<input class="input" id="xsearch" value="${esc(examFilters.search)}" placeholder="Title or paper"></label>
          <label class="field">Subject<select class="input" id="xsubj"><option value="">All subjects</option>${subjects.map((s) => `<option value="${esc(s.code)}" ${examFilters.subject === s.code ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
          <label class="field">Board<select class="input" id="xboard"><option value="">All boards</option>${boards.map((b) => `<option value="${esc(b.code)}" ${examFilters.board === b.code ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
          <label class="field">Year<select class="input" id="xyear"><option value="">All years</option>${years.map((y) => `<option ${String(y) === examFilters.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
          <label class="field">Session<select class="input" id="xses"><option value="">All sessions</option>${['Feb/March', 'May/June', 'Oct/Nov'].map((s) => `<option ${examFilters.session === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label class="field">Paper<input class="input" id="xpaper" value="${esc(examFilters.paper)}" placeholder="e.g. Paper 2"></label>
        </div>
        <div style="display:flex;gap:8px"><button class="btn secondary" type="submit">Filter</button>
        <button class="btn ghost" type="button" id="xclear">Clear</button></div>
      </form></section>
      <section class="card">
        ${exams.length ? `<div class="table-wrap"><table><thead><tr><th>Paper</th><th>Subject</th><th>Board</th><th>Year</th><th>Session</th><th></th></tr></thead><tbody>
        ${exams.map((e) => `<tr><td>${esc(e.title || e.paper)}<br><small style="color:var(--muted)">${esc(e.paper)}</small></td>
        <td>${esc((subjects.find((s) => s.code === e.subject_code) || {}).name || e.subject_code)}</td>
        <td>${esc((boards.find((b) => b.code === e.board_code) || {}).name || e.board_code)}</td>
        <td>${e.year}</td><td>${esc(e.session)}</td>
        <td>${e.question_name || e.markscheme_name ? '<span class="badge success">files</span>' : '<span class="badge">meta only</span>'} <button class="btn secondary" data-exam="${esc(e.id)}">Open</button></td></tr>`).join('')}
        </tbody></table></div>` : stateRow('empty', 'No papers match these filters.')}
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
          <button class="btn secondary" id="xprev" ${examFilters.page === 0 ? 'disabled' : ''}>← Prev</button>
          <span style="color:var(--muted)">Page ${examFilters.page + 1} of ${pages}</span>
          <button class="btn secondary" id="xnext" ${examFilters.page + 1 >= pages ? 'disabled' : ''}>Next →</button>
        </div></section>`;
    document.getElementById('xf').onsubmit = (e) => {
      e.preventDefault();
      examFilters.search = document.getElementById('xsearch').value;
      examFilters.subject = document.getElementById('xsubj').value;
      examFilters.board = document.getElementById('xboard').value;
      examFilters.year = document.getElementById('xyear').value;
      examFilters.session = document.getElementById('xses').value;
      examFilters.paper = document.getElementById('xpaper').value;
      examFilters.page = 0;
      render();
    };
    document.getElementById('xclear').onclick = () => { Object.keys(examFilters).forEach((k) => { examFilters[k] = k === 'page' ? 0 : ''; }); render(); };
    document.getElementById('xprev').onclick = () => { examFilters.page--; render(); };
    document.getElementById('xnext').onclick = () => { examFilters.page++; render(); };
    main.querySelectorAll('[data-exam]').forEach((b) => (b.onclick = () => { openExamId = b.dataset.exam; render(); }));
    document.getElementById('newExam')?.addEventListener('click', showNewExam);
  } catch (e) { main.innerHTML = stateRow('error', e.message); }
}

function showNewExam() {
  getExamMeta().then(({ subjects, boards }) => {
    const years = [];
    for (let y = new Date().getFullYear() + 1; y >= 2015; y--) years.push(y);
    main.innerHTML = `
      <section class="card"><h2 style="margin-top:0">Add exam paper</h2>
        <form id="ef3" class="form">
          <div class="grid cols-2">
            <label class="field">Subject<select class="input" id="esub">${subjects.map((s) => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('')}</select></label>
            <label class="field">Board<select class="input" id="ebrd">${boards.map((b) => `<option value="${esc(b.code)}">${esc(b.name)}</option>`).join('')}</select></label>
            <label class="field">Year<select class="input" id="eyr">${years.map((y) => `<option>${y}</option>`).join('')}</select></label>
            <label class="field">Session<select class="input" id="eses"><option>May/June</option><option>Oct/Nov</option><option>Feb/March</option></select></label>
          </div>
          <label class="field">Paper<input class="input" id="epap" required maxlength="60" placeholder="Paper 2"></label>
          <label class="field">Title (optional)<input class="input" id="etit" maxlength="200" placeholder="e.g. Physics 0625/22"></label>
          <div style="display:flex;gap:8px"><button class="btn" type="submit">Create</button>
          <button class="btn secondary" type="button" id="cancel">Cancel</button></div>
        </form>
        <p style="color:var(--muted);font-size:13px">Upload the question paper and mark scheme from the exam page after creating it. Missing board/subject? Add them below.</p>
        <form id="metaF" class="form"><div class="grid cols-3">
          <label class="field">Kind<select class="input" id="mkind"><option value="board">Board</option><option value="subject">Subject</option></select></label>
          <label class="field">Code<input class="input" id="mcode" required pattern="[a-z0-9_]{2,30}" placeholder="ocr_gateway"></label>
          <label class="field">Name<input class="input" id="mname" required maxlength="80"></label>
        </div><button class="btn secondary" type="submit">Add</button></form></section>`;
    document.getElementById('cancel').onclick = () => render();
    document.getElementById('ef3').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const { exam } = await api.examCreate({
          subject_code: document.getElementById('esub').value,
          board_code: document.getElementById('ebrd').value,
          year: Number(document.getElementById('eyr').value),
          session: document.getElementById('eses').value,
          paper: document.getElementById('epap').value,
          title: document.getElementById('etit').value,
        });
        toast('Exam created. Upload its files.');
        openExamId = exam.id;
        render();
      } catch (err) { toast(err.message); }
    };
    document.getElementById('metaF').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.examMetaAdd({ kind: document.getElementById('mkind').value, code: document.getElementById('mcode').value, name: document.getElementById('mname').value });
        examMetaCache = null;
        toast('Added.');
        showNewExam();
      } catch (err) { toast(err.message); }
    };
  }).catch((e) => { main.innerHTML = stateRow('error', e.message); });
}

async function renderExamDetail(id) {
  main.innerHTML = stateRow('loading', 'Loading exam…');
  try {
    const { exam: ex, questionUrl, markschemeUrl, resources, canManage } = await api.examDetail(id);
    const { subjects, boards } = await getExamMeta();
    const sName = (subjects.find((s) => s.code === ex.subject_code) || {}).name || ex.subject_code;
    const bName = (boards.find((b) => b.code === ex.board_code) || {}).name || ex.board_code;
    main.innerHTML = `
      <section class="card">
        <button class="btn ghost" id="backX">← Exams</button>
        <h2 style="margin:8px 0 4px">${esc(ex.title || `${sName} ${ex.paper}`)}</h2>
        <p style="color:var(--muted);margin:0">${esc(sName)} · ${esc(bName)} · ${ex.year} · ${esc(ex.session)} · ${esc(ex.paper)}</p>
        ${canManage ? `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn secondary" id="editX">Edit</button><button class="btn danger" id="delX">Delete</button></div>` : ''}
      </section>
      <section class="card"><h3 style="margin-top:0">Question paper</h3>
        ${questionUrl ? `<a class="btn" href="${esc(questionUrl)}" target="_blank" rel="noopener">Open ${esc(ex.question_name || 'question paper')}</a>` : stateRow('empty', 'Not uploaded yet.')}
        ${canManage ? `<form id="qpf" class="form" style="margin-top:8px"><label class="field">Upload question paper (PDF)<input class="input" id="qpfile" type="file" accept="application/pdf" required></label><button class="btn secondary" type="submit">Upload</button></form>` : ''}
      </section>
      <section class="card"><h3 style="margin-top:0">Mark scheme</h3>
        ${markschemeUrl ? `<a class="btn" href="${esc(markschemeUrl)}" target="_blank" rel="noopener">Open ${esc(ex.markscheme_name || 'mark scheme')}</a>` : stateRow('empty', 'Not uploaded yet.')}
        ${canManage ? `<form id="msf" class="form" style="margin-top:8px"><label class="field">Upload mark scheme (PDF)<input class="input" id="msfile" type="file" accept="application/pdf" required></label><button class="btn secondary" type="submit">Upload</button></form>` : ''}
      </section>
      <section class="card"><h3 style="margin-top:0">Additional resources (${resources.length})</h3>
        ${resources.length ? `<div class="table-wrap"><table><tbody>
        ${resources.map((r) => `<tr><td>${esc(r.label)}<br><small style="color:var(--muted)">${esc(r.name)}</small></td>
        <td>${r.downloadUrl ? `<a class="btn secondary" href="${esc(r.downloadUrl)}" target="_blank" rel="noopener">Open</a>` : ''}</td>
        ${canManage ? `<td><button class="btn ghost" data-rdel="${esc(r.id)}">Delete</button></td>` : ''}</tr>`).join('')}
        </tbody></table></div>` : stateRow('empty', 'No extra resources.')}
        ${canManage ? `<form id="resf" class="form" style="margin-top:8px"><div class="grid cols-2">
        <label class="field">Label<input class="input" id="reslabel" required maxlength="120" placeholder="e.g. Grade thresholds"></label>
        <label class="field">File<input class="input" id="resfile" type="file" required></label>
        </div><button class="btn secondary" type="submit">Add resource</button></form>` : ''}
      </section>`;
    document.getElementById('backX').onclick = () => { openExamId = null; render(); };
    document.getElementById('delX')?.addEventListener('click', async () => {
      if (!confirm('Delete this exam and all its files?')) return;
      try { await api.examDelete(ex.id); toast('Exam deleted.'); openExamId = null; render(); }
      catch (e) { toast(e.message); }
    });
    document.getElementById('editX')?.addEventListener('click', () => showEditExam(ex, sName, bName));
    const up = async (inputId, kind, after) => {
      const file = document.getElementById(inputId).files[0];
      if (!file) return;
      try {
        const ref = await uploadExamFile(session, { exam_id: ex.id, kind, file });
        await api.examUpdate(ex.id, { [kind]: { path: ref.path, name: file.name } });
        toast('Uploaded.');
        render();
      } catch (err) { toast(err.message); }
    };
    document.getElementById('qpf')?.addEventListener('submit', (e) => { e.preventDefault(); up('qpfile', 'question'); });
    document.getElementById('msf')?.addEventListener('submit', (e) => { e.preventDefault(); up('msfile', 'markscheme'); });
    document.getElementById('resf')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = document.getElementById('resfile').files[0];
      if (!file) return;
      try {
        const ref = await uploadExamFile(session, { exam_id: ex.id, kind: 'resource', file });
        await api.examResourceAdd(ex.id, { path: ref.path, label: document.getElementById('reslabel').value, name: file.name, mime: file.type || 'application/octet-stream', size: file.size });
        toast('Resource added.');
        render();
      } catch (err) { toast(err.message); }
    });
    main.querySelectorAll('[data-rdel]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Delete this resource?')) return;
      try { await api.examResourceDelete(ex.id, b.dataset.rdel); toast('Deleted.'); render(); }
      catch (e) { toast(e.message); }
    }));
  } catch (e) { main.innerHTML = stateRow('error', e.message); }
}

function showEditExam(ex) {
  getExamMeta().then(({ subjects, boards }) => {
    main.innerHTML = `
      <section class="card"><h2 style="margin-top:0">Edit exam</h2>
        <form id="ef4" class="form">
          <div class="grid cols-2">
            <label class="field">Subject<select class="input" id="xsub">${subjects.map((s) => `<option value="${esc(s.code)}" ${s.code === ex.subject_code ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
            <label class="field">Board<select class="input" id="xbrd">${boards.map((b) => `<option value="${esc(b.code)}" ${b.code === ex.board_code ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
            <label class="field">Year<input class="input" id="xyr" type="number" min="1990" max="2100" value="${ex.year}"></label>
            <label class="field">Session<select class="input" id="xss">${['Feb/March', 'May/June', 'Oct/Nov'].map((s) => `<option ${s === ex.session ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          </div>
          <label class="field">Paper<input class="input" id="xpa" required maxlength="60" value="${esc(ex.paper)}"></label>
          <label class="field">Title<input class="input" id="xti" maxlength="200" value="${esc(ex.title || '')}"></label>
          <div style="display:flex;gap:8px"><button class="btn" type="submit">Save</button>
          <button class="btn secondary" type="button" id="cancel">Cancel</button></div>
        </form></section>`;
    document.getElementById('cancel').onclick = () => render();
    document.getElementById('ef4').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.examUpdate(ex.id, {
          subject_code: document.getElementById('xsub').value,
          board_code: document.getElementById('xbrd').value,
          year: Number(document.getElementById('xyr').value),
          session: document.getElementById('xss').value,
          paper: document.getElementById('xpa').value,
          title: document.getElementById('xti').value,
        });
        toast('Exam updated.');
        render();
      } catch (err) { toast(err.message); }
    };
  }).catch((e) => { main.innerHTML = stateRow('error', e.message); });
}

// ---- AI assignment drafts (Phase 8) ----------------------------------------------------------
function showAIAssignment(classId) {
  main.innerHTML = `
    <section class="card"><h2 style="margin-top:0">AI assignment draft</h2>
      <p style="color:var(--muted)">AI drafts are never published automatically. Review and edit before publishing.</p>
      <form id="aig" class="form">
        <div class="grid cols-3">
          <label class="field">Subject<input class="input" id="gsub" required maxlength="80"></label>
          <label class="field">Topic<input class="input" id="gtop" required maxlength="300"></label>
          <label class="field">Difficulty<select class="input" id="gdif"><option>easy</option><option selected>medium</option><option>hard</option></select></label>
          <label class="field">Tasks<input class="input" id="gcount" type="number" min="1" max="20" value="5"></label>
          <label class="field">Type<select class="input" id="gtype"><option value="normal">Normal</option><option value="guided">Guided</option></select></label>
        </div>
        <label class="field">Extra instructions<textarea class="input" id="ginst" rows="2" maxlength="2000"></textarea></label>
        <button class="btn" type="submit" id="gbtn">Generate draft</button>
      </form><div id="gout" style="margin-top:12px"></div>
      <button class="btn secondary" id="backA2" style="margin-top:8px">Back</button></section>`;
  document.getElementById('backA2').onclick = () => showNewAssignment(classId);
  document.getElementById('aig').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('gbtn');
    btn.disabled = true;
    document.getElementById('gout').innerHTML = stateRow('loading', 'Generating…');
    try {
      const { draft } = await api.aiAssignment({
        subject: document.getElementById('gsub').value,
        topic: document.getElementById('gtop').value,
        difficulty: document.getElementById('gdif').value,
        instructions: document.getElementById('ginst').value,
        count: Number(document.getElementById('gcount').value) || 5,
        type: document.getElementById('gtype').value,
      });
      document.getElementById('gout').innerHTML = `
        <label class="field">Title<input class="input" id="dtitle" maxlength="200" value="${esc(draft.title)}"></label>
        <label class="field">Description<textarea class="input" id="ddesc" rows="2" maxlength="5000">${esc(draft.description)}</textarea></label>
        <label class="field">Instructions<textarea class="input" id="dinst" rows="4" maxlength="5000">${esc(draft.instructions)}</textarea></label>
        <div style="display:flex;gap:8px"><button class="btn" id="useDraft">Review & publish</button>
        <button class="btn secondary" id="regen">Regenerate</button></div>`;
      document.getElementById('useDraft').onclick = () => showNewAssignment(classId, {
        ai: true, draft: true, title: document.getElementById('dtitle').value,
        description: document.getElementById('ddesc').value, instructions: document.getElementById('dinst').value,
        type: document.getElementById('gtype').value,
      });
      document.getElementById('regen').onclick = () => document.getElementById('aig').requestSubmit();
    } catch (err) {
      document.getElementById('gout').innerHTML = stateRow('error', err.message);
    } finally { btn.disabled = false; }
  };
}

// ---- Quizzes + AI quiz generator (Phase 8) --------------------------------------------------
async function renderQuizzesHome() {
  if (openQuizId) return renderQuizDetail(openQuizId);
  main.innerHTML = stateRow('loading', 'Loading quizzes…');
  try {
    const { personal, class: classQ } = await api.quizzesList();
    main.innerHTML = `
      <section class="card" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div><h2 style="margin:0">Quizzes</h2>
        <p style="color:var(--muted);margin:0">AI-generated practice is private to you unless a teacher publishes it.</p></div>
        <div style="flex:1"></div>
        <button class="btn" id="genQ">Generate with AI</button>
      </section>
      <section class="card"><h3 style="margin-top:0">My practice quizzes (${personal.length})</h3>
        ${personal.length ? `<div class="table-wrap"><table><tbody>
        ${personal.map((q) => `<tr><td>${esc(q.title)}<br><small style="color:var(--muted)">${esc(q.topic || '')} · ${esc(q.difficulty)} · ${esc(q.source)}</small></td>
        <td><button class="btn secondary" data-quiz="${esc(q.id)}">Open</button></td></tr>`).join('')}</tbody></table></div>`
        : stateRow('empty', 'No personal quizzes. Generate one with AI.')}</section>
      <section class="card"><h3 style="margin-top:0">Class quizzes (${classQ.length})</h3>
        ${classQ.length ? `<div class="table-wrap"><table><tbody>
        ${classQ.map((q) => `<tr><td>${esc(q.title)} ${q.status !== 'published' ? '<span class="badge">draft</span>' : ''}<br><small style="color:var(--muted)">${esc(q.topic || '')} · ${esc(q.difficulty)}</small></td>
        <td><button class="btn secondary" data-quiz="${esc(q.id)}">Open</button></td></tr>`).join('')}</tbody></table></div>`
        : stateRow('empty', 'No class quizzes yet.')}</section>`;
    main.querySelectorAll('[data-quiz]').forEach((b) => (b.onclick = () => { openQuizId = b.dataset.quiz; render(); }));
    document.getElementById('genQ').onclick = showAIQuiz;
  } catch (e) { main.innerHTML = stateRow('error', e.message); }
}

function showAIQuiz() {
  api.list().then(({ classes }) => {
    const teach = (profile.role === 'teacher' || profile.role === 'admin');
    main.innerHTML = `
      <section class="card"><h2 style="margin-top:0">AI quiz generator</h2>
        <form id="qg" class="form">
          <div class="grid cols-3">
            <label class="field">Subject<input class="input" id="qsub" required maxlength="80"></label>
            <label class="field">Topic<input class="input" id="qtop" required maxlength="300"></label>
            <label class="field">Difficulty<select class="input" id="qdif"><option>easy</option><option selected>medium</option><option>hard</option></select></label>
            <label class="field">Questions<input class="input" id="qcount" type="number" min="1" max="20" value="5"></label>
            <label class="field">Save to${teach ? '<select class="input" id="qcls"><option value="">Personal (only me)</option>' + classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('') + '</select>' : '<input class="input" value="Personal (only you)" disabled>'}</label>
          </div>
          <div style="display:flex;gap:12px;font-size:14px">
            <label><input type="checkbox" id="kMcq" checked> MCQ</label>
            <label><input type="checkbox" id="kShort"> Short answer</label>
            <label><input type="checkbox" id="kEssay"> Essay</label>
          </div>
          <button class="btn" type="submit" id="qbtn">Generate</button>
        </form><div id="qout" style="margin-top:12px"></div>
        <button class="btn secondary" id="backQ" style="margin-top:8px">Back</button></section>`;
    document.getElementById('backQ').onclick = () => render();
    let draft = null;
    document.getElementById('qg').onsubmit = async (e) => {
      e.preventDefault();
      const kinds = ['mcq', 'short', 'essay'].filter((k, i) => [document.getElementById('kMcq'), document.getElementById('kShort'), document.getElementById('kEssay')][i].checked);
      if (!kinds.length) { toast('Pick at least one question type.'); return; }
      const btn = document.getElementById('qbtn');
      btn.disabled = true;
      document.getElementById('qout').innerHTML = stateRow('loading', 'Generating…');
      try {
        const clsSel = document.getElementById('qcls');
        const body = {
          subject: document.getElementById('qsub').value, topic: document.getElementById('qtop').value,
          difficulty: document.getElementById('qdif').value, count: Number(document.getElementById('qcount').value) || 5, kinds,
        };
        if (clsSel && clsSel.value) body.class_id = clsSel.value;
        ({ draft } = await api.aiQuiz(body));
        renderQuizDraft(draft, clsSel && clsSel.value);
      } catch (err) {
        document.getElementById('qout').innerHTML = stateRow('error', err.message);
      } finally { btn.disabled = false; }
    };
  }).catch((e) => { main.innerHTML = stateRow('error', e.message); });
}

function renderQuizDraft(draft, classId) {
  const box = document.getElementById('qout');
  box.innerHTML = `
    <label class="field">Title<input class="input" id="dtitle" maxlength="200" value="${esc(draft.title)}"></label>
    <div id="dq">${draft.questions.map((q, i) => `
      <div class="card" data-q="${i}" style="margin-top:8px"><b>Q${i + 1} (${esc(q.kind)}, ${q.points} pts)</b>
      <p>${esc(q.prompt)}</p>
      ${q.kind === 'mcq' ? `<div>${q.options.map((o) => `<div>○ ${esc(o)}${o === q.answer ? ' <b>(correct)</b>' : ''}</div>`).join('')}</div>` : `<p style="color:var(--muted)">Model answer: ${esc(q.answer || '—')}</p>`}
      <button class="btn ghost" data-rm="${i}">Remove</button></div>`).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="saveQ">Save quiz</button>
    <button class="btn secondary" id="regenQ">Regenerate</button></div>`;
  box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => {
    draft.questions.splice(Number(b.dataset.rm), 1);
    renderQuizDraft(draft, classId);
  }));
  document.getElementById('regenQ').onclick = () => document.getElementById('qg').requestSubmit();
  document.getElementById('saveQ').onclick = async () => {
    if (!draft.questions.length) { toast('Remove left no questions.'); return; }
    try {
      const { quiz } = await api.quizSave({
        title: document.getElementById('dtitle').value || draft.title,
        topic: draft.topic, difficulty: draft.difficulty, source: 'ai',
        class_id: classId || null, status: classId ? 'draft' : 'personal', questions: draft.questions,
      });
      toast(classId ? 'Saved as class draft. Publish from the quiz page.' : 'Saved to your practice quizzes.');
      openQuizId = quiz.id;
      render();
    } catch (err) { toast(err.message); }
  };
}

async function renderQuizDetail(id) {
  main.innerHTML = stateRow('loading', 'Loading quiz…');
  try {
    const { quiz, questions, canEdit } = await api.quizDetail(id);
    const { attempts } = await api.quizAttempts(id);
    const isTeacher = canEdit && quiz.class_id;
    main.innerHTML = `
      <section class="card">
        <button class="btn ghost" id="backZ">← Quizzes</button>
        <h2 style="margin:8px 0 4px">${esc(quiz.title)}</h2>
        <p style="color:var(--muted);margin:0">${esc(quiz.topic || '')} · ${esc(quiz.difficulty)} · ${esc(quiz.source)} · ${esc(quiz.status)} · ${questions.length} questions</p>
        ${isTeacher && quiz.status !== 'published' ? '<button class="btn" id="pubQ" style="margin-top:8px">Publish to class</button>' : ''}
        ${canEdit ? '<button class="btn danger" id="delQ" style="margin-top:8px">Delete</button>' : ''}
      </section>
      <section class="card"><h3 style="margin-top:0">${isTeacher ? 'Answer key' : 'Take quiz'}</h3>
        <form id="takeF" class="form">
        ${questions.map((q, i) => `<div><b>Q${i + 1} (${q.points} pts)</b><p>${esc(q.prompt)}</p>
        ${q.kind === 'mcq' ? (isTeacher
          ? q.options.map((o) => `<div>○ ${esc(o)}${o === q.answer ? ' <b>(correct)</b>' : ''}</div>`).join('')
          : q.options.map((o) => `<label style="display:block;font-weight:normal"><input type="radio" name="a_${esc(q.id)}" value="${esc(o)}" required> ${esc(o)}</label>`).join(''))
        : (isTeacher ? `<p style="color:var(--muted)">Model answer: ${esc(q.answer || '—')}</p>` : `<textarea class="input" name="a_${esc(q.id)}" rows="3" maxlength="5000"></textarea>`)}</div>`).join('')}
        ${isTeacher ? '' : '<button class="btn" type="submit">Submit answers</button>'}
        </form><div id="takeOut" style="margin-top:8px"></div></section>
      <section class="card"><h3 style="margin-top:0">${isTeacher ? 'Attempts' : 'My attempts'}</h3>
        ${attempts.length ? `<div class="table-wrap"><table><thead><tr>${isTeacher ? '<th>Student</th>' : ''}<th>Score</th><th>When</th></tr></thead><tbody>
        ${attempts.map((a) => `<tr>${isTeacher ? `<td>${esc(a.student?.full_name || a.student?.email || '')}</td>` : ''}<td><b>${esc(String(a.score))}</b> / ${esc(String(a.max_points))}</td><td>${esc(new Date(a.submitted_at).toLocaleString())}</td></tr>`).join('')}
        </tbody></table></div>
        <p style="color:var(--muted);font-size:13px">MCQ auto-graded. Written answers need teacher review.</p>` : stateRow('empty', 'No attempts yet.')}</section>`;
    document.getElementById('backZ').onclick = () => { openQuizId = null; render(); };
    document.getElementById('pubQ')?.addEventListener('click', async () => {
      try { await api.quizUpdate(id, { status: 'published' }); toast('Published to class.'); render(); }
      catch (e) { toast(e.message); }
    });
    document.getElementById('delQ')?.addEventListener('click', async () => {
      if (!confirm('Delete this quiz?')) return;
      try { await api.quizDelete(id); toast('Deleted.'); openQuizId = null; render(); }
      catch (e) { toast(e.message); }
    });
    document.getElementById('takeF')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const answers = {};
      questions.forEach((q) => { answers[q.id] = fd.get('a_' + q.id) || ''; });
      try {
        const { attempt } = await api.quizSubmit(id, answers);
        document.getElementById('takeOut').innerHTML = `<div class="alert ok"><b>Score: ${esc(String(attempt.score))} / ${esc(String(attempt.max_points))}</b> (MCQ portion; written answers pending review)</div>`;
        toast('Attempt submitted.');
      } catch (err) { toast(err.message); }
    });
  } catch (e) { main.innerHTML = stateRow('error', e.message); }
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

function showNewAssignment(classId, preset = null) {
  const p = preset || {};
  main.innerHTML = `
    <section class="card"><h2 style="margin-top:0">New assignment ${p.ai ? '<span class="badge">AI draft — review before publishing</span>' : ''}</h2>
      ${can('assignment.create') ? '<button class="btn secondary" id="aiGen" style="margin-bottom:12px">Generate draft with AI</button>' : ''}
      <form id="af" class="form">
        <label class="field">Title<input class="input" id="atitle" required minlength="3" maxlength="200" value="${esc(p.title || '')}"></label>
        <div class="grid cols-3">
          <label class="field">Type<select class="input" id="atype"><option value="normal" ${p.type === 'normal' ? 'selected' : ''}>Normal (file upload)</option><option value="guided" ${p.type === 'guided' ? 'selected' : ''}>Guided (written + file)</option></select></label>
          <label class="field">Status<select class="input" id="astatus"><option value="published">Published</option><option value="draft" ${p.draft ? 'selected' : ''}>Draft</option></select></label>
          <label class="field">Max points<input class="input" id="apoints" type="number" min="1" max="1000" value="100"></label>
        </div>
        <div class="grid cols-2">
          <label class="field">Due date (optional)<input class="input" id="adue" type="datetime-local"></label>
          <label class="field">Late submissions<select class="input" id="alate"><option value="no">Not allowed</option><option value="yes">Allowed</option></select></label>
        </div>
        <label class="field">Description<textarea class="input" id="adesc" rows="2" maxlength="5000">${esc(p.description || '')}</textarea></label>
        <label class="field">Instructions<textarea class="input" id="ainst" rows="3" maxlength="5000">${esc(p.instructions || '')}</textarea></label>
        <div style="display:flex;gap:8px"><button class="btn" type="submit">Create</button>
        <button class="btn secondary" type="button" id="cancel">Cancel</button></div>
      </form></section>`;
  document.getElementById('cancel').onclick = () => render();
  document.getElementById('aiGen')?.addEventListener('click', () => showAIAssignment(classId));
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
    const [{ submissions }, { grades }, { suggestions }] = await Promise.all([
      api.submissions(a.id), api.grades(a.id), api.aiSuggestions(a.id).catch(() => ({ suggestions: [] })),
    ]);
    const gMap = Object.fromEntries((grades || []).map((g) => [g.student_id, g]));
    box.innerHTML = `<section class="card"><h3 style="margin-top:0">Submissions (${submissions.length})</h3>
      ${suggestions.length ? `<h4>AI suggestions awaiting your decision (${suggestions.length})</h4>
      ${(suggestions || []).map((s) => `
        <div class="card" data-sug="${esc(s.id)}" style="margin-bottom:8px">
          <b>Suggested: ${esc(String(s.suggested_score))} / ${esc(String(a.max_points))}</b>
          <span class="badge">confidence: ${esc(s.confidence)}</span>
          <p>${esc(s.suggested_feedback)}</p>
          <p style="color:var(--muted);font-size:13px">Criteria: ${esc(s.criteria || '—')}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn secondary" data-approve="${esc(s.id)}">Approve</button>
            <input class="input" style="width:90px" type="number" min="0" max="${esc(String(a.max_points))}" data-mscore="${esc(s.id)}" value="${esc(String(s.suggested_score))}" aria-label="Modified score">
            <input class="input" style="flex:1;min-width:160px" data-mfb="${esc(s.id)}" maxlength="2000" value="${esc(s.suggested_feedback)}" aria-label="Modified feedback">
            <button class="btn secondary" data-modify="${esc(s.id)}">Modify & save</button>
            <button class="btn ghost" data-reject="${esc(s.id)}">Reject</button>
          </div></div>`).join('')}` : ''}
      ${submissions.length ? `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Status</th><th>Answer</th><th>Files</th><th>Grade / ${esc(String(a.max_points))}</th><th></th></tr></thead><tbody>
      ${submissions.map((s) => { const g = gMap[s.student_id]; return `<tr><td>${esc(s.student?.full_name || s.student?.email || '—')}</td>
      <td><span class="badge ${s.status === 'late' ? 'warn' : s.status === 'graded' ? 'success' : ''}">${esc(s.status)}</span></td>
      <td>${esc((s.text_content || '').slice(0, 160))}${(s.text_content || '').length > 160 ? '…' : ''}</td>
      <td>${(s.files || []).map((f) => f.downloadUrl ? `<a href="${esc(f.downloadUrl)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)).join('<br>') || '—'}</td>
      <td><input class="input" style="width:80px" type="number" min="0" max="${esc(String(a.max_points))}" step="0.5" data-score="${esc(s.student_id)}" value="${g ? esc(String(g.score)) : ''}" aria-label="Score">
      <input class="input" style="margin-top:4px;min-width:140px" data-fb="${esc(s.student_id)}" maxlength="2000" placeholder="Feedback" value="${g ? esc(g.feedback || '') : ''}" aria-label="Feedback"></td>
      <td><button class="btn secondary" data-grade="${esc(s.student_id)}">Save</button>
      <button class="btn ghost" data-ai="${esc(s.student_id)}" title="Get AI suggestion">AI</button></td></tr>`; }).join('')}</tbody></table></div>
      <p style="color:var(--muted);font-size:13px">Grades are manual unless you approve an AI suggestion. AI never finalizes grades.</p>` : stateRow('empty', 'No submissions yet.')}</section>`;
    box.querySelectorAll('[data-approve]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await api.aiResolve(b.dataset.approve, { decision: 'approve' }); toast('AI grade approved.'); render(); }
      catch (e) { toast(e.message); b.disabled = false; }
    }));
    box.querySelectorAll('[data-modify]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try {
        await api.aiResolve(b.dataset.modify, {
          decision: 'modify',
          score: Number(box.querySelector(`[data-mscore="${CSS.escape(b.dataset.modify)}"]`).value),
          feedback: box.querySelector(`[data-mfb="${CSS.escape(b.dataset.modify)}"]`).value,
        });
        toast('Modified grade saved.'); render();
      } catch (e) { toast(e.message); b.disabled = false; }
    }));
    box.querySelectorAll('[data-reject]').forEach((b) => (b.onclick = async () => {
      try { await api.aiResolve(b.dataset.reject, { decision: 'reject' }); toast('Suggestion rejected.'); render(); }
      catch (e) { toast(e.message); }
    }));
    box.querySelectorAll('[data-ai]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await api.aiGrade({ assignment_id: a.id, student_id: b.dataset.ai }); toast('AI suggestion ready.'); render(); }
      catch (e) { toast(e.message); b.disabled = false; }
    }));
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
