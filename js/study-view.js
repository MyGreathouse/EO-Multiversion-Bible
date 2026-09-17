/* study-view.js — everything you have saved, in one place. */
import * as bible from './bible-engine.js';
import * as settings from './settings.js';
import * as study from './study.js';
import { el, clear, icon, toast } from './ui.js';

const TABS = [
  ['bookmarks', 'Bookmarks'],
  ['highlights', 'Highlights'],
  ['notes', 'Notes'],
  ['favourites', 'Favourites'],
];

export function render(host, params, navigate) {
  host.className = 'view';
  clear(host);
  document.title = 'Study · EO Multiversion Bible';

  let tab = TABS.some(([id]) => id === params.tab) ? params.tab : 'bookmarks';

  host.append(el('p', { class: 'eyebrow', text: 'Personal study' }));
  host.append(el('h1', {
    style: 'font-family:var(--serif); font-size:1.75rem; font-weight:550; margin:.35rem 0 1.25rem; letter-spacing:-.01em',
    text: 'What you have kept',
  }));

  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Saved items' });
  const list = el('div');
  const counts = study.counts();

  for (const [id, label] of TABS) {
    seg.append(el('button', {
      dataset: { tab: id },
      text: `${label}${counts[id] ? ` ${counts[id]}` : ''}`,
      'aria-pressed': String(tab === id),
      onclick: () => {
        tab = id;
        paint();
        try { history.replaceState(null, '', `#/study?tab=${id}`); } catch { /* sandboxed */ }
      },
    }));
  }
  host.append(seg, list);

  function paint() {
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
    clear(list);
    const entries = study.collect(tab);

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

  return el('div', { class: 'row', style: 'align-items:flex-start' },
    el('button', {
      class: 'row__label', style: 'text-align:left; padding:0',
      onclick: () => navigate(`#/read/${tr}/${bookId}/${chapter}?v=${verse}`),
    }, body),
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
