// Source-agnostic score cross-check across our three independent feeds:
//   • OpenFootball (record)  • ESPN (live)  • TheSportsDB (backup)
//
// Each source exposes a getter `score(match) -> { home, away, ft: [hg, ag] }`
// (or null when that source has no FINAL score for the match) — see
// openFootballFinalScore / espnFinalScore / sdbFinalScore. This module only
// compares; it knows nothing about any source's wire format.
//
// A `source` here is `{ name, score }` where `score` is one of those getters
// already bound to its map. Where two or more sources report a final score for
// the same match, we check they agree (orienting by team name). Used both to
// annotate the UI (annotateScoreChecks) and to report mismatches in scripts
// (reconcileScores).

// Do two same-match reports agree? Orient b onto a by matching home team.
function reportsAgree(a, b) {
  if (a.home === b.home) return a.ft[0] === b.ft[0] && a.ft[1] === b.ft[1]
  if (a.home === b.away) return a.ft[0] === b.ft[1] && a.ft[1] === b.ft[0]
  return true // different teams entirely — not comparable, so no conflict
}

// Collect every source that has a final score for `match`, and whether they all
// agree. Returns null when fewer than two sources have a final (nothing to
// check). Otherwise { count, agree, reports: [{ source, ft, home, away }] }.
export function crossCheck(match, sources) {
  const reports = []
  for (const s of sources) {
    const r = s.score(match)
    if (r?.ft) reports.push({ source: s.name, ...r })
  }
  if (reports.length < 2) return null
  const agree = reports.slice(1).every((r) => reportsAgree(reports[0], r))
  return { count: reports.length, agree, reports }
}

// Return a new matches array with `m.scoreCheck = { count, agree }` set on every
// match that has a final score confirmed by >= 2 sources. Immutable: matches
// without a multi-source final are returned untouched.
export function annotateScoreChecks(matches, sources) {
  if (!sources || sources.length < 2) return matches
  return matches.map((m) => {
    const cc = crossCheck(m, sources)
    return cc ? { ...m, scoreCheck: { count: cc.count, agree: cc.agree } } : m
  })
}

// Disagreements only, for scripts / CI logging. Each entry lists every source's
// score for a match the sources don't agree on.
export function reconcileScores(matches, sources) {
  if (!sources || sources.length < 2) return []
  const out = []
  for (const m of matches) {
    const cc = crossCheck(m, sources)
    if (cc && !cc.agree) {
      out.push({
        num: m.num,
        teams: `${m.t1} v ${m.t2}`,
        reports: cc.reports.map((r) => ({ source: r.source, score: r.ft, home: r.home, away: r.away })),
      })
    }
  }
  return out
}
