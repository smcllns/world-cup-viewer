# World Cup Tracker 2026

[![CI](https://github.com/smcllns/world-cup-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/smcllns/world-cup-tracker/actions/workflows/ci.yml)
[![Live](https://img.shields.io/badge/live-worldcuptracker.win-00c2a8)](https://worldcuptracker.win)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A fast, single-page tracker for all 104 matches of the 2026 FIFA World Cup
(USA · Canada · Mexico) — in **your** timezone, with a live knockout bracket and
the full schedule on one scrollable page.

### 🔗 [worldcuptracker.win](https://worldcuptracker.win)

## What it does

- **Knockout bracket** — a full-width bracket that fills in as groups resolve and
  knockout results come in, with connector lines from Round of 32 to the Final.
- **One scrolling schedule** — every match, grouped by day, with a one-tap toggle
  between **Upcoming** and **Played** (scores).
- **Your timezone** — kickoff times auto-convert to your detected timezone
  (switchable), so you always know when a match actually starts for you.
- **Live scores** — results update automatically while you watch, with live
  in-match status on the games that are underway.
- **Group standings** — all 12 tables with the official 2026 tie-breakers and
  who's through, tucked behind a toggle.
- **Match details** — tap any match for venue, kickoff, how-to-watch (US), the
  event timeline, and a one-click calendar (`.ics`) export.
- **Spoiler-free & themes** — hide all scores with one switch; light/dark follows
  your system.

No accounts, no backend — it's a static site that talks to public score feeds
directly from your browser.

## Develop

Requires [Bun](https://bun.sh).

```bash
bun install
bun run dev      # local dev server
bun run test     # run the test suite
bun run build    # production build to dist/
```

Built with React + Vite. Score data comes from
[OpenFootball](https://github.com/openfootball) (source of record),
[ESPN](https://www.espn.com/soccer/) (live overlay), and cross-checked against
[TheSportsDB](https://www.thesportsdb.com/).

## Credit

Forked with gratitude from [**Chester Ismay**](https://chester.rbind.io)'s
excellent [ismayc/world-cup-viewer](https://github.com/ismayc/world-cup-viewer) —
thank you for the foundation. This fork reshapes it into a bracket-first
single-page experience.

## Disclaimer

An unofficial, fan-made project. Not affiliated with, endorsed by, or sponsored by
FIFA. "World Cup", team, broadcaster, and tournament names are trademarks of their
respective owners.

Licensed [MIT](./LICENSE).
