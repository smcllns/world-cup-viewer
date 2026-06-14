import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MATCHES } from '../src/data/matches.js'
import { VENUES } from '../src/data/venues.js'
import { cupName, applyEdit } from '../scripts/cuptxt.mjs'

// Validate our static schedule against a frozen snapshot of the REAL upstream
// cup.txt — the class of check that was missing when "Australia v Türkiye" failed
// to sync (our name "Türkiye" vs cup.txt "Turkey"). Offline & deterministic; if
// upstream restructures or renames a team, re-freeze test/fixtures/cup-txt-snapshot.txt.
const here = dirname(fileURLToPath(import.meta.url))
const cupTxt = readFileSync(resolve(here, 'fixtures/cup-txt-snapshot.txt'), 'utf8')
const lines = cupTxt.split(/\r?\n/)
const groupMatches = MATCHES.filter((m) => m.stage === 'Group')

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const word = (n) => new RegExp(`(^|[ \\t])${esc(n)}([ \\t]|$)`)

// Is there a cup.txt MATCH line (time + UTC offset) naming both teams, in either
// order? (Works whether the line is still " v " or already scored.)
function hasMatchLine(a, b) {
  return lines.some(
    (l) => /^[ \t]*\d{1,2}:\d{2}[ \t]+UTC/.test(l) && word(a).test(l) && word(b).test(l),
  )
}

describe('cup.txt coverage', () => {
  it('every group match is locatable in cup.txt under its cup.txt spelling', () => {
    const missing = groupMatches
      .filter((m) => !hasMatchLine(cupName(m.t1), cupName(m.t2)))
      .map((m) => `${m.t1} v ${m.t2}  →  "${cupName(m.t1)}" / "${cupName(m.t2)}"`)
    expect(missing, `these matches have no cup.txt line under our (aliased) names:\n${missing.join('\n')}`).toEqual([])
  })

  it('every distinct team appears in cup.txt under its cup.txt spelling', () => {
    const teams = [...new Set(groupMatches.flatMap((m) => [m.t1, m.t2]))]
    const missing = teams.filter((t) => !word(cupName(t)).test(cupTxt))
    expect(missing, `teams absent from cup.txt under our spelling: ${missing.join(', ')}`).toEqual([])
  })

  it('cupName only remaps teams that actually need it (no stale aliases)', () => {
    // A team we alias must NOT already appear verbatim as a cup.txt match-line team;
    // and its alias target must. Guards against an alias that silently shadows a
    // real name or points at the wrong spelling.
    for (const t of ['Türkiye', 'Czechia']) {
      expect(cupName(t)).not.toBe(t) // it's aliased
      expect(word(cupName(t)).test(cupTxt), `${cupName(t)} should be in cup.txt`).toBe(true)
    }
  })
})

describe('applyEdit against the real cup.txt snapshot', () => {
  it('edits a real unscored line cleanly, preserves CRLF, and is idempotent', () => {
    // Find a group match still unscored in the snapshot (the autofill locates it
    // by our app names, mapped through cupName internally).
    let target = null
    let applied = null
    for (const m of groupMatches) {
      const r = applyEdit(cupTxt, {
        t1: m.t1,
        t2: m.t2,
        ft: [1, 0],
        t1Goals: [{ name: 'Tester', minute: 30, pen: false, og: false }],
        t2Goals: [],
      })
      if (r.applied) {
        target = m
        applied = r
        break
      }
    }
    expect(target, 'snapshot should contain at least one unscored group match').toBeTruthy()
    // CRLF preserved: the edit introduces NO new bare LF (the real file is CRLF,
    // with a couple of pre-existing stray LFs we must not add to).
    const bareLF = (s) => (s.match(/[^\r]\n/g) || []).length
    expect(bareLF(applied.text)).toBe(bareLF(cupTxt))
    // The edit added a scorer line and changed nothing before the match's section.
    const head = cupTxt.slice(0, cupTxt.indexOf(applied.oldLine))
    expect(applied.text.startsWith(head)).toBe(true)
    // Idempotent: re-applying finds no " v " line anymore.
    expect(applyEdit(applied.text, { t1: target.t1, t2: target.t2, ft: [1, 0] }).applied).toBe(false)
  })
})

describe('cup_finals.txt (knockout) coverage', () => {
  const finals = readFileSync(resolve(here, 'fixtures/cup-finals-snapshot.txt'), 'utf8')
  const finalsLines = finals.split(/\r?\n/)
  const knockoutMatches = MATCHES.filter((m) => m.stage !== 'Group')
  // A knockout match line: "(NN) <time> UTC<off>  Home v Away  @ Venue".
  const matchLines = finalsLines.filter((l) => /^[ \t]*\(\d+\)[ \t]+\d{1,2}:\d{2}[ \t]+UTC/.test(l))

  it('knockouts live in cup_finals.txt — none leak into the group cup.txt', () => {
    // (If this fails, the autofill is writing knockouts to the wrong file.)
    expect(/Round of|Quarter-?final|Semi-?final|Third|Final/i.test(cupTxt)).toBe(false)
  })

  it('every knockout match number has a "(NN)" line in cup_finals.txt', () => {
    const nums = new Set(matchLines.map((l) => Number(l.match(/\((\d+)\)/)[1])))
    const missing = knockoutMatches.filter((m) => !nums.has(m.num)).map((m) => `#${m.num}`)
    expect(missing, `knockout match numbers absent from cup_finals.txt: ${missing.join(', ')}`).toEqual([])
  })

  it('cup_finals lines have the " v " + "@ venue" shape our (NN)-aware regex needs', () => {
    expect(matchLines.length).toBe(knockoutMatches.length)
    expect(matchLines.every((l) => / v /.test(l) && /@/.test(l))).toBe(true)
  })
})

describe('static data integrity', () => {
  it('every match references a known venue', () => {
    const missing = MATCHES.filter((m) => !VENUES[m.venue]).map((m) => `#${m.num} venue="${m.venue}"`)
    expect(missing).toEqual([])
  })

  it('no two matches share a kickoff instant AND a team (would collide in instant-keyed lookups)', () => {
    // ESPN/TheSportsDB knockout matching falls back to kickoff instant; a collision
    // (same instant + overlapping team) could overlay the wrong match.
    const byInstant = new Map()
    for (const m of MATCHES) {
      const key = new Date(m.ko).getTime()
      ;(byInstant.get(key) || byInstant.set(key, []).get(key)).push(m)
    }
    const collisions = []
    for (const [, group] of byInstant) {
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i]
          const b = group[j]
          if ([a.t1, a.t2].some((t) => t === b.t1 || t === b.t2))
            collisions.push(`#${a.num} & #${b.num} share an instant and a team`)
        }
    }
    expect(collisions).toEqual([])
  })
})
