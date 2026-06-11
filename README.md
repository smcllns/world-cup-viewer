# World Cup 2026 Schedule Viewer

A React + Vite web app showing all 104 matches of the 2026 FIFA World Cup
(USA · Canada · Mexico) in **your** timezone, with where to watch, host
city/stadium, a bracket, group standings, and live results.

🔗 **Live:** https://world-cup-viewer.netlify.app · https://ismayc.github.io/world-cup-viewer/

## Features

- **Your timezone** — kickoff times auto-convert to your detected timezone
  (switchable to 20+), with stadium-local time shown when it differs.
- **Hover for home-country time** — hover a team in any view to see when the
  match kicks off back home; countries spanning multiple time zones (USA, Brazil,
  Australia, …) list each distinct local time.
- **Follow teams** — star any team to highlight it everywhere and filter to a
  one-click "⭐ My Teams" view (saved in your browser).
- **Next-match bar** — a live countdown to the next kickoff (prioritising your
  followed teams, or "Live now"), with a jump-to-match button.
- **Four views** — chronological schedule, a Sunday–Saturday week calendar,
  group standings, and the knockout bracket.
- **Match detail** — click any match for full venue/time/broadcast info and a
  minute-by-minute goal timeline once results are in.
- **How to watch (US)** — English (FOX/FS1) & Spanish (Telemundo/Universo) TV
  and streaming per match; free over-the-air channels flagged.
- **Venues** — all 16 host stadiums with city, country, and region.
- **Filtering** — search, stage, group, team, host country, region,
  city/stadium, timeframe, and broadcast language.
- **Group standings & qualification** — all 12 tables with official tie-breakers,
  who advances, and the 8 best third-placed teams.
- **Bracket** — two-sided knockout bracket that fills in as teams resolve.
- **Add to calendar** — per-match `.ics` download, plus a `webcal://`
  subscription feed (all matches or just your teams) that auto-updates.
- **Spoiler-free mode** — hide scores globally, per day, or per match.
- **Light/dark theme** — follows your system preference, with no flash on load.
- **Shareable URLs** — view, timezone, spoiler mode, and filters persist to the
  query string.
- **Live results** — final scores from the [OpenFootball](https://github.com/openfootball/worldcup.json)
  public JSON feed (no API key), merged in and auto-refreshed, with a live
  in-match score + clock overlaid from [ESPN](https://www.espn.com/soccer/)
  while games are underway, and final scores cross-checked against a third
  source ([TheSportsDB](https://www.thesportsdb.com/)) — each card shows how many
  independent sources confirm the result.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview  # preview the production build
npm test         # run the Vitest suite
```

Every push runs the tests + build in GitHub Actions; pushes to `main` deploy to
Netlify and GitHub Pages only if they pass.

## Schedule accuracy

The schedule data is validated against external sources and frozen into
[`test/fixtures/official-kickoffs.js`](./test/fixtures/official-kickoffs.js).
The test suite (75 tests) asserts every match's kickoff (to the minute, in
Eastern Time), venue, knockout-bracket slot, and group-draw assignment matches
the official schedule, plus structural invariants (complete round-robins,
simultaneous final-matchday kickoffs, no team double-booked, valid bracket
references). Sources: the [Wikipedia knockout-stage table](https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage)
(kickoffs + bracket), Yahoo Sports & MLSsoccer (group times/venues), and NBC
Sports (group draw).

## Data sources

- **Schedule, groups, venues** — FIFA Final Draw (Dec 5, 2025) and official
  match schedule (see *Schedule accuracy* above).
- **Broadcast** — FOX Sports / NBCUniversal (Telemundo) US rights.
- **Results (source of record)** — OpenFootball `worldcup.json` (public domain),
  post-match final scores and goal timelines.
- **Live in-match scores** — ESPN's public scoreboard API (free, no API key,
  CORS-open). Used only while a match is underway, or just finished and
  OpenFootball hasn't posted yet; OpenFootball always wins once it has the score.
- **Backup & score cross-check** — [TheSportsDB](https://www.thesportsdb.com/)
  (free, CORS-open, public test key). An independent third source of final
  scores. Final scores are reconciled across all three feeds: each card shows
  "✓ confirmed by N sources", or "⚠ sources disagree" when they don't, and
  `npm run check:feed` reports any mismatch. (worldcupjson.net was evaluated for
  this role and rejected — no 2026 data and no CORS, so a browser-only app can
  neither read nor validate against it.)

See [`NEWS.md`](./NEWS.md) for the changelog.

## Credits

Created by [Chester Ismay](https://chester.rbind.io). Source on
[GitHub](https://github.com/ismayc/world-cup-viewer).

## Disclaimer

An unofficial, non-commercial fan project. **Not affiliated with, endorsed by, or
sponsored by FIFA.** “World Cup”, and team, broadcaster, and tournament names are
trademarks of their respective owners. Schedule and results data come from the
public-domain [OpenFootball](https://github.com/openfootball/worldcup.json) project;
live in-match scores come from [ESPN](https://www.espn.com/soccer/); final scores
are cross-checked against [TheSportsDB](https://www.thesportsdb.com/).
