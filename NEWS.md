# NEWS

A dated changelog for the World Cup 2026 Schedule Viewer. Each heading is a
calendar day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-06-09

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
