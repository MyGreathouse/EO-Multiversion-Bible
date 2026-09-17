/* compare.js — the same verse across every registered translation. */
import * as bible from './bible-engine.js';
import { el, clear, icon, toast, copyText } from './ui.js';

let dialog = null;
let backdrop = null;
let lastFocus = null;

function ensure() {
  if (dialog) return;
  backdrop = el('div', { class: 'sheet-backdrop', onclick: close });
  dialog = el('div', {
    class: 'sheet', role: 'dialog', 'aria-modal': 'true',
    'aria-label': 'Compare translations', tabindex: '-1',
  });
  document.body.append(backdrop, dialog);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.classList.contains('is-open')) close();
  });
}

export function close() {
  if (!dialog) return;
  dialog.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  lastFocus?.focus?.();
}

export async function openCompare(bookId, chapter, verse) {
  ensure();
  lastFocus = document.activeElement;
  const ref = bible.formatRef(bookId, chapter, verse);

  clear(dialog);
  dialog.append(
    el('div', { class: 'sheet__grip', 'aria-hidden': 'true' }),
    el('div', { class: 'sheet__ref', text: ref }),
    el('p', { class: 'sheet__preview', text: 'Comparing every available translation.' })
  );
  dialog.classList.add('is-open');
  backdrop.classList.add('is-open');
  dialog.focus();

  const rows = await bible.compareVerse(bookId, chapter, verse);
  const list = el('div', { style: 'margin-top:1rem' });
  const plain = [];

  for (const { translation, text, error } of rows) {
    plain.push(`${translation.abbr}: ${text || '—'}`);
    list.append(
      el('div', { class: 'compare-item' },
        el('div', { class: 'compare-item__tr' }, `${translation.abbr} · ${translation.name}`),
        el('p', {
          class: 'compare-item__text',
          text: error ? 'This translation is not available offline yet.'
            : text || 'Not included in this translation.',
          style: text ? null : 'color: var(--text-3); font-style: italic',
        })
      )
    );
  }

  list.append(
    el('div', { style: 'display:flex; gap:.5rem; margin-top:1rem' },
      el('button', {
        class: 'btn', html: icon('copy'),
        onclick: async () => {
          const ok = await copyText(`${ref}\n\n${plain.join('\n\n')}`);
          toast(ok ? 'Comparison copied' : 'Could not copy');
        },
      }, el('span', { text: 'Copy all' })),
      el('button', { class: 'btn btn--ghost', text: 'Close', onclick: close })
    )
  );

  dialog.append(list);
}
