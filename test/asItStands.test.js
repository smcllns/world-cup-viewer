import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { projectKnockout } from '../src/utils/asItStands.js'
import { THIRD_PLACE_COMBINATIONS, THIRD_WINNER_ORDER } from '../src/data/thirdPlaceCombinations.js'

const GROUPS = Object.keys(TEAMS)

// R32 match number for each "winner v third" host (Winner Group W's match).
function winnerMatchNum(w) {
  const m = MATCHES.find((x) => x.stage === 'R32' && (x.t1 === `Winner Group ${w}` || x.t2 === `Winner Group ${w}`))
  return m?.num
}

// A complete group stage with a strict 9/6/3/0 hierarchy per group; the 3rd-vs-
// 4th margin varies by group so every third place has a distinct goal difference
// (the best-8 cut is then unambiguous).
function buildComplete() {
  const score = {}
  GROUPS.forEach((g, i) => {
    const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
    for (const m of MATCHES) {
      if (m.stage !== 'Group' || m.group !== g) continue
      const a = idx[m.t1]
      const b = idx[m.t2]
      const hi = Math.min(a, b)
      const lo = Math.max(a, b)
      const margin = hi === 2 && lo === 3 ? i + 1 : 1
      score[m.num] = a < b ? [margin, 0] : [0, margin]
    }
  })
  return MATCHES.map((m) => (score[m.num] ? { ...m, score: score[m.num] } : m))
}

// Candidate group lists for each R32 third-place slot, parsed from the bracket.
function thirdSlots() {
  const slots = []
  for (const m of MATCHES) {
    if (m.stage !== 'R32') continue
    for (const side of [m.t1, m.t2]) {
      const hit = /^3rd ([A-L/]+)$/.exec(side)
      if (hit) slots.push({ matchNum: m.num, groups: hit[1].split('/') })
    }
  }
  return slots
}

describe('projectKnockout — "as it stands" R32', () => {
  const complete = buildComplete()
  const { perGroup, complete: resolved, official } = projectKnockout(complete)

  it('resolves a full, complete bracket from the official table', () => {
    expect(resolved).toBe(true)
    expect(official).toBe(true)
  })

  it('assigns thirds exactly per FIFA Annexe C for the current combination', () => {
    // buildComplete sends groups E–L through as the eight qualifying thirds.
    const qualifying = GROUPS.filter((g) => perGroup[g].thirdQualifies)
    const key = [...qualifying].sort().join('')
    const combo = THIRD_PLACE_COMBINATIONS[key]
    expect(combo, `Annexe C must contain combination ${key}`).toBeTruthy()
    // For each winner W facing a third, that third's group is combo[i]; its
    // destination must be W's match, facing W's group winner (team index 0 here).
    THIRD_WINNER_ORDER.forEach((w, i) => {
      const thirdGroup = combo[i]
      const dest = perGroup[thirdGroup].third
      expect(dest, `3rd of ${thirdGroup} should have a destination`).toBeTruthy()
      expect(dest.matchNum).toBe(winnerMatchNum(w))
      expect(dest.opponent).toBe(TEAMS[w][0].name)
    })
  })

  it("places each group's 1st and 2nd against a concrete opponent", () => {
    for (const g of GROUPS) {
      expect(perGroup[g].first?.team).toBeTruthy()
      expect(perGroup[g].first?.opponent).toBeTruthy()
      expect(perGroup[g].second?.team).toBeTruthy()
      expect(perGroup[g].second?.opponent).toBeTruthy()
    }
  })

  it('assigns exactly 8 qualifying thirds, each to a slot whose candidate list allows it', () => {
    const slots = thirdSlots()
    const qualifying = GROUPS.filter((g) => perGroup[g].thirdQualifies)
    expect(qualifying).toHaveLength(8)
    const usedMatches = new Set()
    for (const g of qualifying) {
      const dest = perGroup[g].third
      expect(dest, `group ${g} third should have a destination`).toBeTruthy()
      const slot = slots.find((s) => s.matchNum === dest.matchNum)
      expect(slot, `M${dest.matchNum} should be a third-place slot`).toBeTruthy()
      // FIFA's per-slot candidate list must include this group.
      expect(slot.groups).toContain(g)
      usedMatches.add(dest.matchNum)
    }
    // No two thirds share a slot.
    expect(usedMatches.size).toBe(8)
  })

  it('marks the four non-qualifying thirds as outside the best 8 (no destination)', () => {
    const out = GROUPS.filter((g) => !perGroup[g].thirdQualifies)
    expect(out).toHaveLength(4)
    for (const g of out) expect(perGroup[g].third).toBeNull()
  })
})

describe('FIFA Annexe C combinations table', () => {
  const CAND = { A: 'CEFHI', B: 'EFGIJ', D: 'BEFIJ', E: 'ABCDF', G: 'AEHIJ', I: 'CDFGH', K: 'DEIJL', L: 'EHIJK' }

  it('has all 495 combinations of the 12 groups taken 8 at a time', () => {
    const keys = Object.keys(THIRD_PLACE_COMBINATIONS)
    expect(keys).toHaveLength(495)
    for (const k of keys) {
      // key is 8 distinct group letters, sorted
      expect(k).toMatch(/^[A-L]{8}$/)
      expect(new Set(k).size).toBe(8)
      expect([...k].join('')).toBe([...k].sort().join(''))
    }
  })

  it('every row assigns each winner a third within its candidate list, and the thirds are the key set', () => {
    for (const [key, val] of Object.entries(THIRD_PLACE_COMBINATIONS)) {
      expect(val).toMatch(/^[A-L]{8}$/)
      // the eight assigned thirds are exactly the eight groups in the key
      expect([...val].sort().join('')).toBe(key)
      // each winner's assigned third is permitted by FIFA's candidate list
      THIRD_WINNER_ORDER.forEach((w, i) => expect(CAND[w]).toContain(val[i]))
    }
  })
})
