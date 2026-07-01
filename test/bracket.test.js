import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { groupSlotMap, knockoutWinner, knockoutLoser, resolveKnockoutSlots } from '../src/utils/bracket.js'

describe('groupSlotMap', () => {
  const map = groupSlotMap(MATCHES)

  it('maps every group to a Round-of-32 winner and runner-up slot', () => {
    for (const g of Object.keys(TEAMS)) {
      expect(map[g]).toBeTruthy()
      expect(typeof map[g].win).toBe('number')
      expect(typeof map[g].runnerUp).toBe('number')
    }
  })

  it('resolves the documented slots for Group A', () => {
    // M79 = "Winner Group A"; M73 = "Runner-up Group A".
    expect(map['A']).toEqual({ win: 79, runnerUp: 73 })
  })
})

describe('knockoutWinner', () => {
  it('picks the higher score in regulation', () => {
    expect(knockoutWinner({ t1: 'France', t2: 'Sweden', score: [3, 0] })).toBe('France')
    expect(knockoutWinner({ t1: 'South Africa', t2: 'Canada', score: [0, 1] })).toBe('Canada')
  })

  it('breaks a level score by penalty shootout', () => {
    expect(knockoutWinner({ t1: 'Germany', t2: 'Paraguay', score: [1, 1], pens: [3, 4] })).toBe('Paraguay')
    expect(knockoutWinner({ t1: 'Netherlands', t2: 'Morocco', score: [1, 1], pens: [2, 3] })).toBe('Morocco')
  })

  it('returns null when undecided or still a placeholder', () => {
    expect(knockoutWinner({ t1: 'France', t2: 'Sweden' })).toBeNull() // no score yet
    expect(knockoutWinner({ t1: 'France', t2: 'Sweden', score: [1, 1] })).toBeNull() // level, no pens
    expect(knockoutWinner({ t1: 'Winner Match 74', t2: 'France', score: [2, 0] })).toBeNull() // winner is a placeholder
  })
})

describe('knockoutLoser', () => {
  it('is the beaten side of a decided match', () => {
    expect(knockoutLoser({ t1: 'France', t2: 'Sweden', score: [3, 0] })).toBe('Sweden')
    expect(knockoutLoser({ t1: 'Germany', t2: 'Paraguay', score: [1, 1], pens: [3, 4] })).toBe('Germany')
  })

  it('returns null when undecided', () => {
    expect(knockoutLoser({ t1: 'France', t2: 'Sweden' })).toBeNull()
    expect(knockoutLoser({ t1: 'France', t2: 'Sweden', score: [1, 1] })).toBeNull()
  })
})

describe('resolveKnockoutSlots', () => {
  it('propagates decided knockout winners into the next round', () => {
    const matches = [
      { num: 73, stage: 'R32', t1: 'South Africa', t2: 'Canada', score: [0, 1] },
      { num: 74, stage: 'R32', t1: 'Germany', t2: 'Paraguay', score: [1, 1], pens: [3, 4] },
      { num: 75, stage: 'R32', t1: 'Netherlands', t2: 'Morocco', score: [1, 1], pens: [2, 3] },
      { num: 77, stage: 'R32', t1: 'France', t2: 'Sweden', score: [3, 0] },
      { num: 89, stage: 'R16', t1: 'Winner Match 74', t2: 'Winner Match 77' },
      { num: 90, stage: 'R16', t1: 'Winner Match 73', t2: 'Winner Match 75' },
    ]
    const out = resolveKnockoutSlots(matches)
    const byNum = Object.fromEntries(out.map((m) => [m.num, m]))
    expect(byNum[89].t1).toBe('Paraguay')
    expect(byNum[89].t2).toBe('France')
    expect(byNum[90].t1).toBe('Canada')
    expect(byNum[90].t2).toBe('Morocco')
  })

  it('cascades a winner through multiple rounds in one pass', () => {
    const matches = [
      { num: 73, stage: 'R32', t1: 'South Africa', t2: 'Canada', score: [0, 1] },
      { num: 75, stage: 'R32', t1: 'Netherlands', t2: 'Morocco', score: [1, 1], pens: [2, 3] },
      { num: 90, stage: 'R16', t1: 'Winner Match 73', t2: 'Winner Match 75', score: [2, 1] },
      { num: 97, stage: 'QF', t1: 'Winner Match 89', t2: 'Winner Match 90' },
    ]
    const out = resolveKnockoutSlots(matches)
    const byNum = Object.fromEntries(out.map((m) => [m.num, m]))
    // M90 becomes Canada v Morocco, Canada wins 2–1, and flows into M97.
    expect(byNum[90].t1).toBe('Canada')
    expect(byNum[97].t2).toBe('Canada')
    expect(byNum[97].t1).toBe('Winner Match 89') // still unresolved — feeder undecided
  })

  it('feeds the beaten semifinalists into the third-place match', () => {
    const matches = [
      { num: 101, stage: 'SF', t1: 'Argentina', t2: 'France', score: [0, 1] },
      { num: 102, stage: 'SF', t1: 'Brazil', t2: 'Spain', score: [2, 2], pens: [4, 5] },
      { num: 103, stage: '3rd', t1: 'Loser Match 101', t2: 'Loser Match 102' },
      { num: 104, stage: 'Final', t1: 'Winner Match 101', t2: 'Winner Match 102' },
    ]
    const byNum = Object.fromEntries(resolveKnockoutSlots(matches).map((m) => [m.num, m]))
    expect(byNum[103].t1).toBe('Argentina') // lost SF 101
    expect(byNum[103].t2).toBe('Brazil') // lost SF 102 on penalties
    expect(byNum[104].t1).toBe('France') // won SF 101
    expect(byNum[104].t2).toBe('Spain') // won SF 102 on penalties
  })

  it('does not propagate a placeholder as a loser when a side is unresolved', () => {
    // The feed can attach a score to a knockout match before both team names
    // resolve (score is set independently of isRealTeam). The beaten side must
    // not be pushed into the third-place match as a raw placeholder.
    const matches = [
      { num: 101, stage: 'SF', t1: 'Winner Match 97', t2: 'Spain', score: [0, 2] },
      { num: 103, stage: '3rd', t1: 'Loser Match 101', t2: 'Loser Match 102' },
      { num: 104, stage: 'Final', t1: 'Winner Match 101', t2: 'Winner Match 102' },
    ]
    const byNum = Object.fromEntries(resolveKnockoutSlots(matches).map((m) => [m.num, m]))
    expect(byNum[104].t1).toBe('Spain') // winner still resolves
    expect(byNum[103].t1).toBe('Loser Match 101') // loser stays a placeholder, not "Winner Match 97"
  })

  it('leaves the array untouched when nothing has resolved', () => {
    const matches = [{ num: 89, stage: 'R16', t1: 'Winner Match 74', t2: 'Winner Match 77' }]
    expect(resolveKnockoutSlots(matches)).toBe(matches)
  })
})
