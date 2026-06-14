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
import { MATCHES } from '../src/data/matches.js'
import { fetchResults, applyResults, openFootballFinalScore } from '../src/services/results.js'
import { fetchLive, applyLive, espnFinalScore, LIVE_SOURCE, scoreboardDates } from '../src/services/espn.js'
import { fetchBackup, sdbFinalScore, sdbFinalPens } from '../src/services/thesportsdb.js'
import { applyEdit, orientFt } from './cuptxt.mjs'
import { classifyMatch, parseEspnEventDetail, eqFt } from './autofill-core.mjs'

const REPO = 'openfootball/worldcup'
const DIR = '2026--usa'
// Group-stage results live in cup.txt; knockouts in cup_finals.txt (whose lines
// carry a "(NN)" match-number prefix). Target the right file per match.
const fileFor = (m) => `${DIR}/${m.stage === 'Group' ? 'cup.txt' : 'cup_finals.txt'}`

const minutesSince = (iso) => (Date.now() - new Date(iso).getTime()) / 60_000

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

// All ESPN events for the dates around a match's kickoff (UTC ±1 day, same window
// as fetchLive), deduped — so a match ESPN files under an adjacent date isn't
// missed (the single-date version dropped midnight-ET games' scorer/extra-time
// detail).
async function espnEventsAround(ko) {
  const seen = new Set()
  const events = []
  for (const d of scoreboardDates(new Date(ko))) {
    for (const ev of await eventsForDate(d)) {
      const id = ev.id ?? ev.uid ?? ev.date
      if (id && seen.has(id)) continue
      if (id) seen.add(id)
      events.push(ev)
    }
  }
  return events
}

// ESPN detail for our match, oriented to t1/t2 ({ t1Goals, t2Goals, pens, aet }),
// or null when the scoreboard has no matching event. Parsing is in autofill-core
// (unit-tested); this fetches the dates around kickoff and finds the event.
async function espnGoals(m) {
  const events = await espnEventsAround(m.ko)
  for (const ev of events) {
    const detail = parseEspnEventDetail(ev, m)
    if (detail) return detail
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
  // Test path (workflow_dispatch test_email=true): just prove the mail secrets work.
  if (process.env.TEST_EMAIL === '1') {
    sendEmail(
      '✅ Test — World Cup autofill email is working',
      'This is a test from the OpenFootball autofill workflow. If you got this, the ' +
        'mail secrets are configured and you’ll be emailed each time a new final score ' +
        'is synced to openfootball/worldcup.',
    )
    return
  }

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

  // Candidates: OpenFootball blank, confirmed final. Default is ✓✓ (both
  // fallbacks agree on the after-extra-time score); if they DISAGREE, skip. When
  // only ESPN has it, wait for TheSportsDB — unless the match is well past full
  // time, then fall back to ESPN alone. Merge first so knockout matches carry
  // their resolved team names instead of "Winner Group A".
  const merged = applyLive(applyResults(MATCHES, ofMap), liveMap)
  const candidates = []
  for (const m of merged) {
    const espn = orientFt(espnFinalScore(m, liveMap), m)
    const decision = classifyMatch({
      ofFt: openFootballFinalScore(m, ofMap),
      espnFt: espn,
      sdbFt: orientFt(sdbFinalScore(m, backupMap), m),
      minutesPastKickoff: minutesSince(m.ko),
    })
    if (decision.action === 'sync') candidates.push({ m, ft: espn, conf: decision.conf })
  }

  console.log(`\nOpenFootball autofill — ${REPO} (${DIR})`)
  console.log(`  mode: ${DRY ? 'DRY RUN (no push)' : 'WRITE → master'}`)
  console.log(`  ${candidates.length} confirmed final(s) missing from OpenFootball\n`)
  if (!candidates.length) {
    console.log('Nothing to contribute. ✓\n')
    return
  }

  // Load each target file (cup.txt / cup_finals.txt) lazily, once.
  const files = new Map()
  async function loadFile(path) {
    if (files.has(path)) return files.get(path)
    const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      headers: ghHeaders(readToken),
    })
    if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`)
    const meta = await r.json()
    const entry = {
      path,
      sha: meta.sha,
      text: Buffer.from(meta.content, meta.encoding).toString('utf8'),
      changed: false,
    }
    files.set(path, entry)
    return entry
  }

  const applied = []
  const manual = [] // confirmed, but not safe to auto-write — surfaced for a human
  for (const { m, ft, conf } of candidates) {
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

    const file = await loadFile(fileFor(m))
    const res = applyEdit(file.text, {
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
    file.text = res.text
    file.changed = true
    applied.push({ ...res, conf, path: file.path })
    const srcNote = conf === 'espn-only' ? ' [ESPN only — TheSportsDB still lagging]' : ''
    console.log(`  ✓ ${res.label}${res.withDetail ? ' (+ detail)' : ' (score only)'}${pensNote}${srcNote}`)
  }

  if (manual.length) {
    console.log('\n  Needs manual review (`npm run of:edits`):')
    for (const { m, ft, why } of manual) {
      console.log(`    ⚠ ${m.t1} ${ft[0]}-${ft[1]} ${m.t2} — ${why}`)
    }
    // Open a (deduplicated) GitHub issue per match so it surfaces once and
    // notifies — a deferred knockout stays a candidate every run, so a plain
    // email would repeat endlessly; an issue is opened once and tracked.
    if (!DRY) await flagManual(manual)
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

  const srcSuffix = (a) => (a.conf === 'espn-only' ? ' (ESPN only — TheSportsDB lagging)' : '')
  // One commit per changed file (cup.txt and/or cup_finals.txt).
  const commits = []
  for (const f of files.values()) {
    if (!f.changed) continue
    const here = applied.filter((a) => a.path === f.path)
    const message =
      `Auto-fill ${here.length} result${here.length === 1 ? '' : 's'} from ESPN/TheSportsDB\n\n` +
      here.map((a) => `- ${a.label}${srcSuffix(a)}`).join('\n')
    const put = await fetch(`https://api.github.com/repos/${REPO}/contents/${f.path}`, {
      method: 'PUT',
      headers: { ...ghHeaders(pushToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: Buffer.from(f.text, 'utf8').toString('base64'),
        sha: f.sha,
        branch: 'master',
      }),
    })
    if (!put.ok) {
      console.error(`\n✖ Push to ${f.path} failed: ${put.status} ${await put.text()}`)
      process.exit(1)
    }
    const url = (await put.json()).commit?.html_url || ''
    commits.push({ path: f.path, url })
    console.log(`\nCommitted ${here.length} result(s) to ${f.path}: ${url}`)
  }
  console.log()

  // Notify (only on an actual commit, so DRY runs / no-ops never email).
  const subject =
    `⚽ Synced ${applied.length} result${applied.length === 1 ? '' : 's'} to OpenFootball: ` +
    applied.map((a) => a.label).join('; ')
  const body =
    `New final score(s) synced to openfootball/worldcup:\n\n` +
    applied.map((a) => `- ${a.label}${srcSuffix(a)}`).join('\n') +
    `\n\n${commits.map((c) => `${c.path}: ${c.url}`).join('\n')}\n`
  sendEmail(subject, body)
}

