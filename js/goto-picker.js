/* goto-picker.js — change book and chapter without leaving the page you are on.
 *
 * A bottom sheet in two steps: pick a book (with the same type-to-find as the
 * Library), then pick a chapter from a grid. Opened from the reader's header
 * and toolbar and from the Study screen, so reading and studying never need a
 * trip back through Home or the Library.
 *
 *   openGoTo({ navigate, bookId, chapter })
 *
 * start: 'chapters' (default) opens on the current book's chapter grid; 'books'
 * opens on the book list with the current book highlighted. With no bookId it
 * always opens on the book list. Choosing a chapter navigates to the current
 * translation, and the book name at the top of a chapter grid is a link that
 * starts the book at chapter 1.
 */
import * as bible from './bible-engine.js';
import * as settings from './settings.js';
import { el, clear, icon } from './ui.js';

let sheet = null;
let backdrop = null;
let lastFocus = null;
let keyBound = false;

function ensure() {
  if (sheet) return;
  backdrop = el('div', { class: 'sheet-backdrop', onclick: close });
  sheet = el('div', {
    class: 'sheet sheet--goto', role: 'dialog', 'aria-modal': 'true',
    'aria-label': 'Go to a book and chapter', tabindex: '-1',
  });
  document.body.append(backdrop, sheet);
  if (!keyBound) {
    keyBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sheet?.classList.contains('is-open')) close();
    });
  }
}

export function close() {
  if (!sheet) return;
  sheet.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  lastFocus?.focus?.();
}

/* Same forgiving match as the Library: "1cor", "1 cor", "corinthians", "rom". */
const norm = (s) => s.toLowerCase().replace(/[.\s]/g, '');
const matches = (b, q) => !q || norm(b.name).includes(norm(q)) || norm(b.id).includes(norm(q));

