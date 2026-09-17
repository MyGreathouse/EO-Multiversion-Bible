/* library.js — choosing what to read.
 *
 *   The Bible  ->  Old Testament | New Testament  ->  Book  ->  Chapter
 *
 * Every level carries the version with it, so whichever translation you pick is
 * the one you land in. A filter box on both the top level and the testament
 * level lets a person jump straight to a book by typing a few letters, rather
 * than scrolling a 39- or 27-book list to find it.
 */
import * as bible from './bible-engine.js';
import * as settings from './settings.js';
import { el, clear, icon, toast } from './ui.js';

const TESTAMENTS = {
  OT: {
    id: 'OT',
    name: 'Old Testament',
    blurb: 'Law, history, poetry and the prophets.',
    span: 'Genesis to Malachi',
  },
  NT: {
    id: 'NT',
    name: 'New Testament',
    blurb: 'Gospels, Acts, the letters and Revelation.',
    span: 'Matthew to Revelation',
  },
};

export function render(host, params, navigate) {
  host.className = 'view';
  clear(host);
  const level = params.level;
  if (level === 'book') renderChapters(host, params.bookId, navigate);
  else if (level === 'OT' || level === 'NT') renderBooks(host, level, navigate);
  else renderHome(host, navigate);
}

/* ---- version picker, shared by every level -------------------------------- */
function versionPicker(onChange) {
  const wrap = el('div', { class: 'versions versions--six', role: 'group', 'aria-label': 'Bible version' });
  const paint = () => {
    for (const b of wrap.querySelectorAll('.version')) {
      b.setAttribute('aria-pressed', String(b.dataset.tr === settings.get('translation')));
    }
  };
  const groups = [
    { label: 'Modern', ids: ['bsb', 'webbe'] },
    { label: 'Classic', ids: ['asv', 'webster', 'ylt'] },
  ];
  for (const g of groups) {
    const set = bible.TRANSLATIONS.filter((t) => g.ids.includes(t.id));
    if (!set.length) continue;
    wrap.append(el('span', { class: 'version-group', style: 'grid-column:1/-1', text: g.label }));
    for (const t of set) {
      wrap.append(el('button', {
        class: 'version', dataset: { tr: t.id }, 'aria-label': `${t.name} (${t.year})`,
        onclick: () => {
          settings.set('translation', t.id);
          paint();
          toast(`${t.abbr} — ${t.name}`);
          if (onChange) onChange();
        },
      },
        el('span', { class: 'version__abbr', text: t.abbr }),
        el('span', { class: 'version__name', text: t.name })
      ));
    }
  }
  paint();
  return wrap;
}

/* ---- book filter, shared by the top level and each testament -------------
 * Matches on book name, its 3–4 letter canon id, and common typed shorthand
 * (spaces and punctuation stripped), so "1cor", "1 cor" and "corinthians"
 * all find 1 Corinthians. Filtering is instant client-side work over at most
 * 39 items, so it runs on every keystroke with no debounce needed.
 */
function normalise(s) {
  return s.toLowerCase().replace(/[.\s]/g, '');
}

function matches(book, query) {
  if (!query) return true;
  const q = normalise(query);
  return normalise(book.name).includes(q) || normalise(book.id).includes(q);
}

/**
 * onFilter(query) re-renders whatever the query should affect. onEnter()
 * fires when the person presses Enter, so a single confident match can be
 * opened straight from the keyboard.
 */
function filterBox(placeholder, onFilter, onEnter) {
  const wrap = el('div', { class: 'book-filter' });
  const input = el('input', {
    type: 'search', placeholder, 'aria-label': placeholder,
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go',
  });
  const clearBtn = el('button', {
    class: 'book-filter__clear', html: icon('close'), 'aria-label': 'Clear',
    hidden: true, onclick: () => { input.value = ''; clearBtn.hidden = true; onFilter(''); input.focus(); },
  });
  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    onFilter(input.value);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnter?.(input.value); });
  wrap.append(
    el('span', { class: 'book-filter__icon', html: icon('search'), 'aria-hidden': 'true' }),
    input, clearBtn
  );
  return wrap;
}

function bookRow(b, navigate, showTestamentTag) {
  return el('button', {
    class: 'book-row',
    'aria-label': `${b.name}, ${b.chapters.length} chapters`,
    onclick: () => navigate(`#/library/book/${b.id}`),
  },
    el('span', { class: 'book-row__name', text: b.name }),
    el('span', { class: 'book-row__id', text: b.id }),
    showTestamentTag && el('span', { class: 'book-row__tag', text: b.testament }),
    el('span', { class: 'book-row__ch', text: String(b.chapters.length) })
  );
}

const noMatches = (query) => el('div', { class: 'empty', style: 'margin-top:1rem' },
  `No book matches “${query}”.`);

