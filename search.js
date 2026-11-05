/* search.js — full-Bible search across the active translation.
 *
 * Searching needs the whole translation in memory, so the first search loads
 * all 66 books with visible progress and keeps them for the session. A direct
 * reference ("John 3:16", "Romans 8") is answered instantly, before any load.
 */
import * as bible from './bible-engine.js';
import * as settings from './settings.js';
import { el, clear, icon, escapeHtml } from './ui.js';

const MAX_RESULTS = 200;
const corpus = new Map();   // translationId -> [{ bookId, name, chapter, verse, text, lower }]
const incomplete = new Map();  // translationId -> [book names that could not be loaded]
let loading = null;

let lastQuery = '';
let lastResults = null;

export function render(host, params, navigate) {
  host.className = 'view';
  clear(host);
  document.title = 'Search · EO Multiversion Bible';

  const tr = settings.get('translation');
  const t = bible.getTranslation(tr);

  const input = el('input', {
    type: 'search', enterkeyhint: 'search',
    placeholder: 'A word, a phrase, or John 3:16',
    'aria-label': 'Search the Bible',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
  });

  const bar = el('div', { class: 'searchbar' }, input,
    el('button', { class: 'btn btn--primary', html: icon('search'), 'aria-label': 'Search', onclick: () => run(input.value) }));

  const meta = el('p', {
    style: 'margin-top:.6rem; font-size:.8125rem; color:var(--text-2)',
    text: `Searching ${t.name}. Change translation in Settings.`,
  });

  const status = el('div', { style: 'margin-top:1.5rem', role: 'status', 'aria-live': 'polite' });
  const results = el('div');

  host.append(bar, meta, status, results);

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(input.value); });

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value;
    if (q.trim().length < 3) { clear(status); clear(results); return; }
    debounce = setTimeout(() => run(q), 320);
  });

  if (params.q) { input.value = params.q; run(params.q); }
  else {
    status.append(hints(navigate));
    input.focus({ preventScroll: true });
  }

  async function run(raw) {
    const q = raw.trim();
    clear(status); clear(results);
    if (q.length < 2) return;

    // 1. A direct reference wins.
    const ref = bible.parseReference(q);
    if (ref) {
      status.append(el('p', { class: 'eyebrow', text: 'Go to passage' }));
      results.append(el('button', {
        class: 'result',
        onclick: () => navigate(`#/read/${tr}/${ref.bookId}/${ref.chapter}${ref.verse ? `?v=${ref.verse}` : ''}`),
      },
        el('div', { class: 'result__ref', text: bible.formatRef(ref.bookId, ref.chapter, ref.verse) }),
        el('div', { class: 'result__text', text: 'Open this passage' })
      ));
      if (q.replace(/[^a-z]/gi, '').length < 3) return;
      status.append(el('p', { class: 'eyebrow', style: 'margin-top:1.5rem', text: 'Also found in the text' }));
    }

    // 2. Text search.
    if (!corpus.has(tr)) {
      const bar2 = el('div', { class: 'progress' });
      const fill = el('div', { class: 'progress__bar' });
      bar2.append(fill);
      status.append(el('p', { class: 'eyebrow', text: `Preparing ${t.abbr} for searching…` }), bar2);
      await buildCorpus(tr, (p) => { fill.style.width = `${Math.round(p * 100)}%`; });
      clear(status);
      if (ref) status.append(el('p', { class: 'eyebrow', text: 'Also found in the text' }));
    }

    const gaps = incomplete.get(tr) || [];
    if (gaps.length) {
      status.append(el('p', {
        style: 'font-size:.8125rem; color:var(--text-2); margin-bottom:.75rem',
        text: gaps.length > 6
          ? `${gaps.length} books are not downloaded, so they were not searched.`
          : `Not searched (not downloaded): ${gaps.join(', ')}.`,
      }));
    }

    const found = query(tr, q);
    lastQuery = q; lastResults = found;

    status.append(el('p', {
      class: 'eyebrow',
      text: found.length === 0 ? `No matches for “${q}”`
        : `${found.length >= MAX_RESULTS ? `First ${MAX_RESULTS}` : found.length} ${found.length === 1 ? 'match' : 'matches'} in ${t.abbr}`,
    }));

    if (!found.length) {
      results.append(el('div', { class: 'empty', style: 'margin-top:1rem' },
        'Try a shorter word, a different spelling, or a reference like Psalm 23.'));
      return;
    }

    for (const r of found) {
      results.append(el('button', {
        class: 'result',
        onclick: () => navigate(`#/read/${tr}/${r.bookId}/${r.chapter}?v=${r.verse}`),
      },
        el('div', { class: 'result__ref', text: `${r.name} ${r.chapter}:${r.verse}` }),
        el('div', { class: 'result__text', html: highlight(r.text, q) })
      ));
    }
  }
}

function hints(navigate) {
  const wrap = el('div');
  wrap.append(el('p', { class: 'eyebrow', text: 'Try' }));
  const row = el('div', { style: 'display:flex; flex-wrap:wrap; gap:.5rem; margin-top:.75rem' });
  for (const q of ['faith', 'forgiveness', 'John 3:16', 'Romans 8', 'love', 'shepherd']) {
    row.append(el('button', {
      class: 'btn', text: q,
      onclick: () => navigate(`#/search?q=${encodeURIComponent(q)}`),
    }));
  }
  wrap.append(row);
  return wrap;
}

/* ---- corpus -------------------------------------------------------------- */
async function buildCorpus(translationId, onProgress) {
  if (loading) return loading;
  loading = (async () => {
    const list = bible.books();
    const rows = [];
    let done = 0;
    const missing = [];
    for (const b of list) {
      try {
        const data = await bible.loadBook(translationId, b.id);
        data.c.forEach((verses, ci) => {
          verses.forEach((text, vi) => {
            if (text) rows.push({ bookId: b.id, name: b.name, chapter: ci + 1, verse: vi + 1, text, lower: text.toLowerCase() });
          });
        });
      } catch {
        // One unreachable book must not stop the rest of the Bible being searchable.
        missing.push(b.name);
      }
      done += 1;
      onProgress?.(done / list.length);
      if (done % 6 === 0) await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
    }
    corpus.set(translationId, rows);
    incomplete.set(translationId, missing);
    loading = null;
  })();
  return loading;
}

function query(translationId, q) {
  const rows = corpus.get(translationId) || [];
  const phrase = q.replace(/[“”"']/g, '').toLowerCase().trim();
  const words = phrase.split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];

  const out = [];
  for (const r of rows) {
    let ok = r.lower.includes(phrase);
    if (!ok && words.length > 1) ok = words.every((w) => r.lower.includes(w));
    if (ok) {
      out.push(r);
      if (out.length >= MAX_RESULTS) break;
    }
  }
  return out;
}

/* Escapes first, then wraps matches — Scripture is never injected as raw HTML. */
function highlight(text, q) {
  const safe = escapeHtml(text);
  const terms = q.replace(/[“”"']/g, '').trim().split(/\s+/).filter((w) => w.length > 1);
  if (!terms.length) return safe;
  const pattern = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
    .join('|');
  return safe.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
}

export const cached = () => ({ lastQuery, lastResults });
