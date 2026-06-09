# Analysis — "worst hours" for local fans

Side analyses that aren't part of the app. They read the app's own data modules
(`src/data/*`) directly, so they stay in sync with the schedule.

## worst-hours

**Question:** for the group-stage (round-robin) games, which countries' fans get
the *worst hours* to watch their team — i.e. kickoffs in the dead of night back
home?

```bash
node analysis/worst-hours.mjs   # prints a summary + writes worst-hours.csv
```

### Output — `worst-hours.csv` (long format)

One row per **(playing country × group match × home timezone)** — 213 rows.
Countries that span several time zones (USA, Canada, Brazil, Australia, …) get
one row per zone, so the data is "long". Each row carries both the kickoff in the
**stadium's** timezone and in the **fan's** home timezone:

| column | meaning |
|---|---|
| `match`, `group`, `matchup` | which game |
| `fan_country`, `opponent` | the country whose fans this row is about |
| `fan_tz`, `fan_tz_abbr` | the home IANA zone + its abbreviation |
| `local_date`, `local_dow`, `local_kickoff`, `local_hour` | kickoff in the fan's zone |
| `band`, `pain` | unsociability bucket + score (see below) |
| `stadium_city`, `stadium_country`, `stadium_kickoff`, `stadium_tz_abbr` | kickoff at the venue |

### Pain model

`pain` is a 0–10 score driven purely by the **local clock hour the broadcast
starts** (matches run ~2h15m, so an overnight start = overnight finish):

| band | local start | pain |
|---|---|---|
| Prime | 5–10 pm | 0–1 |
| Late night | 10 pm–12 am | 2–4 |
| Daytime | 9 am–5 pm | 1–3 |
| Early morning | 6–9 am | 4–7 |
| **Overnight** | **12–6 am** | **6–10** (2–4 am = 10) |

### Key findings

- **The "worst hours" belt is Europe / Africa / the Middle East, not Asia.**
  North-American afternoon/evening kickoffs land at **1–5 am** across UTC+1…+3:30.
  Far-east fans (Japan, Korea, Australia) actually do *better* — those games fall
  in their next-morning daytime, which is early but watchable.
- **Worst-off fan group: Algeria** (Algiers) — all three group games at 2 am,
  3 am and 4 am (avg pain 10.0). Then Tunisia (8.3), Jordan, Czechia, Egypt,
  Iran, Türkiye.
- **Best-off:** host nations and South American sides — Brazil, Uruguay, Ecuador,
  Panama, Haiti all sit near zero, every game in evening prime time.
- Across all 213 (fan-group × game) rows: 86 Prime, 49 Daytime, **41 Overnight**,
  28 Late night, 9 Early morning.

### Caveats

- **Group stage only** (the round-robin), as asked — knockout games aren't included.
- Pain is hour-of-day only; it does **not** weight weekend vs weekday. The
  `local_dow` column is in the CSV if you want to discount, say, a 3 am Saturday
  vs a 3 am Tuesday.
- Multi-zone countries list each home zone as its own row (no collapsing), so a
  country like the USA contributes up to 6 rows per game.
