import { describe, it, expect } from 'vitest'
import {
  classifyMatch,
  parseEspnEventDetail,
  eqFt,
  ESPN_ONLY_AFTER_MIN,
} from '../scripts/autofill-core.mjs'

describe('classifyMatch', () => {
  const base = { ofFt: null, espnFt: null, sdbFt: null, minutesPastKickoff: 300 }

  it('skips when OpenFootball already has the final', () => {
    expect(classifyMatch({ ...base, ofFt: [1, 0], espnFt: [1, 0], sdbFt: [1, 0] })).toEqual({
      action: 'skip',
      reason: 'openfootball-has-it',
    })
  })

  it('syncs ✓✓ when both fallbacks agree', () => {
    expect(classifyMatch({ ...base, espnFt: [2, 1], sdbFt: [2, 1] })).toEqual({
      action: 'sync',
      conf: 'both',
    })
  })

  it('never auto-writes when the two sources disagree', () => {
    expect(classifyMatch({ ...base, espnFt: [2, 1], sdbFt: [1, 1] })).toEqual({
      action: 'skip',
      reason: 'sources-disagree',
    })
  })

  it('falls back to ESPN alone only once well past full time', () => {
    expect(
      classifyMatch({ ...base, espnFt: [0, 1], sdbFt: null, minutesPastKickoff: ESPN_ONLY_AFTER_MIN }),
    ).toEqual({ action: 'sync', conf: 'espn-only' })
    // ...but waits if it's still too soon
    expect(
      classifyMatch({ ...base, espnFt: [0, 1], sdbFt: null, minutesPastKickoff: ESPN_ONLY_AFTER_MIN - 1 }),
    ).toEqual({ action: 'wait', reason: 'awaiting-second-source' })
  })

  it('waits (never ESPN-only-style on TheSportsDB) when only the backup has it', () => {
    expect(classifyMatch({ ...base, espnFt: null, sdbFt: [1, 1], minutesPastKickoff: 999 })).toEqual({
      action: 'wait',
      reason: 'no-espn-final',
    })
  })

  it('waits when no source has the final yet', () => {
    expect(classifyMatch({ ...base, minutesPastKickoff: 999 })).toEqual({
      action: 'wait',
      reason: 'no-espn-final',
    })
  })

  it('eqFt compares score pairs and is null-safe', () => {
    expect(eqFt([1, 2], [1, 2])).toBe(true)
    expect(eqFt([1, 2], [2, 1])).toBe(false)
    expect(eqFt(null, [1, 2])).toBe(false)
    expect(eqFt([1, 2], null)).toBe(false)
  })
})

// Minimal ESPN scoreboard-event builder.
const goal = (teamId, clock, name, opts = {}) => ({
  scoringPlay: true,
  shootout: Boolean(opts.shootout),
  team: { id: teamId },
  clock: { displayValue: clock },
  athletesInvolved: [{ displayName: name }],
  penaltyKick: Boolean(opts.pen),
  ownGoal: Boolean(opts.og),
})
const event = ({ home, away, statusName = 'STATUS_FINAL', details = [], homeShootout, awayShootout }) => ({
  competitions: [
    {
      status: { type: { name: statusName } },
      competitors: [
        { homeAway: 'home', team: { id: 'H', displayName: home }, shootoutScore: homeShootout },
        { homeAway: 'away', team: { id: 'A', displayName: away }, shootoutScore: awayShootout },
      ],
      details,
    },
  ],
})

