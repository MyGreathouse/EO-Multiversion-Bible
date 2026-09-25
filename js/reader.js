/* reader.js — the reading surface.
 * Scripture is the visual priority; chrome stays out of the way.
 */
import * as bible from './bible-engine.js';
import * as settings from './settings.js';
import * as study from './study.js';
import * as store from './storage.js';
import * as audio from './audio.js';
import { el, clear, icon, toast, copyText, shareText } from './ui.js';
import { openCompare } from './compare.js';
import { openCrossReferences } from './cross-refs-view.js';
import { openTranslationPicker } from './version-picker.js';

let state = null;      // { translation, bookId, chapter, focusVerse }
let railFill = null;
let scrollHandler = null;
let speakingEl = null; // the verse element currently highlighted as being read

export function destroy() {
  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler, { passive: true });
    scrollHandler = null;
  }
  document.removeEventListener('keydown', onKey);
  railFill?.parentElement?.remove();
  railFill = null;
  state = null;
  audio.stop();
  speakingEl = null;
}

export async function render(host, { translation, bookId, chapter, verse, autoListen }, navigate) {
  const keepCompare = state ? state.compareMode : false;
  destroy();
  state = { translation, bookId, chapter, focusVerse: verse || null, navigate,
            compareMode: keepCompare };

  host.className = 'view reader';
  clear(host);

  const rail = el('div', { class: 'rail', 'aria-hidden': 'true' });
  railFill = el('div', { class: 'rail__fill' });
  rail.append(railFill);
  document.body.append(rail);

  const inner = el('div', { class: 'reader__inner' });
  host.append(inner);
  inner.append(el('div', { class: 'loading', role: 'status', 'aria-live': 'polite' },
    el('div', { class: 'loading__bar', 'aria-hidden': 'true' }),
    el('p', { class: 'eyebrow', style: 'margin-top:1rem',
              text: `Opening ${bible.formatRef(bookId, chapter)}…` }),
    el('p', { style: 'font-size:.8125rem; color:var(--text-2); margin-top:.35rem',
              text: bible.isLoaded(translation, bookId)
                ? '' : `Preparing ${bible.getTranslation(translation).name}. This happens once.` })));

  let data;
  try {
    data = await bible.getChapter(translation, bookId, chapter);
  } catch (err) {
    clear(inner);
    inner.append(
      el('div', { class: 'empty' },
        el('p', { style: 'font-weight:600; color:var(--text)',
                  text: `${bible.formatRef(bookId, chapter)} could not be opened.` }),
        el('p', { style: 'margin-top:.4rem', text: err.message }),
        el('div', { style: 'display:flex; gap:.5rem; justify-content:center; margin-top:1rem; flex-wrap:wrap' },
          el('button', {
            class: 'btn btn--primary', text: 'Try again',
            onclick: () => render(host, { translation, bookId, chapter, verse }, navigate),
          }),
          el('button', { class: 'btn', text: 'Choose another book', onclick: () => navigate('#/library') })))
    );
    return;
  }

  study.setPosition(translation, bookId, chapter);
  document.title = `${data.bookName} ${chapter} · EO Multiversion Bible`;

  clear(inner);
  inner.append(chapterPlate(data, translation));
  inner.append(readerTools(data, navigate, autoListen));
  inner.append(scriptureBody(data));
  inner.append(footnoteAdSlot());
  inner.append(chapterNav(navigate));

  attachRailTracking();
  attachSwipe(host);
  document.addEventListener('keydown', onKey);

  if (state.focusVerse) {
    requestAnimationFrame(() => {
      const target = inner.querySelector(`[data-verse="${state.focusVerse}"]`);
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'auto' });
        target.classList.add('is-active');
        setTimeout(() => target.classList.remove('is-active'), 1800);
      }
    });
  } else {
    window.scrollTo(0, 0);
  }
}

/* ---- signature: the chapter opening plate -------------------------------- */
function chapterPlate(data, translationId) {
  const t = bible.getTranslation(translationId);
  return el('header', { class: 'plate' },
    el('div', { class: 'plate__book', text: data.bookName }),
    el('div', { class: 'plate__num', text: String(data.chapter), 'aria-hidden': 'true' }),
    el('h1', { class: 'sr-only', text: `${data.bookName} chapter ${data.chapter}, ${t.name}` }),
    el('div', { class: 'plate__rule', 'aria-hidden': 'true' }),
    el('div', { class: 'plate__tr', text: t.abbr })
  );
}

