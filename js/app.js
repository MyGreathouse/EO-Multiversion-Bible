/* app.js — shell, routing and the translation switcher. */
import * as bible from './bible-engine.js';
import * as settings from './settings.js';
import * as study from './study.js';
import { el, clear, icon, toast } from './ui.js';

import * as home from './home.js';
import * as library from './library.js';
import * as reader from './reader.js';
import * as search from './search.js';
import * as studyView from './study-view.js';
import * as settingsView from './settings-view.js';

const outlet = document.getElementById('outlet');
const titleNode = document.getElementById('view-title');
const trButton = document.getElementById('translation-btn');
const navItems = [...document.querySelectorAll('.nav__item')];

/* ---- routing -------------------------------------------------------------
 * The route lives in a variable, not in the address bar. Sandboxed web views
 * treat a link to '#/library' as a request to leave the app and interrupt with
 * an "Open Link" prompt, so nothing here navigates the document. The URL hash
 * is kept in step where the host allows it, purely so deep links and the back
 * button behave, and it is never read as the source of truth.
 */
let currentRoute = '/';

const normalise = (target) => {
  const path = String(target || '/').replace(/^#/, '');
  return path.startsWith('/') ? path : `/${path}`;
};

function syncAddressBar() {
  try {
    if (window.history && typeof history.replaceState === 'function') {
      history.replaceState(null, '', `#${currentRoute}`);
    }
  } catch {
    /* Sandboxed or opaque origin: the in-memory route is authoritative anyway. */
  }
}

const navigate = (target) => {
  currentRoute = normalise(target);
  syncAddressBar();
  route();
};

function parse() {
  const [pathPart, queryPart] = currentRoute.replace(/^\//, '').split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { segments, params };
}

async function route() {
  const { segments, params } = parse();
  const view = segments[0] || 'home';
  reader.destroy();
  clear(outlet);

  try {
    switch (view) {
      case 'library': {
        const level = segments[1];
        const bookId = level === 'book' ? segments[2] : null;
        titleNode.textContent = level === 'book' && bible.book(bookId)
          ? bible.book(bookId).name
          : level === 'OT' ? 'Old Testament'
          : level === 'NT' ? 'New Testament' : 'Bible';
        setNav('#/library');
        library.render(outlet, { level, bookId }, navigate);
        break;
      }
      case 'read': {
        const [, tr, bookId, chapter] = segments;
        const translation = bible.isTranslation(tr) ? tr : settings.get('translation');
        const b = bible.book(bookId);
        if (!b) { navigate('#/library'); return; }
        const ch = Math.min(Math.max(parseInt(chapter, 10) || 1, 1), b.chapters.length);
        titleNode.textContent = `${b.name} ${ch}`;
        setNav('#/library');
        if (translation !== settings.get('translation')) settings.set('translation', translation);
        await reader.render(outlet, {
          translation, bookId: b.id, chapter: ch, verse: params.v ? parseInt(params.v, 10) : null,
        }, navigate);
        break;
      }
      case 'search': {
        titleNode.textContent = 'Search';
        setNav('#/search');
        search.render(outlet, params, navigate);
        break;
      }
      case 'study': {
        titleNode.textContent = 'Study';
        setNav('#/study');
        studyView.render(outlet, params, navigate);
        break;
      }
      case 'settings': {
        titleNode.textContent = 'Settings';
        setNav('#/settings');
        settingsView.render(outlet, params, navigate);
        break;
      }
      default: {
        titleNode.textContent = 'EO Multiversion Bible';
        setNav('#/');
        await home.render(outlet, params, navigate);
      }
    }
  } catch (err) {
    console.error(err);
    clear(outlet);
    outlet.className = 'view';
    outlet.append(el('div', { class: 'empty' },
      el('p', { text: err.message || 'Something went wrong.' }),
      el('p', { style: 'margin-top:.75rem' },
        el('button', { class: 'btn', text: 'Go to the Bible', onclick: () => navigate('#/library') }))));
  }
  updateTranslationButton();
}

function setNav(target) {
  for (const item of navItems) {
    const on = item.dataset.route === normalise(target);
    if (on) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
}

for (const item of navItems) {
  item.addEventListener('click', () => navigate(item.dataset.route));
}
document.getElementById('brand-btn')?.addEventListener('click', () => navigate('/'));
document.getElementById('skip-link')?.addEventListener('click', () => {
  outlet.focus();
  outlet.scrollIntoView({ block: 'start' });
});

/* ---- translation switcher ------------------------------------------------ */
function updateTranslationButton() {
  trButton.textContent = bible.getTranslation(settings.get('translation')).abbr;
}

trButton.addEventListener('click', () => {
  const list = bible.TRANSLATIONS;
  const current = settings.get('translation');
  const next = list[(list.findIndex((t) => t.id === current) + 1) % list.length];
  settings.set('translation', next.id);
  updateTranslationButton();
  toast(`${next.abbr} — ${next.name}`);

  // Stay exactly where you are, in the new translation.
  const { segments, params } = parse();
  if (segments[0] === 'read') {
    const q = params.v ? `?v=${params.v}` : '';
    navigate(`/read/${next.id}/${segments[2]}/${segments[3]}${q}`);
  } else {
    route();
  }
});

/* ---- boot ---------------------------------------------------------------- */
// Honour a deep link if one was supplied, and follow the back button where the
// host actually gives us a working history.
window.addEventListener('hashchange', () => {
  const fromBar = normalise(location.hash || '/');
  if (fromBar !== currentRoute) {
    currentRoute = fromBar;
    route();
  }
});

(async function start() {
  try {
    await bible.loadCanon();
  } catch (err) {
    outlet.className = 'view';
    outlet.append(el('div', { class: 'empty' },
      el('p', { text: 'EO Multiversion Bible could not load its Scripture index.' }),
      el('p', { style: 'margin-top:.5rem', text: 'Check your connection and reload.' })));
    document.getElementById('splash')?.remove();
    if (typeof window.__EO_BOOTED === 'function') window.__EO_BOOTED();
    return;
  }
  document.getElementById('splash')?.remove();
  if (typeof window.__EO_BOOTED === 'function') window.__EO_BOOTED();

  // Registered here, before the greeting gate, so it fires the instant the
  // page loads -- not after someone taps Amen. The gate's `await` genuinely
  // pauses this function until that tap happens, so anything placed after it
  // (as this originally was) never runs for a visitor who hasn't dismissed
  // the gate yet, and never runs at all for an automated scanner that never
  // taps anything.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }

  currentRoute = normalise(location.hash || '/');

  let gateWasShown = false;
  if (!home.isGreetingDismissed()) {
    gateWasShown = true;
    await home.showGreetingGate();
  }
  await route();

  // Only reveal the dashboard with a scroll + pop if a greeting was actually
  // just dismissed. A plain repeat visit shouldn't animate every time.
  const dash = document.getElementById('dashboard');
  if (dash && gateWasShown) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    dash.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    dash.classList.add('dash-pop');
    dash.addEventListener('animationend', () => dash.classList.remove('dash-pop'), { once: true });
  }
})();
