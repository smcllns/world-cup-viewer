import { describe, it, expect, vi } from 'vitest'
import { fetchLive, applyLive, espnFinalScore } from '../src/services/espn.js'
import { pairKey } from '../src/services/results.js'
import { MATCHES } from '../src/data/matches.js'

const match1 = MATCHES.find((m) => m.num === 1) // Mexico v South Africa
const instOf = (m) => 'inst:' + new Date(m.ko).getTime()

// Minimal ESPN scoreboard shape (one competition per event).
const event = ({ date, state, clock, home, hs, away, as, details }) => ({
  date,
  status: { displayClock: clock, type: { state, shortDetail: clock, description: state } },
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { id: 'H', displayName: home }, score: hs },
        { homeAway: 'away', team: { id: 'A', displayName: away }, score: as },
      ],
      details: details || [],
    },
  ],
})

// One ESPN scoring-play detail (team is 'H' or 'A').
const goal = ({ team, min, name, pen = false, og = false }) => ({
  type: { id: '70', text: 'Goal' },
  clock: { displayValue: `${min}'` },
  team: { id: team },
  scoringPlay: true,
  penaltyKick: pen,
  ownGoal: og,
  shootout: false,
  athletesInvolved: [{ shortName: name, displayName: name }],
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

  it('throws only when every scoreboard date request fails', async () => {
    // fetchLive now queries a few dates around now (yesterday/today/tomorrow) and
    // merges, so it's best-effort: it rejects only if none of them are reachable.
    global.fetch = vi.fn(async () => ({ ok: false, status: 502 }))
    await expect(fetchLive()).rejects.toThrow(/scoreboard|unreachable/i)
  })

  it('still returns a map when only one date slate responds', async () => {
    const feed = {
      events: [
        event({ date: '2026-06-14T04:00Z', state: 'in', clock: "43'", home: 'Australia', hs: '1', away: 'Türkiye', as: '0' }),
      ],
    }
    let n = 0
    global.fetch = vi.fn(async () => (n++ === 0 ? { ok: true, json: async () => feed } : { ok: false, status: 500 }))
    const map = await fetchLive()
    expect(map.get(pairKey('Australia', 'Türkiye')).score).toEqual([1, 0])
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

  it('parses cards and preserves stoppage-time minutes, oriented to our order', async () => {
    // ESPN home = South Africa (our t2), so events on team 'A' (Mexico, our t1).
    const feed = {
      events: [
        event({
          date: '2026-06-11T19:00Z', state: 'in', clock: "45'+2'",
          home: 'South Africa', hs: '0', away: 'Mexico', as: '1',
          details: [
            { type: { text: 'Goal' }, clock: { displayValue: "45'+2'" }, team: { id: 'A' }, scoringPlay: true, athletesInvolved: [{ shortName: 'J. Quiñones' }] },
            { type: { text: 'Yellow Card' }, clock: { displayValue: "40'" }, team: { id: 'A' }, yellowCard: true, athletesInvolved: [{ shortName: 'C. Montes' }] },
          ],
        }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const m = applyLive(MATCHES, await fetchLive()).find((x) => x.num === 1)

    expect(m.goals.t1).toEqual([{ name: 'J. Quiñones', minute: 45, extra: 2, penalty: false, og: false }])
    expect(m.cards.t1).toEqual([{ name: 'C. Montes', minute: 40, extra: undefined, color: 'yellow' }])
    // ...and the live label uses ESPN's shortDetail (so "HT"/"FT" show, not the clock).
    expect(m.live.clock).toBe("45'+2'")
  })

  it('parses goal events and orients the scorer timeline to our team order', async () => {
    // ESPN home = South Africa (away in our order), so goals must be flipped.
    const feed = {
      events: [
        event({
          date: '2026-06-11T19:00Z', state: 'in', clock: "31'",
          home: 'South Africa', hs: '0', away: 'Mexico', as: '1',
          details: [goal({ team: 'A', min: 9, name: 'J. Quiñones' })],
        }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchLive()

    const m = applyLive(MATCHES, map).find((x) => x.num === 1) // our order: Mexico v South Africa
    expect(m.score).toEqual([1, 0])
    expect(m.goals.t1).toEqual([{ name: 'J. Quiñones', minute: 9, penalty: false, og: false }])
    expect(m.goals.t2).toEqual([])
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
