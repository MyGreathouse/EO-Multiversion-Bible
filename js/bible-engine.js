/* bible-engine.js — translation-agnostic Scripture access.
 *
 *   Translation -> Book -> Chapter -> Verse
 *
 * The engine knows nothing about the interface, and the interface never
 * touches raw files. Adding a translation means adding a registry entry plus
 * a folder of book files in the same shape — no engine changes.
 *
 * Book file shape:  { i, n, t, c: [ [verse, ...], ... ], h?: { ch: { v: heading } } }
 * Scripture text is treated as immutable. Nothing here rewrites it.
 */

const DATA_ROOT = 'data';

/* ---- translation registry ------------------------------------------------ */
export const TRANSLATIONS = [
  {
    id: 'bsb',
    family: 'critical',
    abbr: 'BSB',
    name: 'Berean Standard Bible',
    year: 2022,
    language: 'en',
    rights: 'public-domain',
    notice:
      'The Berean Standard Bible has been dedicated to the public domain by ' +
      'Bible Hub. It may be used and reproduced freely, including commercially.',
  },
  {
    id: 'webbe',
    family: 'critical',
    abbr: 'WEB-BE',
    name: 'World English Bible, British Edition',
    year: 2020,
    language: 'en-GB',
    rights: 'public-domain',
    notice:
      'The World English Bible, British Edition is in the public domain, ' +
      'dedicated as such by Michael Paul Johnson and eBible.org.',
  },
  {
    id: 'asv',
    family: 'critical',
    abbr: 'ASV',
    name: 'American Standard Version',
    year: 1901,
    language: 'en',
    rights: 'public-domain',
    notice:
      'The American Standard Version (1901) is in the public domain; its ' +
      'copyright, held by Thomas Nelson & Sons and later the International ' +
      'Council of Religious Education, has expired.',
  },
  {
    id: 'webster',
    family: 'received',
    abbr: 'Webster',
    name: "Webster's Bible",
    year: 1833,
    language: 'en',
    rights: 'public-domain',
    notice:
      "Noah Webster's revision of the King James Version (1833), modernising " +
      'its language. In the public domain; its 1833 publication date places ' +
      'it beyond any copyright term.',
  },
  {
    id: 'ylt',
    family: 'received',
    abbr: 'YLT',
    name: "Young's Literal Translation",
    year: 1898,
    language: 'en',
    rights: 'public-domain',
    notice:
      "Robert Young's word-for-word translation (1862, revised 1898), rendered " +
      'directly from the Hebrew and Greek. In the public domain worldwide.',
  },
];

export const getTranslation = (id) =>
  TRANSLATIONS.find((t) => t.id === id) || TRANSLATIONS[0];

export const isTranslation = (id) => TRANSLATIONS.some((t) => t.id === id);

/**
 * Some verses are absent from translations that follow the modern critical
 * text (Acts 24:7, Mark 9:44, John 5:4 and so on) but present in those that
 * follow the Received Text. Rather than show a bare gap, the reader can offer
 * the verse from a translation that carries it — clearly attributed, never
 * silently substituted, and never invented.
 * Returns { translation, text } or null.
 */
export async function findOmittedVerse(currentId, bookId, chapter, verse) {
  const candidates = TRANSLATIONS.filter(
    (t) => t.id !== currentId && t.family === 'received'
  );
  for (const t of candidates) {
    try {
      const text = await getVerse(t.id, bookId, chapter, verse);
      if (text && text.trim()) return { translation: t, text };
    } catch {
      /* that translation isn't downloaded yet; try the next */
    }
  }
  return null;
}

/* ---- canon --------------------------------------------------------------- */
let canon = null;          // { version, books: [...] }
let byId = new Map();
let byLower = new Map();

const bookCache = new Map();     // `${tr}/${bookId}` -> book object
const inflight = new Map();

export async function loadCanon() {
  if (canon) return canon;
  const res = await fetch(`${DATA_ROOT}/canon.json`);
  if (!res.ok) throw new Error('Could not load the Bible index.');
  canon = await res.json();
  byId = new Map(canon.books.map((b) => [b.id, b]));
  byLower = new Map();
  for (const b of canon.books) {
    byLower.set(b.name.toLowerCase(), b);
    byLower.set(b.name.toLowerCase().replace(/\s+/g, ''), b);
    byLower.set(b.id.toLowerCase(), b);
    for (const alias of ALIASES[b.id] || []) byLower.set(alias, b);
  }
  return canon;
}

export const books = () => (canon ? canon.books : []);
export const booksIn = (testament) => books().filter((b) => b.testament === testament);
export const book = (id) => byId.get(id) || null;
export const bookName = (id) => (byId.get(id)?.name ?? id);
export const chapterCount = (id) => byId.get(id)?.chapters.length ?? 0;
export const verseCount = (id, ch) => byId.get(id)?.chapters[ch - 1] ?? 0;

/** Previous/next chapter across book boundaries. */
export function step(bookId, chapter, delta) {
  const list = books();
  let i = list.findIndex((b) => b.id === bookId);
  if (i < 0) return null;
  let ch = chapter + delta;
  if (ch < 1) {
    if (i === 0) return null;
    i -= 1;
    ch = list[i].chapters.length;
  } else if (ch > list[i].chapters.length) {
    if (i === list.length - 1) return null;
    i += 1;
    ch = 1;
  }
  return { bookId: list[i].id, chapter: ch };
}

