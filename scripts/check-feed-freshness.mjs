// Feed-freshness check for the OpenFootball 2026 results feed.
//
// The app reads scores from OpenFootball, which commits results same-day /
// post-match rather than live (see src/services/results.js). The risk is not
// "is the README updated" but "once a match has finished, does the feed
// actually carry its score?". This script answers exactly that by reusing the
// app's own fetch + match-keying, so it can never drift from the schedule.
//
// The app shows a score if ANY of its three sources carries the final, so the
// gate buckets on the same union — it alarms only when the app would be blind,
// not merely when one source lags. For every scheduled match old enough that it
// must be over, we look for a final across OpenFootball / ESPN / TheSportsDB:
//   • scored   — at least one source has the final (the app can show it)
//   • pending  — finished < STALE_HOURS ago, no source yet (sources may catch up)
//   • STALE    — finished >= STALE_HOURS ago, NO source has it (the alarm)
//
// OpenFootball is still the source of record; when it lags behind a fallback the
// match is "scored" (not stale) but is also reported under an informational
// "OpenFootball lagging" note, so the source-of-record drift stays visible
// without failing CI after every match.
//
// Exit status: 0 if nothing is stale, 1 if any finished match is stale. That
// makes it usable as a cron/CI gate (.github/workflows/feed-freshness.yml) so
// you get an email the moment scores start lagging — not when you notice them.
//
// Run:   node scripts/check-feed-freshness.mjs
// Tune:  STALE_HOURS=6 node scripts/check-feed-freshness.mjs   (default 4)

import { MATCHES } from '../src/data/matches.js'
import { fetchResults, RESULTS_SOURCE, openFootballFinalScore } from '../src/services/results.js'
import { fetchLive, LIVE_SOURCE, espnFinalScore } from '../src/services/espn.js'
import { fetchBackup, BACKUP_SOURCE, sdbFinalScore } from '../src/services/thesportsdb.js'
import { reconcileScores } from '../src/services/reconcile.js'

// A match is assumed over this many hours after kickoff (90' + half + stoppage
// + a margin). Until then we don't expect a result and say nothing about it.
const MATCH_OVER_HOURS = 2.5
// Once a finished match has gone this long without a score, treat it as stale.
const STALE_HOURS = Number(process.env.STALE_HOURS || 4)

const now = Date.now()
const hoursSince = (iso) => (now - new Date(iso).getTime()) / 3_600_000
const fmt = (iso) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' ET'

// Best-effort: how long ago was the 2026 data file last committed on GitHub?
// Purely informational — never fails the check (rate limits, offline, etc.).
async function feedCommitAge() {
  const url =
    'https://api.github.com/repos/openfootball/worldcup.json/commits?path=2026/worldcup.json&per_page=1'
  const headers = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  try {
    const res = await fetch(url, { headers })
    if (!res.ok) return null
    const [last] = await res.json()
    const date = last?.commit?.committer?.date
    return date ? { date, hours: hoursSince(date) } : null
  } catch {
    return null
  }
}

