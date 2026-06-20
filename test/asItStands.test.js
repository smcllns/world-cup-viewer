import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { projectKnockout } from '../src/utils/asItStands.js'

const GROUPS = Object.keys(TEAMS)

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
  const { perGroup, complete: resolved } = projectKnockout(complete)

  it('resolves a full, complete bracket', () => {
    expect(resolved).toBe(true)
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
