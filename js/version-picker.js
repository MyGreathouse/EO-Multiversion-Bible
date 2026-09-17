/* version-picker.js — the one place a person chooses a translation.
 *
 * Used from the reader toolbar (keeps your exact place, switches on tap) and
 * anywhere else that needs the full six-version list without room for six
 * buttons in a row.
 */
import * as bible from './bible-engine.js';
import * as settings from './settings.js';
import { el, clear, icon, toast } from './ui.js';

let sheet = null;
let backdrop = null;
let lastFocus = null;

function ensure() {
  if (sheet) return;
  backdrop = el('div', { class: 'sheet-backdrop', onclick: close });
  sheet = el('div', {
    class: 'sheet', role: 'dialog', 'aria-modal': 'true',
    'aria-label': 'Choose a translation', tabindex: '-1',
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

const ERA = {
  modern: { label: 'Modern', ids: ['bsb', 'webbe'] },
  classic: { label: 'Classic', ids: ['asv', 'webster', 'ylt'] },
};

/**
 * onPick(translationId) is called after the sheet closes. If the reader
 * passes one, the picker also shows which version keeps your exact verse.
 */
export function openTranslationPicker(onPick) {
  ensure();
  lastFocus = document.activeElement;
  const current = settings.get('translation');

  clear(sheet);
  sheet.append(
    el('div', { class: 'sheet__grip', 'aria-hidden': 'true' }),
    el('div', { class: 'sheet__head' },
      el('div', { class: 'sheet__ref', text: 'Choose a translation' }),
      el('button', { class: 'icon-btn', html: icon('close'), 'aria-label': 'Close', onclick: close })
    )
  );

  for (const era of Object.values(ERA)) {
    const group = bible.TRANSLATIONS.filter((t) => era.ids.includes(t.id));
    if (!group.length) continue;
    sheet.append(el('p', { class: 'version-group', text: era.label }));
    for (const t of group) {
      sheet.append(el('button', {
        class: 'picker-row', 'aria-current': String(t.id === current),
        onclick: () => {
          settings.set('translation', t.id);
          toast(`${t.abbr} — ${t.name}`);
          close();
          onPick?.(t.id);
        },
      },
        el('span', { class: 'picker-row__mark', html: icon('check') }),
        el('span', { class: 'picker-row__body' },
          el('span', { class: 'picker-row__name', text: t.name }),
          el('span', { class: 'picker-row__meta', text: `${t.abbr} · ${t.year}` })
        )
      ));
    }
  }

  sheet.classList.add('is-open');
  backdrop.classList.add('is-open');
  sheet.focus();
}
