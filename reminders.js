/* reminders.js — a daily "have you read yet" nudge.
 *
 * Read this before changing anything: there is no standard browser API
 * that lets a closed, no-server PWA wake itself up and fire a notification
 * at an exact future time. The Notification Triggers API (TimestampTrigger)
 * was the one thing that could have done this -- Chrome ran it as an
 * origin trial and then ended its development, stating plainly that
 * consistent cross-platform behaviour wasn't achievable. It never shipped.
 *
 * So this is deliberately a *catch-up* reminder, not an alarm: every time
 * the app is opened or comes back to the foreground, it checks whether
 * today's reminder time has passed and nothing has been read yet today,
 * and if so, shows a notification right then. On Chrome/Android, with the
 * app installed, Periodic Background Sync is also registered as a
 * best-effort addition -- it can occasionally wake the service worker in
 * the background, but the browser decides the real frequency, not this
 * code, and it doesn't exist at all on iOS Safari or Firefox.
 */
import * as store from './storage.js';
import * as study from './study.js';

export const isSupported = () => 'Notification' in window;

export function permission() {
  return isSupported() ? Notification.permission : 'unsupported';
}

export async function requestPermission() {
  if (!isSupported()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hasReadToday() {
  const last = study.history()[0];
  if (!last) return false;
  return todayKey(new Date(last.at)) === todayKey();
}

function pastReminderTime(time) {
  const [h, m] = (time || '05:00').split(':').map(Number);
  const now = new Date();
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}

function alreadyRemindedToday() {
  return store.get('reminderLastFired', null) === todayKey();
}

function markRemindedToday() {
  store.set('reminderLastFired', todayKey());
}

/**
 * The main entry point -- safe to call on every app open and every time
 * the tab regains focus. Does nothing unless the reminder is on, permission
 * has been granted, today's time has passed, nothing's been read today,
 * and it hasn't already fired once today.
 */
export function checkAndNotify(settings) {
  const cfg = settings.get('dailyReminder');
  if (!cfg?.enabled) return false;
  if (!isSupported() || Notification.permission !== 'granted') return false;
  if (alreadyRemindedToday()) return false;
  if (!pastReminderTime(cfg.time)) return false;
  if (hasReadToday()) return false;

  try {
    new Notification('Time for Scripture', {
      body: 'You haven\u2019t opened your Bible yet today.',
      icon: 'assets/icon-192.png',
      tag: 'eo-daily-reminder',
    });
    markRemindedToday();
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort only -- registers Periodic Background Sync where the browser
 * supports it (Chrome/Android, app installed). Silently does nothing
 * everywhere else, including iOS Safari and Firefox, which don't have
 * this API at all.
 */
export async function registerBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg || !('periodicSync' in reg)) return false;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return false;
    await reg.periodicSync.register('eo-daily-reminder', { minInterval: 12 * 60 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}
