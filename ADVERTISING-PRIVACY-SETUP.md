# Advertising & Privacy Setup

How the advertising and consent layer works, what's already built, and what
still needs doing in a real Google account before any of it goes live.

## 1. Local-first architecture (unchanged)

The reading experience — Scripture text, search, translation switching,
compare, notes, highlights, bookmarks, favourites, reading history, reading
plan progress, theme and display preferences — is written to the browser's
`localStorage` under the `eo.bible.v1.` prefix and never transmitted anywhere.
See `js/storage.js`, `js/study.js`, `js/plans.js`. This did not change with
advertising added, and nothing in the ads/consent layer can read it: `js/ads.js`
and `js/consent.js` never import `study.js` or `storage.js`.

## 2. What Bible data is stored locally

Bookmarks, highlights (with colour), personal notes, favourites, reading
position, reading history (last ~40 chapters), reading plan progress, and all
display/reading preferences (theme, text size, translation, voice, greeting
mode, etc). Full list: `js/storage.js`, the `NAMESPACE` prefix and `keys()`.

## 3. Third-party advertising technology in use

**Google AdSense.** No other ad network is wired in. Everything Google-specific
lives in three files:

- `js/ads-config.js` — the *only* place a publisher ID or ad-slot ID is ever
  set. Currently placeholder values with `ENABLED: false`.
- `js/ads.js` — loads the AdSense script and fills the three reserved slots.
  Never touches Bible/study data.
- `js/consent.js` — reads the IAB TCF signal (`window.__tcfapi`), which any
  certified CMP exposes, including Google's own.

## 4. Consent mechanism (CMP)

**Google's own "Privacy & messaging"** tool, configured inside the AdSense
account itself (Account → Privacy & messaging). This was chosen over a
homemade banner because:

- AdSense has required a TCF-certified CMP for EEA/UK/Switzerland traffic
  since January 2024 — building a custom one from scratch means also
  maintaining its certification and keeping it current as rules change.
- It's Google-hosted and Google-maintained, so it tracks their own evolving
  requirements rather than this app needing to.
- It integrates with the AdSense script automatically — no separate wiring
  needed for the banner UI itself.

`js/consent.js` does **not** implement its own consent UI. It reads whatever
CMP is actually present via the standard `window.__tcfapi` interface.

## 5. How consent reaches advertising

`js/ads.js`'s `fillSlots()` calls `consent.canRequestAds()` before ever
loading the AdSense script or requesting an ad. If a CMP is present and
consent hasn't been resolved yet (`eventStatus === 'cmpuishown'`), or is
required and absent, no ad is requested. Outside a region the CMP governs, or
before any CMP exists, Google's own documented behaviour is that this gating
doesn't apply — so `canRequestAds()` resolves `true` in that case, matching
Google's own default.

## 6. Advertising behaviour once consent is granted

The relevant reserved slot (Home, Library, or the reader footnote) is
unhidden and filled with a real `<ins class="adsbygoogle">` unit, requested
against the slot ID configured in `js/ads-config.js`.

## 7. Advertising behaviour when consent is not granted

The slot stays hidden. The rest of the page is completely unaffected —
nothing in the Bible-reading code path depends on whether a slot filled.

## 8. Changing consent later

**Settings → Privacy & Advertising → Change privacy choices.** This calls
`consent.reopenChoices()`, which calls Google's documented
`googlefc.showRevocationMessage()` if present.

**⚠️ Needs verification against your live account.** Google's exact global
object for this has shifted across product iterations before. This cannot be
confirmed working until Privacy & Messaging is actually configured in a real
AdSense account to test against — do that before relying on this button in
production.

## 9. Where the AdSense publisher ID is configured

`js/ads-config.js` → `PUBLISHER_ID`. Get it from AdSense → Account →
Account information. Looks like `ca-pub-XXXXXXXXXXXXXXXX`.

## 10. Where ad-slot IDs are configured

`js/ads-config.js` → `SLOTS`. Create one ad unit per slot in AdSense → Ads →
By ad unit, then paste each unit's slot ID in for `home`, `library`, and
`reader-footnote`.

## 11. UK/EEA consent handling

Handled entirely by Google's Privacy & Messaging CMP once configured in the
AdSense account (see §4). This app's code only *reads* the resulting signal;
it does not implement region logic itself.

## 12. Testing the different consent states

With `ADS_CONFIG.ENVIRONMENT = 'test'` (the default), every reserved slot
renders a clearly labelled placeholder — "Ad slot (…) — test mode, no real ad
requested" — instead of making any real request, so layout and gating can be
checked with zero risk of an invalid production impression. Force each
scenario by editing `js/ads-config.js` temporarily:

| Scenario | How to force it |
|---|---|
| Ads off entirely | `ENABLED: false` (the shipped default) |
| Ads on, no real request | `ENABLED: true`, `ENVIRONMENT: 'test'` |
| Offline | Toggle devtools "Offline", confirm no slot fills |
| Ad failure | Set an invalid slot ID, confirm the Bible is unaffected |

## 13. What must be configured manually in Google AdSense

**This must be completed in Google AdSense — none of it can be done from
this codebase:**

1. Create/verify the AdSense account for the real production domain.
2. Add the site (`eobibles.com` or `bible.risten.co.uk`) and get it approved.
3. Create three ad units (Home, Library, reader footnote) and copy their
   slot IDs into `js/ads-config.js`.
4. Enable and configure **Privacy & messaging** for GDPR/UK/Switzerland —
   customise the message wording/design to match the app's tone if desired.
5. Confirm the `googlefc.showRevocationMessage()` call in `js/consent.js`
   actually reopens that message once it's live (see §8).

## 14. Before production launch, check

- [ ] `js/ads-config.js`: real `PUBLISHER_ID`, real slot IDs, `ENVIRONMENT: 'production'`
- [ ] `ENABLED: true` only after the above are real
- [ ] Privacy & messaging configured and tested in the real AdSense account
- [ ] "Change privacy choices" verified against the live CMP
- [ ] `legal/privacy.html` still accurately describes what's actually running
- [ ] Play Console → Data safety updated to disclose the ad SDK (currently
      says "no data collected" — that changes once ads go live)

## Limitations this documentation cannot verify

No AdSense account exists yet for this app as of writing. Everything above
matches Google's publicly documented behaviour, checked at the time this was
written — but the exact revocation-message API call (§8), real approval of
the site by AdSense, and real ad delivery can only be confirmed against a
live, configured account. This is not a guarantee of legal compliance; get
your own advice for anything with real financial or regulatory stakes.
