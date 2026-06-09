// Side analysis (NOT wired into the app): for every group-stage (round-robin)
// match, how painful is the local kickoff hour for fans back in each playing
// country's home timezone(s)?
//
// Long format: one row per (playing country × group match × home timezone).
// Each row carries the real kickoff in the *stadium's* timezone plus the same
// instant in the fan's home timezone, an hour-of-day "pain" score, and a band.
//
// Run:  node analysis/worst-hours.mjs        (prints summary, writes CSV)

import { MATCHES } from '../src/data/matches.js'
import { VENUES } from '../src/data/venues.js'
import { TEAM_TIMEZONES } from '../src/data/teamTimezones.js'
import { writeFileSync } from 'node:fs'

// ---- formatting helpers -------------------------------------------------
const fmtTime = (iso, tz) =>
  new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
const fmtDate = (iso, tz) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
const fmtDow = (iso, tz) =>
  new Date(iso).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' })
const abbrev = (iso, tz) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(new Date(iso))
    .find((x) => x.type === 'timeZoneName')
  return p ? p.value : ''
}
// Hour-of-day 0–23 at a given instant in a given timezone.
const hourIn = (iso, tz) =>
  parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(
      new Date(iso),
    ),
    10,
  ) % 24

// ---- "worst hours" model ------------------------------------------------
// Pain is driven purely by the local clock hour the broadcast STARTS. Prime
// evening = 0; the dead of night (2–4am) = 10. Matches run ~2h15m, so an
// overnight start also means an overnight finish — start hour is the binding
// constraint and keeps the metric transparent.
const PAIN = {
  0: 6, 1: 8, 2: 10, 3: 10, 4: 10, 5: 9, 6: 7, 7: 5, 8: 4,
  9: 3, 10: 3, 11: 2, 12: 2, 13: 2, 14: 2, 15: 1, 16: 1,
  17: 0, 18: 0, 19: 0, 20: 0, 21: 1, 22: 2, 23: 4,
}
const bandOf = (h) => {
  if (h >= 0 && h < 6) return 'Overnight'      // 12am–5:59am  (worst)
  if (h >= 6 && h < 9) return 'Early morning'  // 6am–8:59am
  if (h >= 9 && h < 17) return 'Daytime'       // 9am–4:59pm
  if (h >= 17 && h < 22) return 'Prime'        // 5pm–9:59pm  (best)
  return 'Late night'                          // 10pm–11:59pm
}

// ---- build the long data frame -----------------------------------------
const rows = []
for (const m of MATCHES.filter((m) => m.stage === 'Group')) {
  const v = VENUES[m.venue]
  const stadiumKickoff = fmtTime(m.ko, v.tz)
  const stadiumAbbr = abbrev(m.ko, v.tz)
  for (const [country, opponent] of [
    [m.t1, m.t2],
    [m.t2, m.t1],
  ]) {
    const zones = TEAM_TIMEZONES[country] || []
    for (const tz of zones) {
      const h = hourIn(m.ko, tz)
      rows.push({
        match: m.num,
        group: m.group,
        matchup: `${m.t1} v ${m.t2}`,
        fan_country: country,
        opponent,
        fan_tz: tz,
        fan_tz_abbr: abbrev(m.ko, tz),
        local_date: fmtDate(m.ko, tz),
        local_dow: fmtDow(m.ko, tz),
        local_kickoff: fmtTime(m.ko, tz),
        local_hour: h,
        band: bandOf(h),
        pain: PAIN[h],
        stadium_city: v.city,
        stadium_country: v.country,
        stadium_kickoff: stadiumKickoff,
        stadium_tz_abbr: stadiumAbbr,
      })
    }
  }
}

// ---- write the full long frame as CSV ----------------------------------
const COLS = [
  'match', 'group', 'matchup', 'fan_country', 'opponent', 'fan_tz', 'fan_tz_abbr',
  'local_date', 'local_dow', 'local_kickoff', 'local_hour', 'band', 'pain',
  'stadium_city', 'stadium_country', 'stadium_kickoff', 'stadium_tz_abbr',
]
const csvCell = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s))
const csv = [COLS.join(',')]
  .concat(rows.map((r) => COLS.map((c) => csvCell(r[c])).join(',')))
  .join('\n')
