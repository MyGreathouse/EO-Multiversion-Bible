/* audio.js — read-aloud engine, built on the browser's own speech synthesis.
 *
 * No server, no account, no per-use cost -- this matches the rest of the
 * app's offline-first design. The honest trade-off: voice quality depends
 * entirely on what the visitor's own device offers. This module never
 * invents a voice or pretends the app controls that; it only works with
 * whatever the device actually provides.
 */

let voices = [];
let voicesPromise = null;

export const isSupported = () => 'speechSynthesis' in window;

function loadVoices() {
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise((resolve) => {
    if (!isSupported()) { resolve([]); return; }
    const grab = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length) voices = list;
      return list;
    };
    if (grab().length) { resolve(voices); return; }
    // Voices load asynchronously in most browsers; some also never fire
    // this event if the list was already available, so a short fallback
    // timer keeps this from waiting forever on a device with none at all.
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      grab();
      resolve(voices);
    }, { once: true });
    setTimeout(() => resolve(grab()), 350);
  });
  return voicesPromise;
}

export async function getVoices() {
  await loadVoices();
  return voices;
}

/* The Web Speech API exposes a voice's name and language, never a gender --
 * there is no such field in the spec. This infers one from naming
 * conventions used across iOS, Android, Windows and Chrome's own voices.
 * A voice that matches neither pattern is filed under "Other" rather than
 * guessed at, so the grouping stays honest about what it doesn't know. */
const FEMALE_PATTERN = /female|samantha|karen|victoria|moira|tessa|fiona|serena|zira|susan|hazel|catherine|kate|emily|amy|joanna|salli|kimberly|ivy|olivia|shelley|linda|heather|aria|jenny|libby|sonia/i;
const MALE_PATTERN = /male|daniel|alex|fred|oliver|arthur|george|james|ryan|david|mark(?!et)|guy|matthew|brian|justin|eric|russell|thomas|ryan|christopher|liam/i;

export function classifyVoice(voice) {
  const n = voice?.name || '';
  if (FEMALE_PATTERN.test(n)) return 'female';
  if (MALE_PATTERN.test(n)) return 'male';
  return 'other';
}

/* Groups a voice by language/accent using its actual BCP-47 locale (e.g.
 * "en-GB", "ja-JP") -- the one piece of real, structured information every
 * voice reliably carries. This can only group what a device actually has;
 * it never invents a voice that isn't there. English variants are split by
 * region since that's what "British" vs "American" vs "Nigerian" means in
 * practice; other languages are grouped by language alone. Nothing here
 * guarantees a given accent exists on any particular device -- Nigerian
 * English in particular has no standard system voice on current phones or
 * browsers as far as this was checked, so that group will often be empty. */
const ACCENT_GROUPS = [
  { id: 'en-GB', label: 'British English', test: (l) => /^en-GB/i.test(l) },
  { id: 'en-US', label: 'American English', test: (l) => /^en-US/i.test(l) },
  { id: 'en-NG', label: 'Nigerian English', test: (l) => /^en-NG/i.test(l) },
  { id: 'ja', label: 'Japanese', test: (l) => /^ja/i.test(l) },
  { id: 'fr', label: 'French', test: (l) => /^fr/i.test(l) },
  { id: 'zh', label: 'Chinese', test: (l) => /^zh/i.test(l) },
  { id: 'es', label: 'Spanish', test: (l) => /^es/i.test(l) },
  { id: 'ru', label: 'Russian', test: (l) => /^ru/i.test(l) },
];

export function classifyAccent(voice) {
  const lang = voice?.lang || '';
  const match = ACCENT_GROUPS.find((g) => g.test(lang));
  return match ? match.label : (lang.split('-')[0].toUpperCase() || 'Other') + ' / other';
}

export const ACCENT_ORDER = [...ACCENT_GROUPS.map((g) => g.label), null]; // null = catch-all "Other"

let queue = [];
let queueIndex = 0;
let cancelled = true;
let callbacks = null;
let activeVoice = null;
let activeRate = 0.85;
// Bumped on every jump/stop/fresh speak() so a callback from an utterance
// that's being cancelled -- browsers are inconsistent about whether that
// still fires onend, onerror, both, or neither -- can never act on stale
// state and corrupt the queue position.
let generation = 0;
let onProblem = null;      // told when speech cannot start at all, so the app can say so instead of staying silent
let failures = 0;          // utterances in a row that errored without ever starting
let utterRef = null;       // keep a live reference: Chrome can garbage-collect an utterance mid-speech and never fire onend

const PROBLEM = 'Couldn\u2019t start the voice. Check your phone isn\u2019t on silent, turn the volume up, and make sure a text-to-speech voice is installed.';

/* Clears whatever the speech engine is holding. cancel() is only called when
 * something is actually queued: on some phones, cancelling an idle engine makes
 * the next speak() silently do nothing. A stuck "paused" state (left over from
 * an earlier page or a backgrounded tab) silences everything after it, so that
 * is released too. Returns true if the engine was busy. */
function clearEngine() {
  if (!isSupported()) return false;
  const s = window.speechSynthesis;
  const busy = s.speaking || s.pending || s.paused;
  if (busy) s.cancel();
  if (s.paused) s.resume();
  return busy;
}

function fail() {
  const cb = onProblem;
  generation += 1; cancelled = true; queue = []; queueIndex = 0; callbacks = null; onProblem = null;
  clearEngine();
  cb?.(PROBLEM);
}

export const isSpeaking = () => isSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
export const isPaused = () => isSupported() && window.speechSynthesis.paused;

/** True while a chapter is actively queued, whether speaking or paused --
 * this is what a "tap a verse to jump" control should check before acting. */
export const isActive = () => !cancelled && queue.length > 0;

