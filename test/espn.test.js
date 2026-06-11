import { describe, it, expect, vi } from 'vitest'
import { fetchLive, applyLive, espnFinalScore } from '../src/services/espn.js'
import { pairKey } from '../src/services/results.js'
import { MATCHES } from '../src/data/matches.js'

const match1 = MATCHES.find((m) => m.num === 1) // Mexico v South Africa
const instOf = (m) => 'inst:' + new Date(m.ko).getTime()

// Minimal ESPN scoreboard shape (one competition per event).
const event = ({ date, state, clock, home, hs, away, as }) => ({
  date,
  status: { displayClock: clock, type: { state, shortDetail: clock, description: state } },
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { displayName: home }, score: hs },
        { homeAway: 'away', team: { displayName: away }, score: as },
      ],
    },
  ],
})

describe('fetchLive (parsing ESPN shape)', () => {
  it('parses live score, clock, and keys by pair + instant; maps ESPN aliases', async () => {
    const feed = {
      events: [
        event({ date: '2026-06-11T19:00Z', state: 'in', clock: "67'", home: 'Mexico', hs: '2', away: 'South Africa', as: '1' }),
        // ESPN alias: "United States" -> "USA"; pre-match has no score.
        event({ date: '2026-06-13T16:00Z', state: 'pre', clock: '0\'', home: 'United States', hs: '0', away: 'Paraguay', as: '0' }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))

    const map = await fetchLive()

    const rec = map.get(pairKey('Mexico', 'South Africa'))
    expect(rec.score).toEqual([2, 1])
    expect(rec.state).toBe('in')
    expect(rec.clock).toBe("67'")
    // Also addressable by kickoff instant.
    expect(map.get('inst:' + new Date('2026-06-11T19:00Z').getTime())).toBe(rec)

    // Alias resolved, and a pre-match carries a null score.
    const usa = map.get(pairKey('USA', 'Paraguay'))
    expect(usa.score).toBeNull()
    expect(usa.state).toBe('pre')
  })

  it('throws on a non-OK response', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 502 }))
    await expect(fetchLive()).rejects.toThrow(/502/)
  })
})

describe('applyLive (overlay onto the merged schedule)', () => {
  it('overlays a live score oriented to our team order and sets match.live', () => {
    // ESPN reports South Africa as home — our order is (Mexico, South Africa).
    const map = new Map([
      [pairKey('Mexico', 'South Africa'), { home: 'South Africa', away: 'Mexico', score: [1, 2], state: 'in', clock: "67'", detail: '2nd Half' }],
    ])
    const merged = applyLive(MATCHES, map)
    const m = merged.find((x) => x.num === 1)
    expect(m.score).toEqual([2, 1]) // flipped to (Mexico, South Africa)
    expect(m.live).toEqual({ clock: "67'", detail: '2nd Half' })
    expect(m.liveSource).toBe(true)
  })

  it('defers to OpenFootball: a match that already has a score is untouched', () => {
    const withScore = MATCHES.map((m) => (m.num === 1 ? { ...m, score: [0, 0] } : m))
    const map = new Map([
      [pairKey('Mexico', 'South Africa'), { home: 'Mexico', away: 'South Africa', score: [2, 1], state: 'in', clock: "80'" }],
    ])
    const merged = applyLive(withScore, map)
    const m = merged.find((x) => x.num === 1)
    expect(m.score).toEqual([0, 0]) // OpenFootball wins
    expect(m.live).toBeUndefined()
  })

  it('resolves a knockout placeholder by kickoff instant and overlays its score', () => {
    const ko = MATCHES.find((m) => m.num === 73) // Round of 32, placeholder teams
    const map = new Map([
      [instOf(ko), { home: 'Spain', away: 'Morocco', score: [1, 0], state: 'in', clock: "30'", detail: '1st Half' }],
    ])
    const merged = applyLive(MATCHES, map)
    const m = merged.find((x) => x.num === 73)
    expect(m.t1).toBe('Spain')
    expect(m.t2).toBe('Morocco')
    expect(m.score).toEqual([1, 0])
    expect(m.live.clock).toBe("30'")
  })

  it('returns the input unchanged when there is no live data', () => {
    expect(applyLive(MATCHES, null)).toBe(MATCHES)
    expect(applyLive(MATCHES, new Map())).toBe(MATCHES)
  })
})

describe('espnFinalScore (getter for the reconciler)', () => {
  it('returns an oriented final only once the match is post', () => {
    const inProgress = new Map([
      [pairKey('Mexico', 'South Africa'), { home: 'Mexico', away: 'South Africa', score: [1, 0], state: 'in' }],
    ])
    expect(espnFinalScore(match1, inProgress)).toBeNull()

    const done = new Map([
      [pairKey('Mexico', 'South Africa'), { home: 'Mexico', away: 'South Africa', score: [2, 1], state: 'post' }],
    ])
    expect(espnFinalScore(match1, done)).toEqual({ home: 'Mexico', away: 'South Africa', ft: [2, 1] })
  })
})
