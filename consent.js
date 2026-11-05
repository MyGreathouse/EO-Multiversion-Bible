/* consent.js — a thin reader of whatever consent-management platform (CMP)
 * is actually running. This deliberately does NOT implement its own
 * consent logic or its own "I have decided" flag in localStorage --
 * AdSense requires a TCF-certified CMP for EEA/UK/Switzerland traffic, and
 * the correct source of truth is that CMP's own signal, not a homemade one.
 *
 * In production this will be Google's own "Privacy & messaging" CMP,
 * configured directly in the AdSense account (see ADVERTISING-PRIVACY-SETUP.md).
 * It exposes the standard IAB TCF API (window.__tcfapi), which is what this
 * file reads -- the same interface any other certified CMP would expose,
 * so this isn't locked to one vendor's internals.
 */

let cached = null; // null = not yet known, otherwise the last TCF event data

function readTCF() {
  return new Promise((resolve) => {
    if (typeof window.__tcfapi !== 'function') { resolve(null); return; }
    try {
      window.__tcfapi('addEventListener', 2, (data, success) => {
        if (success && data) { cached = data; resolve(data); }
      });
    } catch { resolve(null); }
    // A CMP that never calls back (or isn't actually present despite the
    // global existing) shouldn't hang the app -- fall through to null.
    setTimeout(() => resolve(cached), 800);
  });
}

/**
 * Whether it's currently fine to request advertising at all. Outside a
 * region the CMP governs (or before any CMP is configured), Google's own
 * documented behaviour is that ad serving simply isn't gated this way --
 * so "no signal present" resolves to true, not false. Where a CMP *is*
 * present, its own gdprApplies / consent status decides.
 */
export async function canRequestAds() {
  const data = await readTCF();
  if (!data) return true;
  if (data.gdprApplies === false) return true;
  return Boolean(data.tcString) && data.eventStatus !== 'cmpuishown';
}

/** Whether personalised (rather than only non-personalised) ads are allowed. */
export async function canPersonalize() {
  const data = await readTCF();
  if (!data || data.gdprApplies === false) return true;
  const purposes = data.purpose?.consent || {};
  // Purpose 1 (store/access info) and 4 (personalised ads) are the two
  // that matter for whether a personalised request is appropriate.
  return Boolean(purposes[1] && purposes[4]);
}

/**
 * Reopens the CMP's own choice screen, for Settings -> Privacy & Advertising.
 * This calls Google's documented Privacy & Messaging revocation entry point
 * when it's present. IMPORTANT: verify this against the live AdSense
 * account once Privacy & Messaging is actually configured -- Google's exact
 * global has shifted names across product iterations before, and this
 * cannot be confirmed working until a real, configured CMP exists to test
 * against. See ADVERTISING-PRIVACY-SETUP.md.
 */
export function reopenChoices() {
  if (typeof window.googlefc?.showRevocationMessage === 'function') {
    window.googlefc.showRevocationMessage();
    return true;
  }
  return false;
}
