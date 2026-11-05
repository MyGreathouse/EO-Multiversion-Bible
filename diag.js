/* diag.js — temporary diagnostic. Delete diag.html and diag.js after use. */
const EXPECTED = {
 "index.html": "a70d0d4aa0f9",
 "sw.js": "4e0ca51efb22",
 "manifest.webmanifest": "2a57c9d6560e",
 "css/app.css": "248426a0cd73",
 "legal/licences.html": "bbd27208fb6d",
 "data/canon.json": "be00397a15a9",
 "js/ads-config.js": "f01cf3237166",
 "js/ads.js": "d67c3e128c6c",
 "js/app.js": "a013fd47e79a",
 "js/audio.js": "8243b4ccd8c5",
 "js/bible-engine.js": "181ff1821d0a",
 "js/compare.js": "fd814621e450",
 "js/consent.js": "744e997ba399",
 "js/cross-refs-view.js": "14a71d7ba5af",
 "js/cross-refs.js": "3555afceea17",
 "js/goto-picker.js": "e8be677d6324",
 "js/home.js": "3842cb9f39fd",
 "js/library.js": "30c44ccb6ff2",
 "js/plans-view.js": "7648f7d4f3ac",
 "js/plans.js": "b700cf86a70b",
 "js/reader.js": "a812cb66d539",
 "js/reminders.js": "661d2e835433",
 "js/search.js": "800859199b13",
 "js/settings-view.js": "8a1267a15dea",
 "js/settings.js": "2990b6d2941d",
 "js/storage.js": "8495335a13d1",
 "js/study-view.js": "69d8b1c6af9e",
 "js/study.js": "5f0d59284c8d",
 "js/ui.js": "09f3449d951f",
 "js/version-picker.js": "a2e0ab234c21"
};
const MODULES = ["js/ads-config.js", "js/ads.js", "js/audio.js", "js/bible-engine.js", "js/compare.js", "js/consent.js", "js/cross-refs-view.js", "js/cross-refs.js", "js/goto-picker.js", "js/home.js", "js/library.js", "js/plans-view.js", "js/plans.js", "js/reader.js", "js/reminders.js", "js/search.js", "js/settings-view.js", "js/settings.js", "js/storage.js", "js/study-view.js", "js/study.js", "js/ui.js", "js/version-picker.js"];
const out = document.getElementById('out');
const row = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; out.append(d); };
const sha = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))]
  .map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);

(async () => {
  row('h', '1. Files on the server vs the new build');
  let bad = 0;
  for (const [path, want] of Object.entries(EXPECTED)) {
    try {
      const r = await fetch(path + '?d=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) { bad++; row('bad', 'MISSING (' + r.status + ')  ' + path); continue; }
      const buf = await r.arrayBuffer();
      const got = await sha(buf);
      if (got === want) row('ok', 'ok  ' + path);
      else { bad++; row('bad', 'DIFFERENT  ' + path + '  (' + buf.byteLength + ' bytes)'); }
    } catch (e) { bad++; row('bad', 'ERROR  ' + path + '  ' + e.message); }
  }
  row('h', '2. Does each script load?');
  let broken = 0;
  for (const m of MODULES) {
    try { await import('./' + m + '?d=' + Date.now()); row('ok', 'loads  ' + m); }
    catch (e) { broken++; row('bad', 'FAILS  ' + m + '  ->  ' + e.message); }
  }
  row('h', '3. Scripture');
  for (const p of ['data/translations/asv/GEN.json', 'data/translations/bsb/JHN.json']) {
    try { const r = await fetch(p, { cache: 'no-store' }); row(r.ok ? 'ok' : 'bad', (r.ok ? 'ok  ' : 'MISSING (' + r.status + ')  ') + p); }
    catch (e) { row('bad', 'ERROR ' + p); }
  }
  row('h', 'Summary: ' + bad + ' file problem(s), ' + broken + ' script(s) failing');
})();
