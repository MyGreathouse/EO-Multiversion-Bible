/* ui.js — small shared interface helpers. */

/** Scripture and user notes are always inserted as text nodes, never as HTML. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;           // only ever given icon markup
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---- icons (inline, 24×24, currentColor) --------------------------------- */
const paths = {
  home: 'M3 10.2 12 3l9 7.2V21H14v-6h-4v6H3z',
  book: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z M20 16H6.5',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M20 20l-4-4',
  study: 'M12 3 4 6.5v11L12 21l8-3.5v-11z M12 3v18',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  gear: 'M10.3 3.2a1 1 0 0 1 1-.8h1.4a1 1 0 0 1 1 .8l.2 1.3a7 7 0 0 1 1.5.9l1.2-.5a1 1 0 0 1 1.2.4l.7 1.2a1 1 0 0 1-.2 1.3l-1 .8a7 7 0 0 1 0 1.8l1 .8a1 1 0 0 1 .2 1.3l-.7 1.2a1 1 0 0 1-1.2.4l-1.2-.5a7 7 0 0 1-1.5.9l-.2 1.3a1 1 0 0 1-1 .8h-1.4a1 1 0 0 1-1-.8l-.2-1.3a7 7 0 0 1-1.5-.9l-1.2.5a1 1 0 0 1-1.2-.4l-.7-1.2a1 1 0 0 1 .2-1.3l1-.8a7 7 0 0 1 0-1.8l-1-.8a1 1 0 0 1-.2-1.3l.7-1.2a1 1 0 0 1 1.2-.4l1.2.5a7 7 0 0 1 1.5-.9z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  bookmark: 'M6 3h12v18l-6-4.5L6 21z',
  highlighter: 'M4 20h16 M6.5 16.5 15 8l3.5 3.5L10 20H6.5z M15 8l2-2a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5l-2 2',
  note: 'M5 3h14v12l-6 6H5z M19 15h-6v6',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z',
  copy: 'M9 9h11v11H9z M15 9V4H4v11h5',
  share: 'M12 15V3 M8 6.5 12 3l4 3.5 M5 13v6.5a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19.5V13',
  compare: 'M12 3v18 M4 7h5 M4 12h5 M4 17h5 M15 7h5 M15 12h5 M15 17h5',
  link: 'M14 3h7v7 M21 3 10 14 M12 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
  heart: 'M12 20.5s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3.5c0 5.4-7.5 10-7.5 10z',
  close: 'M6 6l12 12 M18 6 6 18',
  check: 'M4 12.5 9.5 18 20 6.5',
  trash: 'M4 6h16 M9 6V3.5h6V6 M6.5 6l.9 14h9.2l.9-14',
  download: 'M12 3v12 M7.5 10.5 12 15l4.5-4.5 M4 20h16',
  sun: 'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z M12 1v2.5 M12 20.5V23 M4.2 4.2l1.8 1.8 M18 18l1.8 1.8 M1 12h2.5 M20.5 12H23 M4.2 19.8 6 18 M18 6l1.8-1.8',
  speaker: 'M3 9v6h4l5 5V4L7 9z M14.5 9.5l2.5 2.5-2.5 2.5 M18 7l3 5-3 5',
  play: 'M7 4l12 8-12 8z',
  pause: 'M8 4v16 M16 4v16',
  pin: 'M12 19V9 M6 13l6-6 6 6 M5 5h14',
  grip: 'M8 6h.01 M8 12h.01 M8 18h.01 M16 6h.01 M16 12h.01 M16 18h.01',
};

export function icon(name, extra = '') {
  const d = paths[name] || '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${d}"/></svg>`;
}

let monogramCount = 0;
export function MONOGRAM() {
  const uid = `eo-mk-${++monogramCount}`;
  return `<svg class="monogram" viewBox="0 0 460 380" role="img" aria-label="EO" xmlns="http://www.w3.org/2000/svg"><defs><mask id="${uid}"><rect width="460" height="380" fill="#fff"/><rect x="122" y="167" width="66" height="46" fill="#000"/></mask></defs><g fill="none" stroke="currentColor" stroke-width="30" stroke-linejoin="miter"><circle cx="286" cy="190" r="132" mask="url(#${uid})"/><path d="M175 58 H60 V322 H175"/><path d="M60 190 H300"/></g></svg>`;
}

/* ---- toast --------------------------------------------------------------- */
let toastNode = null;
let toastTimer = null;

export function toast(message) {
  if (!toastNode) {
    toastNode = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastNode);
  }
  toastNode.textContent = message;
  toastNode.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove('is-on'), 2200);
}

/* ---- copy & share -------------------------------------------------------- */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return 'shared'; } catch { return 'cancelled'; }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}