/* ---- scripture ----------------------------------------------------------- */
function scriptureBody(data) {
  const body = el('article', { class: 'scripture', lang: 'en' });
  const showHeadings = settings.get('showHeadings');
  const flowing = settings.get('verseLayout') === 'flowing';
  const poetry = settings.get('poetryLayout') !== 'prose' && data.poetry ? data.poetry : null;
  const hi = study.highlights();
  const bm = study.bookmarks();
  const nt = study.notes();

  let para = el('p');
  const flush = () => { if (para.childNodes.length) body.append(para); para = el('p'); };

  data.verses.forEach((text, i) => {
    const v = i + 1;
    const heading = showHeadings && data.headings ? data.headings[String(v)] : null;
    if (heading) {
      flush();
      body.append(el('h2', { class: 'heading', text: heading }));
    }

    const key = study.refKey(data.bookId, data.chapter, v);
    const lines = poetry ? poetry[String(v)] : null;
    const block = Boolean(lines) || !flowing;

    const span = el('span', {
      class: block ? (lines ? 'v v--block v--poetic' : 'v v--block') : 'v',
      role: 'button',
      tabindex: '0',
      'data-verse': String(v),
      'data-hl': hi[key]?.colour || null,
      'data-bm': bm[key] ? '1' : null,
      'data-note': nt[key] ? '1' : null,
      'aria-label': `Verse ${v}. Open verse actions.`,
    });

    const number = () => el('span', { class: 'v__n', 'aria-hidden': 'true', text: String(v) });

    if (!text) {
      // Absent from this translation's source text (a critical-text omission).
      // Offer it from a translation that carries it rather than showing a gap.
      const holder = el('span', { class: 'v-omitted' });
      const reveal = el('button', {
        class: 'v-omitted__btn',
        text: 'Not in this translation — show it from another',
        onclick: async (e) => {
          e.stopPropagation();
          reveal.disabled = true;
          reveal.textContent = 'Looking…';
          const found = await bible.findOmittedVerse(data.translation, data.bookId, data.chapter, v);
          holder.replaceChildren(
            found
              ? el('span', { class: 'v-omitted__text' },
                  document.createTextNode(found.text + ' '),
                  el('span', { class: 'v-omitted__src', text: `(${found.translation.abbr})` }))
              : el('span', { class: 'v-omitted__text', text: 'Not present in any translation available here.' })
          );
        },
      });
      holder.append(reveal);
      span.append(number(), holder);
    } else if (lines) {
      // Poetry. Every verse opens flush left; only subordinate and turned lines
      // are indented, so the left edge stays a clean column of verse numbers.
      // The number belongs with the first line of Scripture, not with an
      // editorial superscription, so every verse number sits in one column.
      let numbered = false;
      lines.forEach((mark, li) => {
        const offset = mark[1];
        const brk = mark.length > 2 ? mark[2] : 0;
        const end = li + 1 < lines.length ? lines[li + 1][1] - 1 : text.length;
        let level = mark[0];
        const structural = level !== 5;
        if (structural && !numbered) level = 1;
        const line = el('span', {
          class: 'ln',
          dataset: { level: String(level) },
          'data-stanza': brk ? '1' : null,
        });
        if (structural && !numbered) { line.append(number()); numbered = true; }
        line.append(document.createTextNode(text.slice(offset, end)));
        span.append(line);
      });
      if (!numbered && span.firstChild) span.firstChild.prepend(number());
    } else {
      span.append(number(), document.createTextNode(block ? text : text + ' '));
    }

    if (block) { flush(); body.append(span); } else { para.append(span); }
  });
  flush();

  attachPressAndHold(body);
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const t = e.target.closest('.v');
      if (t) { e.preventDefault(); openSheet(+t.dataset.verse); }
    }
  });
  return body;
}

