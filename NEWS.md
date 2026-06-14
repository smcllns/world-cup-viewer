# NEWS

A dated changelog for the World Cup 2026 Schedule Viewer. Each heading is a
calendar day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-06-14
- **Knockout autofill would not have worked — two critical fixes (PR):** a deep
  scan of openfootball's 1930–2026 files (vs our writer) found that 2026 knockouts
  live in a **separate file** `2026--usa/cup_finals.txt` (with a `(NN)`
  match-number prefix on each line), not `cup.txt` — so the autofill (which only
  edited `cup.txt`, with a regex that choked on `(NN)`) would have **silently
  no-op'd every knockout result**. Now it writes group results to `cup.txt` and
  knockouts to `cup_finals.txt` (one commit per file), and the line regex accepts
  the optional `(NN)` prefix. Also fixed the **a.e.t. paren order**: real files
  write `(score-at-90, half-time)` — e.g. `3-3 a.e.t. (2-2, 2-0)` — but our writer
  (and the test that encoded it) had it reversed. Froze a real `cup_finals.txt`
  snapshot + tests (every knockout match number is present; `(NN)`-prefixed line
  matching; corrected a.e.t. order against the 2022 final). The scan also
  *confirmed* our `(OG)`, `(pen.)`, shootout, and stoppage-minute formats are
  correct for the current files. 169 tests.
- **Hardening pass — kill the mapping-mismatch bug class (PR):** an audit (driven
  by the two name/date bugs below) found and fixed more of the same class:
  (1) **TheSportsDB spells it "Bosnia-Herzegovina"** (hyphen), which our aliases
  didn't map — Bosnia's matches would silently fail the cross-check; (2) the
  autofill's `espnGoals` still fetched a **single ESPN date** (the lag the live
  fix addressed) — now uses the ±1-day window so a midnight-ET match's
  scorers/extra-time aren't dropped; (3) `applyResults` could write a **reversed
  score** if a feed name matched neither team — now it skips. New tests pin every
  **real captured ESPN + TheSportsDB spelling** to a known team (would've caught
  both prior bugs), assert the duplicated ESPN alias maps stay in sync, exercise
  `applyEdit` against a frozen real cup.txt snapshot (CRLF + idempotency), and
  check static-data integrity. Plus `npm run check:sync` — a runtime drift guard
  (wired into the hourly feed-freshness job) that fails if upstream cup.txt renames
  a team so the autofill can't find its line. 146 tests.
