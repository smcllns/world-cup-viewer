import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { groupSlotMap } from '../src/utils/bracket.js'

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