/* ---- press and hold ------------------------------------------------------
 * Holding a verse opens its actions. A quick tap does nothing, so scrolling
 * through a chapter never springs the sheet open by accident.
 */
const HOLD_MS = 420;
const HOLD_SLOP = 12;      // px of finger travel allowed before it counts as a scroll

let holdTimer = null;
let holdTarget = null;
let holdOrigin = null;
let holdFired = false;
let tapsWithoutHold = 0;

function cancelHold() {
  clearTimeout(holdTimer);
  holdTimer = null;
  holdTarget?.classList.remove('is-pressing');
  holdTarget = null;
  holdOrigin = null;
}

function attachPressAndHold(body) {
  // The gesture is invisible, so say it exists once -- then never again.
  // Staggered after the swipe hint so the two never overlap on a first visit.
  if (!store.get('holdHintSeen', false)) {
    store.set('holdHintSeen', true);
    setTimeout(() => toast('Press and hold any verse to bookmark, highlight or add a note'), 3600);
  }

  body.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    const t = e.target.closest('.v');
    if (!t) return;
    holdFired = false;
    holdTarget = t;
    holdOrigin = { x: e.clientX, y: e.clientY };
    t.classList.add('is-pressing');
    holdTimer = setTimeout(() => {
      holdFired = true;
      const verse = +t.dataset.verse;
      t.classList.remove('is-pressing');
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* optional */ } }
      cancelHold();
      if (state && state.compareMode) openCompare(state.bookId, state.chapter, verse);
      else openSheet(verse);
    }, HOLD_MS);
  });

  body.addEventListener('pointermove', (e) => {
    if (!holdOrigin) return;
    if (Math.abs(e.clientX - holdOrigin.x) > HOLD_SLOP
        || Math.abs(e.clientY - holdOrigin.y) > HOLD_SLOP) cancelHold();
  }, { passive: true });

  body.addEventListener('pointerup', (e) => {
    const t = holdTarget;
    cancelHold();
    if (holdFired) return;
    const v = e.target.closest('.v');
    if (!v || !t) return;
    if (state && state.compareMode) { openCompare(state.bookId, state.chapter, +v.dataset.verse); return; }
    // Teach the gesture rather than leaving a tap feeling broken.
    tapsWithoutHold += 1;
    if (tapsWithoutHold <= 3) toast('Hold a verse to bookmark, highlight or note it');
  });

  body.addEventListener('pointercancel', cancelHold);
  body.addEventListener('pointerleave', cancelHold);
  window.addEventListener('scroll', cancelHold, { passive: true });

  // Suppress the platform's own long-press menu on Scripture.
  body.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.v')) e.preventDefault();
  });
}

