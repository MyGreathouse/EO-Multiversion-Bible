/* home.js — the calm entry point.
 *
 * First visit each day: a full-screen greeting with the verse of the day,
 * acknowledged with "Amen" before the dashboard is revealed. Once
 * acknowledged, later visits that same day go straight to the dashboard —
 * the greeting isn't repeated every time the Home tab is tapped, only once
 * a day, keyed to the device's own local calendar date.
 */
import * as bible from './bible-engine.js';
import * as settings from './settings.js';
import * as study from './study.js';
import * as store from './storage.js';
import { el, clear, icon, toast, shareText, MONOGRAM } from './ui.js';

/* A rota of references, not text. The verse itself is always read from the
   chosen translation's own file. */
const DAILY = [
  ['PSA', 23, 1], ['JHN', 3, 16], ['PRO', 3, 5], ['ISA', 40, 31], ['ROM', 8, 28],
  ['PHP', 4, 13], ['JOS', 1, 9], ['MAT', 6, 33], ['PSA', 46, 1], ['JER', 29, 11],
  ['HEB', 11, 1], ['GAL', 5, 22], ['PSA', 119, 105], ['1CO', 13, 4], ['EPH', 2, 8],
  ['MAT', 11, 28], ['PSA', 27, 1], ['ROM', 12, 2], ['ISA', 41, 10], ['2CO', 5, 17],
  ['PRO', 16, 3], ['JAS', 1, 5], ['PSA', 34, 8], ['COL', 3, 23], ['1PE', 5, 7],
  ['MIC', 6, 8], ['PSA', 91, 1], ['JHN', 14, 6], ['ROM', 5, 8], ['LAM', 3, 22],
  ['ECC', 3, 1], ['MAT', 5, 16], ['PSA', 51, 10], ['HEB', 12, 1], ['1JN', 4, 19],
  ['PSA', 121, 1], ['PRO', 18, 10], ['ACT', 1, 8], ['GAL', 2, 20], ['PHP', 4, 6],
  ['DEU', 31, 6], ['PSA', 139, 14], ['MRK', 12, 30], ['ROM', 15, 13], ['1TH', 5, 16],
  ['JOB', 19, 25], ['PSA', 103, 2], ['ISA', 53, 5], ['LUK', 6, 31], ['2TI', 1, 7],
];

const dayIndex = () => {
  const d = new Date();
  const start = Date.UTC(d.getFullYear(), 0, 0);
  const day = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000);
  return day % DAILY.length;
};

/* ---- once-a-day greeting gate ---------------------------------------------
 * Keyed to the device's local calendar date, not a session, so dismissing it
 * sticks until a new day genuinely begins. */
const localDateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const isGreetingDismissed = () => store.get('dailyVerseSeen', null) === localDateKey();
const dismissGreeting = () => store.set('dailyVerseSeen', localDateKey());

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export async function render(host, params, navigate) {
  host.className = 'view';
  clear(host);
  document.title = 'EO Multiversion Bible';

  const tr = settings.get('translation');

  host.append(el('header', { class: 'hero' },
    el('div', { html: MONOGRAM(), style: 'width:4.5rem; margin:0 auto 1rem; color:var(--brand)' }),
    el('h1', { class: 'wordmark', style: 'font-size:1rem', text: 'EO Multiversion Bible' }),
    el('div', { class: 'hero__rule', 'aria-hidden': 'true' }),
    el('p', { class: 'tagline', text: 'Read. Study. Reflect.' })
  ));

  host.append(await buildDashboard(tr, navigate));
}

/* ---- the gate: a full-screen takeover, dismissed only by Amen -------------
 * Exported standalone and shown once per day from the app's boot sequence —
 * before the first route renders, whatever that route turns out to be — so
 * the greeting appears the first time the app is opened each day regardless
 * of which screen someone lands on, not only when that screen is Home.
 */

