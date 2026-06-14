// OpenFootball autofill — unattended writer that contributes confirmed final
// scores back to the upstream source (openfootball/worldcup, 2026--usa/cup.txt),
// the follow-through on the maintainer's edit-in-place invite
// (openfootball/worldcup.json#23). Companion to the read-only `of:edits` helper.
//
// For every finished match where BOTH fallbacks (ESPN + TheSportsDB) agree on
// the final and OpenFootball hasn't recorded it yet, it edits the match line in
// cup.txt — `Home  FT (HT)  Away` (or the a.e.t./penalty form for knockouts)
// plus a goalscorer block in the file's house style — and commits to master.
// Conservative by design:
//   • Only acts on ✓✓ matches (both fallbacks agree on the after-ET score);
//     ⚠ single-source and ✗ disagreements are left for a human (`of:edits`).
//   • Idempotent: only touches a line that still reads "Home v Away". A line
//     already carrying a score (or a knockout line still on placeholder names)
//     is skipped — so re-running never double-edits.
//   • Half-time + scorers come from ESPN's goal feed and are only written when
//     the parsed goals reconcile exactly with the agreed final; for a group
//     match that doesn't reconcile it falls back to a valid score-only line.
//   • Knockouts: extra-time / penalties are rendered in full
//     (`1-1 a.e.t. (1-0, 1-1), 4-2 pen.`, shootout kicks excluded from scorers).
//     The after-ET score is ✓✓; the penalty tally is from ESPN, cross-checked
//     against TheSportsDB when it carries one (a disagreement defers to a human).
//     A knockout whose goals can't be reconciled is never written as a bare
//     score — it's surfaced for manual review instead.
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
import { appendFileSync } from 'node:fs'
import { MATCHES } from '../src/data/matches.js'
import { fetchResults, applyResults, openFootballFinalScore, normalizeTeam } from '../src/services/results.js'
import { fetchLive, applyLive, espnFinalScore, LIVE_SOURCE } from '../src/services/espn.js'
import { fetchBackup, sdbFinalScore, sdbFinalPens } from '../src/services/thesportsdb.js'
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

const toNum = (v) => (v == null || v === '' ? null : Number(v))