/* ---- reader tools -------------------------------------------------------- */
function highlightSpeaking(verseNum) {
  clearSpeakingHighlight();
  const target = document.querySelector(`.scripture [data-verse="${verseNum}"]`);
  if (target) {
    target.classList.add('v--speaking');
    speakingEl = target;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
function clearSpeakingHighlight() {
  speakingEl?.classList.remove('v--speaking');
  speakingEl = null;
}

function readerTools(data, navigate, autoListen) {
  const bar = el('div', { class: 'tools' });

  const compareBtn = el('button', {
    class: 'tool', 'aria-pressed': String(Boolean(state.compareMode)),
    onclick: () => {
      state.compareMode = !state.compareMode;
      compareBtn.setAttribute('aria-pressed', String(state.compareMode));
      hint.hidden = !state.compareMode;
      toast(state.compareMode ? 'Tap any verse to compare' : 'Compare off');
    },
  }, el('span', { html: icon('compare'), style: 'display:contents' }),
     el('span', { text: 'Compare' }));

  let listenState = 'idle'; // idle | speaking | paused
  const listenIcon = el('span', { html: icon('speaker'), style: 'display:contents' });
  const listenLabel = el('span', { text: 'Listen' });
  const paintListen = () => {
    listenBtn.setAttribute('aria-pressed', String(listenState !== 'idle'));
    listenIcon.innerHTML = icon(listenState === 'speaking' ? 'pause' : listenState === 'paused' ? 'play' : 'speaker');
    listenLabel.textContent = listenState === 'speaking' ? 'Pause' : listenState === 'paused' ? 'Resume' : 'Listen';
  };
  const startListening = () => {
    if (!audio.isSupported()) return;
    const entries = data.verses.map((text, i) => ({ verse: i + 1, text })).filter((e) => e.text);
        if (!entries.length) { toast('Nothing to read in this chapter'); return; }
    listenState = 'speaking';
    paintListen();
    audio.speak(entries, {
      voiceURI: settings.get('readingVoice'),
      rate: settings.get('readingRate'),
      onVerseStart: (entry) => highlightSpeaking(entry.verse),
      onEnd: () => {
        const next = settings.get('autoContinueListening') ? bible.step(state.bookId, state.chapter, 1) : null;
        listenState = 'idle';
        paintListen();
        clearSpeakingHighlight();
        if (next) navigate(`#/read/${state.translation}/${next.bookId}/${next.chapter}?listen=1`);
      },
    });
  };
  const listenBtn = el('button', {
    class: 'tool', 'aria-pressed': 'false',
    onclick: () => {
      if (!audio.isSupported()) { toast('This browser can\u2019t read aloud'); return; }
      if (listenState === 'idle') {
        startListening();
      } else if (listenState === 'speaking') {
        audio.pause();
        listenState = 'paused';
        paintListen();
      } else {
        audio.resume();
        listenState = 'speaking';
        paintListen();
      }
    },
  }, listenIcon, listenLabel);

  const current = bible.getTranslation(state.translation);
  const switcher = el('button', {
    class: 'version-trigger', 'aria-haspopup': 'true',
    'aria-label': `Change translation. Currently ${current.name}.`,
    onclick: () => openTranslationPicker((next) => {
      const q = state.focusVerse ? `?v=${state.focusVerse}` : '';
      navigate(`#/read/${next}/${state.bookId}/${state.chapter}${q}`);
    }),
  },
    el('span', {},
      el('span', { class: 'version-trigger__hint', text: 'Version' }),
      el('br'),
      el('span', { class: 'version-trigger__label', text: current.abbr })),
    el('span', { html: icon('chevronDown'), style: 'display:contents' })
  );

  const hint = el('p', { class: 'tools__hint', hidden: !state.compareMode,
                         text: 'Compare is on — tap any verse.' });

  bar.append(switcher, compareBtn, listenBtn);
  if (autoListen) startListening();
  return el('div', {}, bar, hint);
}

/* ---- advertising: a footnote at the very end of a chapter -----------------
 * Placed only after the last verse and before the chapter-navigation buttons —
 * never inside the Scripture body, never between verses, never a popup or
 * overlay. Reading is complete before a person reaches it. Inert (`hidden`)
 * until a real provider is configured; no placeholder ad is ever drawn.
 * See css .ad-footnote and the reserved slots on Home and Library for the
 * same pattern elsewhere in the app.
 */
function footnoteAdSlot() {
  return el('aside', {
    class: 'ad-footnote', 'data-slot': 'reader-footnote',
    'aria-hidden': 'true', hidden: true,
  },
    el('span', { class: 'ad-footnote__label', text: 'Advertisement' }),
    el('div', { class: 'ad-footnote__body' })
  );
}

/* ---- chapter navigation -------------------------------------------------- */
function chapterNav(navigate) {
  const prev = bible.step(state.bookId, state.chapter, -1);
  const next = bible.step(state.bookId, state.chapter, +1);
  const to = (s) => `/read/${state.translation}/${s.bookId}/${s.chapter}`;

  return el('nav', { class: 'chapter-nav', 'aria-label': 'Chapter navigation' },
    el('button', {
      class: 'btn', disabled: !prev,
      html: icon('chevronLeft'),
      'aria-label': prev ? `Previous chapter, ${bible.formatRef(prev.bookId, prev.chapter)}` : 'No previous chapter',
      onclick: () => prev && navigate(to(prev)),
    }, el('span', { text: prev ? bible.formatRef(prev.bookId, prev.chapter) : 'Start' })),

    el('button', {
      class: 'btn btn--ghost', text: 'Chapters',
      'aria-label': `All chapters of ${bible.bookName(state.bookId)}`,
      onclick: () => navigate(`/library/book/${state.bookId}`),
    }),

    el('button', {
      class: 'btn', disabled: !next,
      'aria-label': next ? `Next chapter, ${bible.formatRef(next.bookId, next.chapter)}` : 'No next chapter',
      onclick: () => next && navigate(to(next)),
    }, el('span', { text: next ? bible.formatRef(next.bookId, next.chapter) : 'End' }),
       el('span', { html: icon('chevronRight'), style: 'display:contents' }))
  );
}

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const s = bible.step(state.bookId, state.chapter, e.key === 'ArrowLeft' ? -1 : 1);
    if (s) {
      e.preventDefault();
      state.navigate(`/read/${state.translation}/${s.bookId}/${s.chapter}`);
    }
  }
}