export function showGreetingGate() {
  return new Promise(async (resolve) => {
    const tr = settings.get('translation');
    const [bookId, chapter, verse] = DAILY[dayIndex()];
    let text = '';
    try { text = await bible.getVerse(tr, bookId, chapter, verse); } catch { text = ''; }
    if (!text) {
      try { text = await bible.getVerse('webster', bookId, chapter, verse); } catch { /* offline */ }
    }

    const appRoot = document.querySelector('.app');
    const ref = bible.formatRef(bookId, chapter, verse);
    const abbr = bible.getTranslation(tr).abbr;

    // Save keeps the verse in Favourites; Share hands off to the system sheet
    // (or the clipboard). Neither closes the gate — only Amen does that.
    const saveBtn = el('button', {
      class: 'gate__act', id: 'gate-save',
      onclick: () => {
        const on = study.toggleFavourite(bookId, chapter, verse, tr);
        paintSave();
        toast(on ? 'Saved to favourites' : 'Removed from favourites');
      },
    }, el('span', { class: 'gate__act-icon', html: icon('star') }),
       el('span', { class: 'gate__act-label', text: 'Save' }));

    function paintSave() {
      const on = study.isFavourite(bookId, chapter, verse);
      saveBtn.setAttribute('aria-pressed', String(on));
      saveBtn.setAttribute('aria-label',
        on ? `Remove ${ref} from favourites` : `Save ${ref} to favourites`);
    }
    paintSave();

    const shareBtn = el('button', {
      class: 'gate__act', id: 'gate-share',
      'aria-label': `Share ${ref}`,
      onclick: async () => {
        const result = await shareText(ref, `\u201c${text}\u201d\n\u2014 ${ref} (${abbr})`);
        if (result === 'copied') toast('Verse copied');
        else if (result === 'failed') toast('Could not share');
      },
    }, el('span', { class: 'gate__act-icon', html: icon('share') }),
       el('span', { class: 'gate__act-label', text: 'Share' }));

    const backdrop = el('div', {
      class: 'gate', role: 'alertdialog', 'aria-modal': 'true',
      'aria-label': `${greeting()}. Verse of the day.`,
    },
      el('div', { class: 'gate__inner' },
        el('div', { html: MONOGRAM(), class: 'gate__mark', 'aria-hidden': 'true' }),
        el('p', { class: 'gate__eyebrow', text: 'Verse of the day' }),
        el('h1', { class: 'gate__greeting', text: `${greeting()}.` }),
        el('div', { class: 'gate__rule', 'aria-hidden': 'true' }),
        el('p', { class: 'gate__verse', text: text || 'Available once this book has been downloaded.' }),
        el('p', { class: 'gate__ref', text: `${bible.formatRef(bookId, chapter, verse)} · ${bible.getTranslation(tr).abbr}` }),
        el('span', { class: 'gate__heart', html: icon('heart'), 'aria-hidden': 'true' }),
        el('div', { class: 'gate__actions' },
          saveBtn,
          el('button', { class: 'amen-btn', id: 'amen-btn', onclick: onAmen }, 'Amen'),
          shareBtn
        ),
        el('p', { class: 'gate__hint', text: 'Tap Amen to continue' })
      )
    );

    document.body.append(backdrop);
    document.body.style.overflow = 'hidden';
    if (appRoot) appRoot.inert = true;
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      document.getElementById('amen-btn')?.focus();
    });

    function onAmen() {
      dismissGreeting();
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const cleanup = () => {
        backdrop.remove();
        document.body.style.overflow = '';
        if (appRoot) appRoot.inert = false;
        resolve();
      };
      if (reduceMotion) { cleanup(); return; }
      backdrop.classList.add('is-closing');
      backdrop.addEventListener('transitionend', cleanup, { once: true });
    }
  });
}

