/* settings-view.js — appearance, translation, offline downloads, privacy, licences. */
import * as bible from './bible-engine.js';
import * as settings from './settings.js';
import * as store from './storage.js';
import * as audio from './audio.js';
import * as consent from './consent.js';
import { ADS_CONFIG } from './ads-config.js';
import { el, clear, icon, toast, copyText } from './ui.js';

export function render(host, params, navigate) {
  host.className = 'view';
  clear(host);
  document.title = 'Settings · EO Multiversion Bible';

  host.append(el('p', { class: 'eyebrow', text: 'Settings' }));
  host.append(el('h1', {
    style: 'font-family:var(--serif); font-size:1.75rem; font-weight:550; margin:.35rem 0 1.5rem; letter-spacing:-.01em',
    text: 'Reading and privacy',
  }));

  /* ---- translation ---- */
  host.append(sectionTitle('Translation'));
  const trSelect = el('select', {
    'aria-label': 'Bible translation',
    onchange: (e) => { settings.set('translation', e.target.value); paintNotice(); toast('Translation changed'); },
  });
  for (const t of bible.TRANSLATIONS) {
    trSelect.append(el('option', { value: t.id, selected: settings.get('translation') === t.id }, `${t.abbr} — ${t.name}`));
  }
  host.append(row('Default translation', 'Used for reading, search and the daily verse.', trSelect));
  const notice = el('p', { class: 'legal', style: 'padding:.75rem 0' });
  host.append(notice);
  const paintNotice = () => { notice.textContent = bible.getTranslation(settings.get('translation')).notice; };
  paintNotice();

  /* ---- appearance ---- */
  host.append(sectionTitle('Appearance'));

  const themeSelect = el('select', {
    'aria-label': 'Theme',
    onchange: (e) => settings.set('theme', e.target.value),
  });
  for (const [v, l] of [['auto', 'Match my device'], ['day', 'Day'], ['sepia', 'Sepia'], ['night', 'Night']]) {
    themeSelect.append(el('option', { value: v, selected: settings.get('theme') === v }, l));
  }
  host.append(row('Theme', 'Sepia and Night are easier on the eyes at length.', themeSelect));

  host.append(rangeRow('Text size', 'textSize', 15, 30, 1, (v) => `${v}px`));
  host.append(rangeRow('Line spacing', 'leading', 1.4, 2.2, 0.02, (v) => `${(+v).toFixed(2)}`));
  host.append(rangeRow('Reading width', 'measure', 26, 46, 1, (v) => `${v}rem`));

  const layoutSelect = el('select', {
    'aria-label': 'Verse layout',
    onchange: (e) => settings.set('verseLayout', e.target.value),
  });
  for (const [v, l] of [['separate', 'Each verse on its own line'], ['flowing', 'Flowing paragraphs']]) {
    layoutSelect.append(el('option', { value: v, selected: settings.get('verseLayout') === v }, l));
  }
  host.append(row('Verse layout', null, layoutSelect));

  host.append(row('Section headings', 'Editorial headings, where the translation provides them.',
    toggle('showHeadings')));

  const poetrySelect = el('select', {
    'aria-label': 'Poetry layout',
    onchange: (e) => settings.set('poetryLayout', e.target.value),
  });
  for (const [v, l] of [['lines', 'Set as poetry'], ['prose', 'Set as prose']]) {
    poetrySelect.append(el('option', { value: v, selected: settings.get('poetryLayout') === v }, l));
  }
  host.append(row('Psalms and poetry',
    'BSB and WEB-BE carry poetic line breaks. ASV, Webster and YLT are always set as prose.',
    poetrySelect));

  /* ---- greeting ---- */
  host.append(sectionTitle('Greeting'));
  const greetingSelect = el('select', {
    'aria-label': 'Greeting',
    onchange: (e) => settings.set('greetingMode', e.target.value),
  });
  for (const [v, l] of [['auto', 'Match the time of day'], ['morning', 'Always morning'],
                         ['afternoon', 'Always afternoon'], ['evening', 'Always evening']]) {
    greetingSelect.append(el('option', { value: v, selected: settings.get('greetingMode') === v }, l));
  }
  host.append(row('Daily greeting', 'How the verse of the day greets you each morning.', greetingSelect));

  /* ---- read aloud ---- */
  host.append(sectionTitle('Read aloud'));
  if (!audio.isSupported()) {
    host.append(el('p', { class: 'legal', style: 'padding:.5rem 0' },
      'This browser doesn\u2019t support reading Scripture aloud.'));
  } else {
    const voiceSelect = el('select', { 'aria-label': 'Reading voice' },
      el('option', { value: '', selected: !settings.get('readingVoice') }, 'Device default'));
    const previewBtn = el('button', {
      class: 'btn', text: 'Preview',
      onclick: () => audio.speakSample(voiceSelect.value || null, settings.get('readingRate')),
    });
    audio.getVoices().then((voices) => {
      // Grouped by language/accent first (British, American, Japanese, and
      // so on, from the voice's own locale), then by gender within each
      // group. This only reflects what the device actually has -- an
      // accent with no installed voice simply doesn't appear here, rather
      // than being offered and silently failing.
      const byAccent = new Map();
      for (const v of voices) {
        const accent = audio.classifyAccent(v);
        if (!byAccent.has(accent)) byAccent.set(accent, []);
        byAccent.get(accent).push(v);
      }
      const genderLabel = { female: 'Female', male: 'Male', other: '' };
      const orderedAccents = [...audio.ACCENT_ORDER.filter((a) => a && byAccent.has(a)),
        ...[...byAccent.keys()].filter((a) => !audio.ACCENT_ORDER.includes(a))];
      for (const accent of orderedAccents) {
        const list = byAccent.get(accent);
        if (!list?.length) continue;
        const optgroup = el('optgroup', { label: accent });
        for (const v of list) {
          const gender = genderLabel[audio.classifyVoice(v)];
          optgroup.append(el('option', {
            value: v.voiceURI,
            selected: settings.get('readingVoice') === v.voiceURI,
          }, `${v.name}${gender ? ` (${gender})` : ''}`));
        }
        voiceSelect.append(optgroup);
      }
    });
    voiceSelect.addEventListener('change', () => settings.set('readingVoice', voiceSelect.value || null));
    host.append(row('Voice', 'Grouped by language and accent, using whatever this device actually offers \u2014 coverage varies by phone and browser.',
      el('div', { style: 'display:flex; gap:.5rem; align-items:center' }, voiceSelect, previewBtn)));
    host.append(rangeRow('Reading speed', 'readingRate', 0.5, 1, 0.05, (v) => `${(+v).toFixed(2)}\u00d7`));
    host.append(row('Keep reading into the next chapter',
      'When a chapter finishes, carry straight on rather than stopping.',
      toggle('autoContinueListening')));
  }

  /* ---- offline ---- */
  host.append(sectionTitle('Offline'));
  const dlStatus = el('p', { class: 'legal', style: 'padding-top:.5rem' });
  const dlBar = el('div', { class: 'progress', style: 'margin-top:.5rem; display:none' });
  const dlFill = el('div', { class: 'progress__bar' });
  dlBar.append(dlFill);

  host.append(row(
    'Save this translation for offline reading',
    'Downloads all 66 books so the whole Bible works with no connection.',
    el('button', {
      class: 'btn', html: icon('download'),
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        dlBar.style.display = 'block';
        const tr = settings.get('translation');
        const books = bible.books();
        let done = 0, failed = 0;
        for (const b of books) {
          try { await bible.loadBook(tr, b.id); } catch { failed += 1; }
          done += 1;
          dlFill.style.width = `${Math.round((done / books.length) * 100)}%`;
          dlStatus.textContent = `${done} of ${books.length} books saved…`;
        }
        dlStatus.textContent = failed
          ? `Saved ${books.length - failed} of ${books.length} books. Try again when you have a connection.`
          : `All ${books.length} books of ${bible.getTranslation(tr).abbr} are available offline.`;
        btn.disabled = false;
        toast(failed ? 'Some books could not be saved' : 'Available offline');
      },
    }, el('span', { text: 'Download' }))
  ));
  host.append(dlBar, dlStatus);

  /* ---- privacy ---- */
  host.append(sectionTitle('Your data'));
  host.append(el('p', { class: 'legal', style: 'padding:.5rem 0 0' },
    'EO Multiversion Bible has no accounts and no sign-in. Your bookmarks, highlights, notes, ' +
    'favourites and reading position are stored on this device and are never sent ' +
    'anywhere.' + (store.isPersistent() ? '' :
      ' This browser is blocking storage, so anything you save now will be lost when you close the app.')));

  host.append(row('Export your study', 'Download a JSON copy of everything you have saved.',
    el('button', { class: 'btn', text: 'Export', onclick: exportData })));

  host.append(row('Erase everything', 'Removes all bookmarks, highlights, notes and settings from this device.',
    el('button', {
      class: 'btn', text: 'Erase',
      onclick: () => {
        if (!confirm('Erase all bookmarks, highlights, notes and favourites from this device? This cannot be undone.')) return;
        store.eraseAll();
        toast('Everything erased');
        setTimeout(() => location.reload(), 600);
      },
    })));

  /* ---- privacy & advertising ---- */
  host.append(sectionTitle('Privacy & Advertising'));
  host.append(el('p', { class: 'legal', style: 'padding-bottom:.5rem' },
    ADS_CONFIG.ENABLED
      ? 'This app is supported by advertising. Your bookmarks, highlights, notes and ' +
        'reading history are never part of that \u2014 see the Privacy Policy for exactly ' +
        'what advertising involves and what choices you have.'
      : 'Advertising is not yet active in this build. When it is, this is where you\u2019ll ' +
        'be able to review and change your advertising choices.'));
  host.append(row('Advertising preferences', 'Review or change how advertising-related information may be used.',
    el('button', {
      class: 'btn',
      text: 'Change privacy choices',
      onclick: () => {
        if (!consent.reopenChoices()) {
          toast(ADS_CONFIG.ENABLED
            ? 'Your browser\u2019s own cookie settings control this for now.'
            : 'Advertising is not active in this build yet.');
        }
      },
    })));

  /* ---- licensing ---- */
  host.append(sectionTitle('Scripture licensing'));
  const legal = el('div', { class: 'legal' });
  for (const t of bible.TRANSLATIONS) {
    legal.append(el('h3', { text: `${t.abbr} — ${t.name}` }));
    legal.append(el('p', { text: t.notice }));
  }
  legal.append(el('h3', { text: 'Adding translations' }));
  legal.append(el('p', {
    text: 'Copyrighted translations such as the NIV or TLB are not included. They ' +
      'can only be added once a written licence covering app distribution and ' +
      'commercial use has been obtained from the rights holder.',
  }));
  host.append(legal);

  host.append(sectionTitle('Documents'));
  const docs = el('div', { style: 'display:flex; flex-wrap:wrap; gap:.5rem; padding-top:.5rem' });
  const single = typeof window !== 'undefined' && Boolean(window.__EO_GZ);
  for (const [href, label] of [
    ['legal/privacy.html', 'Privacy policy'],
    ['legal/terms.html', 'Terms of use'],
    ['legal/licences.html', 'Scripture licensing'],
    ['legal/faq.html', 'FAQ'],
  ]) {
    if (single) continue;
    docs.append(el('a', { class: 'btn', href, target: '_blank', rel: 'noopener', text: label }));
  }
  if (single) {
    docs.append(el('p', { class: 'legal', text:
      'The privacy policy, terms and full licensing notes ship as separate pages ' +
      'in the deployable build. The licensing summary above applies either way.' }));
  }
  host.append(docs);

  host.append(sectionTitle('About'));
  host.append(el('p', { class: 'legal' },
    'EO Multiversion Bible — Scripture. Study. Reflection. Created under the EO personal brand ' +
    'by Elias Okafor. Ideas. Purpose. Impact.'));
  host.append(el('p', { class: 'legal', style: 'margin-top:.75rem' },
    '\u00a9 2026 Risten Global Ltd. All rights reserved. This applies to the application \u2014 ' +
    'its design, code and compilation \u2014 not to the Scripture text itself, which is public ' +
    'domain. See Scripture licensing above for the translations\u2019 own status.'));
  host.append(el('p', { class: 'legal', style: 'margin-top:.5rem' },
    el('button', { class: 'btn btn--ghost', style: 'padding-left:0', text: 'Reset all settings', onclick: () => { settings.reset(); toast('Settings reset'); render(host, params, navigate); } })));
}

