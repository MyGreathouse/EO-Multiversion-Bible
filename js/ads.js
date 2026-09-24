/* ads.js — fills the reserved, inert ad slots that already exist in the
 * markup (Home, Library, reader footnote). This module owns every place
 * the word "AdSense" appears in the codebase; nothing else should load or
 * reference third-party ad script directly.
 *
 * Hard rule, enforced structurally rather than just by convention: nothing
 * in here ever touches study.js/storage.js data. Ads know nothing about
 * bookmarks, highlights, notes or reading history, and never will by
 * default -- see ADVERTISING-PRIVACY-SETUP.md section on data separation.
 */
import { ADS_CONFIG, isConfigured } from './ads-config.js';
import * as consent from './consent.js';

let scriptRequested = false;

function loadAdSenseScript() {
  if (scriptRequested) return;
  scriptRequested = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_CONFIG.PUBLISHER_ID}`;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
}

function renderTestPlaceholder(bodyEl, label) {
  bodyEl.textContent = '';
  bodyEl.append(Object.assign(document.createElement('div'), {
    textContent: `Ad slot (${label}) \u2014 test mode, no real ad requested`,
  }));
}

function renderRealAd(bodyEl, slotId) {
  bodyEl.textContent = '';
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  ins.dataset.adClient = ADS_CONFIG.PUBLISHER_ID;
  ins.dataset.adSlot = slotId;
  ins.dataset.adFormat = 'auto';
  ins.dataset.fullWidthResponsive = 'true';
  bodyEl.append(ins);
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch { /* AdSense not ready yet, or blocked -- the slot just stays empty */ }
}

/**
 * Fills every reserved slot currently in the DOM. Safe to call repeatedly
 * (each route render creates new slot elements); does nothing at all
 * unless ads are enabled, configured, online, and (where the CMP applies)
 * consent allows a request.
 */
export async function fillSlots(root = document) {
  if (!ADS_CONFIG.ENABLED) return;
  if (!navigator.onLine) return; // no ad is expected while offline -- see brief section 11
  if (ADS_CONFIG.ENVIRONMENT === 'production' && !isConfigured()) return; // placeholders never fire for real

  let allowed = true;
  try { allowed = await consent.canRequestAds(); } catch { allowed = true; }
  if (!allowed) return;

  const containers = root.querySelectorAll('[data-slot]');
  if (!containers.length) return;

  for (const el of containers) {
    const body = el.querySelector('.ad-slot__body, .ad-footnote__body') || el;
    el.hidden = false;
    el.removeAttribute('aria-hidden'); // a populated ad should be perceivable, not hidden from assistive tech
    el.setAttribute('data-enabled', 'true');
    if (ADS_CONFIG.ENVIRONMENT !== 'production') {
      renderTestPlaceholder(body, el.dataset.slot);
      continue;
    }
    const slotId = ADS_CONFIG.SLOTS[el.dataset.slot];
    if (!slotId || slotId.startsWith('YOUR_AD_SLOT_ID')) { el.hidden = true; continue; }
    loadAdSenseScript();
    try { renderRealAd(body, slotId); } catch { /* fail silently -- the Bible keeps working */ }
  }
}

/** Called once at boot so the script can be ready before the first slot needs it. */
export function init() {
  if (!ADS_CONFIG.ENABLED) return;
  window.addEventListener('online', () => fillSlots());
}
