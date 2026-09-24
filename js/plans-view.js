/* plans-view.js — browse reading plans, start one, and open today's reading. */
import * as bible from './bible-engine.js';
import * as plans from './plans.js';
import { el, clear, icon, toast } from './ui.js';

export function render(host, params, navigate) {
  host.className = 'view';
  clear(host);
  document.title = 'Reading Plans \u00b7 The EO Multiversion Bible';

  host.append(el('p', { class: 'eyebrow', text: 'Reading plans' }));
  host.append(el('h1', {
    style: 'font-family:var(--serif); font-size:1.75rem; font-weight:550; margin:.35rem 0 .5rem; letter-spacing:-.01em',
    text: 'A plan, not a race',
  }));
  host.append(el('p', { style: 'color:var(--text-2); font-size:.9375rem; margin-bottom:1.5rem; max-width:34rem',
    text: 'Miss a day and pick up where you left off \u2014 nothing here tracks a streak or scolds you for a gap.' }));

  const state = plans.active();
  if (state) host.append(activeCard(state, host, navigate));

  host.append(el('h2', {
    style: 'font-size:.75rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--text-2); margin: 1.75rem 0 .75rem',
    text: state ? 'Switch to a different plan' : 'Choose a plan',
  }));

  for (const plan of plans.PLANS) {
    if (state && state.planId === plan.id) continue;
    host.append(planCard(plan, host, navigate, Boolean(state)));
  }
}

function activeCard(state, host, navigate) {
  const prog = plans.progress();
  const day = plans.nextDay();
  const today = state.schedule[day] || [];
  const done = day >= state.schedule.length;

  const card = el('div', { class: 'plate', style: 'margin-bottom:1.5rem' });
  card.append(
    el('div', { class: 'plate__book', style: 'text-transform:none', text: state.plan.name }),
    el('div', { style: 'margin:.5rem 0 1rem; font-family:var(--serif); font-size:1.4rem; font-weight:600',
      text: done ? 'You have finished this plan.' : `Day ${day + 1} of ${state.schedule.length}` }),
  );

  if (!done) {
    const list = el('ul', { style: 'list-style:none; padding:0; margin:0 0 1rem' });
    for (const { bookId, chapter } of today) {
      list.append(el('li', { style: 'padding:.3rem 0' },
        el('button', {
          class: 'row__label', style: 'text-align:left; padding:0; font-weight:600',
          onclick: () => navigate(`#/read/bsb/${bookId}/${chapter}`),
        }, `${bible.bookName(bookId)} ${chapter}`)));
    }
    card.append(list, el('button', {
      class: 'btn btn--primary',
      text: plans.isDayComplete(day) ? 'Marked as read today' : 'Mark today\u2019s reading done',
      onclick: () => {
        plans.toggleDay(day);
        toast('Marked as read');
        render(host, {}, navigate);
      },
    }));
  }

  if (prog) {
    const bar = el('div', { class: 'progress', style: 'margin-top:1.25rem' });
    bar.append(el('div', { class: 'progress__bar', style: `width:${prog.percent}%` }));
    card.append(
      el('p', { style: 'font-size:.8125rem; color:var(--text-2); margin-top:.5rem',
        text: `${prog.done} of ${prog.total} days read (${prog.percent}%)` }),
      bar);
  }

  card.append(el('button', {
    class: 'row__label', style: 'text-align:left; padding:0; margin-top:1rem; font-size:.8125rem; color:var(--text-3)',
    text: 'Stop this plan',
    onclick: () => {
      if (!confirm('Stop this reading plan? Your progress on it will be cleared.')) return;
      plans.stop();
      toast('Plan stopped');
      render(host, {}, navigate);
    },
  }));

  return card;
}

function planCard(plan, host, navigate, hasActive) {
  return el('div', { class: 'row', style: 'align-items:flex-start' },
    el('div', { style: 'flex:1; min-width:0' },
      el('div', { style: 'font-weight:700; font-size:.9375rem', text: plan.name }),
      el('div', { class: 'row__hint', text: `${plan.description} \u00b7 ${plan.length}` })),
    el('button', {
      class: 'btn', text: hasActive ? 'Switch' : 'Start',
      onclick: () => {
        if (hasActive && !confirm(`Switch to ${plan.name}? Your progress on the current plan will be cleared.`)) return;
        plans.start(plan.id);
        toast(`Started ${plan.name}`);
        render(host, {}, navigate);
      },
    }));
}
