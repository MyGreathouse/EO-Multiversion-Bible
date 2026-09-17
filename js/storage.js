/* storage.js — all personal data stays on this device.
   Nothing here is ever sent to a server. A memory fallback keeps the app
   usable where the browser blocks storage (private mode, embedded frames). */

const NS = 'eo.bible.v1.';
const memory = new Map();

let backing = null;
try {
  const probe = NS + '__probe';
  window.localStorage.setItem(probe, '1');
  window.localStorage.removeItem(probe);
  backing = window.localStorage;
} catch {
  backing = null;
}

export const isPersistent = () => backing !== null;

function readRaw(key) {
  if (backing) { try { return backing.getItem(NS + key); } catch { /* fall through */ } }
  return memory.has(NS + key) ? memory.get(NS + key) : null;
}

function writeRaw(key, value) {
  if (backing) {
    try { backing.setItem(NS + key, value); return true; } catch { /* quota or blocked */ }
  }
  memory.set(NS + key, value);
  return false;
}

export function get(key, fallback = null) {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function set(key, value) {
  return writeRaw(key, JSON.stringify(value));
}

export function remove(key) {
  if (backing) { try { backing.removeItem(NS + key); } catch { /* ignore */ } }
  memory.delete(NS + key);
}

/** Every key this app owns, for export and for "erase everything". */
export function keys() {
  const out = new Set();
  if (backing) {
    try {
      for (let i = 0; i < backing.length; i++) {
        const k = backing.key(i);
        if (k && k.startsWith(NS)) out.add(k.slice(NS.length));
      }
    } catch { /* ignore */ }
  }
  for (const k of memory.keys()) out.add(k.slice(NS.length));
  return [...out];
}

export function exportAll() {
  const data = {};
  for (const k of keys()) data[k] = get(k);
  return { app: 'EO Multiversion Bible', version: 1, exported: new Date().toISOString(), data };
}

export function eraseAll() {
  for (const k of keys()) remove(k);
}
