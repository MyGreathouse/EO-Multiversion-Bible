/* cross-refs-view.js — related passages for a verse, ranked and tappable. */
import * as bible from './bible-engine.js';
import * as xrefs from './cross-refs.js';
import { el, clear, icon } from './ui.js';

let sheet = null;
let backdrop = null;
let lastFocus = null;

function ensure() {
  if (sheet) return;
  backdrop = el('div', { class: 'sheet-backdrop', onclick: close });
  sheet = el('div', {
    class: 'sheet', role: 'dialog', 'aria-modal': 'true',
    'aria-label': 'Cross references', tabindex: '-1',
  });
  document.body.append(backdrop, sheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('is-open')) close();
  });
}

export function close() {
  if (!sheet) return;
  sheet.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  lastFocus?.focus?.();
}

/**
 * onJump(bookId, chapter, verse) is called after the sheet closes with a
 * passage picked. translationId controls which version the previews are
 * shown in — normally whatever the reader currently has open.
 */
export async function openCrossReferences(bookId, chapter, verse, translationId, onJump) {
  ensure();
  lastFocus = document.activeElement;
  const ref = bible.formatRef(bookId, chapter, verse);
  const trAbbr = bible.getTranslation(translationId).abbr;

  clear(sheet);
  sheet.append(
    el('div', { class: 'sheet__grip', 'aria-hidden': 'true' }),
    el('div', { class: 'sheet__head' },
      el('div', { class: 'sheet__ref', text: `Cross references \u00b7 ${ref}` }),
      el('button', { class: 'icon-btn', html: icon('close'), 'aria-label': 'Close', onclick: close })
    ),
    el('p', { class: 'sheet__preview', text: 'Loading related passages\u2026' })
  );
  sheet.classList.add('is-open');
  backdrop.classList.add('is-open');
  sheet.focus();

  const list = await xrefs.forVerse(bookId, chapter, verse);
  clear(sheet);
  sheet.append(
    el('div', { class: 'sheet__grip', 'aria-hidden': 'true' }),
    el('div', { class: 'sheet__head' },
      el('div', { class: 'sheet__ref', text: `Cross references \u00b7 ${ref}` }),
      el('button', { class: 'icon-btn', html: icon('close'), 'aria-label': 'Close', onclick: close })
    )
  );

  if (!list.length) {
    sheet.append(el('div', { class: 'empty', style: 'margin-top:1rem' },
      'No cross references are recorded for this verse.'));
    sheet.append(footer());
    return;
  }

  sheet.append(el('p', {
    class: 'sheet__preview',
    text: `${list.length} related ${list.length === 1 ? 'passage' : 'passages'} in ${trAbbr}, most relevant first.`,
  }));

  const rows = el('div', { style: 'margin-top:.75rem' });
  for (const r of list) {
    const row = el('button', {
      class: 'result',
      onclick: () => { close(); onJump?.(r.bookId, r.chapter, r.verseStart); },
    },
      el('div', { class: 'result__ref', text: xrefs.formatRange(r) }),
      el('div', { class: 'result__text', text: '\u2026' })
    );
    rows.append(row);
    // Previews load progressively so the list is usable immediately; a slow
    // or offline book quietly falls back to a plain "open" prompt.
    bible.getVerse(translationId, r.bookId, r.chapter, r.verseStart)
      .then((t) => { row.querySelector('.result__text').textContent = t || 'Open this passage'; })
      .catch(() => { row.querySelector('.result__text').textContent = 'Open this passage'; });
  }
  sheet.append(rows, footer());
}

function footer() {
  return el('p', { class: 'sheet__foot', text: xrefs.ATTRIBUTION });
}