export function openGoTo({ navigate, bookId = null, chapter = null, start = 'chapters' }) {
  ensure();
  lastFocus = document.activeElement;
  const tr = settings.get('translation');

  const go = (id, ch) => {
    close();
    navigate(`#/read/${tr}/${id}/${ch}`);
  };

  const head = (title, backLabel, onBack) => el('div', { class: 'sheet__head' },
    onBack
      ? el('button', {
          class: 'goto-back', onclick: onBack, 'aria-label': backLabel,
        }, el('span', { html: icon('chevronLeft'), style: 'display:contents' }), backLabel)
      : null,
    el('div', { class: 'sheet__ref', text: title || '' }),
    el('button', { class: 'icon-btn', html: icon('close'), 'aria-label': 'Close', onclick: close })
  );

  /* ---- step 2: chapters of one book -------------------------------------- */
  const showChapters = (id, fromList) => {
    const b = bible.book(id);
    if (!b) return;
    if (b.chapters.length === 1) { go(b.id, 1); return; }

    clear(sheet);
    sheet.append(
      el('div', { class: 'sheet__grip', 'aria-hidden': 'true' }),
      head(null, 'Books', () => showBooks(b.id)),
      el('p', { class: 'goto-sub', text: `${b.chapters.length} chapters · ${bible.getTranslation(tr).abbr} · tap a number, or the book name to start at chapter 1` })
    );
    // The book itself is a link: one tap reads it from the beginning.
    sheet.querySelector('.sheet__head .sheet__ref').replaceWith(el('button', {
      class: 'goto-booklink', 'aria-label': `Read ${b.name} from chapter 1`,
      onclick: () => go(b.id, 1),
    },
      el('span', { text: b.name }),
      el('span', { html: icon('chevronRight'), style: 'display:contents' })));
    const grid = el('div', { class: 'goto-grid', role: 'group', 'aria-label': `${b.name} chapters` });
    let currentBtn = null;
    for (let n = 1; n <= b.chapters.length; n++) {
      const isCurrent = b.id === bookId && n === chapter;
      const btn = el('button', {
        class: 'goto-ch', text: String(n),
        'aria-label': `${b.name} chapter ${n}`,
        'aria-current': isCurrent ? 'true' : 'false',
        onclick: () => go(b.id, n),
      });
      if (isCurrent) currentBtn = btn;
      grid.append(btn);
    }
    sheet.append(grid);
    // Only the current chapter is focused/scrolled to; otherwise the sheet itself holds focus.
    currentBtn?.scrollIntoView?.({ block: 'center' });
  };

  /* ---- step 1: books ----------------------------------------------------- */
  let tab = bible.book(bookId)?.testament || 'OT';   // which testament the tabs show
  const showBooks = (focusId = null) => {
    const focusBook = bible.book(focusId || bookId);
    if (focusBook) tab = focusBook.testament;
    clear(sheet);
    const list = el('div', { class: 'goto-books' });
    const TABS = [['OT', 'Old Testament'], ['NT', 'New Testament']];
    const seg = el('div', { class: 'seg goto-seg', role: 'group', 'aria-label': 'Testament' });
    const paintTabs = () => {
      for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.t === tab));
    };
    for (const [t, label] of TABS) {
      seg.append(el('button', {
        dataset: { t }, text: `${label} · ${bible.booksIn(t).length}`,
        onclick: () => { tab = t; paintTabs(); paint(input.value); list.scrollTop = 0; },
      }));
    }
    const input = el('input', {
      type: 'search', placeholder: 'Find a book — try “genesis” or “rom”',
      'aria-label': 'Find a book', autocomplete: 'off', autocapitalize: 'off',
      spellcheck: 'false', enterkeyhint: 'go',
    });
    const paint = (q = '') => {
      clear(list);
      let shown = 0;
      // Searching spans both testaments (and the tabs step aside); otherwise show just the chosen one.
      seg.hidden = !!q;
      const groups = q ? [['Old Testament', 'OT'], ['New Testament', 'NT']]
                       : TABS.filter(([t]) => t === tab).map(([t, l]) => [l, t]);
      for (const [label, testament] of groups) {
        const found = bible.booksIn(testament).filter((b) => matches(b, q));
        if (!found.length) continue;
        if (q) list.append(el('p', { class: 'version-group', text: label }));
        for (const b of found) {
          shown++;
          list.append(el('button', {
            class: 'book-row', 'aria-current': String(b.id === bookId),
            'aria-label': `${b.name}, ${b.chapters.length} chapters`,
            dataset: { book: b.id },
            onclick: () => showChapters(b.id, true),
          },
            el('span', { class: 'book-row__name', text: b.name }),
            el('span', { class: 'book-row__id', text: b.id }),
            el('span', { class: 'book-row__ch', text: String(b.chapters.length) })));
        }
      }
      if (!shown) list.append(el('div', { class: 'empty', style: 'margin-top:1rem', text: `No book matches “${q}”.` }));
    };
    input.addEventListener('input', () => paint(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); // otherwise this same Enter would "click" the chapter button that gets focus next
      const found = bible.books().filter((b) => matches(b, input.value));
      if (found.length >= 1 && input.value) showChapters(found[0].id, true);
    });
    sheet.append(
      el('div', { class: 'sheet__grip', 'aria-hidden': 'true' }),
      head('Go to', null, null),
      el('div', { class: 'book-filter', style: 'margin-top:.75rem' },
        el('span', { class: 'book-filter__icon', html: icon('search'), 'aria-hidden': 'true' }),
        input),
      seg,
      list
    );
    paintTabs();
    paint();
    const target = list.querySelector(`[data-book="${focusId || bookId}"]`);
    if (target) target.scrollIntoView({ block: 'center' });
    else input.focus({ preventScroll: true });
  };

  // A one-chapter book (Jude, Obadiah…) has no grid to show, so start on the book list.
  if (start !== 'books' && bookId && bible.book(bookId)?.chapters.length > 1) showChapters(bookId, false);
  else showBooks(bookId);

  sheet.classList.add('is-open');
  backdrop.classList.add('is-open');
  sheet.focus({ preventScroll: true });
}
