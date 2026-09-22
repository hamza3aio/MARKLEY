// MARKLEY mobile PDF scanner: capture → optimize → crop → reorder → PDF → attach.
import { getSession } from './supabase-client.js';
import { uploadOne, formatBytes } from './files.js';
import { toast } from './ui.js';
import { esc } from './ui.js';

const params = new URLSearchParams(location.search);
const classId = params.get('class') || '';
const assignmentId = params.get('assignment') || '';

const session = await getSession().catch(() => null);
if (!session) {
  location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
  throw new Error('redirect');
}
// Server verifies session/role on upload + submit; gate here is UX only.
try {
  const r = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + session.access_token } });
  if (!r.ok) throw new Error();
} catch { location.href = '/login.html'; throw new Error('redirect'); }

document.getElementById('back').href = assignmentId
  ? '/dashboard.html?tab=assignments&open=' + encodeURIComponent(assignmentId)
  : '/dashboard.html?tab=assignments';

const pages = []; // { id, dataUrl }
let pdfBlob = null;
let cropper = null;
let cropTarget = null;
let stream = null;

const pagesEl = document.getElementById('pages');
const countEl = document.getElementById('count');

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function optimizeImage(img) {
  const max = 1600;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(img, 0, 0, w, h);
  return cv.toDataURL('image/jpeg', 0.82);
}

function addFile(file) {
  if (!file.type.startsWith('image/')) { toast('Only images can be scanned.'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    pages.push({ id: uid(), dataUrl: optimizeImage(img) });
    URL.revokeObjectURL(url);
    render();
  };
  img.onerror = () => toast('Could not read that image.');
  img.src = url;
}

function render() {
  countEl.textContent = String(pages.length);
  document.getElementById('gen').disabled = !pages.length;
  pagesEl.innerHTML = pages.length ? pages.map((p, i) => `
    <div class="page"><img src="${p.dataUrl}" alt="Page ${i + 1}">
      <div><b>Page ${i + 1}</b>
        <div class="ops">
          <button class="btn secondary" data-up="${p.id}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn secondary" data-dn="${p.id}" ${i === pages.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn secondary" data-crop="${p.id}">Crop</button>
          <button class="btn ghost" data-del="${p.id}">Remove</button>
        </div></div></div>`).join('')
    : '<div class="empty">No pages yet. Take a photo or choose images.</div>';
  const move = (id, dir) => {
    const i = pages.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= pages.length) return;
    [pages[i], pages[j]] = [pages[j], pages[i]];
    pdfBlob = null; syncPdfButtons(); render();
  };
  pagesEl.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => move(b.dataset.up, -1)));
  pagesEl.querySelectorAll('[data-dn]').forEach((b) => (b.onclick = () => move(b.dataset.dn, 1)));
  pagesEl.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    pages.splice(pages.findIndex((p) => p.id === b.dataset.del), 1);
    pdfBlob = null; syncPdfButtons(); render();
  }));
  pagesEl.querySelectorAll('[data-crop]').forEach((b) => (b.onclick = () => openCrop(b.dataset.crop)));
}

function syncPdfButtons() {
  document.getElementById('dl').disabled = !pdfBlob;
  document.getElementById('attach').disabled = !pdfBlob || !assignmentId;
}

// Inputs
const camInput = document.getElementById('camInput');
const libInput = document.getElementById('libInput');
document.getElementById('camBtn').onclick = () => camInput.click();
document.getElementById('libBtn').onclick = () => libInput.click();
camInput.onchange = () => { [...camInput.files].forEach(addFile); camInput.value = ''; };
libInput.onchange = () => { [...libInput.files].forEach(addFile); libInput.value = ''; };

// Live camera
const liveBox = document.getElementById('liveBox');
const video = document.getElementById('video');
document.getElementById('liveBtn').onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    liveBox.style.display = 'block';
  } catch { toast('Camera not available. Use Take photo instead.'); }
};
async function stopLive() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  liveBox.style.display = 'none';
}
document.getElementById('liveOff').onclick = stopLive;
document.getElementById('snap').onclick = () => {
  if (!video.videoWidth) { toast('Camera not ready.'); return; }
  const cv = document.createElement('canvas');
  cv.width = video.videoWidth; cv.height = video.videoHeight;
  cv.getContext('2d').drawImage(video, 0, 0);
  const img = new Image();
  img.onload = () => { pages.push({ id: uid(), dataUrl: optimizeImage(img) }); pdfBlob = null; syncPdfButtons(); render(); };
  img.src = cv.toDataURL('image/jpeg', 0.9);
};

// Crop
function openCrop(id) {
  cropTarget = pages.find((p) => p.id === id);
  if (!cropTarget) return;
  const img = document.getElementById('cropImg');
  img.src = cropTarget.dataUrl;
  document.getElementById('cropBack').classList.add('open');
  cropper?.destroy();
  img.onload = () => { cropper = new Cropper(img, { viewMode: 1, autoCropArea: 1 }); };
}
document.getElementById('cropCancel').onclick = () => {
  cropper?.destroy(); cropper = null;
  document.getElementById('cropBack').classList.remove('open');
};
document.getElementById('cropApply').onclick = () => {
  if (!cropper || !cropTarget) return;
  cropTarget.dataUrl = cropper.getCroppedCanvas({ maxWidth: 1600 }).toDataURL('image/jpeg', 0.85);
  cropper.destroy(); cropper = null;
  document.getElementById('cropBack').classList.remove('open');
  pdfBlob = null; syncPdfButtons(); render();
};

// Generate
document.getElementById('gen').onclick = async () => {
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = 595.28, H = 841.89;
    for (let i = 0; i < pages.length; i++) {
      const dims = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = rej;
        im.src = pages[i].dataUrl;
      });
      if (i > 0) pdf.addPage();
      const s = Math.min(W / dims.w, H / dims.h);
      const w = dims.w * s, h = dims.h * s;
      pdf.addImage(pages[i].dataUrl, 'JPEG', (W - w) / 2, (H - h) / 2, w, h);
    }
    pdfBlob = pdf.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    document.getElementById('prevBox').innerHTML =
      `<p style="color:var(--muted)">Preview (${pages.length} pages, ${esc(formatBytes(pdfBlob.size))})</p>
       <iframe src="${url}" style="width:100%;height:480px;border:1px solid var(--border);border-radius:12px" title="PDF preview"></iframe>`;
    syncPdfButtons();
    toast('PDF generated.');
  } catch { toast('Could not generate PDF. Please try again.'); }
};

document.getElementById('dl').onclick = () => {
  if (!pdfBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(pdfBlob);
  a.download = 'markley-scan.pdf';
  a.click();
};

document.getElementById('attach').onclick = async (e) => {
  if (!pdfBlob || !assignmentId) return;
  e.target.disabled = true;
  try {
    const file = new File([pdfBlob], 'scan.pdf', { type: 'application/pdf' });
    const ref = await uploadOne(session, { purpose: 'submission', class_id: classId, assignment_id: assignmentId, file });
    sessionStorage.setItem('markley.staged', JSON.stringify({ ...ref, assignment_id: assignmentId }));
    location.href = '/dashboard.html?tab=assignments&open=' + encodeURIComponent(assignmentId);
  } catch (err) { toast(err.message); e.target.disabled = false; }
};

render();