/* ---- swipe between chapters ----------------------------------------------
 * Lets a reader move chapter to chapter from anywhere on the page, rather
 * than scrolling to the buttons at the bottom.
 *
 * Rightward swipes needed particular care. iOS treats a right-swipe as the
 * system "go back" gesture and will hijack it mid-stroke: the web view stops
 * sending pointer events and fires pointercancel, so a handler that waits for
 * pointerup never runs and the swipe silently does nothing. Three things fix
 * that together:
 *   1. touch-action: pan-y on the reader (see css) claims horizontal gestures
 *      for the page, leaving vertical scroll and pinch-zoom to the browser.
 *   2. The gesture is recognised on pointermove, the moment it passes the
 *      threshold, rather than waiting for a pointerup that may never arrive.
 *   3. Strokes starting in the very left edge zone are ignored, because that
 *      is the system gesture's territory and competing there is unreliable.
 *
 * It stays deliberately conservative so it never fires during ordinary
 * vertical scrolling or while pressing and holding a verse (that gesture
 * cancels itself after 12px of travel).
 */
const SWIPE_MIN_X = 60;      // px of horizontal travel required
const SWIPE_MAX_Y = 45;      // px of vertical drift tolerated
const SWIPE_MAX_MS = 700;    // a swipe, not a slow drag
const SWIPE_EDGE = 24;       // px of left edge left to the system back gesture

let swipeStart = null;

function endSwipe() { swipeStart = null; }

function trySwipe(x, y) {
  const s = swipeStart;
  if (!s || s.done || !state) return;

  const dx = x - s.x;
  const dy = y - s.y;
  if (Date.now() - s.t > SWIPE_MAX_MS) { endSwipe(); return; }
  if (Math.abs(dx) < SWIPE_MIN_X) return;
  if (Math.abs(dy) > SWIPE_MAX_Y) return;
  if (Math.abs(dx) < Math.abs(dy) * 2) return;

  // Never hijack a swipe while a sheet or dialog is open over the reader.
  if (document.querySelector('.sheet.is-open, .gate')) { endSwipe(); return; }

  s.done = true;   // fire once per stroke
  // Swipe left = forward, matching the direction pages move in a book.
  const delta = dx < 0 ? 1 : -1;
  const target = bible.step(state.bookId, state.chapter, delta);
  if (!target) {
    toast(delta > 0 ? 'End of the Bible' : 'Start of the Bible');
    return;
  }
  state.navigate(`/read/${state.translation}/${target.bookId}/${target.chapter}`);
}

function attachSwipe(host) {
  // The gesture is invisible, so say it exists once -- then never again.
  if (!store.get('swipeHintSeen', false)) {
    store.set('swipeHintSeen', true);
    setTimeout(() => toast('Swipe left or right to change chapter'), 1200);
  }

  // render() runs on every chapter change but `host` is the persistent outlet
  // element, so guard against stacking a fresh set of listeners each time.
  if (host.dataset.swipeBound === '1') return;
  host.dataset.swipeBound = '1';

  host.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;   // mouse users have keys and buttons
    if (e.clientX <= SWIPE_EDGE) { swipeStart = null; return; }
    swipeStart = { x: e.clientX, y: e.clientY, t: Date.now(), done: false };
  }, { passive: true });

  // Recognise the swipe as it happens, so a hijacked pointerup can't lose it.
  host.addEventListener('pointermove', (e) => {
    if (!swipeStart) return;
    trySwipe(e.clientX, e.clientY);
  }, { passive: true });

  host.addEventListener('pointerup', (e) => {
    trySwipe(e.clientX, e.clientY);
    endSwipe();
  }, { passive: true });

  host.addEventListener('pointercancel', endSwipe, { passive: true });
}

