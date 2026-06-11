// Independent backup / score-validator from TheSportsDB — free, CORS-open
// (Access-Control-Allow-Origin: *), no personal signup (uses the public test
// key). It carries the 2026 schedule and final scores, so it's a third opinion
// on game scores alongside OpenFootball (record) and ESPN (live).
//
// Free-tier limits: the livescore endpoint is paywalled, so this is FINAL scores
// only — there is no in-match data here. That's fine for its role: a backup
// source of finished results and a cross-check that flags when the sources
// disagree (see services/reconcile.js, scripts/check-feed-freshness.mjs).
//
// Endpoint: eventsseason for league 4429 ("FIFA World Cup"), season 2026.
// strTimestamp is UTC (e.g. "2026-06-11T19:00:00" == our 15:00 ET kickoff), so
// we append "Z" to get the right instant.

import { normalizeTeam, isRealTeam, pairKey } from './results.js'

export const BACKUP_SOURCE = {
  name: 'TheSportsDB',
  url: 'https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2026',
  homepage: 'https://www.thesportsdb.com/',
}

// TheSportsDB spellings that differ from ours. (normalizeTeam already maps the
// OpenFootball-style aliases like "Turkey" -> "Türkiye".)
const SDB_ALIASES = {
  'United States': 'USA',
  'Korea Republic': 'South Korea',
  'IR Iran': 'Iran',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cabo Verde': 'Cape Verde',
  'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
  'DR Congo': 'DR Congo',
  'Congo DR': 'DR Congo',
  Curacao: 'Curaçao',
}

// Statuses that mean the match is over (TheSportsDB uses a few spellings).
const FINISHED = new Set(['FT', 'AET', 'PEN', 'AP', 'Match Finished', 'After Pen.'])

const normSdb = (name) => normalizeTeam(SDB_ALIASES[name] || name)
const toNum = (v) => (v == null || v === '' ? null : Number(v))

function instantOf(ev) {
  const ts = ev.strTimestamp
    ? ev.strTimestamp + (/[zZ]|[+-]\d\d:?\d\d$/.test(ev.strTimestamp) ? '' : 'Z')
    : ev.dateEvent && ev.strTime
      ? `${ev.dateEvent}T${ev.strTime}Z`
      : null
  const t = ts ? new Date(ts).getTime() : NaN
  return Number.isNaN(t) ? null : t
}

// Build a lookup of FINAL-score records keyed by team pair and kickoff instant
// (same scheme as the ESPN adapter), so it slots into the same matching logic.
export async function fetchBackup(signal) {
  const res = await fetch(BACKUP_SOURCE.url, { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`Backup request failed (HTTP ${res.status})`)
  const data = await res.json()
  const map = new Map()
  for (const ev of data.events || []) {
    const home = normSdb(ev.strHomeTeam)
    const away = normSdb(ev.strAwayTeam)
    if (!home || !away) continue
    const h = toNum(ev.intHomeScore)
    const a = toNum(ev.intAwayScore)
    const final = FINISHED.has(ev.strStatus) && h != null && a != null
    const rec = {
      home,
      away,
      final,
      score: h != null && a != null ? [h, a] : null,
      instant: instantOf(ev),
    }
    map.set(pairKey(home, away), rec)
    if (rec.instant != null) map.set('inst:' + rec.instant, rec)
  }
  return map
}

// Final score for one of our matches, oriented by team name (home, away) so the
// reconciler can compare it against the other sources. Returns null unless this
// source reports the match as finished. Mirrors the getters in results.js / espn.js.
export function sdbFinalScore(match, backupMap) {
  if (!backupMap) return null
  const rec =
    isRealTeam(match.t1) && isRealTeam(match.t2)
      ? backupMap.get(pairKey(normalizeTeam(match.t1), normalizeTeam(match.t2)))
      : backupMap.get('inst:' + new Date(match.ko).getTime())
  if (!rec || !rec.final || !rec.score) return null
  return { home: rec.home, away: rec.away, ft: rec.score }
}
