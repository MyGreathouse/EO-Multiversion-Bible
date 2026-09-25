/* study-view.js — everything you have saved, in one place. */
import * as bible from './bible-engine.js';
import * as settings from './settings.js';
import * as study from './study.js';
import * as audio from './audio.js';
import { el, clear, icon, toast } from './ui.js';

const TABS = [
  ['bookmarks', 'Bookmarks'],
  ['highlights', 'Highlights'],
  ['notes', 'Notes'],
  ['favourites', 'Favourites'],
];

const REORDERABLE = new Set(['bookmarks', 'highlights', 'favourites']);

/**
 * Lets a row be dragged by its handle to a new position in the list. The
 * dragged row floats and follows the pointer; other rows are never moved
 * mid-drag, only highlighted to show where it would land -- simpler and
 * more reliable on touch than live-reordering the DOM during the drag.
 * The actual new order is only written on release.
 */
function attachDragReorder(list, getTab, repaint) {
  let dragEl = null;
  let rows = [];

  const rowAtPoint = (clientY) => {
    let best = null;
    let bestDist = Infinity;
    for (const r of rows) {
      if (r === dragEl) continue;
      const rect = r.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const dist = Math.abs(mid - clientY);
      if (dist < bestDist) { bestDist = dist; best = r; }
    }
    return best;
  };

  const cleanup = () => {
    for (const r of rows) {
      r.classList.remove('row--drop-target');
      r.style.transform = '';
      r.style.position = '';
      r.style.zIndex = '';
    }
    dragEl?.classList.remove('row--dragging');
    dragEl = null;
    rows = [];
  };

  list.addEventListener('pointerdown', (e) => {
    if (!REORDERABLE.has(getTab())) return;
    const handle = e.target.closest('.row__handle');
    if (!handle) return;
    const rowEl = handle.closest('.row');
    if (!rowEl) return;
    e.preventDefault();
    dragEl = rowEl;
    rows = [...list.querySelectorAll('.row')];
    dragEl.style.position = 'relative';
    dragEl.style.zIndex = '5';
    dragEl.classList.add('row--dragging');
    dragEl.dataset.startY = String(e.clientY);
    try { dragEl.setPointerCapture(e.pointerId); } catch { /* not essential */ }
  });

  list.addEventListener('pointermove', (e) => {
    if (!dragEl) return;
    const startY = Number(dragEl.dataset.startY);
    dragEl.style.transform = `translateY(${e.clientY - startY}px)`;
    for (const r of rows) r.classList.remove('row--drop-target');
    rowAtPoint(e.clientY)?.classList.add('row--drop-target');
  });

  const onRelease = (e) => {
    if (!dragEl) return;
    const target = rowAtPoint(e.clientY);
    const key = dragEl.dataset.key;
    const tab = getTab();
    const toIndex = target ? rows.indexOf(target) : rows.indexOf(dragEl);
    cleanup();
    if (key && target) {
      study.reorder(tab, key, toIndex);
      repaint();
    }
  };
  list.addEventListener('pointerup', onRelease);
  list.addEventListener('pointercancel', cleanup);
}

