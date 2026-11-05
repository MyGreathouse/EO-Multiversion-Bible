/* plans.js — structured reading plans: a day-by-day schedule generated from
 * the real canon, plus simple progress tracking. Nothing here is sent
 * anywhere; progress lives in the same on-device storage as everything
 * else in the app, and following a plan is entirely optional.
 */
import * as bible from './bible-engine.js';
import * as store from './storage.js';

const GOSPELS = ['MAT', 'MRK', 'LUK', 'JHN'];
const NEW_TESTAMENT = ['MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
  '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'];
const WHOLE_BIBLE = ['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI',
  '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN',
  'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', ...NEW_TESTAMENT];

/**
 * Distributes every chapter in the given books evenly across a number of
 * days -- spread across the whole plan rather than clumped into its first
 * few days -- so no day is disproportionately long.
 */
function buildSchedule(bookIds, totalDays) {
  const units = [];
  for (const id of bookIds) {
    const n = bible.chapterCount(id);
    for (let c = 1; c <= n; c++) units.push({ bookId: id, chapter: c });
  }
  const days = [];
  let idx = 0;
  for (let d = 0; d < totalDays; d++) {
    const end = Math.round(((d + 1) * units.length) / totalDays);
    days.push(units.slice(idx, end));
    idx = end;
  }
  return days;
}

export const PLANS = [
  {
    id: 'gospels-30',
    name: 'The Gospels',
    length: '30 days',
    description: 'Matthew, Mark, Luke and John, a few chapters a day.',
    build: () => buildSchedule(GOSPELS, 30),
  },
  {
    id: 'nt-90',
    name: 'The New Testament',
    length: '90 days',
    description: 'Every book from Matthew to Revelation.',
    build: () => buildSchedule(NEW_TESTAMENT, 90),
  },
  {
    id: 'bible-365',
    name: 'The Whole Bible',
    length: '365 days',
    description: 'Genesis to Revelation, in canonical order, over a year.',
    build: () => buildSchedule(WHOLE_BIBLE, 365),
  },
];

export const getPlan = (id) => PLANS.find((p) => p.id === id) || null;

/* ---- progress --------------------------------------------------------- */
const load = () => store.get('readingPlan', null);
const save = (v) => store.set('readingPlan', v);

/** The plan currently being followed, or null if none has been started. */
export function active() {
  const state = load();
  if (!state) return null;
  const plan = getPlan(state.planId);
  if (!plan) return null;
  return { ...state, plan, schedule: plan.build() };
}

export function start(planId) {
  const plan = getPlan(planId);
  if (!plan) return;
  save({ planId, startedAt: Date.now(), completedDays: [] });
}

export function stop() {
  save(null);
}

export function isDayComplete(day) {
  const state = load();
  return Boolean(state?.completedDays?.includes(day));
}

export function toggleDay(day) {
  const state = load();
  if (!state) return;
  const set = new Set(state.completedDays || []);
  if (set.has(day)) set.delete(day); else set.add(day);
  save({ ...state, completedDays: [...set].sort((a, b) => a - b) });
}

/** The first day not yet marked complete -- where "today's reading" opens to. */
export function nextDay() {
  const state = load();
  if (!state) return 0;
  const plan = getPlan(state.planId);
  if (!plan) return 0;
  const total = plan.build().length;
  const done = new Set(state.completedDays || []);
  for (let d = 0; d < total; d++) if (!done.has(d)) return d;
  return total - 1;
}

export function progress() {
  const state = load();
  if (!state) return null;
  const plan = getPlan(state.planId);
  if (!plan) return null;
  const total = plan.build().length;
  const done = (state.completedDays || []).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}