- **Fix: autofill couldn't sync Türkiye/Czechia matches (name spelling).** Our app
  and the feeds use the official FIFA names (Türkiye, Czechia), but cup.txt's match
  lines use simpler spellings (Turkey, Czech Republic) — so the writer searched for
  e.g. "Australia v Türkiye", didn't find the "Australia v Turkey" line, and
  silently skipped (this is why Australia 2–0 Türkiye didn't sync overnight despite
  ESPN confirming it). Added a `cupName` alias map so the line lookup uses cup.txt's
  spelling, with a test. Australia 2–0 Türkiye
  ([commit](https://github.com/openfootball/worldcup/commit/7b779a6837a69b06c391308b0c7aab82717ea48a))
  synced once fixed.
- **Fix: live matches stuck on "Live" with no score/clock.** The live overlay
  used ESPN's default scoreboard (no date param), which returns only one date's
  slate and can lag a day — so a late-night match (e.g. a midnight-ET kickoff that
  ESPN files under the next date) was missing from it, and the card fell back to a
  time-based "Live" with no score or clock. `fetchLive` now queries the dates
  around now (yesterday/today/tomorrow, UTC) and merges them, so live games show
  their score and clock again. (Caught live on Australia 1–0 Türkiye, 43'.)
- **Self-perpetuating autofill loop + a big test pass (PR):** GitHub's scheduler
  fires too sparsely (~once/2h) to rely on, so a loop run now **re-dispatches the
  next one** while another match window is within ~5.5h — coverage during a match
  day no longer depends on the scheduler (the `*/15` cron is just a backstop to
  restart the chain after overnight rests). Loop runs share one concurrency group
  so the chain never doubles up; quick manual runs get their own. Extracted the
  autofill's risky decision/parsing logic into `scripts/autofill-core.mjs`
  (`classifyMatch`, `parseEspnEventDetail`) and added tests: ESPN-only fallback /
  disagreement / ✓✓ branches, ESPN event → goals/penalties/extra-time parsing
  (incl. a 2022-final-shaped shootout fixture), more `windowStatus` edges, and a
  guard that the scripts pull in **zero npm packages** (the workflow runs without
  `npm ci`). 147 tests total. Design + optional external-pinger notes in
  [`docs/autofill-scheduling.md`](./docs/autofill-scheduling.md).
- **Resilient scheduling (sleep-until-window) + manual babysit:** GitHub fires
  scheduled workflows only sporadically (observed ~once every 2h), which could
  miss a match's ~95-min sync window entirely. Reworked the loop to SLEEP until
  the next match window (up to a ~5h budget) and poll through it, so a single
  sparse trigger still covers upcoming games. Added a `babysit` workflow_dispatch
  input that runs this long loop on demand (used to guarantee overnight coverage).
- **ESPN-only fallback when TheSportsDB lags:** the autofill still prefers ✓✓
  (both sources agree), but TheSportsDB often posts a final tens of minutes late,
  which was blocking otherwise-confirmed syncs. Now, once a match is ≥150 min
  past kickoff (≈ full time + ~30 min) and ESPN has confirmed the final while
  TheSportsDB still hasn't, it syncs on ESPN alone — the commit and email note
  “ESPN only — TheSportsDB lagging”. Disagreements are still never auto-written.
  (First use: Haiti 0–1 Scotland.)
- **Autofill now runs only during match-finishing windows (and actually at
  ~5-min cadence):** GitHub throttles `*/5` cron schedules hard — the workflow was
  only firing a couple of times an hour. Reworked it into a window-gated
  self-loop: a coarse `*/15` trigger spins the job up, and it loops every ~5 min
  *only* while a match is in its finishing window (kickoff +85 to +180 min —
  late second half through source confirmation, [`scripts/active-window.mjs`](./scripts/active-window.mjs));
  outside those windows it exits in seconds. Because each window is ~95 min long,
  a coarse trigger reliably lands inside it, and the concurrency group hands off
  between jobs with no gap. Dropped `npm ci` (the scripts have no npm deps) so the
  idle checks are cheap, and moved the sync email in-script (Gmail SMTP via
  python3) so it fires per loop iteration — also retiring the third-party mail
  Action. New `windowStatus()` is unit-tested (128 tests total).
- **Manual-review alerts for knockouts the autofill can't auto-sync:** when a
  knockout is confirmed but can't be written safely (ESPN/TheSportsDB disagree on
  the penalty tally, goals don't reconcile, or ESPN has no goal detail), the
  workflow opens a **deduplicated GitHub issue** assigned to the maintainer —
  raised once (not every 5-minute run), so it's a trackable to-do rather than
  email spam. Bumped `action-send-mail` to v17 (Node 24; clears the deprecation
  warning).
- **Email notification on every upstream sync:** when the autofill workflow
  actually commits a new final to `openfootball/worldcup`, it now emails
  chester.ismay@gmail.com with the match(es), commit link, and run link. The
  script emits step outputs only on a real push (no commit → no email; deferred
  /manual-review items don't email). The email step uses Gmail SMTP and needs two
  repo secrets — `MAIL_USERNAME` (the Gmail address) and `MAIL_PASSWORD` (a Gmail
  App Password); if they're absent the step is skipped and the sync still runs.
- **Autofill now handles knockout a.e.t./penalties** (was group-stage only): the
  OpenFootball autofill writer renders knockout results in cup.txt's full house
  style — `1-1 a.e.t. (1-0, 1-1), 4-2 pen.` — with extra-time-aware half-time and
  FT-at-90 scores and shootout kicks excluded from the goalscorer block. The
  after-extra-time score is still ✓✓ (ESPN + TheSportsDB); the penalty tally is
  ESPN-primary, cross-checked against TheSportsDB when it carries one (a
  disagreement, or a knockout whose goals can't be reconciled, is surfaced for
  manual review rather than written as a bare score). Matches are merged first so
  knockout lines pick up resolved team names instead of "Winner Group A". New
  `buildScore()` + a.e.t./penalty tests in `cuptxt.mjs` anchored on the verified
  2022 final (Argentina 3–3 a.e.t. (2–0, 2–2), 4–2 pen.). First live autofill
  commit: Brazil 1–1 Morocco
  ([commit](https://github.com/openfootball/worldcup/commit/dc6d4da963150ef6e41de2ac82afd692291705a2)).

## 2026-06-13
- **`npm run of:autofill` + hourly workflow — automatically give confirmed
  finals back to OpenFootball:** the write-capable counterpart to `of:edits`.
  For every finished match where ESPN + TheSportsDB agree on the final and
  OpenFootball is missing it, it edits the `cup.txt` line (score + half-time +
  goalscorers, in the file's house style) and commits to `openfootball/worldcup`
  master. Conservative: group stage only (knockouts can be a.e.t./penalties —
  surfaced for manual review), ✓✓-confirmed only, and idempotent (only touches a
  line still reading `Home v Away`). Half-time/scorers come from ESPN; if they
  don't reconcile with the agreed final it writes a valid score-only line. All
  formatting + placement is isolated in [`scripts/cuptxt.mjs`](./scripts/cuptxt.mjs)
  and covered by [`test/cuptxt.test.js`](./test/cuptxt.test.js) (19 tests:
  FT/HT, `(pen.)`/`(OG)`, repeat-scorer comma-merge, one-sided vs two-sided
  blocks, orientation to the file's team order, special characters, CRLF
  endings, idempotency, placement). The
  [workflow](./.github/workflows/openfootball-autofill.yml) runs every 5 minutes
  (GitHub's minimum cron granularity) so a freshly-finished match is filled in
  within minutes; it needs an `OF_PUSH_TOKEN` secret (PAT, Contents: write);
  without it, it dry-runs. Format conventions were derived from a survey of the
  2006–2026 cup.txt files.
- **`npm run of:edits` — give late finals back to OpenFootball:** OpenFootball
  commits results by hand and sometimes lags after a match. This new script
  ([`scripts/openfootball-edits.mjs`](./scripts/openfootball-edits.mjs)) reuses
  the app's existing three-source reconciliation to list finished matches whose
  final OpenFootball hasn't posted yet but ESPN and/or TheSportsDB have —
  printed as paste-ready `cup.txt` lines (`Home  FT  Away`), ranked ✓✓ both
  fallbacks agree / ⚠ one fallback only / ✗ fallbacks disagree, plus any match
  where OpenFootball's score disagrees with the fallbacks (possible
  corrections). It's the follow-through on the maintainer's edit-in-place invite
  in [worldcup.json#23](https://github.com/openfootball/worldcup.json/issues/23);
  read-only (never writes). Its first real catch — Qatar 1–1 Switzerland
  (Jun 13), confirmed by ESPN + TheSportsDB — was contributed back to the
  upstream source ([cup.txt edit](https://github.com/openfootball/worldcup/commit/cb9171670e19695bb95625683ead74d9d469e55e)).
  Note the edit target is `openfootball/worldcup`'s `2026--usa/cup.txt`, **not**
  `worldcup.json` (bot-regenerated, so direct JSON edits get clobbered).
- **Foldable days on the Schedule:** each day section now collapses/expands from
  its header (chevron + match count), and days that have already passed fold shut
  by default — so the page opens on what's still to come instead of a long scroll
  of finished matches. "Past" is judged against today in the viewer's selected
  timezone; expanding/collapsing a day overrides the default for that day. The
  per-day "Hide scores" spoiler toggle is unchanged and only shows while a day is
  expanded. (Weeks in the Week view are next.)
- **Real soccer ball across the share image and all app icons:** the Open
  Graph/Twitter preview (`public/og-image.png`/`.svg`) and the PWA/home-screen
  icons used an abstract mark that didn't read as a ball. Swapped in the
  [Google Noto Emoji](https://github.com/googlefonts/noto-emoji) soccer ball
  (Apache License 2.0) — a polished, instantly recognizable design. Embedded the
  vector in `og-image.svg` and `icon.svg`, then re-rendered all PNGs from the
  SVGs with headless Chrome: `og-image.png` (1200×630), `icon-512.png` (also the
  maskable icon — ball kept inside the safe zone), `icon-192.png`, and
  `apple-touch-icon.png` (180×180). Credited Noto in the README. The
  `index.html` favicon stays the ⚽ emoji — the detail doesn't read at 16px, and
  the emoji is crisper there.

## 2026-06-11
- **Doc fix — README no longer claims subs in the timeline:** the Match Detail
  timeline advertised substitutions (🔁), but the ESPN *scoreboard* feed the app
  reads only carries goals and cards (its curated "key plays" list) — subs live
  only on ESPN's per-match `summary` endpoint, which the app doesn't fetch. So
  subs never rendered. Trimmed the subs mention from the README feature list and
  data-sources note to match actual behavior. (The timeline's sub-rendering code
  stays as harmless scaffolding if we later wire the summary endpoint.)
- **Feed-freshness gate now alarms only when the app is blind:** the CI check
  bucketed STALE on OpenFootball alone, so it red-failed after every finished
  match while OpenFootball (which commits results hours late) caught up — even
  though ESPN/TheSportsDB already carried the final and the app showed it. The
  gate now treats a match as scored if *any* of the three sources has the final,
  and only fails when none do (the app would genuinely show no score).
  OpenFootball lagging behind a fallback is surfaced as an informational note
  instead of a failure. (Opener: Mexico 2–0 South Africa was on ESPN but not yet
  in OpenFootball — gate stayed green.)
- **Distinct nav icons:** Schedule, Week, and the Calendar subscribe/export button
  all shared a calendar glyph. Schedule is now `📋`, Week stays `📆`, and the
  Calendar button is `📤` (it's an export/subscribe action), so each is visually
  distinct.
- **Installable (PWA manifest):** added `public/manifest.webmanifest` + app icons
  (192/512/maskable, apple-touch-icon) and linked them in index.html, so the app
  can be added to a phone/desktop home screen and launches standalone (no browser
  chrome) with a branded splash. Relative paths so it works on both Netlify (root)
  and GitHub Pages (sub-path). No service worker / offline yet — install + chrome
  only.
- **OG preview image:** added a branded 1200×630 `public/og-image.png` (+ source
  SVG) and wired `og:image`/`twitter:image` (summary_large_image) so shared links
  unfurl with a picture.
- **Fixed finished match showing as live:** new `liveState()` helper — a match
  ESPN flags is live, a match with a final score is finished even inside the
  time-based window; the clock is only a fallback. Used by MatchCard, MatchDetail,
  NextMatch, and the "Live now" filter (a just-ended game now reads FT immediately).
- **Live state everywhere + richer timeline (app-wide audit follow-up):**
  - Live badge/clock now shows in **Week** and **Bracket** views (was Schedule-only),
    via shared `LiveBadge`/`ScoreCheck` components; Week also gained pens/AET labels
    and the source cross-check badge.
  - **Match status label**: the badge shows ESPN's `shortDetail`, so it reads
    "HT"/"FT" at breaks instead of a frozen clock; **stoppage time** is preserved in
    the clock ("45'+3'") and in goal/card minutes ("45+2'"). (ESPN's feed does not
    expose the *announced* added-time "+4", only elapsed — documented in espn.js.)
  - **Cards & substitutions**: ESPN `details` now parsed into `m.cards`/`m.subs` and
    rendered in the Match Detail timeline (⚽ 🟨 🟥 🔁); "Goals" → "Match events".
  - **"Live now" filter** uses the real `m.live` flag instead of the time-based guess.
  - **Accessibility**: `aria-label`/`role="status"` on live/FT badges, aria-label on
    bracket matches, and a `useModalA11y` hook (focus trap + restore) for both modals.
  - **SEO/social**: description, Open Graph, Twitter card, and theme-color in index.html.
  - **Robustness**: all three fetchers guard `res.json()`; OpenFootball also asserts a
    `matches[]` array so a bad 200 surfaces an error instead of silently showing none.

- **TheSportsDB as a third source + score cross-check:** added
  `src/services/thesportsdb.js` (free, CORS-open, public test key; FIFA World Cup
  league 4429, season 2026) as an independent backup source of final scores.
  Refactored the validator into a source-agnostic `src/services/reconcile.js`
  (`crossCheck`, `annotateScoreChecks`, `reconcileScores`), with each adapter now
  exposing a `*FinalScore` getter (`openFootballFinalScore`, `espnFinalScore`,
  `sdbFinalScore`). The app fetches all three feeds in parallel and annotates
  every final with how many sources confirm it: MatchCard shows "✓ confirmed by
  N sources" or "⚠ sources disagree", and `npm run check:feed` now reports
  three-way disagreements. On-page attribution updated (results bar + footer) to
  credit TheSportsDB as the cross-check. worldcupjson.net stays rejected (no 2026
  data, no CORS).
- **Live in-match scores via ESPN:** added `src/services/espn.js` — a live
  overlay on top of OpenFootball. `fetchLive()` reads ESPN's public scoreboard
  (free, no key, CORS-open) and `applyLive()` overlays the running score + clock
  onto the OpenFootball-merged schedule, keyed by team pair (groups) or kickoff
  instant (knockouts, even before teams resolve). OpenFootball stays the source
  of record: once it has a score, ESPN defers. MatchCard now shows ESPN's real
  clock/HT in the LIVE badge instead of a time-based guess, and the results bar
  shows an "N live now" indicator. App fetches both sources in parallel via
  `Promise.allSettled` so ESPN is best-effort. On-page attribution updated in
  both the results bar and the footer disclaimer.
- **ESPN as cross-validator (not worldcupjson.net):** `reconcileScores()` flags
  matches where OpenFootball and ESPN disagree on a final score; wired into
  `npm run check:feed`. worldcupjson.net was evaluated for this backup/validator
  role and rejected — it returns 2022 data for 2026 queries and serves no CORS
  header, so a frontend-only app can neither consume nor validate against it.
- **Feed-freshness check:** evaluated switching the live-results source to
  worldcupjson.net — rejected, it has no 2026 data (queries return 2022) and
  relies on legacy JSONP, not CORS. Stayed on OpenFootball, whose 2026 data file
  is live and well-formed; the stale README was a red herring. To guard the real
  risk (scores lagging once games start), added `scripts/check-feed-freshness.mjs`
  (`npm run check:feed`): reuses `fetchResults`/`matchKey`/`MATCHES` to flag any
  match that finished ≥ `STALE_HOURS` ago but still has no score in the feed.
  Wired it to a new hourly `feed-freshness` GitHub Action so a lagging feed
  surfaces as a failed run (email) instead of stale scores on the site.

## 2026-06-09

- **Fix "Add to Google Calendar" link:** the Google button built a `cid` from an
  https URL (percent-encoded), which Google rejects with "check the URL". It now
  uses a raw `webcal://` cid (`…/calendar/render?cid=webcal://…`) per Google's
  subscribe-by-URL format, preserving the `?teams=` query for the my-teams feed.
  Extracted `webcalUrl`/`googleCalendarUrl` into `utils/ics.js` with tests.
- **Analysis folder:** added `analysis/worst-hours.mjs` (+ generated
  `worst-hours.csv` and a README) — a side analysis of which countries' fans get
  the worst local hours to watch their group-stage games. Reads the app's data
  modules directly; not part of the build.
- **README refresh:** documented the newer features (home-country hover times,
  follow teams, next-match bar, week view, match detail, calendar subscription,
  theme) and added a "Schedule accuracy" section describing the fixture-based
  validation; added `npm test` and a credits line.
- **Bracket, draw & timezone validation:** verified the knockout bracket wiring
  (all 32 group-position slots, third-place routing, and Winner/Loser-Match
  progression) against the Wikipedia bracket; the group draw against NBC Sports;
  and the team→home-timezone map (valid IANA zones, full coverage). All correct —
  no data changes. Froze the official bracket slots + group draw into the fixture
  and added tests for them plus timezone validity. Suite now 75 tests.
- **Venue audit + consistency tests:** verified all 104 host venues against
  authoritative sources (Wikipedia knockout cities; Yahoo + MLSsoccer by-stadium
  for the group stage) — all correct (a Yahoo article mislabeled Uruguay v Spain
  as Monterrey; it's Estadio Akron, as we had it). Froze the official venue per
  match into the test fixture. Added internal-consistency tests: each group is a
  complete round-robin, final-matchday games kick off simultaneously, no team
  plays twice within 48h, no venue double-books, and every "Winner/Loser Match N"
  reference resolves to an earlier match. Suite now 71 tests.
- **Full kickoff-time audit + regression test:** cross-checked all 104 kickoffs
  against authoritative sources (Wikipedia knockout table; wilx/Yahoo group
  schedules). The group stage (1–72) was already correct. Found and fixed **14
  more knockout games** (75, 79, 81, 82, 85, 87, 88, 90, 92, 93, 94, 96, 100,
  101) whose local wall-clock time had been stored as if it were Eastern Time,
  shifting them 1–3 hours early. Added `test/fixtures/official-kickoffs.js` (the
  official ET kickoff for every match) and tests that assert each match matches
  it to the minute, uses the `-04:00` offset, and lands at a plausible local
  hour — so this class of error can't recur silently. Suite now 65 tests.
- **Fix SoFi knockout kickoff times:** matches 73 (R32, Jun 28), 84 (R32,
  Jul 2) and 98 (QF, Jul 10) at SoFi Stadium were stored 2–3 hours early; all
  three are 12:00 PM PT / 3:00 PM ET per the official schedule (now
  `15:00-04:00`). The five SoFi group games were already correct.
- **CI action upgrades:** bumped GitHub Actions to their Node-24 majors
  (checkout v6, setup-node v6, configure-pages v6, upload-pages-artifact v5,
  deploy-pages v5) ahead of GitHub forcing Node 20 actions to Node 24 on
  2026-06-16.
- **Hover for home-country kickoff times:** hovering a team in any match-context
  view (schedule, week, bracket, next-match bar, detail modal) shows when the
  game kicks off in that team's home-country local time. Countries spanning
  multiple time zones (USA, Canada, Mexico, Brazil, Australia, NZ, Ecuador,
  Spain, Portugal, DR Congo) list each distinct local time; same-clock zones
  collapse. Backed by a new `teamTimezones` map and `teamKickoffTooltip` helper,
  with tests (suite now 61).
- **Footer credit + source link:** footer now credits Chester Ismay
  (chester.rbind.io) and links to the GitHub repo.
- **Now public + second host:** repository made public; the app is also deployed
  to GitHub Pages at https://ismayc.github.io/world-cup-viewer/ (alongside
  Netlify). Build uses a relative base so one artifact works at both a domain
  root and a sub-path; the Pages deploy runs from CI after tests pass.
- **Disclaimer added:** footer and README now state the project is unofficial and
  not affiliated with/endorsed by FIFA, and credit the public-domain data source.
- **Follow teams:** star any team to highlight it everywhere (schedule, week,
  bracket, standings) and filter to a one-click "⭐ My Teams" view. Saved in the
  browser (localStorage).
- **Next-match countdown + jump:** a hero bar counts down to the next kickoff
  (prioritizing your followed teams, or "Live now" when one is in play) with a
  "Jump to it" button that scrolls to that match.
- **Match detail + goal timeline:** click any match for a detail modal with full
  venue/time/broadcast info and a minute-by-minute goal timeline (penalties &
  own-goals flagged) once results are in.
- **Qualification scenarios:** standings now apply the official FIFA tie-breakers
  (points → goal difference → goals scored → head-to-head points/GD/GF among
  tied teams; alphabetical fallback where fair-play/lots data isn't available),
  mark who advances, and rank the **8 best third-placed teams**.
- **Calendar subscription:** subscribe via `webcal://` to an auto-updating feed
  (all matches or just your teams) served by a Netlify Function — it reflects
  resolved knockout teams and scores as they happen. Plus one-time `.ics`
  downloads (all / current filter / my teams) and a Google Calendar link.
- **Light/dark theme:** a theme toggle (defaults to your system preference) with
  no flash on load.
- **Collapsed filters by default:** the whole filter/search panel (search, stage
  chips, dropdowns) is now hidden behind a compact "⚙ Filters & Search" toggle so
  the schedule is front-and-center. The toggle shows an active-filter count with a
  "Clear all" shortcut, and the panel auto-opens when a shared URL already has
  filters applied.
- **Mobile-friendly:** responsive pass for phones/tablets — match cards stack,
  the filter panel stops sticking, the view switcher scrolls horizontally,
  search and selects go full-width (with 16px text to stop iOS zoom-on-focus),
  standings collapse to one column, and week/bracket grids scroll. Bigger tap
  targets throughout.
- **Tests + CI/CD:** added a Vitest suite (44 tests, since grown) covering data integrity,
  the search parser, results merge/parsing, week/time/ICS/standings utils, and a
  jsdom render smoke test for every view. Wired up GitHub Actions: every push/PR
  runs tests + build, and pushes to `main` deploy to Netlify only if tests pass.
- **Fix:** resolved a blank/black page caused by a missing `useState` import in
  the Filters component (a runtime crash the production build didn't catch — now
  guarded by the render smoke test).
- Initial release of the World Cup 2026 Schedule Viewer (React + Vite).
- **Schedule:** all 104 matches with kickoff auto-converted to the viewer's
  timezone (detected via `Intl`, switchable to 20+ zones); stadium-local time
  shown when it differs.
- **Venues:** 16 host stadiums across the USA, Canada, and Mexico, each with
  city, country, and FIFA region.
- **How to watch (US):** per-match English (FOX/FS1) and Spanish
  (Telemundo/Universo) TV + streaming options, with free over-the-air channels
  flagged.
- **Filtering:** search; stage chips; group, team, host country, region,
  city/stadium, timeframe (live/upcoming/finished), and broadcast-language
  filters; reset.
- **Scoped search:** the search box understands `field: value` syntax —
  `team: Mexico`, `city: Dallas`, `stadium: SoFi`, `country: Canada`,
  `group: C`, `stage: Final`, `region: Western` — and combines multiple tokens
  (`team: Brazil stage: group`). Plain text still does a broad match. One-click
  example chips make the syntax discoverable.
- **Collapsible search:** the search box is hidden behind a 🔍 Search toggle by
  default; opening reveals the input + example chips, closing clears the query.
  A query restored from the URL opens it automatically.
- **Add to calendar:** per-match `.ics` download (UTC times, venue, broadcast
  info) for Apple/Google/Outlook calendars.
- **Bracket view:** two-sided knockout bracket (R32 → Final) plus third-place
  match; fills in real teams as the knockout resolves.
- **Week view:** a Sunday–Saturday calendar laid out as 7 day-columns, with
  matches color-coded by group (and a color for knockout games), plus prev/next
  week navigation and a color legend. Respects active filters and spoiler mode.
- **Group standings:** all 12 group tables (P/W/D/L/GF/GA/GD/Pts) computed from
  results; top-two highlighted as qualifying.
- **Spoiler-free mode:** hide scores globally, per day, or reveal a single
  match; standings respect it too.
- **Shareable state:** active view, timezone, spoiler mode, and all filters
  persist to the URL.
- **Live results:** scores fetched from the OpenFootball public JSON feed (no
  API key), merged into the schedule immutably; knockout placeholders resolve to
  real teams. Manual refresh + optional 2-minute auto-refresh.
- **Deployment:** private GitHub repo `ismayc/world-cup-viewer`; hosted on
  Netlify at https://world-cup-viewer.netlify.app.
