import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { computeClinch } from '../src/utils/clinch.js'

const GROUPS = Object.keys(TEAMS)

// Apply a { matchNum: [g1, g2] } map onto a clone of the real schedule.
function withScores(scoreByNum) {
  return MATCHES.map((m) => (scoreByNum[m.num] ? { ...m, score: scoreByNum[m.num] } : m))
}

describe('clinch — within a single group', () => {
  // Group A: Mexico, South Africa, South Korea, Czechia.
  // Matchday 1+2 played; m53 (Czechia v Mexico) and m54 (SA v SK) remain.
  it('flags a guaranteed group winner as won-group', () => {
    // Mexico win both matches by 3; nobody else can reach Mexico's 6 points.
    const status = computeClinch(
      withScores({
        1: [3, 0], // Mexico 3–0 South Africa
        2: [0, 0], // South Korea 0–0 Czechia
        25: [0, 0], // Czechia 0–0 South Africa
        28: [3, 0], // Mexico 3–0 South Korea
      }),
    )
    expect(status['Mexico']).toBe('won-group')
    // Cross-group race isn't computable (other groups unplayed), so the chasing
    // teams are simply undecided — never falsely "through" or "out".
    expect(status['Czechia']).toBeNull()
    expect(status['South Korea']).toBeNull()
  })

  it('flags two teams clear of the field as top2 (through, group order open)', () => {
    // Mexico and Czechia both 6 pts; South Africa/South Korea can reach only 3.
    const status = computeClinch(
      withScores({
        1: [1, 0], // Mexico 1–0 South Africa
        2: [0, 1], // South Korea 0–1 Czechia
        25: [1, 0], // Czechia 1–0 South Africa
        28: [1, 0], // Mexico 1–0 South Korea
      }),
    )
    expect(status['Mexico']).toBe('top2')
    expect(status['Czechia']).toBe('top2')
    expect(status['South Africa']).toBeNull()
    expect(status['South Korea']).toBeNull()
  })

  it('does not claim a clinch while a rival can still overtake on points', () => {
    // Only matchday 1 played: far too open for anything to be locked.
    const status = computeClinch(
      withScores({
        1: [1, 0], // Mexico 1–0 South Africa
        2: [0, 0], // South Korea 0–0 Czechia
      }),
    )
    for (const t of TEAMS['A']) expect(status[t.name]).toBeNull()
  })
})

describe('clinch — full group stage, cross-group third place', () => {
  // Build a complete, tie-free group stage with a strict 9/6/3/0 hierarchy in
  // every group (team index 0 strongest … 3 weakest). The third-placed team's
  // goal difference is made distinct per group so the best-8-of-12 cut is
  // unambiguous, letting us assert exact clinch statuses.
  function buildComplete() {
    const score = {}
    GROUPS.forEach((g, i) => {
      const names = TEAMS[g].map((t) => t.name)
      const idx = Object.fromEntries(names.map((n, k) => [n, k]))
      for (const m of MATCHES) {
        if (m.stage !== 'Group' || m.group !== g) continue
        const a = idx[m.t1]
        const b = idx[m.t2]
        const hi = Math.min(a, b)
        const lo = Math.max(a, b)
        // The 3rd-vs-4th game (indices 2 v 3) wins by a group-specific margin so
        // every group's third place has a unique goal difference.
        const margin = hi === 2 && lo === 3 ? i + 1 : 1
        score[m.num] = a < b ? [margin, 0] : [0, margin]
      }
    })
    return withScores(score)
  }

  it('matches the final qualification picture for every team', () => {
    const status = computeClinch(buildComplete())
    GROUPS.forEach((g, i) => {
      const [first, second, third, fourth] = TEAMS[g].map((t) => t.name)
      expect(status[first]).toBe('won-group')
      expect(status[second]).toBe('top2')
      // Third places with GD = i-1; the 8 highest (i = 4..11) advance.
      expect(status[third]).toBe(i >= 4 ? 'third' : 'eliminated')
      expect(status[fourth]).toBe('eliminated')
    })
  })
})
