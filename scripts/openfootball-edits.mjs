// OpenFootball edit helper — turns our app's score reconciliation into
// paste-ready cup.txt edits, so missing/late final scores can be filled in
// upstream by hand. This is the concrete follow-through on the maintainer's
// edit-in-place invite (openfootball/worldcup.json#23): the app already knows,
// from ESPN + TheSportsDB, which finished matches OpenFootball hasn't scored
// yet — this prints them in cup.txt syntax so you can paste them straight in.
//
// The app reads scores from OpenFootball (source of record) and overlays ESPN
// (live) + TheSportsDB (backup). When a match has finished and a fallback
// carries the final but OpenFootball doesn't, the app shows the score — but
// upstream cup.txt is still blank. This script lists exactly those, with a
// paste-ready "Home  FT  Away" line, ranked by how many sources confirm it:
//   ✓✓ both fallbacks agree   ⚠ only one fallback   ✗ fallbacks disagree
// It also flags matches where OpenFootball already has a score the fallbacks
// contradict (possible corrections).
//
// cup.txt records the half-time score in parens — e.g. `Mexico 2-0 (1-0) ...` —
// but the fallbacks only expose the full-time score, so we emit full-time only
// (a valid cup.txt line); add the half-time by hand if you have it.
//
// This NEVER writes anything. Edits are made by hand in the browser:
//   https://github.com/openfootball/worldcup/blob/master/2026--usa/cup.txt
//
// Run:  node scripts/openfootball-edits.mjs   (alias: npm run of:edits)

import { MATCHES, STAGE_LABELS } from '../src/data/matches.js'
import { VENUES } from '../src/data/venues.js'
import { fetchResults, RESULTS_SOURCE, openFootballFinalScore } from '../src/services/results.js'
import { fetchLive, LIVE_SOURCE, espnFinalScore } from '../src/services/espn.js'
import { fetchBackup, BACKUP_SOURCE, sdbFinalScore } from '../src/services/thesportsdb.js'

const EDIT_URL = 'https://github.com/openfootball/worldcup/blob/master/2026--usa/cup.txt'

// A match is assumed over this many hours after kickoff — matches the
// freshness gate (scripts/check-feed-freshness.mjs). Until then we say nothing.
const MATCH_OVER_HOURS = 2.5

const now = Date.now()
const hoursSince = (iso) => (now - new Date(iso).getTime()) / 3_600_000
const dateHint = (iso) =>
  new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: 'numeric',
  })

// Orient a source report (home/away by team name + ft = [homeGoals, awayGoals])
// onto our match's t1 v t2 order, so the printed line matches cup.txt's first/
// second team. Returns [t1goals, t2goals] or null if the names don't line up.
function orient(rep, m) {
  if (!rep?.ft) return null
  if (rep.home === m.t1) return [rep.ft[0], rep.ft[1]]
  if (rep.home === m.t2) return [rep.ft[1], rep.ft[0]]
  if (rep.away === m.t1) return [rep.ft[1], rep.ft[0]]
  if (rep.away === m.t2) return [rep.ft[0], rep.ft[1]]
  return null // normalized name we don't recognize — skip rather than misreport
}

const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1]
const sectionOf = (m) => (m.stage === 'Group' ? `Group ${m.group}` : STAGE_LABELS[m.stage] || m.stage)
const cityOf = (m) => VENUES[m.venue]?.city || m.venue

async function main() {
  let ofMap
  try {
    ofMap = await fetchResults()
  } catch (err) {
    console.error(`✖ Could not fetch the source-of-record feed: ${err.message}`)
    console.error(`  ${RESULTS_SOURCE.url}`)
    process.exit(2)
  }
  const [liveRes, backupRes] = await Promise.allSettled([fetchLive(), fetchBackup()])
  const liveMap = liveRes.status === 'fulfilled' ? liveRes.value : null
  const backupMap = backupRes.status === 'fulfilled' ? backupRes.value : null

  const missing = [] // OpenFootball blank, a fallback has the final
  const corrections = [] // OpenFootball scored, but a fallback contradicts it
  let noSource = 0 // finished, but no source has it (the freshness gate's job)
  let upcoming = 0
  let ofHas = 0

  for (const m of MATCHES) {
    if (hoursSince(m.ko) < MATCH_OVER_HOURS) {
      upcoming++
      continue
    }
    const ofFt = orient(openFootballFinalScore(m, ofMap), m)
    const reps = [
      liveMap && { name: LIVE_SOURCE.name, ft: orient(espnFinalScore(m, liveMap), m) },
      backupMap && { name: BACKUP_SOURCE.name, ft: orient(sdbFinalScore(m, backupMap), m) },
    ].filter((r) => r && r.ft)

    if (ofFt) {
      ofHas++
      const disagreeing = reps.filter((r) => !same(r.ft, ofFt))
      if (disagreeing.length) corrections.push({ m, ofFt, reps })
      continue
    }
    if (!reps.length) {
      noSource++
      continue
    }
    // OpenFootball is blank but a fallback has the final. Confidence: do the
    // fallbacks (when there are two) agree?
    const agree = reps.length < 2 || reps.every((r) => same(r.ft, reps[0].ft))
    missing.push({
      m,
      reps,
      ft: reps[0].ft,
      mark: !agree ? '✗' : reps.length >= 2 ? '✓✓' : '⚠',
      agree,
    })
  }

  console.log(`\nOpenFootball edit helper — 2026--usa/cup.txt`)
  console.log(`  source of record: ${RESULTS_SOURCE.url}`)
  console.log(
    `  cross-checked vs: ${[liveMap && LIVE_SOURCE.name, backupMap && BACKUP_SOURCE.name].filter(Boolean).join(', ') || '(no fallback reachable)'}`,
  )
  console.log(`  edit in place:    ${EDIT_URL}`)
  console.log(
    `\n  ${ofHas} already scored upstream · ${missing.length} missing (fallback has it) · ${corrections.length} possible corrections · ${noSource} finished w/ no source · ${upcoming} upcoming\n`,
  )

  if (!missing.length && !corrections.length) {
    console.log('Nothing to add — OpenFootball is in sync with the fallbacks. ✓\n')
    return
  }

  if (missing.length) {
    console.log('Missing from OpenFootball — replace " v " on the match line with the score:')
    console.log('  (✓✓ both fallbacks agree · ⚠ one fallback only · ✗ fallbacks disagree — verify)\n')
    let section = null
    for (const e of missing) {
      const s = sectionOf(e.m)
      if (s !== section) {
        console.log(`  ▪ ${s}`)
        section = s
      }
      const line = `${e.m.t1}  ${e.ft[0]}-${e.ft[1]}  ${e.m.t2}`
      const note = e.mark === '✗'
        ? e.reps.map((r) => `${r.name} ${r.ft.join('-')}`).join(' | ')
        : e.mark === '✓✓'
          ? `${e.reps.map((r) => r.name).join(' + ')} agree`
          : `only ${e.reps[0].name}`
      console.log(`    ${e.mark}  ${line}`)
      console.log(`         @ ${cityOf(e.m)} · ${dateHint(e.m.ko)} ET · ${note}`)
    }
    console.log()
  }

  if (corrections.length) {
    console.log('Possible corrections — OpenFootball disagrees with the fallbacks:')
    for (const c of corrections) {
      const parts = [`OpenFootball ${c.ofFt.join('-')}`, ...c.reps.map((r) => `${r.name} ${r.ft.join('-')}`)]
      console.log(`  #${c.m.num} ${c.m.t1} v ${c.m.t2} — ${parts.join(' | ')}`)
    }
    console.log()
  }
}

main()