/* ---- the dashboard: a premium overview, revealed once the gate closes ----- */
async function buildDashboard(tr, navigate) {
  const dashboard = el('div', { id: 'dashboard' });
  dashboard.append(el('p', { class: 'dash-title', text: 'Dashboard' }));
  dashboard.append(heroCard(tr, navigate));
  dashboard.append(statGrid(navigate));
  dashboard.append(libraryCard(navigate));
  dashboard.append(recentSection(navigate));
  dashboard.append(el('div', { class: 'ad-slot', 'data-slot': 'home', 'aria-hidden': 'true' }));
  return dashboard;
}

function heroCard(tr, navigate) {
  const pos = study.position();
  const target = pos || { translation: tr, bookId: 'JHN', chapter: 1 };
  const t = bible.getTranslation(target.translation);

  return el('button', {
    class: 'dash-hero',
    onclick: () => navigate(`#/read/${target.translation}/${target.bookId}/${target.chapter}`),
  },
    el('div', { class: 'dash-hero__mark', html: MONOGRAM(), 'aria-hidden': 'true' }),
    el('p', { class: 'dash-hero__eyebrow', text: pos ? 'Continue reading' : 'Start reading' }),
    el('div', { class: 'dash-hero__ref', text: bible.formatRef(target.bookId, target.chapter) }),
    el('div', { class: 'dash-hero__meta', text: pos ? `${t.abbr} · ${relative(pos.at)}` : `${t.abbr} · The Gospel of John` }),
    el('span', { class: 'dash-hero__go', html: icon('chevronRight') })
  );
}

const STAT_META = {
  bookmarks: { label: 'Bookmarks', icon: 'bookmark', hl: 'gold' },
  highlights: { label: 'Highlights', icon: 'highlighter', hl: 'terracotta' },
  notes: { label: 'Notes', icon: 'note', hl: 'teal' },
  favourites: { label: 'Favourites', icon: 'star', hl: 'sage' },
};

function statGrid(navigate) {
  const c = study.counts();
  return el('div', { class: 'section' },
    el('div', { class: 'section__head' }, el('p', { class: 'eyebrow', text: 'Your study' })),
    el('div', { class: 'grid-2' },
      ...Object.entries(STAT_META).map(([key, meta]) =>
        el('button', {
          class: 'stat-tile', dataset: { hl: meta.hl },
          onclick: () => navigate(`#/study?tab=${key}`),
        },
          el('span', { class: 'stat-tile__icon', html: icon(meta.icon) }),
          el('span', { class: 'stat-tile__n', text: String(c[key]) }),
          el('span', { class: 'stat-tile__l', text: meta.label })
        ))
    )
  );
}

function libraryCard(navigate) {
  return el('div', { class: 'section', style: 'text-align:center' },
    el('button', {
      class: 'library-link',
      'aria-label': 'Open the Bible Library — browse all 66 books',
      onclick: () => navigate('/library'),
    }, 'Bible Library'),
    el('p', { class: 'dash-library-sub',
              text: `All 66 books, ${bible.TRANSLATIONS.length} translations` })
  );
}

function recentSection(navigate) {
  const recent = study.history().slice(1, 5);
  const section = el('div', { class: 'section' },
    el('p', { class: 'eyebrow', text: 'Recently read' }));

  if (!recent.length) {
    section.append(el('div', { class: 'empty', text: 'Chapters you read will appear here.' }));
    return section;
  }
  const list = el('div', { class: 'stack' });
  for (const h of recent) {
    list.append(el('button', {
      class: 'card continue',
      onclick: () => navigate(`#/read/${h.translation}/${h.bookId}/${h.chapter}`),
    },
      el('div', {},
        el('div', { style: 'font-family:var(--serif); font-size:1rem; font-weight:550', text: bible.formatRef(h.bookId, h.chapter) }),
        el('div', { class: 'continue__meta', text: `${bible.getTranslation(h.translation).abbr} · ${relative(h.at)}` })),
      el('span', { class: 'continue__go', html: icon('chevronRight') })
    ));
  }
  section.append(list);
  return section;
}

function relative(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
