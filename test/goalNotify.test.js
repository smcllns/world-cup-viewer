import { describe, it, expect } from 'vitest'
import { detectGoals, goalNotification, goalKeys, isLiveish, inScope } from '../src/services/goalNotify.js'

// A live match with the given goal lists.
const live = (num, t1, t2, g1 = [], g2 = [], extra = {}) => ({
  num,
  t1,
  t2,
  live: { clock: "60'" },
  goals: { t1: g1, t2: g2 },
  ...extra,
})
const goal = (name, minute, opts = {}) => ({ name, minute, ...opts })

describe('detectGoals', () => {
  it('never notifies on the first sighting of a match (initialization)', () => {
    const matches = [live(1, 'Spain', 'Cape Verde', [goal('Pedri', 23)])]
    const { events, next } = detectGoals(null, matches, { scope: 'all' })
    expect(events).toEqual([])
    expect(next.get(1).size).toBe(1) // recorded for next time
  })

  it('fires once when a new goal appears between polls', () => {
    const before = detectGoals(null, [live(1, 'Spain', 'Cape Verde')], { scope: 'all' }).next
    const after = [live(1, 'Spain', 'Cape Verde', [goal('Pedri', 23)])]
    const { events } = detectGoals(before, after, { scope: 'all' })
    expect(events).toHaveLength(1)
    expect(events[0].match.num).toBe(1)
    expect(events[0].side).toBe('t1')
    expect(events[0].goal.name).toBe('Pedri')
  })

  it('does not re-fire a goal already seen', () => {
    const matches = [live(1, 'Spain', 'Cape Verde', [goal('Pedri', 23)])]
    const before = detectGoals(null, matches, { scope: 'all' }).next
    const { events } = detectGoals(before, matches, { scope: 'all' })
    expect(events).toEqual([])
  })

  it('emits an event per goal when two arrive in the same poll', () => {
    const before = detectGoals(null, [live(1, 'A', 'B')], { scope: 'all' }).next
    const after = [live(1, 'A', 'B', [goal('X', 10)], [goal('Y', 12)])]
    const { events } = detectGoals(before, after, { scope: 'all' })
    expect(events.map((e) => e.goal.name).sort()).toEqual(['X', 'Y'])
  })

  it('ignores goals on a finished, OpenFootball-only match (not live-ish)', () => {
    // No m.live / m.liveSource: goals arrived from OpenFootball post-match.
    const before = detectGoals(null, [{ num: 1, t1: 'A', t2: 'B', goals: { t1: [], t2: [] } }], {
      scope: 'all',
    }).next
    const after = [{ num: 1, t1: 'A', t2: 'B', goals: { t1: [goal('X', 10)], t2: [] } }]
    const { events } = detectGoals(before, after, { scope: 'all' })
    expect(events).toEqual([])
  })

  it('still fires for a just-finished match overlaid from ESPN (liveSource)', () => {
    const before = detectGoals(null, [live(1, 'A', 'B')], { scope: 'all' }).next
    const after = [
      { num: 1, t1: 'A', t2: 'B', liveSource: true, score: [1, 0], goals: { t1: [goal('X', 90)], t2: [] } },
    ]
    const { events } = detectGoals(before, after, { scope: 'all' })
    expect(events).toHaveLength(1)
  })

  describe('scope', () => {
    const followed = new Set(['Spain'])
    const seed = () => detectGoals(null, [live(1, 'Spain', 'Cape Verde'), live(2, 'France', 'Senegal')], { scope: 'followed', followed }).next
    const next = [live(1, 'Spain', 'Cape Verde', [goal('Pedri', 23)]), live(2, 'France', 'Senegal', [goal('Mbappé', 30)])]

    it("'followed' notifies only on matches with a starred team", () => {
      const { events } = detectGoals(seed(), next, { scope: 'followed', followed })
      expect(events).toHaveLength(1)
      expect(events[0].match.t1).toBe('Spain')
    })

    it("'all' notifies on every live match", () => {
      const { events } = detectGoals(seed(), next, { scope: 'all', followed })
      expect(events).toHaveLength(2)
    })
  })
})

describe('helpers', () => {
  it('goalKeys covers both teams', () => {
    expect(goalKeys(live(1, 'A', 'B', [goal('X', 10)], [goal('Y', 20)])).size).toBe(2)
  })
  it('isLiveish is true for in-progress or ESPN-overlaid, false otherwise', () => {
    expect(isLiveish({ live: {} })).toBe(true)
    expect(isLiveish({ liveSource: true })).toBe(true)
    expect(isLiveish({ score: [1, 0] })).toBe(false)
  })
  it('inScope respects followed teams unless scope is all', () => {
    const m = { t1: 'Spain', t2: 'Cape Verde' }
    expect(inScope(m, 'followed', new Set(['Spain']))).toBe(true)
    expect(inScope(m, 'followed', new Set(['Brazil']))).toBe(false)
    expect(inScope(m, 'all', new Set())).toBe(true)
  })
})

describe('goalNotification', () => {
  it('formats a standard goal with scorer, minute, and score line', () => {
    const m = { num: 13, t1: 'Spain', t2: 'Cape Verde', score: [1, 0] }
    const n = goalNotification({ match: m, side: 't1', goal: goal('Pedri', 23) })
    expect(n.title).toBe('⚽ GOAL — Spain')
    expect(n.body).toBe("Pedri 23'\nSpain 1–0 Cape Verde")
    expect(n.tag).toContain('13')
  })

  it('marks penalties, own goals, and stoppage time', () => {
    const m = { num: 1, t1: 'A', t2: 'B', score: [0, 1] }
    const pen = goalNotification({ match: m, side: 't2', goal: goal('Kane', 90, { extra: 4, penalty: true }) })
    expect(pen.body).toContain("(pen) 90+4'")
    const og = goalNotification({ match: m, side: 't1', goal: goal('Smith', 55, { og: true }) })
    expect(og.body).toContain('(OG)')
  })

  it('falls back to the team name when the scorer is unknown', () => {
    const m = { num: 1, t1: 'A', t2: 'B', score: [1, 0] }
    const n = goalNotification({ match: m, side: 't1', goal: goal('', 12) })
    expect(n.body.startsWith("A 12'")).toBe(true)
  })
})