function speakNext(attempt = 0) {
  if (cancelled) return;
  if (queueIndex >= queue.length) { callbacks?.onEnd?.(); return; }
  const entry = queue[queueIndex];
  if (!entry.text) { queueIndex += 1; speakNext(); return; }
  const myGen = generation;
  const live = () => myGen === generation && !cancelled;
  const utter = new SpeechSynthesisUtterance(entry.text);
  if (activeVoice) { try { utter.voice = activeVoice; } catch { /* stale or invalid voice object -- fall back to the device default rather than break playback */ } }
  else utter.lang = document.documentElement.lang || 'en';
  utter.rate = activeRate;
  utter.volume = 1;
  let started = false;
  let watchdog = setTimeout(() => {
    // Asked to speak, but the engine never began. Try once more from a clean engine; then give up loudly.
    if (!live() || started) return;
    if (attempt === 0) {
      generation += 1;               // retire the silent utterance so a late event from it can't move the queue
      const g = generation;
      clearEngine();
      setTimeout(() => { if (g === generation && !cancelled) speakNext(1); }, 120);
    }
    else fail();
  }, 4000);
  const done = () => clearTimeout(watchdog);
  utter.onstart = () => { started = true; failures = 0; done(); if (live()) callbacks?.onVerseStart?.(entry); };
  utter.onend = () => { done(); if (live()) { queueIndex += 1; speakNext(); } };
  utter.onerror = (e) => {
    done();
    if (!live()) return;
    // 'canceled' / 'interrupted' come from our own jump or stop and are not failures.
    if (e && (e.error === 'canceled' || e.error === 'interrupted')) return;
    failures += 1;
    if (!started && failures >= 2) { fail(); return; }
    queueIndex += 1; speakNext();
  };
  utterRef = utter;
  window.speechSynthesis.speak(utter);
}

/**
 * Reads a list of { verse, text } entries aloud, one utterance per entry, so
 * playback can be paused and resumed cleanly and the entry currently being
 * read can be highlighted via onVerseStart.
 */
export function speak(entries, { voiceURI, rate = 0.85, onVerseStart, onEnd, onProblem: problem } = {}) {
  const busy = reset();
  if (!isSupported() || !entries || !entries.length) { onEnd?.(); return; }

  cancelled = false;
  queue = entries;
  queueIndex = 0;
  failures = 0;
  callbacks = { onVerseStart, onEnd };
  onProblem = problem || null;
  activeVoice = voiceURI ? voices.find((v) => v.voiceURI === voiceURI) : null;
  activeRate = rate;
  // iPhones only allow speech that starts inside the tap itself, so when the
  // engine is idle this speaks synchronously. A short gap is only needed when
  // we have just cancelled something that was still playing.
  const myGen = generation;
  if (busy) setTimeout(() => { if (myGen === generation && !cancelled) speakNext(); }, 80);
  else speakNext();
}

/**
 * Jumps to a specific verse within the chapter currently playing (or
 * paused) and continues forward from there -- for "tap a verse while
 * listening to skip to it" rather than waiting for the whole queue to play
 * through in order. Returns false, doing nothing, if nothing is active or
 * the verse isn't part of the current queue (e.g. a different chapter).
 */
export function jumpToVerse(verseNumber) {
  if (!isActive()) return false;
  const idx = queue.findIndex((e) => e.verse === verseNumber);
  if (idx < 0) return false;
  generation += 1; // invalidate whatever utterance is currently in flight
  const busy = clearEngine();
  cancelled = false;
  queueIndex = idx;
  failures = 0;
  const myGen = generation;
  if (busy) setTimeout(() => { if (myGen === generation && !cancelled) speakNext(); }, 80);
  else speakNext();
  return true;
}

/** Changes the speed of whatever plays next -- the verse currently mid-speech
 * can't retroactively speed up or slow down (the Web Speech API has no way
 * to do that), but every verse from here on will use the new rate. Safe to
 * call whether or not anything is currently playing. */
export function setRate(rate) {
  activeRate = rate;
}

export function pause() {
  if (isSupported() && window.speechSynthesis.speaking) window.speechSynthesis.pause();
}
export function resume() {
  if (isSupported() && window.speechSynthesis.paused) window.speechSynthesis.resume();
}
function reset() {
  generation += 1;
  cancelled = true;
  queue = [];
  queueIndex = 0;
  callbacks = null;
  onProblem = null;
  return clearEngine();
}
export function stop() { reset(); }

/** Call this straight from a tap when the verses still have to be fetched
 * before speak(): iPhones only let a page start speech from inside the tap
 * itself, and an await in between loses that permission. A silent, one-space
 * utterance spoken here keeps the permission for the real speak() afterwards. */
export function unlock() {
  if (!isSupported()) return;
  try {
    const s = window.speechSynthesis;
    if (s.paused) s.resume();
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    utterRef = u;
    s.speak(u);
  } catch { /* harmless: the real speak() still runs */ }
}

/** A short sample used when previewing a voice in Settings. */
export function speakSample(voiceURI, rate = 0.85, text = 'The Lord is my shepherd; I shall not want.') {
  if (!isSupported()) return;
  const busy = clearEngine();
  const voice = voiceURI ? voices.find((v) => v.voiceURI === voiceURI) : null;
  const utter = new SpeechSynthesisUtterance(text);
  if (voice) { try { utter.voice = voice; } catch { /* stale or invalid voice object -- fall back to the device default rather than break playback */ } }
  else utter.lang = document.documentElement.lang || 'en';
  utter.rate = rate;
  utter.volume = 1;
  utterRef = utter;
  if (busy) setTimeout(() => window.speechSynthesis.speak(utter), 80);
  else window.speechSynthesis.speak(utter);
}
