# World Cup 2026 Schedule Viewer

A React + Vite web app showing all 104 matches of the 2026 FIFA World Cup
(USA · Canada · Mexico) in **your** timezone, with where to watch, host
city/stadium, a bracket, group standings, and live results.

🔗 **Live:** https://world-cup-viewer.netlify.app · https://ismayc.github.io/world-cup-viewer/

## Features

- **Your timezone** — kickoff times auto-convert to your detected timezone
  (switchable to 20+), with stadium-local time shown when it differs.
- **How to watch (US)** — English (FOX/FS1) & Spanish (Telemundo/Universo) TV
  and streaming per match; free over-the-air channels flagged.
- **Venues** — all 16 host stadiums with city, country, and region.
- **Filtering** — search, stage, group, team, host country, region,
  city/stadium, timeframe, and broadcast language.
- **Add to calendar** — per-match `.ics` download.
- **Bracket** — two-sided knockout bracket that fills in as teams resolve.
- **Group standings** — all 12 tables, computed from results.
- **Spoiler-free mode** — hide scores globally, per day, or per match.
- **Shareable URLs** — view, timezone, spoiler mode, and filters persist to the
  query string.
- **Live results** — scores from the [OpenFootball](https://github.com/openfootball/worldcup.json)
  public JSON feed (no API key), merged in and auto-refreshed.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## Data sources

- **Schedule, groups, venues** — FIFA Final Draw (Dec 5, 2025) and official
  match schedule.
- **Broadcast** — FOX Sports / NBCUniversal (Telemundo) US rights.
- **Live results** — OpenFootball `worldcup.json` (public domain).

See [`NEWS.md`](./NEWS.md) for the changelog.

## Disclaimer

An unofficial, non-commercial fan project. **Not affiliated with, endorsed by, or
sponsored by FIFA.** “World Cup”, and team, broadcaster, and tournament names are
trademarks of their respective owners. Schedule and results data come from the
public-domain [OpenFootball](https://github.com/openfootball/worldcup.json) project.