/* ---- loading ------------------------------------------------------------- */
export async function loadBook(translationId, bookId) {
  const key = `${translationId}/${bookId}`;
  if (bookCache.has(key)) return bookCache.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const res = await fetch(`${DATA_ROOT}/translations/${translationId}/${bookId}.json`);
      if (!res.ok) throw new Error(`${bookName(bookId)} is not available offline yet.`);
      const data = await res.json();
      if (!Array.isArray(data.c)) throw new Error('Scripture file is malformed.');
      if (data.q && typeof data.q !== 'object') delete data.q;
      bookCache.set(key, data);
      return data;
    } finally {
      // A failed load must not poison later attempts.
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export async function getChapter(translationId, bookId, chapter) {
  const b = await loadBook(translationId, bookId);
  const verses = b.c[chapter - 1];
  if (!verses) throw new Error(`${bookName(bookId)} has no chapter ${chapter}.`);
  return {
    translation: translationId,
    bookId,
    bookName: b.n,
    chapter,
    verses,
    headings: (b.h && b.h[String(chapter)]) || null,
    poetry: (b.q && b.q[String(chapter)]) || null,
  };
}

export async function getVerse(translationId, bookId, chapter, verse) {
  const b = await loadBook(translationId, bookId);
  return b.c[chapter - 1]?.[verse - 1] ?? '';
}

/** The same verse in every registered translation, for comparison. */
export async function compareVerse(bookId, chapter, verse) {
  return Promise.all(
    TRANSLATIONS.map(async (t) => {
      try {
        return { translation: t, text: await getVerse(t.id, bookId, chapter, verse) };
      } catch {
        return { translation: t, text: '', error: true };
      }
    })
  );
}

export const isLoaded = (translationId, bookId) =>
  bookCache.has(`${translationId}/${bookId}`);

/* ---- references ---------------------------------------------------------- */
const ALIASES = {
  GEN: ['gn'], EXO: ['ex', 'exod'], LEV: ['lv', 'lev'], NUM: ['nm', 'num'],
  DEU: ['dt', 'deut'], JOS: ['josh'], JDG: ['judg', 'jdgs'], RUT: ['ruth', 'rth'],
  '1SA': ['1sam', 'isam', '1 sam'], '2SA': ['2sam', '2 sam'],
  '1KI': ['1kgs', '1kings', '1 kgs'], '2KI': ['2kgs', '2kings', '2 kgs'],
  '1CH': ['1chr', '1chron'], '2CH': ['2chr', '2chron'],
  EZR: ['ezra'], NEH: ['neh'], EST: ['esth'], JOB: ['jb'],
  PSA: ['ps', 'psalm', 'psa', 'pss'], PRO: ['prov', 'prv'], ECC: ['eccl', 'qoh'],
  SNG: ['song', 'songofsongs', 'sos', 'canticles'], ISA: ['is', 'isa'],
  JER: ['jer'], LAM: ['lam'], EZK: ['ezek', 'eze'], DAN: ['dan', 'dn'],
  HOS: ['hos'], JOL: ['joel'], AMO: ['am', 'amos'], OBA: ['obad', 'ob'],
  JON: ['jonah'], MIC: ['mic'], NAM: ['nah', 'nahum'], HAB: ['hab'],
  ZEP: ['zeph'], HAG: ['hag'], ZEC: ['zech'], MAL: ['mal'],
  MAT: ['mt', 'matt', 'matthew'], MRK: ['mk', 'mark', 'mr'],
  LUK: ['lk', 'luke'], JHN: ['jn', 'john', 'joh'], ACT: ['acts', 'ac'],
  ROM: ['rom', 'rm'], '1CO': ['1cor', '1 cor'], '2CO': ['2cor', '2 cor'],
  GAL: ['gal'], EPH: ['eph'], PHP: ['phil', 'php', 'philip'],
  COL: ['col'], '1TH': ['1thess', '1thes'], '2TH': ['2thess', '2thes'],
  '1TI': ['1tim'], '2TI': ['2tim'], TIT: ['titus'], PHM: ['philem', 'phlm'],
  HEB: ['heb'], JAS: ['jas', 'james'], '1PE': ['1pet', '1pt'], '2PE': ['2pet', '2pt'],
  '1JN': ['1john', '1jn'], '2JN': ['2john', '2jn'], '3JN': ['3john', '3jn'],
  JUD: ['jude'], REV: ['rev', 'apocalypse'],
};

/**
 * Parse "John 3:16", "1 cor 13", "ps 23", "Romans 8:28-30".
 * Returns { bookId, chapter, verse } or null. Chapter and verse are clamped
 * to what actually exists so a reference can never point off the end.
 */
export function parseReference(input) {
  if (!input) return null;
  const s = input.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  const m = s.match(/^([1-3]?\s?[a-z]+(?:\s[a-z]+)*)\s*(\d+)?\s*(?::\s*(\d+))?/);
  if (!m) return null;

  const namePart = m[1].replace(/\s+/g, ' ').trim();
  const b = byLower.get(namePart) || byLower.get(namePart.replace(/\s+/g, ''));
  if (!b) return null;

  let chapter = m[2] ? parseInt(m[2], 10) : 1;
  chapter = Math.min(Math.max(chapter, 1), b.chapters.length);
  let verse = m[3] ? parseInt(m[3], 10) : null;
  if (verse !== null) verse = Math.min(Math.max(verse, 1), b.chapters[chapter - 1]);
  return { bookId: b.id, chapter, verse };
}

export const formatRef = (bookId, chapter, verse) =>
  verse ? `${bookName(bookId)} ${chapter}:${verse}` : `${bookName(bookId)} ${chapter}`;
