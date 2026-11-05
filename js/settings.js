/* settings.js — reading appearance and preferences, applied to the document root. */
import * as store from './storage.js';
import { isTranslation } from './bible-engine.js';

const DEFAULTS = {
  theme: 'auto',            // auto | day | sepia | night
  translation: 'asv',         // ASV is the primary version
  textSize: 18,             // px, 15–30
  leading: 1.72,            // 1.4–2.2
  measure: 34,              // rem, 26–46
  justify: false,
  verseLayout: 'separate',   // separate | flowing
  showHeadings: true,
  poetryLayout: 'lines',    // lines | prose
  greetingMode: 'auto',     // auto | morning | afternoon | evening
  readingVoice: null,       // a voiceURI, or null for the device default
  readingRate: 0.85,        // 0.5-1.0, how fast the Listen feature reads
  autoContinueListening: false,
  dailyReminder: { enabled: false, time: '05:00' },
};

let current = { ...DEFAULTS, ...store.get('settings', {}) };
if (!isTranslation(current.translation)) current.translation = DEFAULTS.translation;

/* One-time move to ASV as the primary version. Earlier builds defaulted to
 * Webster's and saved it with the other settings the first time anything
 * changed, so people who never chose a version still have 'webster' stored.
 * Those are moved to ASV once. Anyone on another version is left alone, and the
 * flag means a later deliberate choice of Webster is never overwritten. */
if (!store.get('primaryAsvApplied', false)) {
  if (current.translation === 'webster') {
    current = { ...current, translation: 'asv' };
    store.set('settings', current);
  }
  store.set('primaryAsvApplied', true);
}

const listeners = new Set();
const media = window.matchMedia('(prefers-color-scheme: dark)');

export const all = () => ({ ...current });
export const get = (k) => current[k];

export function set(key, value) {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  store.set('settings', current);
  apply();
  listeners.forEach((fn) => fn(key, value));
}

export function reset() {
  current = { ...DEFAULTS };
  store.set('settings', current);
  apply();
  listeners.forEach((fn) => fn('*', null));
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resolvedTheme() {
  if (current.theme !== 'auto') return current.theme;
  return media.matches ? 'night' : 'day';
}

export function apply() {
  const root = document.documentElement;
  const theme = resolvedTheme();
  root.dataset.theme = theme;
  root.style.setProperty('--reading-size', `${current.textSize}px`);
  root.style.setProperty('--reading-leading', String(current.leading));
  root.style.setProperty('--reading-measure', `${current.measure}rem`);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'night' ? '#121A2B' : theme === 'sepia' ? '#F2EADC' : '#F5F5F5');
  }
}

media.addEventListener('change', () => {
  if (current.theme === 'auto') apply();
});

apply();
