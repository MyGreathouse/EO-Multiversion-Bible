/* speed-control.js — one reading-speed control, used by the reader and by Settings.
 *
 * Quick-pick buttons, a slider and a box where any speed can be typed. The
 * range is deliberately wide (0.1x to 2x) so someone who wants to follow along
 * very slowly, or listen quickly, can set exactly that. The speed is saved and
 * takes effect from the next verse onward. */
import * as settings from './settings.js';
import * as audio from './audio.js';
import { el } from './ui.js';

const PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5];
const fmt = (v) => String(+(+v).toFixed(2));

export function speedControl({ compact = false } = {}) {
  const apply = (v, from) => {
    const rate = audio.clampRate(v);
    settings.set('readingRate', rate);
    audio.setRate(rate);
    if (from !== 'slider') slider.value = String(rate);
    if (from !== 'number') number.value = fmt(rate);
    paintChips();
    return rate;
  };

  const chips = PRESETS.map((p) => el('button', {
    type: 'button', class: 'speed-chip', text: `${fmt(p)}×`,
    'aria-label': `Set speed to ${fmt(p)} times`, dataset: { v: String(p) },
    onclick: () => apply(p),
  }));
  const paintChips = () => {
    const cur = +(+settings.get('readingRate')).toFixed(2);
    for (const c of chips) c.setAttribute('aria-pressed', String(+c.dataset.v === cur));
  };

  const slider = el('input', {
    type: 'range', min: audio.RATE_MIN, max: audio.RATE_MAX, step: 0.05,
    value: audio.clampRate(settings.get('readingRate')),
    'aria-label': 'Reading speed',
    oninput: (e) => apply(parseFloat(e.target.value), 'slider'),
  });
  const number = el('input', {
    type: 'number', min: String(audio.RATE_MIN), max: String(audio.RATE_MAX), step: '0.05',
    inputmode: 'decimal', value: fmt(audio.clampRate(settings.get('readingRate'))),
    'aria-label': 'Reading speed, type any value from 0.1 to 2',
    onchange: (e) => {
      const parsed = parseFloat(e.target.value);
      apply(Number.isNaN(parsed) ? settings.get('readingRate') : parsed);
    },
  });

  paintChips();
  return el('div', { class: `speed-control${compact ? ' speed-control--compact' : ''}` },
    el('div', { class: 'audio-row' },
      el('span', { class: 'audio-row__hint', text: 'Speed' }),
      slider,
      el('div', { class: 'audio-row__num-wrap' }, number, el('span', { class: 'audio-row__suffix', text: '×' }))),
    el('div', { class: 'speed-chips', role: 'group', 'aria-label': 'Quick speeds' }, ...chips),
    el('p', { class: 'speed-note', text: 'Type any speed from 0.1× to 2×. Very slow speeds can sound uneven on some phones — it depends on the voice.' }));
}
