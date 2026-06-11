// Feed-freshness check for the OpenFootball 2026 results feed.
//
// The app reads scores from OpenFootball, which commits results same-day /
// post-match rather than live (see src/services/results.js). The risk is not
// "is the README updated" but "once a match has finished, does the feed
// actually carry its score?". This script answers exactly that by reusing the
// app's own fetch + match-keying, so it can never drift from the schedule.
//
// For every scheduled match whose kickoff is far enough in the past that it
// must be over, we look for a final score in the live feed and bucket it:
//   • scored   — result present (healthy)
//   • pending  — finished < STALE_HOURS ago, no score yet (feed may catch up)
//   • STALE    — finished >= STALE_HOURS ago, still no score (the alarm)
//
// Exit status: 0 if nothing is stale, 1 if any finished match is stale. That
// makes it usable as a cron/CI gate (.github/workflows/feed-freshness.yml) so
// you get an email the moment scores start lagging — not when you notice them.
//
// Run:   node scripts/check-feed-freshness.mjs
// Tune:  STALE_HOURS=6 node scripts/check-feed-freshness.mjs   (default 4)

import { MATCHES } from '../src/data/matches.js'
import { fetchResults, matchKey, RESULTS_SOURCE, openFootballFinalScore } from '../src/services/results.js'
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
  let map
  try {
    map = await fetchResults()
  } catch (err) {
    console.error(`✖ Could not fetch the live feed: ${err.message}`)
    console.error(`  ${RESULTS_SOURCE.url}`)
    process.exit(2)
  }

  const scored = []
  const pending = []
  const stale = []
  let upcoming = 0

  for (const m of MATCHES) {
    const age = hoursSince(m.ko)
    if (age < MATCH_OVER_HOURS) {
      upcoming++
      continue // not over yet — no result expected
    }
    const hasScore = Boolean(map.get(matchKey(m))?.score)
    if (hasScore) scored.push(m)
    else if (age >= STALE_HOURS) stale.push(m)
    else pending.push(m)
  }

  const finished = scored.length + pending.length + stale.length
  const commit = await feedCommitAge()

  console.log(`\nFeed freshness — ${RESULTS_SOURCE.name} (2026)`)
  console.log(`  source:        ${RESULTS_SOURCE.url}`)
  console.log(
    `  last commit:   ${commit ? `${commit.hours.toFixed(1)}h ago (${fmt(commit.date)})` : 'unknown'}`,
  )
  console.log(`  stale after:   ${STALE_HOURS}h past kickoff with no score\n`)

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

  // Cross-validate OpenFootball against ESPN + TheSportsDB (best-effort).
  // worldcupjson.net can't fill this role — no 2026 data, no CORS.
  await reportDisagreements(map)

  if (stale.length) {
    console.log(`⚠ STALE — finished >= ${STALE_HOURS}h ago, still no score in the feed:`)
    for (const m of stale) {
      console.log(`  ✖ #${m.num} ${m.t1} v ${m.t2} — kicked off ${fmt(m.ko)} (${hoursSince(m.ko).toFixed(1)}h ago)`)
    }
    console.log(`\nThe OpenFootball 2026 feed is lagging. Check its commits, or consider a fallback source.\n`)
    process.exit(1)
  }

  console.log(`All finished matches have results. Feed is healthy. ✓\n`)
}

// Where two or more sources report a final score, flag any disagreement.
async function reportDisagreements(ofMap) {
  const sources = [{ name: RESULTS_SOURCE.name, score: (m) => openFootballFinalScore(m, ofMap) }]
  const [live, backup] = await Promise.allSettled([fetchLive(), fetchBackup()])
  if (live.status === 'fulfilled') {
    sources.push({ name: LIVE_SOURCE.name, score: (m) => espnFinalScore(m, live.value) })
  } else {
    console.log(`Cross-check: couldn't reach ${LIVE_SOURCE.name}.`)
  }
  if (backup.status === 'fulfilled') {
    sources.push({ name: BACKUP_SOURCE.name, score: (m) => sdbFinalScore(m, backup.value) })
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
