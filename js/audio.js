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

let queue = [];
let queueIndex = 0;
let cancelled = true;
let callbacks = null;

export const isSpeaking = () => isSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
export const isPaused = () => isSupported() && window.speechSynthesis.paused;

/**
 * Reads a list of { verse, text } entries aloud, one utterance per entry, so
 * playback can be paused and resumed cleanly and the entry currently being
 * read can be highlighted via onVerseStart.
 */
export function speak(entries, { voiceURI, rate = 1, onVerseStart, onEnd } = {}) {
  stop();
  if (!isSupported() || !entries || !entries.length) { onEnd?.(); return; }

  cancelled = false;
  queue = entries;
  queueIndex = 0;
  callbacks = { onVerseStart, onEnd };
  const voice = voiceURI ? voices.find((v) => v.voiceURI === voiceURI) : null;

  const speakNext = () => {
    if (cancelled) return;
    if (queueIndex >= queue.length) { callbacks?.onEnd?.(); return; }
    const entry = queue[queueIndex];
    if (!entry.text) { queueIndex += 1; speakNext(); return; }
    const utter = new SpeechSynthesisUtterance(entry.text);
    if (voice) utter.voice = voice;
    utter.rate = rate;
    utter.onstart = () => { if (!cancelled) callbacks?.onVerseStart?.(entry); };
    utter.onend = () => { if (!cancelled) { queueIndex += 1; speakNext(); } };
    utter.onerror = () => { if (!cancelled) { queueIndex += 1; speakNext(); } };
    window.speechSynthesis.speak(utter);
  };
  speakNext();
}

export function pause() {
  if (isSupported() && window.speechSynthesis.speaking) window.speechSynthesis.pause();
}
export function resume() {
  if (isSupported() && window.speechSynthesis.paused) window.speechSynthesis.resume();
}
export function stop() {
  cancelled = true;
  queue = [];
  queueIndex = 0;
  callbacks = null;
  if (isSupported()) window.speechSynthesis.cancel();
}

/** A short sample used when previewing a voice in Settings. */
export function speakSample(voiceURI, text = 'The Lord is my shepherd; I shall not want.') {
  if (!isSupported()) return;
  window.speechSynthesis.cancel();
  const voice = voiceURI ? voices.find((v) => v.voiceURI === voiceURI) : null;
  const utter = new SpeechSynthesisUtterance(text);
  if (voice) utter.voice = voice;
  window.speechSynthesis.speak(utter);
}
