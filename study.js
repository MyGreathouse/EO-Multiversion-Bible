/* study.js — bookmarks, highlights, notes, favourites and reading position.
 *
 * All of it is keyed to a Scripture reference rather than a translation, so a
 * note you make while reading one translation is still there when you switch to another.
 * Everything is stored on this device only.
 */
import * as store from './storage.js';

export const HIGHLIGHT_COLOURS = [
  { id: 'gold', label: 'Gold' },
  { id: 'terracotta', label: 'Terracotta' },
  { id: 'teal', label: 'Teal' },
  { id: 'sage', label: 'Sage' },
  { id: 'navy', label: 'Navy' },
];

export const refKey = (bookId, chapter, verse) => `${bookId}.${chapter}.${verse}`;
export const parseKey = (key) => {
  const [bookId, c, v] = key.split('.');
  return { bookId, chapter: +c, verse: +v };
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const notify = (what) => listeners.forEach((fn) => fn(what));

const load = (k, fallback) => store.get(k, fallback);
const save = (k, v, what) => { store.set(k, v); notify(what); };

/* ---- bookmarks ----------------------------------------------------------- */
export const bookmarks = () => load('bookmarks', {});
export const isBookmarked = (b, c, v) => Boolean(bookmarks()[refKey(b, c, v)]);

export function toggleBookmark(b, c, v, translation) {
  const all = bookmarks();
  const key = refKey(b, c, v);
  if (all[key]) delete all[key];
  else all[key] = { at: Date.now(), translation };
  save('bookmarks', all, 'bookmarks');
  return Boolean(all[key]);
}

/* ---- highlights ---------------------------------------------------------- */
export const highlights = () => load('highlights', {});
export const highlightOf = (b, c, v) => highlights()[refKey(b, c, v)]?.colour ?? null;

export function setHighlight(b, c, v, colour, translation) {
  const all = highlights();
  const key = refKey(b, c, v);
  if (!colour) delete all[key];
  else all[key] = { colour, at: Date.now(), translation };
  save('highlights', all, 'highlights');
  return colour;
}

/* ---- notes --------------------------------------------------------------- */
export const notes = () => load('notes', {});
export const noteOf = (b, c, v) => notes()[refKey(b, c, v)]?.text ?? '';

export function setNote(b, c, v, text, translation) {
  const all = notes();
  const key = refKey(b, c, v);
  const clean = (text || '').trim();
  if (!clean) delete all[key];
  else all[key] = { text: clean, at: Date.now(), translation };
  save('notes', all, 'notes');
  return clean;
}

/* ---- favourites ---------------------------------------------------------- */
export const favourites = () => load('favourites', {});
export const isFavourite = (b, c, v) => Boolean(favourites()[refKey(b, c, v)]);

export function toggleFavourite(b, c, v, translation) {
  const all = favourites();
  const key = refKey(b, c, v);
  if (all[key]) delete all[key];
  else all[key] = { at: Date.now(), translation };
  save('favourites', all, 'favourites');
  return Boolean(all[key]);
}

/* ---- reading position & history ------------------------------------------ */
export const position = () => load('position', null);

export function setPosition(translation, bookId, chapter) {
  const prev = position();
  if (prev && prev.bookId === bookId && prev.chapter === chapter && prev.translation === translation) return;
  save('position', { translation, bookId, chapter, at: Date.now() }, 'position');
  pushHistory(translation, bookId, chapter);
}

export const history = () => load('history', []);

function pushHistory(translation, bookId, chapter) {
  const list = history().filter((h) => !(h.bookId === bookId && h.chapter === chapter));
  list.unshift({ translation, bookId, chapter, at: Date.now() });
  store.set('history', list.slice(0, 40));
  notify('history');
}

/* ---- summary for the Study screen ---------------------------------------- */
// Bookmarks, highlights and favourites can be manually reordered; notes
// stay in their existing newest-first order, out of scope for this. The
// order is stored as a plain list of keys -- purely additive, so a list
// nobody has ever reordered behaves exactly as it always has.
const REORDERABLE = new Set(['bookmarks', 'highlights', 'favourites']);
const orderKey = (kind) => `${kind}Order`;
const getOrder = (kind) => load(orderKey(kind), []);
const setOrder = (kind, keys) => save(orderKey(kind), keys, orderKey(kind));

export function collect(kind) {
  const map = kind === 'bookmarks' ? bookmarks()
    : kind === 'highlights' ? highlights()
    : kind === 'notes' ? notes()
    : favourites();
  const entries = Object.entries(map).map(([key, value]) => ({ ...parseKey(key), ...value, key }));
  if (!REORDERABLE.has(kind)) return entries.sort((a, b) => b.at - a.at);

  const byKey = new Map(entries.map((e) => [e.key, e]));
  const ordered = [];
  for (const k of getOrder(kind)) {
    const e = byKey.get(k);
    if (e) { ordered.push(e); byKey.delete(k); }
  }
  // Anything not yet manually placed -- new items, or a list that's never
  // been reordered at all -- keeps the original newest-first behaviour.
  const rest = [...byKey.values()].sort((a, b) => b.at - a.at);
  return [...ordered, ...rest];
}

/** Pins one entry to the very top of its list. */
export function moveToTop(kind, key) {
  if (!REORDERABLE.has(kind)) return;
  const current = collect(kind).map((e) => e.key);
  setOrder(kind, [key, ...current.filter((k) => k !== key)]);
}

/** Moves one entry to a specific position (0-based) in its list. */
export function reorder(kind, key, toIndex) {
  if (!REORDERABLE.has(kind)) return;
  const current = collect(kind).map((e) => e.key);
  const without = current.filter((k) => k !== key);
  without.splice(Math.max(0, Math.min(toIndex, without.length)), 0, key);
  setOrder(kind, without);
}

export const counts = () => ({
  bookmarks: Object.keys(bookmarks()).length,
  highlights: Object.keys(highlights()).length,
  notes: Object.keys(notes()).length,
  favourites: Object.keys(favourites()).length,
});

export function removeEntry(kind, key) {
  const all = load(kind, {});
  delete all[key];
  save(kind, all, kind);
}
