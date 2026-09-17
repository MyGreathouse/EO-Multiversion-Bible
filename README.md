# EO Multiversion Bible

**Read. Study. Reflect.**

A Progressive Web App for reading and personally studying Scripture. The complete
Old and New Testaments in five translations, offline-capable, with no account
and no server-side storage of anything personal.

Created under the EO / Elias Okafor personal brand. *Ideas. Purpose. Impact.*

---

## What it does

- Complete 66-book canon, 1,189 chapters, in five translations: **BSB, WEB-BE, ASV, Webster's, YLT**
- 357,057 cross-references (OpenBible.info, CC BY), ranked by community relevance,
  with live verse previews — hold any verse, tap Cross refs
- Psalms, Proverbs, Job and the prophets set as poetry with proper indent levels
- Find any book instantly by typing a few letters — name or 3-letter id — from
  the library or from within a testament, no scrolling required
- Book → chapter → verse navigation, with previous/next crossing book boundaries
- Swipe left/right anywhere in a chapter to move between chapters, or use the
  buttons at the end of each chapter
- Verses absent from a critical-text translation (Acts 24:7, Mark 9:44, John 5:4
  and 14 others) can be shown on request from Webster's or YLT, clearly
  attributed — never silently substituted, never invented
- Full-Bible text search plus direct reference lookup (`John 3:16`, `Rom 8`, `ps 23`)
- Verse comparison across all three translations
- Bookmarks, five highlight colours, private notes, favourites, reading history
- Day / Sepia / Night themes; adjustable text size, line spacing and reading width
- YourUKHelpDesk Swiss Editorial palette: Canvas #F5F5F5, Navy #1B2A4A,
  Terracotta #C15F3C, Gold #D4AF37, Teal #008080, Sage #8FBC8F
- Works fully offline once books are cached; installable to a home screen
- No accounts, no analytics, no tracking. Personal data never leaves the device.

## Running it

Any static file server will do. Service workers require `https://` or `localhost`.

```bash
cd eo-bible
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploying

Push to GitHub, then import the repository in Vercel. No build step and no
environment variables are required — it is a static site.

`vercel.json` sets long-lived immutable caching for Scripture files and fonts,
`no-cache` for the service worker, and a strict Content-Security-Policy that
permits no external origins.

## Layout

```
index.html              application shell
manifest.webmanifest    PWA manifest
sw.js                   service worker (shell + Scripture caching)
vercel.json             headers and caching
css/app.css             design system and all styling
js/
  app.js                shell, hash router, translation switcher
  bible-engine.js       translation registry, canon, loading, reference parsing
  storage.js            device-local storage with in-memory fallback
  settings.js           reading appearance and preferences
  study.js              bookmarks, highlights, notes, favourites, position
  home.js  library.js  reader.js  search.js  compare.js
  study-view.js  settings-view.js  ui.js
data/
  canon.json            book names, testaments, chapter and verse counts
  translations/bsb|webbe|asv|webster|ylt/<BOOK>.json
assets/
  fonts/                Literata and Archivo (subset, variable, woff2)
  icon.svg  icon-*.png  eo-monogram.svg
legal/
  privacy.html  terms.html  licences.html
```

### Scripture file format

One file per book per translation:

```json
{ "i": "PSA", "n": "Psalms", "t": "bsb",
  "c": [ ["verse 1 text", "verse 2 text"], ["…"] ],
  "h": { "23": { "1": "The LORD Is My Shepherd" } },
  "q": { "23": { "1": [[5,0],[1,18],[2,43]] } } }
