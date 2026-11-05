/* cross-refs.js — related passages for a verse.
 *
 * Source: OpenBible.info's crowd-sourced, vote-ranked cross-reference set.
 * Licensed CC BY — unlike the translations in this app, it requires
 * attribution, which is why it is credited explicitly wherever it is shown
 * and again in Settings.
 *
 * One file per book, loaded lazily and cached, matching the pattern already
 * used for Scripture itself.
 */
import { book as canonBook, bookName } from './bible-engine.js';

const DATA_ROOT = 'data/xrefs';
const cache = new Map();
const inflight = new Map();

export const ATTRIBUTION = 'Cross-reference data from OpenBible.info, used under a Creative Commons Attribution licence.';

async function loadBook(bookId) {
  if (cache.has(bookId)) return cache.get(bookId);
  if (inflight.has(bookId)) return inflight.get(bookId);

  const p = (async () => {
    try {
      const res = await fetch(`${DATA_ROOT}/${bookId}.json`);
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      cache.set(bookId, data);
      return data;
    } catch {
      // Cross-references are supplementary; a missing file should degrade to
      // "none found", not break the reading experience.
      cache.set(bookId, {});
      return {};
    } finally {
      inflight.delete(bookId);
    }
  })();
  inflight.set(bookId, p);
  return p;
}

/**
 * Cross-references for one verse, ranked by community relevance.
 * Returns [{ bookId, bookName, chapter, verseStart, verseEnd }, ...].
 */
export async function forVerse(bookId, chapter, verse) {
  const data = await loadBook(bookId);
  const raw = data?.[String(chapter)]?.[String(verse)] || [];
  return raw.map(([toBook, toChapter, toStart, toEnd]) => ({
    bookId: toBook,
    bookName: bookName(toBook),
    chapter: toChapter,
    verseStart: toStart,
    verseEnd: toEnd,
  }));
}

export function formatRange(ref) {
  const { bookName: name, chapter, verseStart, verseEnd } = ref;
  return verseStart === verseEnd
    ? `${name} ${chapter}:${verseStart}`
    : `${name} ${chapter}:${verseStart}-${verseEnd}`;
}

/** Whether this book has any cross-reference data at all (for offline UX). */
export async function isAvailable(bookId) {
  if (!canonBook(bookId)) return false;
  const data = await loadBook(bookId);
  return Object.keys(data).length > 0;
}
