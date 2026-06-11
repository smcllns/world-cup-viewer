// Live(-in-match) layer from ESPN's public scoreboard — free, no API key, and
// CORS-open (Access-Control-Allow-Origin: *), so it works straight from the
// browser like OpenFootball. ESPN gives the *running* score plus a real match
// status and clock ("67'", "HT"), which OpenFootball can't: OpenFootball commits
// results post-match, not minute-by-minute.
//
// Roles (see App.jsx merge order):
//   • OpenFootball (src/services/results.js) = SOURCE OF RECORD. Public-domain,
//     stable, canonical final scores/goals; also resolves knockout team names.
//   • ESPN (here) = LIVE OVERLAY. Fills the gap only while a match is underway,
//     or just finished and OpenFootball hasn't posted yet. The moment
//     OpenFootball has a score, that wins (applyLive defers to it).
//
// We deliberately do NOT use worldcupjson.net as a backup/validator: it has no
// 2026 data (queries return 2022) and serves no CORS header, so a frontend-only
// app can't call it. Scores are cross-checked against OpenFootball and
// TheSportsDB instead — see services/reconcile.js, which flags disagreements via
// each source's *FinalScore getter (espnFinalScore is exported below).

import { normalizeTeam, isRealTeam, pairKey } from './results.js'

export const LIVE_SOURCE = {
  name: 'ESPN',
  url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard',
  homepage: 'https://www.espn.com/soccer/',
}

// ESPN spellings that differ from ours. (normalizeTeam already handles the
// OpenFootball-style aliases like "Turkey" -> "Türkiye" and
// "Czech Republic" -> "Czechia", so we only add ESPN's own divergences and let
// normalizeTeam finish the job.)
const ESPN_ALIASES = {
  'United States': 'USA',
  'Korea Republic': 'South Korea',
  'IR Iran': 'Iran',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cabo Verde': 'Cape Verde',
  'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
  'Bosnia-Herzegovina': 'Bosnia & Herzegovina',
  'Congo DR': 'DR Congo',
  Curacao: 'Curaçao',
}

const normEspn = (name) => normalizeTeam(ESPN_ALIASES[name] || name)
const toNum = (v) => (v == null || v === '' ? null : Number(v))

// Parse ESPN's competitor.score / shootout into our shapes.
function parseEspnScore(home, away, state) {
  if (state === 'pre') return null
  const h = toNum(home.score)
  const a = toNum(away.score)
  if (h == null || a == null) return null
  return [h, a]
}

// Build a lookup of live records from ESPN's scoreboard. Every record is stored
// twice: by team pair (unique per tournament for played matches; survives
// simultaneous group kickoffs) and by kickoff instant (lets us match knockout
// games whose teams our static schedule still shows as placeholders).
export async function fetchLive(signal) {
  const res = await fetch(LIVE_SOURCE.url, { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`Live request failed (HTTP ${res.status})`)
  const data = await res.json()
  const map = new Map()
  for (const ev of data.events || []) {
    const comp = ev.competitions?.[0]
    if (!comp || !Array.isArray(comp.competitors)) continue
    const home = comp.competitors.find((c) => c.homeAway === 'home')
    const away = comp.competitors.find((c) => c.homeAway === 'away')
    if (!home?.team || !away?.team) continue

    const st = ev.status || comp.status || {}
    const state = st.type?.state || 'pre' // 'pre' | 'in' | 'post'
    const rec = {
      home: normEspn(home.team.displayName),
      away: normEspn(away.team.displayName),
      state,
      clock: st.displayClock || '',
      detail: st.type?.shortDetail || st.type?.description || '',
      score: parseEspnScore(home, away, state),
      instant: ev.date ? new Date(ev.date).getTime() : null,
    }
    // Penalty shootout, if ESPN exposes it (knockouts).
    const hp = toNum(home.shootoutScore)
    const ap = toNum(away.shootoutScore)
    if (hp != null && ap != null) rec.pens = [hp, ap]

    map.set(pairKey(rec.home, rec.away), rec)
    if (rec.instant != null) map.set('inst:' + rec.instant, rec)
  }
  return map
}

// Look up the ESPN record for one of our (possibly OpenFootball-merged) matches:
// by team pair when both teams are real, else by kickoff instant.
function liveRecordFor(match, liveMap) {
  if (isRealTeam(match.t1) && isRealTeam(match.t2)) {
    return liveMap.get(pairKey(normalizeTeam(match.t1), normalizeTeam(match.t2))) || null
  }
  const inst = new Date(match.ko).getTime()
  return liveMap.get('inst:' + inst) || null
}

// Overlay ESPN live / just-finished data onto an already-OpenFootball-merged
// matches array. OpenFootball stays the source of record: if a match already has
// a score (from OpenFootball), it is left untouched. The static input is never
// mutated.
export function applyLive(matches, liveMap) {
  if (!liveMap || liveMap.size === 0) return matches
  return matches.map((m) => {
    const rec = liveRecordFor(m, liveMap)
    if (!rec) return m

    // OpenFootball already recorded this match -> it wins. (But still let ESPN
    // resolve placeholder team names if OpenFootball somehow hasn't.)
    if (Array.isArray(m.score)) return m

    const bothReal = isRealTeam(m.t1) && isRealTeam(m.t2)

    // Nothing to show yet (pre-match or no numeric score): only resolve knockout
    // team names if ESPN knows them and we still hold placeholders.
    if (rec.state === 'pre' || !rec.score) {
      if (!bothReal && isRealTeam(rec.home) && isRealTeam(rec.away)) {
        return { ...m, t1: rec.home, t2: rec.away }
      }
      return m
    }

    const out = { ...m }
    if (bothReal) {
      // Orient ESPN's (home, away) score to our (t1, t2) ordering.
      const aligned = normalizeTeam(m.t1) === rec.home
      out.score = aligned ? [...rec.score] : [rec.score[1], rec.score[0]]
    } else {
      // Knockout placeholder: adopt ESPN's teams + their (home, away) order.
      if (isRealTeam(rec.home)) out.t1 = rec.home
      if (isRealTeam(rec.away)) out.t2 = rec.away
      out.score = [...rec.score]
    }
    if (rec.pens) out.pens = [...rec.pens]
    if (rec.state === 'in') out.live = { clock: rec.clock, detail: rec.detail }
    out.liveSource = true
    return out
  })
}

// Final score for one of our matches, oriented by team name, for the score
// reconciler (services/reconcile.js). ESPN only counts once the match is over
// ('post'). Mirrors the getters in results.js / thesportsdb.js.
export function espnFinalScore(match, liveMap) {
  const rec = liveRecordFor(match, liveMap)
  if (!rec || rec.state !== 'post' || !rec.score) return null
  return { home: rec.home, away: rec.away, ft: rec.score }
}