/* ---- level 1: the two testaments ------------------------------------------ */
function renderHome(host, navigate) {
  document.title = 'Bible · EO Multiversion Bible';

  host.append(el('p', { class: 'eyebrow', text: 'The Bible' }));
  host.append(el('h1', { class: 'page-title', text: 'Sixty-six books' }));

  const testamentSection = el('div', {});
  const list = el('div', { class: 'stack' });
  for (const t of [TESTAMENTS.OT, TESTAMENTS.NT]) {
    const books = bible.booksIn(t.id);
    const chapters = books.reduce((a, b) => a + b.chapters.length, 0);
    list.append(el('button', {
      class: 'card testament',
      'aria-label': `${t.name}, ${books.length} books`,
      onclick: () => navigate(`#/library/${t.id}`),
    },
      el('span', { class: 'testament__body' },
        el('span', { class: 'testament__name', text: t.name }),
        el('span', { class: 'testament__blurb', text: t.blurb }),
        el('span', { class: 'testament__meta',
                     text: `${books.length} books · ${chapters} chapters · ${t.span}` })
      ),
      el('span', { class: 'testament__go', html: icon('chevronRight') })
    ));
  }
  testamentSection.append(list);

  const results = el('div', { class: 'books', style: 'margin-top:1rem' });
  const allBooks = bible.books();

  function paint(query) {
    if (!query.trim()) {
      testamentSection.hidden = false;
      results.hidden = true;
      return;
    }
    testamentSection.hidden = true;
    results.hidden = false;
    clear(results);
    const found = allBooks.filter((b) => matches(b, query));
    if (!found.length) { results.append(noMatches(query)); return; }
    for (const b of found) results.append(bookRow(b, navigate, true));
  }

  function openBest(query) {
    const found = allBooks.filter((b) => matches(b, query));
    if (found.length === 1) navigate(`#/library/book/${found[0].id}`);
  }

  host.append(el('p', { class: 'eyebrow', style: 'margin:1.25rem 0 .5rem', text: 'Find a book' }));
  host.append(filterBox('Find a book — try “genesis” or “rom”', paint, openBest));
  host.append(testamentSection, results);
  results.hidden = true;

  host.append(el('p', { class: 'eyebrow', style: 'margin:2rem 0 .5rem', text: 'Version' }));
  host.append(versionPicker());

  host.append(el('div', { class: 'ad-slot', 'data-slot': 'library', 'aria-hidden': 'true' }));
}

/* ---- level 2: books within a testament ------------------------------------ */
function renderBooks(host, testament, navigate) {
  const t = TESTAMENTS[testament];
  document.title = `${t.name} · EO Multiversion Bible`;

  host.append(backButton('The Bible', () => navigate('#/library')));
  host.append(el('p', { class: 'eyebrow', text: 'Testament' }));
  host.append(el('h1', { class: 'page-title', text: t.name }));
  host.append(el('p', { class: 'page-sub', text: t.blurb }));

  const books = bible.booksIn(testament);
  const list = el('div', { class: 'books' });
  const empty = el('div', {});

  function paint(query) {
    clear(list);
    const found = books.filter((b) => matches(b, query));
    if (!found.length) { clear(empty); empty.append(noMatches(query)); return; }
    clear(empty);
    for (const b of found) list.append(bookRow(b, navigate, false));
  }

  function openBest(query) {
    const found = books.filter((b) => matches(b, query));
    if (found.length === 1) navigate(`#/library/book/${found[0].id}`);
  }

  host.append(el('p', { class: 'eyebrow', style: 'margin:1.25rem 0 .5rem', text: 'Find a book' }));
  host.append(filterBox(`Find a book in the ${t.name}`, paint, openBest));
  host.append(list, empty);
  paint('');

  host.append(el('p', { class: 'eyebrow', style: 'margin:2rem 0 .5rem', text: 'Version' }));
  host.append(versionPicker());
}

/* ---- level 3: chapters within a book --------------------------------------- */
function renderChapters(host, bookId, navigate) {
  const b = bible.book(bookId);
  if (!b) { navigate('#/library'); return; }
  document.title = `${b.name} · EO Multiversion Bible`;

  const t = TESTAMENTS[b.testament];
  host.append(backButton(t.name, () => navigate(`#/library/${b.testament}`)));
  host.append(el('p', { class: 'eyebrow', text: t.name }));
  host.append(el('h1', { class: 'page-title', text: b.name }));
  host.append(el('p', {
    class: 'page-sub',
    text: `${b.chapters.length} ${b.chapters.length === 1 ? 'chapter' : 'chapters'} · `
        + `${b.chapters.reduce((a, c) => a + c, 0)} verses`,
  }));

  host.append(el('p', { class: 'eyebrow', style: 'margin:1.5rem 0 .5rem', text: 'Version' }));
  host.append(versionPicker(() => render(host, { level: 'book', bookId }, navigate)));

  host.append(el('p', { class: 'eyebrow', style: 'margin:1.5rem 0 .5rem', text: 'Chapter' }));
  const grid = el('div', { class: 'chapters', role: 'group', 'aria-label': `Chapters of ${b.name}` });
  for (let c = 1; c <= b.chapters.length; c++) {
    grid.append(el('button', {
      class: 'chip', text: String(c),
      'aria-label': `${b.name} chapter ${c}`,
      onclick: () => navigate(`#/read/${settings.get('translation')}/${b.id}/${c}`),
    }));
  }
  host.append(grid);
}

const backButton = (label, onclick) => el('button', {
  class: 'btn btn--ghost back', onclick, 'aria-label': `Back to ${label}`,
},
  el('span', { html: icon('chevronLeft'), style: 'display:contents' }),
  el('span', { text: label })
);