// Send a notification via Gmail SMTP using Python's smtplib (preinstalled on the
// runner — avoids adding an npm/Action dependency, and works inside the loop).
// No-op without mail secrets; best-effort, never throws.
function sendEmail(subject, body) {
  const user = process.env.MAIL_USERNAME
  const pass = process.env.MAIL_PASSWORD
  if (!user || !pass) {
    console.log('  (no mail secrets — skipping email)')
    return
  }
  const py = `import smtplib, os, ssl
from email.message import EmailMessage
m = EmailMessage()
m['From'] = os.environ['SMTP_FROM']; m['To'] = os.environ['SMTP_TO']
m['Subject'] = os.environ['SMTP_SUBJECT']; m.set_content(os.environ['SMTP_BODY'])
with smtplib.SMTP_SSL('smtp.gmail.com', 465, context=ssl.create_default_context()) as s:
    s.login(os.environ['SMTP_USER'], os.environ['SMTP_PASS'])
    s.send_message(m)
`
  try {
    execSync('python3 -', {
      input: py,
      env: {
        ...process.env,
        SMTP_FROM: `World Cup Autofill <${user}>`,
        SMTP_TO: process.env.MAIL_TO || 'chester.ismay@gmail.com',
        SMTP_SUBJECT: subject,
        SMTP_BODY: body,
        SMTP_USER: user,
        SMTP_PASS: pass,
      },
    })
    console.log(`  ✉ emailed ${process.env.MAIL_TO || 'chester.ismay@gmail.com'}`)
  } catch (err) {
    console.log(`  ✖ email failed: ${(err.stderr || err.message || '').toString().trim()}`)
  }
}

// Open a GitHub issue in OUR repo for each match the autofill couldn't safely
// write, deduplicated by title so it's raised once (not every run). Uses
// GITHUB_TOKEN (issues:write on this repo) — best-effort, never throws.
async function flagManual(manual) {
  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  if (!repo || !token) return
  const owner = repo.split('/')[0]
  for (const { m, ft, why } of manual) {
    const title = `Manual review: ${m.t1} vs ${m.t2}`
    try {
      const q = encodeURIComponent(`repo:${repo} is:issue is:open in:title "${title}"`)
      const found = await fetch(`https://api.github.com/search/issues?q=${q}`, {
        headers: ghHeaders(token),
      }).then((r) => (r.ok ? r.json() : { items: [] }))
      if ((found.items || []).some((i) => i.title === title)) {
        console.log(`  (issue already open) ${title}`)
        continue
      }
      const body =
        `@${owner} — the autofill couldn't safely sync this knockout result, so it needs a hand.\n\n` +
        `- **${m.t1} ${ft[0]}-${ft[1]} ${m.t2}** (after-extra-time score, ✓✓ confirmed)\n` +
        `- Reason: ${why}\n\n` +
        `Fill it in at \`2026--usa/cup.txt\` (run \`npm run of:edits\` for the exact line). Close this once done.`
      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, assignees: [owner] }),
      })
      console.log(res.ok ? `  ⚠ opened issue: ${title}` : `  ✖ issue create failed (${res.status})`)
    } catch (err) {
      console.log(`  ✖ issue create error: ${err.message}`)
    }
  }
}

main()
