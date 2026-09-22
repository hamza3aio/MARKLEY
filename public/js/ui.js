// MARKLEY UI primitives: toasts, modal, table states. No duplicated UI code.
export function toast(msg, ms = 3200) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function openModal(html) {
  let back = document.querySelector('.modal-back');
  if (!back) {
    back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal" role="dialog" aria-modal="true"></div>';
    back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
    document.body.appendChild(back);
  }
  back.querySelector('.modal').innerHTML = html;
  back.classList.add('open');
}
export function closeModal() {
  document.querySelector('.modal-back')?.classList.remove('open');
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function stateRow(kind, msg) {
  return `<div class="${kind === 'error' ? 'error-state' : kind === 'loading' ? 'loading' : 'empty'}">${esc(msg)}</div>`;
}