describe('parseEspnEventDetail', () => {
  it('returns null when the event is for different teams', () => {
    const ev = event({ home: 'Brazil', away: 'Morocco' })
    expect(parseEspnEventDetail(ev, { t1: 'Haiti', t2: 'Scotland' })).toBeNull()
  })

  it('parses a one-sided group result, oriented to t1/t2', () => {
    const ev = event({
      home: 'Haiti',
      away: 'Scotland',
      details: [goal('A', "28'", 'John McGinn')],
    })
    const d = parseEspnEventDetail(ev, { t1: 'Haiti', t2: 'Scotland' })
    expect(d.t1Goals).toEqual([])
    expect(d.t2Goals).toEqual([{ name: 'John McGinn', minute: 28, extra: undefined, pen: false, og: false }])
    expect(d.pens).toBeNull()
    expect(d.aet).toBe(false)
  })

  it('re-orients when our t1/t2 order is the reverse of ESPN home/away', () => {
    const ev = event({ home: 'Haiti', away: 'Scotland', details: [goal('A', "28'", 'John McGinn')] })
    const d = parseEspnEventDetail(ev, { t1: 'Scotland', t2: 'Haiti' })
    expect(d.t1Goals).toEqual([{ name: 'John McGinn', minute: 28, extra: undefined, pen: false, og: false }])
    expect(d.t2Goals).toEqual([])
  })

  it('flags an own goal', () => {
    const ev = event({ home: 'Haiti', away: 'Scotland', details: [goal('H', "40'", 'Own Goaler', { og: true })] })
    const d = parseEspnEventDetail(ev, { t1: 'Haiti', t2: 'Scotland' })
    expect(d.t1Goals[0].og).toBe(true)
  })

  it('parses a penalty shootout: excludes shootout kicks, captures pens + a.e.t.', () => {
    // Modelled on the 2022 final (Argentina 3-3 a.e.t., 4-2 pens).
    const ev = event({
      home: 'Argentina',
      away: 'France',
      statusName: 'STATUS_FINAL_PEN',
      homeShootout: '4',
      awayShootout: '2',
      details: [
        goal('H', "23'", 'Lionel Messi', { pen: true }),
        goal('H', "36'", 'Ángel Di María'),
        goal('A', "80'", 'Kylian Mbappé', { pen: true }),
        goal('A', "81'", 'Kylian Mbappé'),
        goal('H', "108'", 'Lionel Messi'),
        goal('A', "118'", 'Kylian Mbappé', { pen: true }),
        goal('H', "120'", 'Paulo Dybala', { shootout: true }), // shootout kick — must be excluded
        goal('A', "120'", 'Kingsley Coman', { shootout: true }),
      ],
    })
    const d = parseEspnEventDetail(ev, { t1: 'Argentina', t2: 'France' })
    expect(d.aet).toBe(true)
    expect(d.pens).toEqual([4, 2])
    expect(d.t1Goals.map((g) => `${g.name} ${g.minute}`)).toEqual([
      'Lionel Messi 23',
      'Ángel Di María 36',
      'Lionel Messi 108',
    ])
    expect(d.t2Goals.map((g) => g.minute)).toEqual([80, 81, 118])
    // No shootout taker leaked into the goal lists.
    expect(d.t1Goals.concat(d.t2Goals).some((g) => g.name === 'Paulo Dybala')).toBe(false)
  })

  it('infers a.e.t. from an extra-time goal even without a PEN status', () => {
    const ev = event({
      home: 'Spain',
      away: 'Germany',
      statusName: 'STATUS_FINAL', // not flagged AET, but a 105' goal implies it
      details: [goal('H', "105'", 'Someone')],
    })
    expect(parseEspnEventDetail(ev, { t1: 'Spain', t2: 'Germany' }).aet).toBe(true)
  })

  it('parses stoppage-time minutes', () => {
    const ev = event({ home: 'A', away: 'B', details: [goal('H', "45'+2'", 'X'), goal('A', "90'+4'", 'Y')] })
    const d = parseEspnEventDetail(ev, { t1: 'A', t2: 'B' })
    expect(d.t1Goals[0]).toMatchObject({ minute: 45, extra: 2 })
    expect(d.t2Goals[0]).toMatchObject({ minute: 90, extra: 4 })
    expect(d.aet).toBe(false) // 90+4 is regulation stoppage, not extra time
  })
})
