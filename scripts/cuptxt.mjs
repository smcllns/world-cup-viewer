// Pure formatting + placement helpers for editing openfootball's cup.txt — kept
// separate from the network/IO in openfootball-autofill.mjs so they can be unit
// tested (see test/cuptxt.test.js). Everything here is deterministic: given the
// file text and a confirmed result, produce the edited text in the file's exact
// house style, in the right place, idempotently.

import { normalizeTeam } from '../src/services/results.js'

// Indents that match the existing 2026 scorer blocks: "(home…;" then "   away…)".
export const HOME_INDENT = ' '.repeat(20)
export const AWAY_INDENT = ' '.repeat(23)

// ESPN's team-name divergences from ours (mirrors src/services/espn.js).
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
export const normEspn = (name) => normalizeTeam(ESPN_ALIASES[name] || name)

export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Orient a source report (home/away by name, ft = [homeGoals, awayGoals]) onto a
// match's t1 v t2 order. Returns [t1goals, t2goals] or null when names don't fit.
export function orientFt(rep, m) {
  if (!rep?.ft) return null
  const t1 = normalizeTeam(m.t1)
  const t2 = normalizeTeam(m.t2)
  if (rep.home === t1) return [rep.ft[0], rep.ft[1]]
  if (rep.home === t2) return [rep.ft[1], rep.ft[0]]
  if (rep.away === t1) return [rep.ft[1], rep.ft[0]]
  if (rep.away === t2) return [rep.ft[0], rep.ft[1]]
  return null
}

// "90'+4'" -> { minute: 90, extra: 4 }; "17'" -> { minute: 17 }.
export function parseClock(dv) {
  const [base, extra] = String(dv || '').replace(/'/g, '').split('+')
  const minute = parseInt(base, 10)
  const ex = extra != null ? parseInt(extra, 10) : NaN
  return { minute: Number.isNaN(minute) ? null : minute, extra: Number.isNaN(ex) ? undefined : ex }
}

// One goal -> its minute token, e.g. "45+2'", "16' (pen.)", "7'(OG)".
export function goalToken(g) {
  const min = g.extra != null ? `${g.minute}+${g.extra}'` : `${g.minute}'`
  return g.og ? `${min}(OG)` : g.pen ? `${min} (pen.)` : min
}

// One team's goals in cup.txt style: "Scorer 12' Other 45+2'", repeat scorers
// comma-merged ("Valencia 16' (pen.), 31'").
export function fmtSide(goals) {
  const parts = []
  for (const g of goals) {
    const tok = goalToken(g)
    const last = parts[parts.length - 1]
    if (last && last.name === g.name) last.toks.push(tok)
    else parts.push({ name: g.name, toks: [tok] })
  }
  return parts.map((p) => `${p.name} ${p.toks.join(', ')}`).join(' ')
}

// Scorer block: two lines when both teams scored (";" splits home/away), one
// line when only one did, null when goalless. Home is the team listed first on
// the match line. `eol` lets the writer match the file's line endings (the real
// cup.txt is CRLF) so we never introduce mixed endings.
export function scorerBlock(homeGoals, awayGoals, eol = '\n') {
  const h = fmtSide(homeGoals)
  const a = fmtSide(awayGoals)
  if (homeGoals.length && awayGoals.length) return `${HOME_INDENT}(${h};${eol}${AWAY_INDENT}${a})`
  if (homeGoals.length) return `${HOME_INDENT}(${h})`
  if (awayGoals.length) return `${HOME_INDENT}(${a})`
  return null
}

// Half-time count for one team from its goals (goals in the first 45').
const firstHalf = (g) => g.minute != null && g.minute <= 45
const validGoals = (goals, n) => goals.length === n && goals.every((g) => g.name && g.minute != null)

// Regex for an UNSCORED match line "  <time> UTC<off>   Home  v Away   @ Venue".
// Captures: 1=prefix(time) 2=home 3=gap 4=gap 5=away 6=" @ venue…". The tail is
// [^\r\n]* (not .*$) so it stops cleanly at the line end on CRLF files without
// swallowing the carriage return — letting the writer keep endings consistent.
export function lineRegex(home, away) {
  return new RegExp(
    `^(\\s*\\d{1,2}:\\d{2}\\s+UTC\\S+\\s+)(${esc(home)})(\\s+)v(\\s+)(${esc(away)})(\\s+@[^\\r\\n]*)`,
    'm',
  )
}

// Apply one confirmed result to the cup.txt text. spec:
//   { t1, t2, ft:[t1g,t2g], t1Goals?, t2Goals? }  (goals oriented to t1/t2)
// Returns { applied:true, text, oldLine, newBlock, label } when an unscored line
// was found and edited, else { applied:false, reason }. Idempotent: a line that
// no longer reads "Home v Away" (already scored / still a placeholder) is left
// untouched. Half-time + scorers are only written when the goals reconcile with
// the final; otherwise a valid score-only line is written.
export function applyEdit(text, spec) {
  const { t1, t2, ft, t1Goals = null, t2Goals = null } = spec
  const eol = text.includes('\r\n') ? '\r\n' : '\n'

  let hit = null
  let homeIsT1 = true
  for (const [home, away, isT1] of [
    [t1, t2, true],
    [t2, t1, false],
  ]) {
    const m = lineRegex(home, away).exec(text)
    if (m) {
      hit = m
      homeIsT1 = isT1
      break
    }
  }
  if (!hit) return { applied: false, reason: 'line-not-found' }

  const ftLine = homeIsT1 ? ft : [ft[1], ft[0]]
  let scoreSeg = `${ftLine[0]}-${ftLine[1]}`
  let block = null

  if (t1Goals && t2Goals && validGoals(t1Goals, ft[0]) && validGoals(t2Goals, ft[1])) {
    const htT1 = t1Goals.filter(firstHalf).length
    const htT2 = t2Goals.filter(firstHalf).length
    const htLine = homeIsT1 ? [htT1, htT2] : [htT2, htT1]
    scoreSeg = `${ftLine[0]}-${ftLine[1]} (${htLine[0]}-${htLine[1]})`
    const homeGoals = homeIsT1 ? t1Goals : t2Goals
    const awayGoals = homeIsT1 ? t2Goals : t1Goals
    block = scorerBlock(homeGoals, awayGoals, eol)
  }

  let newBlock = `${hit[1]}${hit[2]}${hit[3]}${scoreSeg}${hit[4]}${hit[5]}${hit[6]}`
  if (block) newBlock += `${eol}${block}`
  const next = text.slice(0, hit.index) + newBlock + text.slice(hit.index + hit[0].length)
  const label = `${t1} ${ft[0]}-${ft[1]} ${t2}`
  return { applied: true, text: next, oldLine: hit[0], newBlock, label, withDetail: Boolean(block) }
}