export function render(host, params, navigate) {
  host.className = 'view';
  clear(host);
  document.title = 'Study · EO Multiversion Bible';

  let tab = TABS.some(([id]) => id === params.tab) ? params.tab : 'bookmarks';
  let listenState = 'idle'; // idle | speaking | paused

  host.append(el('p', { class: 'eyebrow', text: 'Personal study' }));
  host.append(el('h1', {
    style: 'font-family:var(--serif); font-size:1.75rem; font-weight:550; margin:.35rem 0 1.25rem; letter-spacing:-.01em',
    text: 'What you have kept',
  }));

  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Saved items' });
  const list = el('div');
  attachDragReorder(list, () => tab, () => paint());
  const counts = study.counts();

  for (const [id, label] of TABS) {
    seg.append(el('button', {
      dataset: { tab: id },
      text: `${label}${counts[id] ? ` ${counts[id]}` : ''}`,
      'aria-pressed': String(tab === id),
      onclick: () => {
        stopListening();
        tab = id;
        paint();
        try { history.replaceState(null, '', `#/study?tab=${id}`); } catch { /* sandboxed */ }
      },
    }));
  }
  host.append(seg);

  const listenIcon = el('span', { html: icon('speaker'), style: 'display:contents' });
  const listenLabel = el('span', { text: 'Listen to these' });
  const paintListen = () => {
    listenBtn.setAttribute('aria-pressed', String(listenState !== 'idle'));
    listenIcon.innerHTML = icon(listenState === 'speaking' ? 'pause' : listenState === 'paused' ? 'play' : 'speaker');
    listenLabel.textContent = listenState === 'speaking' ? 'Pause' : listenState === 'paused' ? 'Resume'
      : 'Listen to these';
  };
  function stopListening() {
    audio.stop();
    listenState = 'idle';
    paintListen();
    const active = list.querySelector('.row--speaking');
    active?.classList.remove('row--speaking');
  }
  const listenBtn = el('button', {
    class: 'tool', style: 'margin: var(--sp-3) 0', 'aria-pressed': 'false',
    onclick: async () => {
      if (!audio.isSupported()) { toast('This browser can\u2019t read aloud'); return; }
      if (listenState === 'speaking') { audio.pause(); listenState = 'paused'; paintListen(); return; }
      if (listenState === 'paused') { audio.resume(); listenState = 'speaking'; paintListen(); return; }

      const entries = study.collect(tab);
      if (!entries.length) return;
      const withText = await Promise.all(entries.map(async (entry) => {
        const tr = entry.translation && bible.isTranslation(entry.translation)
          ? entry.translation : settings.get('translation');
        const text = await bible.getVerse(tr, entry.bookId, entry.chapter, entry.verse).catch(() => null);
        return { verse: entry.key, text };
      }));
      listenState = 'speaking';
      paintListen();
      audio.speak(withText, {
        voiceURI: settings.get('readingVoice'),
        rate: settings.get('readingRate'),
        onVerseStart: (entry) => {
          list.querySelector('.row--speaking')?.classList.remove('row--speaking');
          const row = list.querySelector(`[data-key="${entry.verse}"]`);
          if (row) { row.classList.add('row--speaking'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        },
        onEnd: () => stopListening(),
      });
    },
  }, listenIcon, listenLabel);
  host.append(listenBtn, list);

  function paint() {
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
    clear(list);
    const entries = study.collect(tab);
    listenBtn.hidden = !entries.length;

    if (!entries.length) {
      list.append(el('div', { class: 'empty' },
        el('p', { text: emptyCopy(tab) }),
        el('p', { style: 'margin-top:.75rem' },
          el('button', { class: 'btn', text: 'Open the Bible', onclick: () => navigate('#/library') }))));
      return;
    }

    for (const entry of entries) {
      list.append(row(entry, tab, navigate, paint));
    }
  }

  paint();
}

function emptyCopy(tab) {
  return {
    bookmarks: 'Bookmark a verse while reading and it will be waiting here.',
    highlights: 'Highlights you make while reading will be collected here.',
    notes: 'Notes are private to this device. Write one from any verse.',
    favourites: 'Build a collection of the Scriptures that matter most to you.',
  }[tab];
}

function row(entry, tab, navigate, repaint) {
  const { bookId, chapter, verse } = entry;
  const tr = entry.translation && bible.isTranslation(entry.translation)
    ? entry.translation : settings.get('translation');
  const ref = bible.formatRef(bookId, chapter, verse);

  const body = el('div', { style: 'flex:1; min-width:0' },
    el('div', { class: 'result__ref', text: `${ref} · ${bible.getTranslation(tr).abbr}` }));

  const text = el('div', { class: 'result__text', text: '…' });
  body.append(text);
  bible.getVerse(tr, bookId, chapter, verse)
    .then((t) => { text.textContent = t || 'Not included in this translation.'; })
    .catch(() => { text.textContent = 'Not available offline.'; });

  if (tab === 'notes' && entry.text) {
    body.append(el('p', {
      style: 'margin-top:.6rem; padding-left:.75rem; border-left:2px solid var(--accent-bright); font-size:.875rem; color:var(--text)',
      text: entry.text,
    }));
  }
  if (tab === 'highlights' && entry.colour) {
    body.append(el('span', {
      style: `display:inline-block; width:.75rem; height:.75rem; border-radius:50%; margin-top:.6rem; background:var(--hl-${entry.colour})`,
      role: 'img', 'aria-label': `${entry.colour} highlight`,
    }));
  }

  const reorderable = REORDERABLE.has(tab);
  const handle = reorderable ? el('button', {
    class: 'icon-btn row__handle', html: icon('grip'),
    'aria-label': `Drag to reorder ${ref}`,
    style: 'touch-action:none; cursor:grab',
  }) : null;
  const pinBtn = reorderable ? el('button', {
    class: 'icon-btn', html: icon('pin'),
    'aria-label': `Move ${ref} to the top`,
    onclick: () => { study.moveToTop(tab, entry.key); toast('Moved to top'); repaint(); },
  }) : null;

  return el('div', { class: 'row', style: 'align-items:flex-start', dataset: { key: entry.key } },
    handle,
    el('button', {
      class: 'row__label', style: 'text-align:left; padding:0',
      onclick: () => navigate(`#/read/${tr}/${bookId}/${chapter}?v=${verse}`),

    }, body),
    pinBtn,
    el('button', {
      class: 'icon-btn', html: icon('trash'),
      'aria-label': `Remove ${ref} from ${tab}`,
      onclick: () => {
        study.removeEntry(tab, entry.key);
        toast('Removed');
        repaint();
      },
    })
  );
}