async function main() {
  let ofMap
  try {
    ofMap = await fetchResults()
  } catch (err) {
    console.error(`✖ Could not fetch the source-of-record feed: ${err.message}`)
    console.error(`  ${RESULTS_SOURCE.url}`)
    process.exit(2)
  }

  // The app also overlays ESPN (live) and TheSportsDB (backup). Fetch both
  // best-effort: the gate must still run if either is unreachable, falling back
  // to whatever sources did respond.
  const [liveRes, backupRes] = await Promise.allSettled([fetchLive(), fetchBackup()])
  const liveMap = liveRes.status === 'fulfilled' ? liveRes.value : null
  const backupMap = backupRes.status === 'fulfilled' ? backupRes.value : null

  const scored = []
  const pending = []
  const stale = []
  const ofLagging = [] // a fallback has the final, but OpenFootball doesn't yet
  let upcoming = 0

  for (const m of MATCHES) {
    const age = hoursSince(m.ko)
    if (age < MATCH_OVER_HOURS) {
      upcoming++
      continue // not over yet — no result expected
    }
    const ofScore = openFootballFinalScore(m, ofMap)
    const hasScore =
      ofScore ||
      (liveMap && espnFinalScore(m, liveMap)) ||
      (backupMap && sdbFinalScore(m, backupMap))
    if (hasScore) {
      scored.push(m)
      if (!ofScore) ofLagging.push(m)
    } else if (age >= STALE_HOURS) {
      stale.push(m)
    } else {
      pending.push(m)
    }
  }

  const finished = scored.length + pending.length + stale.length
  const commit = await feedCommitAge()

  console.log(`\nFeed freshness — ${RESULTS_SOURCE.name} (2026)`)
  console.log(`  source:        ${RESULTS_SOURCE.url}`)
  console.log(
    `  last commit:   ${commit ? `${commit.hours.toFixed(1)}h ago (${fmt(commit.date)})` : 'unknown'}`,
  )
  console.log(`  stale after:   ${STALE_HOURS}h past kickoff with no score from any source\n`)

  if (finished === 0) {
    console.log(`No matches have finished yet — ${upcoming} still upcoming. Nothing to check. ✓\n`)
    return
  }

  console.log(`  ${scored.length} scored   ${pending.length} pending   ${stale.length} STALE   (of ${finished} finished, ${upcoming} upcoming)\n`)

  if (pending.length) {
    console.log(`Recently finished, awaiting score (< ${STALE_HOURS}h — likely fine):`)
    for (const m of pending) {
      console.log(`  · #${m.num} ${m.t1} v ${m.t2} — kicked off ${fmt(m.ko)} (${hoursSince(m.ko).toFixed(1)}h ago)`)
    }
    console.log()
  }

  // Source of record lagging behind a fallback: not stale (the app shows the
  // score), but worth surfacing so the OpenFootball drift stays visible.
  if (ofLagging.length) {
    console.log(`OpenFootball (source of record) lagging — final only via fallback (ESPN/TheSportsDB):`)
    for (const m of ofLagging) {
      console.log(`  · #${m.num} ${m.t1} v ${m.t2} — kicked off ${fmt(m.ko)} (${hoursSince(m.ko).toFixed(1)}h ago)`)
    }
    console.log()
  }

  // Cross-validate OpenFootball against ESPN + TheSportsDB (best-effort).
  // worldcupjson.net can't fill this role — no 2026 data, no CORS.
  reportDisagreements(ofMap, liveMap, backupMap)

  if (stale.length) {
    console.log(`⚠ STALE — finished >= ${STALE_HOURS}h ago, no source has a final score:`)
    for (const m of stale) {
      console.log(`  ✖ #${m.num} ${m.t1} v ${m.t2} — kicked off ${fmt(m.ko)} (${hoursSince(m.ko).toFixed(1)}h ago)`)
    }
    console.log(`\nNone of OpenFootball, ESPN, or TheSportsDB carry these results — the app would show no score.\n`)
    process.exit(1)
  }

  console.log(`All finished matches have a result from at least one source. ✓\n`)
}

// Where two or more sources report a final score, flag any disagreement.
// Maps are fetched once in main() and passed in (null when a source was
// unreachable).
function reportDisagreements(ofMap, liveMap, backupMap) {
  const sources = [{ name: RESULTS_SOURCE.name, score: (m) => openFootballFinalScore(m, ofMap) }]
  if (liveMap) {
    sources.push({ name: LIVE_SOURCE.name, score: (m) => espnFinalScore(m, liveMap) })
  } else {
    console.log(`Cross-check: couldn't reach ${LIVE_SOURCE.name}.`)
  }
  if (backupMap) {
    sources.push({ name: BACKUP_SOURCE.name, score: (m) => sdbFinalScore(m, backupMap) })
  } else {
    console.log(`Cross-check: couldn't reach ${BACKUP_SOURCE.name}.`)
  }
  if (sources.length < 2) {
    console.log(`Cross-check skipped — fewer than two sources reachable.\n`)
    return
  }
  const diffs = reconcileScores(MATCHES, sources)
  if (!diffs.length) return // silent when the sources agree (or nothing to compare)
  console.log(`⚠ Sources disagree on final scores (${sources.map((s) => s.name).join(', ')}):`)
  for (const d of diffs) {
    const parts = d.reports.map((r) => `${r.source} ${r.score.join('–')}`).join('  |  ')
    console.log(`  #${d.num} ${d.teams} — ${parts}`)
  }
  console.log()
}

main()