```

`c` is chapters, each an array of verses in order. `h` is optional editorial
section headings, keyed chapter → verse.

`q` is optional poetic line structure, keyed chapter → verse, as
`[indentLevel, characterOffset, stanzaBreak?]` pairs. Levels are 1–4 for indent
depth, 5 for a psalm superscription, 0 for a prose paragraph. The verse text is
never duplicated — the reader slices the single immutable string at those
offsets. A client that ignores `q` renders correct prose.

An empty verse string means the verse is genuinely absent from that translation
(a modern critical-text omission such as Mark 9:44); the reader labels these
rather than showing a gap.

Poetry is present for BSB (9,855 verses) and WEB-BE (8,062 verses). ASV,
Webster's and YLT carry no poetic markup in their source and always render as
prose; readers who want line separation can use the *one verse per line*
setting.

## Cross-references

`data/xrefs/<BOOK>.json` holds one file per book: chapter -> verse -> up to 20
related passages `[toBookId, toChapter, toVerseStart, toVerseEnd]`, ranked by
community vote and validated against this app's own canon (a handful of links
that didn't resolve to a real verse — a versification mismatch on 3 John 1:15 —
were dropped during the build; see `src/build_xrefs.py`). Source: OpenBible.info,
CC BY licensed, credited in the cross-references panel and in Settings.

## Advertising footnote

A single inert `<aside class="ad-footnote">` is rendered after the last verse
of every chapter, before the chapter-navigation buttons — never inside the
Scripture body, never between verses. It is `hidden` until a real provider is
configured; no placeholder ad is ever drawn. This is the only ad placement
inside the reader; Home and Library carry their own separate reserved slots.

## Adding a translation

The engine is translation-agnostic. Nothing in the reader, search or study code
needs to change.

1. Confirm you have the right to redistribute it — see **Licensing** below.
2. Convert it to the file format above, one file per book, using the same
   66 book IDs as `data/canon.json`.
3. Put the files in `data/translations/<id>/`.
4. Add an entry to `TRANSLATIONS` in `js/bible-engine.js`, including a `notice`
   string with the attribution the licence requires.

That is the whole change. The translation then appears in the switcher, in
Settings, in search, and in verse comparison.

## Licensing — read before publishing

| Translation | Status |
|---|---|
| **BSB** (Berean Standard Bible) | Public domain worldwide. Free for commercial use. |
| **WEB-BE** (World English Bible, British Edition) | Public domain worldwide. |
| **ASV** (American Standard Version, 1901) | Public domain worldwide; original copyright expired. |
| **Webster's Bible** (1833) | Public domain worldwide; pre-dates any applicable copyright term. |
| **YLT** (Young's Literal Translation, 1862/1898) | Public domain worldwide. |

**The King James Version is held back pending permission, not included in
this release.** Outside the UK it is public domain; within the UK it remains
under perpetual Crown letters patent exercised by Cambridge University Press,
with free use capped at 500 verses for non-commercial purposes — short of the
complete text this app would otherwise carry. A request has been sent to
CUP's Permissions Department (permissions@cambridge.org); the translation
will be reinstated if written permission is granted. See
`legal/licences.html` for the full note.

Copyrighted translations (NIV, ESV, NLT, TLB and others) are deliberately
excluded and must not be added without a written licence covering app
distribution, offline caching, the relevant territories, and commercial use.

Typefaces: Literata and Archivo, SIL Open Font Licence 1.1.

## Advertising

There is no advertising code in the app and no placeholder advertisements.
Inert `.ad-slot` containers are reserved on the Home and Library screens only —
never inside the reader. Ads must never interrupt Scripture reading. Introducing
a provider means filling those containers and updating `legal/privacy.html`
first.

## Privacy and security

- No accounts, no sign-in, no analytics, no third-party requests.
- Personal study data is written to `localStorage` under the `eo.bible.v1.`
  prefix and never transmitted. A memory fallback keeps the app usable where the
  browser blocks storage; Settings warns the user when that happens.
- Scripture text and user notes are inserted as text nodes, never as HTML.
  Search highlighting escapes first, then marks. Scripture is never evaluated.
- No personal data is placed in URLs. The only query parameter is a verse number.

## Data provenance

Scripture was imported from published public-domain releases, not generated and
not scraped:

- BSB — Bible Hub public-domain release (verse text); section headings and
  poetic line structure aligned in from the BSB USFM edition
- WEB-BE — WEBBE 2020 public-domain USFM (Michael Paul Johnson / eBible.org)
- ASV, Webster's, YLT — `scrollmapper/bible_databases` (MIT-licensed conversion
  of three independently public-domain texts; verified against the source
  translations' own copyright status, not taken on the repo's word alone)

The import was verified: 66 books and 1,189 chapters in every translation with no
chapter-count mismatch; 31,102 verses in BSB, ASV, Webster's and YLT (WEB-BE
differs by one due to a single split-verse convention). Several upstream defects
were caught and corrected during the build:

- a WEBBE JSON mirror whose single-chapter books were corrupt (its Philemon file
  contained Philippians) — rejected outright
- a BSB USFM mirror missing Psalm 106:42 and Lamentations 2:1, using a
  non-standard apostrophe codepoint, and differing in wording from the current
  BSB edition in 1,351 verses — demoted to a structure-only source
- Logseq block-ID metadata embedded in 24 verses of the BSB markdown release —
  stripped

Because the BSB text and structure now come from two editions that disagree in
places, poetic lines are aligned onto the verified text by matching opening
words. Where a verse cannot be aligned confidently (7.2% of poetic verses) it
renders as prose rather than as mis-broken poetry.