// ESPN detail for our match, oriented to t1/t2:
//   { t1Goals, t2Goals, pens, aet }
// goals are [{ name, minute, extra, pen, og }] (shootout kicks excluded); pens
// is [t1Pens, t2Pens] or null; aet is true when the match went to extra time.
// Null when the event isn't found.
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
      if (!d.scoringPlay || d.shootout) continue // exclude penalty-shootout kicks
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

    const ph = toNum(hc.shootoutScore)
    const pa = toNum(ac.shootoutScore)
    const pensHA = ph != null && pa != null ? [ph, pa] : null
    const statusName = c.status?.type?.name || ''
    const aet =
      /PEN|AET|_ET\b/.test(statusName) ||
      Boolean(pensHA) ||
      home.concat(away).some((g) => g.minute != null && g.minute > 90)

    const orient2 = (pair) => (pair == null ? null : hn === nt1 ? pair : [pair[1], pair[0]])
    const goals = hn === nt1 ? { t1Goals: home, t2Goals: away } : { t1Goals: away, t2Goals: home }
    return { ...goals, pens: orient2(pensHA), aet }
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

  // Candidates: OpenFootball blank, both fallbacks present AND agree (✓✓) on the
  // final (the after-extra-time score for knockouts). Merge first so knockout
  // matches carry their resolved team names instead of "Winner Group A".
  const merged = applyLive(applyResults(MATCHES, ofMap), liveMap)
  const candidates = []
  for (const m of merged) {
    if (openFootballFinalScore(m, ofMap)) continue
    const espn = orientFt(espnFinalScore(m, liveMap), m)
    const sdb = orientFt(sdbFinalScore(m, backupMap), m)
    if (espn && sdb && eqFt(espn, sdb)) candidates.push({ m, ft: espn })
  }

  console.log(`\nOpenFootball autofill — ${REPO}/${FILE}`)
  console.log(`  mode: ${DRY ? 'DRY RUN (no push)' : 'WRITE → master'}`)
  console.log(`  ${candidates.length} confirmed final(s) missing from OpenFootball\n`)
  if (!candidates.length) {
    console.log('Nothing to contribute. ✓\n')
    return
  }

  const meta = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    headers: ghHeaders(readToken),
  }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`GET cup.txt -> ${r.status}`))))
  let text = Buffer.from(meta.content, meta.encoding).toString('utf8')

  const applied = []
  const manual = [] // confirmed, but not safe to auto-write — surfaced for a human
  for (const { m, ft } of candidates) {
    const knockout = m.stage !== 'Group'
    const detail = await espnGoals(m)

    // Knockouts need ESPN's goal/extra-time/shootout detail to render correctly;
    // without it we can't tell a.e.t./penalties from a plain score, so defer.
    if (knockout && !detail) {
      manual.push({ m, ft, why: 'no ESPN goal detail (can’t confirm a.e.t./pens)' })
      continue
    }

    // Penalty shootout: ESPN is primary; cross-check TheSportsDB when it carries
    // the tally. A disagreement is too risky to auto-write → defer to a human.
    let pens = detail?.pens || null
    let pensNote = ''
    if (pens) {
      const sdbP = orientFt(sdbFinalPens(m, backupMap), m)
      if (sdbP && !eqFt(sdbP, pens)) {
        manual.push({ m, ft, why: `pens disagree (ESPN ${pens.join('-')} vs TheSportsDB ${sdbP.join('-')})` })
        continue
      }
      pensNote = sdbP ? ' [pens ✓✓]' : ' [pens ESPN-only]'
    }

    const res = applyEdit(text, {
      t1: m.t1,
      t2: m.t2,
      ft,
      t1Goals: detail?.t1Goals,
      t2Goals: detail?.t2Goals,
      aet: detail?.aet || false,
      pens,
    })
    if (!res.applied) {
      if (res.reason === 'knockout-unreconciled') {
        manual.push({ m, ft, why: 'ESPN goals don’t reconcile with the final' })
      } else {
        console.log(`  · skip ${m.t1} v ${m.t2} — line not found (already scored or placeholder)`)
      }
      continue
    }
    text = res.text
    applied.push(res)
    console.log(`  ✓ ${res.label}${res.withDetail ? ' (+ detail)' : ' (score only)'}${pensNote}`)
  }

  if (manual.length) {
    console.log('\n  Needs manual review (`npm run of:edits`):')
    for (const { m, ft, why } of manual) {
      console.log(`    ⚠ ${m.t1} ${ft[0]}-${ft[1]} ${m.t2} — ${why}`)
    }
  }

  if (!applied.length) {
    console.log('\nNo editable lines (all already filled). ✓\n')
    return
  }

  if (DRY) {
    console.log('\n— DRY RUN: planned diff —')
    for (const a of applied) {
      console.log(`\n- ${a.oldLine.replace(/\r/g, '')}`)
      for (const l of a.newBlock.replace(/\r/g, '').split('\n')) console.log(`+ ${l}`)
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
  const url = res.commit?.html_url || res.commit?.sha || ''
  console.log(`\nCommitted ${applied.length} result(s): ${url}\n`)

  // Emit step outputs (only on an actual commit) so the workflow can email a
  // notification for the newly-synced finals. No commit → no outputs → no email.
  setOutput('count', String(applied.length))
  setOutput('summary', applied.map((a) => a.label).join('; '))
  setOutput('details', applied.map((a) => `- ${a.label}`).join('\n'))
  setOutput('commit_url', url)
}

// Append a (possibly multi-line) GitHub Actions step output. No-op locally.
function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT
  if (!file) return
  const delim = `__EOF_${name}__`
  appendFileSync(file, `${name}<<${delim}\n${value}\n${delim}\n`)
}

main()
