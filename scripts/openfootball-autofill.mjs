// OpenFootball autofill — unattended writer that contributes confirmed final
// scores back to the upstream source (openfootball/worldcup, 2026--usa/cup.txt),
// the follow-through on the maintainer's edit-in-place invite
// (openfootball/worldcup.json#23). Companion to the read-only `of:edits` helper.
//
// For every finished match where BOTH fallbacks (ESPN + TheSportsDB) agree on
// the final and OpenFootball hasn't recorded it yet, it edits the match line in
// cup.txt — `Home  FT (HT)  Away` plus a goalscorer block in the file's house
// style — and commits straight to master. Conservative by design:
//   • Only acts on ✓✓ matches (both fallbacks agree); ⚠ single-source and
//     ✗ disagreements are left for a human (`npm run of:edits`).
//   • Idempotent: only touches a line that still reads "Home v Away". A line
//     already carrying a score (or a knockout line still on placeholder names)
//     is skipped — so re-running never double-edits.
//   • Half-time + scorers come from ESPN's goal feed and are only written when
//     the parsed goals reconcile exactly with the agreed final; otherwise it
//     falls back to a score-only line (always valid — scorers are optional).
//
// All cup.txt formatting/placement lives in scripts/cuptxt.mjs (unit-tested);
// this file is just the network glue + the commit. cup.txt is the source;
// worldcup.json (which the app reads) is bot-regenerated from it, so we edit
// cup.txt, NOT the JSON. See README "Giving back".
//
// Auth: needs OF_PUSH_TOKEN (a PAT with contents:write on openfootball/worldcup)
// to push. Without it — or with DRY_RUN=1 — it prints the planned edits and
// writes nothing, so it's harmless in CI until the secret is configured.
//
// Run:  node scripts/openfootball-autofill.mjs            (writes if able)
//       DRY_RUN=1 node scripts/openfootball-autofill.mjs  (preview only)

import { execSync } from 'node:child_process'
import { MATCHES } from '../src/data/matches.js'
import { fetchResults, openFootballFinalScore, normalizeTeam } from '../src/services/results.js'
import { fetchLive, espnFinalScore, LIVE_SOURCE } from '../src/services/espn.js'
import { fetchBackup, sdbFinalScore } from '../src/services/thesportsdb.js'
import { applyEdit, orientFt, normEspn, parseClock } from './cuptxt.mjs'

const REPO = 'openfootball/worldcup'
const FILE = '2026--usa/cup.txt'

const eqFt = (a, b) => a && b && a[0] === b[0] && a[1] === b[1]
const etDate = (iso) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '')

const dayCache = new Map()
async function eventsForDate(yyyymmdd) {
  if (dayCache.has(yyyymmdd)) return dayCache.get(yyyymmdd)
  let evs = []
  try {
    const res = await fetch(`${LIVE_SOURCE.url}?dates=${yyyymmdd}`, { cache: 'no-store' })
    if (res.ok) evs = (await res.json()).events || []
  } catch {
    /* best-effort — a missing day just means score-only, no scorers */
  }
  dayCache.set(yyyymmdd, evs)
  return evs
}

// Goals for our match from ESPN's scoreboard, oriented to t1/t2:
// { t1Goals, t2Goals } each [{ name, minute, extra, pen, og }], or null.
async function espnGoals(m) {
  const events = await eventsForDate(etDate(m.ko))
  const nt1 = normalizeTeam(m.t1)
  const nt2 = normalizeTeam(m.t2)
  for (const ev of events) {
    const c = ev.competitions?.[0]
    const hc = c?.competitors?.find((x) => x.homeAway === 'home')
    const ac = c?.competitors?.find((x) => x.homeAway === 'away')
    if (!hc?.team || !ac?.team) continue
    const hn = normEspn(hc.team.displayName)
    const an = normEspn(ac.team.displayName)
    if (!((hn === nt1 && an === nt2) || (hn === nt2 && an === nt1))) continue

    const home = []
    const away = []
    for (const d of c.details || []) {
      if (!d.scoringPlay || d.shootout) continue
      const tid = String(d.team?.id)
      const side = tid === String(hc.team.id) ? home : tid === String(ac.team.id) ? away : null
      if (!side) continue
      const { minute, extra } = parseClock(d.clock?.displayValue)
      const a = d.athletesInvolved?.[0] || {}
      side.push({
        name: (a.displayName || a.shortName || '').trim(),
        minute,
        extra,
        pen: Boolean(d.penaltyKick),
        og: Boolean(d.ownGoal),
      })
    }
    const ord = (g) => (g.minute || 0) * 100 + (g.extra || 0)
    home.sort((a, b) => ord(a) - ord(b))
    away.sort((a, b) => ord(a) - ord(b))
    return hn === nt1 ? { t1Goals: home, t2Goals: away } : { t1Goals: away, t2Goals: home }
  }
  return null
}

function ghHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'world-cup-viewer-autofill',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function main() {
  const pushToken = process.env.OF_PUSH_TOKEN || ''
  let readToken = pushToken || process.env.GITHUB_TOKEN || ''
  if (!readToken) {
    try {
      readToken = execSync('gh auth token', { encoding: 'utf8' }).trim()
    } catch {
      /* unauthenticated reads still work, just lower rate limit */
    }
  }
  const DRY = process.env.DRY_RUN === '1' || !pushToken

  let ofMap
  try {
    ofMap = await fetchResults()
  } catch (err) {
    console.error(`✖ Could not reach OpenFootball: ${err.message}`)
    process.exit(2)
  }
  const [liveRes, backupRes] = await Promise.allSettled([fetchLive(), fetchBackup()])
  const liveMap = liveRes.status === 'fulfilled' ? liveRes.value : null
  const backupMap = backupRes.status === 'fulfilled' ? backupRes.value : null
  if (!liveMap || !backupMap) {
    console.log('Need BOTH ESPN and TheSportsDB to confirm a final — one is unreachable. Skipping.')
    return
  }

  // Candidates: OpenFootball blank, both fallbacks present AND agree (✓✓).
  // Knockout finals can go to extra time / penalties — ESPN's plain score would
  // drop the "a.e.t."/shootout detail, so the auto-writer is scoped to the group
  // stage and knockouts are surfaced for manual handling (`npm run of:edits`).
  const candidates = []
  const knockoutPending = []
  for (const m of MATCHES) {
    if (openFootballFinalScore(m, ofMap)) continue
    const espn = orientFt(espnFinalScore(m, liveMap), m)
    const sdb = orientFt(sdbFinalScore(m, backupMap), m)
    if (!(espn && sdb && eqFt(espn, sdb))) continue
    if (m.stage === 'Group') candidates.push({ m, ft: espn })
    else knockoutPending.push({ m, ft: espn })
  }

  console.log(`\nOpenFootball autofill — ${REPO}/${FILE}`)
  console.log(`  mode: ${DRY ? 'DRY RUN (no push)' : 'WRITE → master'}`)
  console.log(`  ${candidates.length} group-stage final(s) to write` +
    (knockoutPending.length ? ` · ${knockoutPending.length} knockout final(s) need manual review` : ''))
  if (knockoutPending.length) {
    console.log('  (knockouts may be a.e.t./penalties — fill by hand via `npm run of:edits`):')
    for (const { m, ft } of knockoutPending) {
      console.log(`    ⚠ ${m.t1} ${ft[0]}-${ft[1]} ${m.t2}`)
    }
  }
  console.log()
  if (!candidates.length) {
    console.log('No group-stage finals to contribute. ✓\n')
    return
  }

  const meta = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    headers: ghHeaders(readToken),
  }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`GET cup.txt -> ${r.status}`))))
  let text = Buffer.from(meta.content, meta.encoding).toString('utf8')

  const applied = []
  for (const { m, ft } of candidates) {
    const goals = await espnGoals(m)
    const res = applyEdit(text, { t1: m.t1, t2: m.t2, ft, t1Goals: goals?.t1Goals, t2Goals: goals?.t2Goals })
    if (!res.applied) {
      console.log(`  · skip ${m.t1} v ${m.t2} — line not found (already scored or placeholder)`)
      continue
    }
    text = res.text
    applied.push(res)
    console.log(`  ✓ ${res.label}${res.withDetail ? ' (+ HT & scorers)' : ' (score only)'}`)
  }

  if (!applied.length) {
    console.log('\nNo editable lines (all already filled). ✓\n')
    return
  }

  if (DRY) {
    console.log('\n— DRY RUN: planned diff —')
    for (const a of applied) {
      console.log(`\n- ${a.oldLine}`)
      for (const l of a.newBlock.split('\n')) console.log(`+ ${l}`)
    }
    const hint = process.env.OF_PUSH_TOKEN
      ? ''
      : `Set OF_PUSH_TOKEN (PAT with contents:write on ${REPO}) to enable writes. `
    console.log(`\n${hint}Nothing was pushed.\n`)
    return
  }

  const message =
    `Auto-fill ${applied.length} result${applied.length === 1 ? '' : 's'} from ESPN/TheSportsDB\n\n` +
    applied.map((a) => `- ${a.label}`).join('\n')
  const put = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    method: 'PUT',
    headers: { ...ghHeaders(pushToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(text, 'utf8').toString('base64'),
      sha: meta.sha,
      branch: 'master',
    }),
  })
  if (!put.ok) {
    console.error(`\n✖ Push failed: ${put.status} ${await put.text()}`)
    process.exit(1)
  }
  const res = await put.json()
  console.log(`\nCommitted ${applied.length} result(s): ${res.commit?.html_url || res.commit?.sha}\n`)
}

main()