/* ---- helpers ------------------------------------------------------------- */
const sectionTitle = (text) => el('h2', {
  class: 'eyebrow', style: 'margin:2rem 0 .25rem', text,
});

function row(label, hint, control) {
  return el('div', { class: 'row' },
    el('div', { class: 'row__label' },
      el('div', { style: 'font-weight:600; font-size:.9375rem', text: label }),
      hint && el('div', { class: 'row__hint', text: hint })),
    control);
}

function rangeRow(label, key, min, max, step, format) {
  const value = el('span', {
    style: 'font-variant-numeric:tabular-nums; color:var(--text-2); font-size:.8125rem; min-width:3.5rem; text-align:right',
    text: format(settings.get(key)),
  });
  const input = el('input', {
    type: 'range', min, max, step, value: settings.get(key),
    'aria-label': label,
    oninput: (e) => {
      const v = (key === 'leading' || key === 'readingRate') ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
      settings.set(key, v);
      value.textContent = format(v);
    },
  });
  return row(label, null, el('div', { style: 'display:flex; align-items:center; gap:.75rem' }, input, value));
}

function toggle(key) {
  const btn = el('button', {
    class: 'btn', role: 'switch',
    'aria-checked': String(settings.get(key)),
    text: settings.get(key) ? 'On' : 'Off',
    onclick: () => {
      const next = !settings.get(key);
      settings.set(key, next);
      btn.setAttribute('aria-checked', String(next));
      btn.textContent = next ? 'On' : 'Off';
    },
  });
  return btn;
}

async function exportData() {
  const payload = JSON.stringify(store.exportAll(), null, 2);
  try {
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', {
      href: url,
      download: `eo-bible-study-${new Date().toISOString().slice(0, 10)}.json`,
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Study exported');
    return;
  } catch {
    /* Downloads are blocked in some embedded web views. */
  }
  const ok = await copyText(payload);
  toast(ok ? 'Study copied to the clipboard' : 'Could not export your study');
}