/* ---- reading rail -------------------------------------------------------- */
function attachRailTracking() {
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 8 ? Math.min(1, window.scrollY / max) : 0;
    if (railFill) railFill.style.height = `${pct * 100}%`;
  };
  scrollHandler = () => requestAnimationFrame(update);
  window.addEventListener('scroll', scrollHandler, { passive: true });
  update();
}

/* ---- verse action sheet -------------------------------------------------- */
let sheet = null;
let backdrop = null;
let lastFocus = null;

function ensureSheet() {
  if (sheet) return;
  backdrop = el('div', { class: 'sheet-backdrop', onclick: closeSheet });
  sheet = el('div', {
    class: 'sheet', role: 'dialog', 'aria-modal': 'true',
    'aria-label': 'Verse actions', tabindex: '-1',
  });
  document.body.append(backdrop, sheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('is-open')) closeSheet();
  });
}

export function closeSheet() {
  if (!sheet) return;
  sheet.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  lastFocus?.focus?.();
}

async function openSheet(verse) {
  ensureSheet();
  lastFocus = document.activeElement;
  const { translation, bookId, chapter } = state;
  const text = await bible.getVerse(translation, bookId, chapter, verse);
  const ref = bible.formatRef(bookId, chapter, verse);
  const abbr = bible.getTranslation(translation).abbr;

  clear(sheet);
  sheet.append(el('div', { class: 'sheet__grip', 'aria-hidden': 'true' }));
  sheet.append(el('div', { class: 'sheet__head' },
    el('div', { class: 'sheet__ref', text: `${ref} · ${abbr}` }),
    el('button', { class: 'icon-btn', html: icon('close'), 'aria-label': 'Close', onclick: closeSheet })
  ));
  sheet.append(el('p', {
    class: 'sheet__preview',
    text: text || 'This verse is not included in this translation.',
  }));

  const actions = el('div', { class: 'sheet__actions' });
  const palette = el('div', { class: 'palette', hidden: true });
  const swatches = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Highlight colour' });
  const extras = el('div', { class: 'sheet__extras' });
  palette.append(el('p', { class: 'palette__label', text: 'Highlight colour' }), swatches);

  const refresh = () => { repaintVerse(verse); paint(); };

  function paint() {
    const bookmarked = study.isBookmarked(bookId, chapter, verse);
    const favourite = study.isFavourite(bookId, chapter, verse);
    const note = Boolean(study.noteOf(bookId, chapter, verse));
    const colour = study.highlightOf(bookId, chapter, verse);

    /* The four study actions, given equal weight. */
    clear(actions);
    actions.append(
      action('bookmark', 'Bookmark', bookmarked, () => {
        const on = study.toggleBookmark(bookId, chapter, verse, translation);
        toast(on ? 'Bookmarked' : 'Bookmark removed');
        refresh();
      }),
      action('highlighter', 'Highlight', Boolean(colour), () => {
        palette.hidden = !palette.hidden;
        if (!palette.hidden) swatches.firstElementChild?.focus();
      }, colour),
      action('note', note ? 'Edit note' : 'Note', note,
        () => openNote(bookId, chapter, verse, translation, refresh)),
      action('star', 'Favourite', favourite, () => {
        const on = study.toggleFavourite(bookId, chapter, verse, translation);
        toast(on ? 'Added to favourites' : 'Removed from favourites');
        refresh();
      })
    );

    clear(swatches);
    for (const c of study.HIGHLIGHT_COLOURS) {
      swatches.append(el('button', {
        class: 'swatch', style: `background: var(--hl-${c.id})`,
        'aria-label': `Highlight ${c.label}`,
        'aria-pressed': String(colour === c.id),
        onclick: () => {
          const next = colour === c.id ? null : c.id;
          study.setHighlight(bookId, chapter, verse, next, translation);
          toast(next ? `Highlighted ${c.label.toLowerCase()}` : 'Highlight removed');
          refresh();
        },
      }));
    }
    swatches.append(el('button', {
      class: 'swatch swatch--none', html: icon('close'),
      'aria-label': 'Remove highlight', 'aria-pressed': String(!colour),
      onclick: () => {
        study.setHighlight(bookId, chapter, verse, null, translation);
        toast('Highlight removed');
        refresh();
      },
    }));
    if (colour) palette.hidden = false;

    clear(extras);
    extras.append(
      extra('compare', 'Compare', () => { closeSheet(); openCompare(bookId, chapter, verse); }),
      extra('link', 'Cross refs', () => {
        closeSheet();
        openCrossReferences(bookId, chapter, verse, translation, (b, c, v) => {
          state.navigate(`/read/${translation}/${b}/${c}?v=${v}`);
        });
      }),
      extra('copy', 'Copy', async () => {
        const ok = await copyText(`“${text}”\n— ${ref} (${abbr})`);
        toast(ok ? 'Verse copied' : 'Could not copy');
      }),
      extra('share', 'Share', async () => {
        const r = await shareText(ref, `“${text}”\n— ${ref} (${abbr})`);
        if (r === 'copied') toast('Verse copied');
      })
    );
  }

  paint();
  sheet.append(actions, palette, extras,
    el('p', { class: 'sheet__foot', text: 'Saved items appear under Study.' }));
  sheet.classList.add('is-open');
  backdrop.classList.add('is-open');
  sheet.focus();
}