writeFileSync(new URL('./worst-hours.csv', import.meta.url), csv + '\n')

// ---- aggregate: which fan groups have the worst hours? -----------------
// Each (country, tz) fan group watches exactly 3 group games.
const groups = new Map()
for (const r of rows) {
  const key = `${r.fan_country}||${r.fan_tz}`
  if (!groups.has(key)) {
    groups.set(key, { country: r.fan_country, tz: r.fan_tz, abbr: r.fan_tz_abbr, games: [] })
  }
  groups.get(key).games.push(r)
}
const summary = [...groups.values()]
  .map((g) => {
    const pains = g.games.map((x) => x.pain)
    return {
      country: g.country,
      tz: g.tz.replace(/^.*\//, '').replace(/_/g, ' '),
      avgPain: pains.reduce((a, b) => a + b, 0) / pains.length,
      maxPain: Math.max(...pains),
      overnight: g.games.filter((x) => x.band === 'Overnight').length,
      kickoffs: g.games
        .sort((a, b) => a.match - b.match)
        .map((x) => `${x.local_kickoff} ${x.fan_tz_abbr} (${x.band})`),
    }
  })
  .sort((a, b) => b.avgPain - a.avgPain || b.maxPain - a.maxPain)

// ---- print report -------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n)
console.log(`\nGroup-stage games: ${MATCHES.filter((m) => m.stage === 'Group').length}`)
console.log(`Long-frame rows (country × game × timezone): ${rows.length}`)
console.log(`Distinct fan groups (country × timezone): ${groups.size}`)

console.log(`\n=== Band distribution across all rows ===`)
const bandCounts = {}
for (const r of rows) bandCounts[r.band] = (bandCounts[r.band] || 0) + 1
for (const b of ['Overnight', 'Early morning', 'Daytime', 'Prime', 'Late night']) {
  const n = bandCounts[b] || 0
  console.log(`  ${pad(b, 14)} ${pad(n, 4)} ${'█'.repeat(Math.round((n / rows.length) * 50))}`)
}

console.log(`\n=== WORST-OFF FAN GROUPS (avg pain over their 3 group games) ===`)
console.log(`  ${pad('Country', 16)} ${pad('Home zone', 16)} ${pad('avg', 5)} ${pad('o/n', 4)} kickoffs (local)`)
for (const s of summary.slice(0, 18)) {
  console.log(
    `  ${pad(s.country, 16)} ${pad(s.tz, 16)} ${pad(s.avgPain.toFixed(1), 5)} ${pad(s.overnight, 4)} ${s.kickoffs.join('  ·  ')}`,
  )
}

console.log(`\n=== BEST-OFF FAN GROUPS (for contrast) ===`)
for (const s of summary.slice(-6).reverse()) {
  console.log(
    `  ${pad(s.country, 16)} ${pad(s.tz, 16)} ${pad(s.avgPain.toFixed(1), 5)} ${pad(s.overnight, 4)} ${s.kickoffs.join('  ·  ')}`,
  )
}

console.log(`\n=== Sample of the long data frame (first 12 rows) ===`)
console.log(
  `  ${pad('M', 3)} ${pad('fan_country', 14)} ${pad('fan_tz_abbr', 11)} ${pad('local', 9)} ${pad('hr', 3)} ${pad('band', 14)} pain  | stadium`,
)
for (const r of rows.slice(0, 12)) {
  console.log(
    `  ${pad(r.match, 3)} ${pad(r.fan_country, 14)} ${pad(r.fan_tz_abbr, 11)} ${pad(r.local_kickoff, 9)} ${pad(r.local_hour, 3)} ${pad(r.band, 14)} ${pad(r.pain, 4)} | ${r.stadium_kickoff} ${r.stadium_tz_abbr} ${r.stadium_city}`,
  )
}

console.log(`\nFull long frame written to analysis/worst-hours.csv (${rows.length} rows).\n`)