function action(iconName, label, pressed, onclick, colour) {
  return el('button', {
    class: 'act', 'aria-pressed': String(Boolean(pressed)), onclick,
    dataset: colour ? { hl: colour } : {},
  },
    el('span', { class: 'act__icon', html: icon(iconName) }),
    el('span', { class: 'act__label', text: label })
  );
}

function extra(iconName, label, onclick) {
  return el('button', { class: 'extra', onclick },
    el('span', { html: icon(iconName), style: 'display:contents' }),
    el('span', { text: label })
  );
}

function repaintVerse(verse) {
  const node = document.querySelector(`.scripture [data-verse="${verse}"]`);
  if (!node) return;
  const { bookId, chapter } = state;
  const colour = study.highlightOf(bookId, chapter, verse);
  if (colour) node.dataset.hl = colour; else delete node.dataset.hl;
  if (study.isBookmarked(bookId, chapter, verse)) node.dataset.bm = '1'; else delete node.dataset.bm;
  if (study.noteOf(bookId, chapter, verse)) node.dataset.note = '1'; else delete node.dataset.note;
}

/* ---- note editor --------------------------------------------------------- */
function openNote(bookId, chapter, verse, translation, done) {
  clear(sheet);
  const existing = study.noteOf(bookId, chapter, verse);
  const field = el('textarea', {
    class: 'note-input',
    placeholder: 'What does this verse say to you?',
    'aria-label': `Your note on ${bible.formatRef(bookId, chapter, verse)}`,
  });
  field.value = existing;

  sheet.append(
    el('div', { class: 'sheet__grip', 'aria-hidden': 'true' }),
    el('div', { class: 'sheet__ref', text: `Note · ${bible.formatRef(bookId, chapter, verse)}` }),
    el('p', { class: 'sheet__preview', text: 'Private to this device.' }),
    el('div', { style: 'margin-top:1rem' }, field),
    el('div', { style: 'display:flex; gap:.5rem; margin-top:1rem' },
      el('button', {
        class: 'btn btn--primary', text: 'Save note',
        onclick: () => {
          study.setNote(bookId, chapter, verse, field.value, translation);
          toast(field.value.trim() ? 'Note saved' : 'Note removed');
          closeSheet();
          done();
        },
      }),
      existing && el('button', {
        class: 'btn', text: 'Delete',
        onclick: () => {
          study.setNote(bookId, chapter, verse, '', translation);
          toast('Note removed');
          closeSheet();
          done();
        },
      }),
      el('button', { class: 'btn btn--ghost', text: 'Cancel', onclick: () => { closeSheet(); done(); } })
    )
  );
  field.focus();
}
