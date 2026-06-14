import { describe, it, expect } from 'vitest'
import { windowStatus, WINDOW_START_MIN, WINDOW_END_MIN } from '../scripts/active-window.mjs'

const KO = Date.parse('2026-06-20T18:00:00Z')
const at = (min) => KO + min * 60_000
const matches = [{ ko: '2026-06-20T18:00:00Z' }]

describe('windowStatus', () => {
  it('is IDLE before the window, counting down to its start', () => {
    expect(windowStatus(matches, at(0))).toEqual({ state: 'IDLE', seconds: WINDOW_START_MIN * 60 })
    expect(windowStatus(matches, at(WINDOW_START_MIN - 10))).toEqual({ state: 'IDLE', seconds: 10 * 60 })
  })

  it('is ACTIVE inside the window, counting down to its end', () => {
    expect(windowStatus(matches, at(WINDOW_START_MIN))).toEqual({
      state: 'ACTIVE',
      seconds: (WINDOW_END_MIN - WINDOW_START_MIN) * 60,
    })
    expect(windowStatus(matches, at(120))).toEqual({ state: 'ACTIVE', seconds: (WINDOW_END_MIN - 120) * 60 })
  })

  it('is IDLE with -1 once every window has passed', () => {
    expect(windowStatus(matches, at(WINDOW_END_MIN + 5))).toEqual({ state: 'IDLE', seconds: -1 })
  })

  it('extends the ACTIVE end across overlapping matches', () => {
    const two = [{ ko: '2026-06-20T18:00:00Z' }, { ko: '2026-06-20T18:30:00Z' }]
    // At +120: first window [85,180] and second [115,210] both active → ends at the later (210).
    expect(windowStatus(two, at(120))).toEqual({ state: 'ACTIVE', seconds: (210 - 120) * 60 })
  })

  it('points at the nearest upcoming window when several are ahead', () => {
    const two = [{ ko: '2026-06-20T22:00:00Z' }, { ko: '2026-06-20T18:30:00Z' }]
    // From +0 (18:00), the 18:30 match's window starts first (at 18:30 + 85m).
    const res = windowStatus(two, at(0))
    expect(res.state).toBe('IDLE')
    expect(res.seconds).toBe((30 + WINDOW_START_MIN) * 60)
  })

  it('is IDLE -1 with no matches at all', () => {
    expect(windowStatus([], at(0))).toEqual({ state: 'IDLE', seconds: -1 })
  })

  it('treats the exact window end as no-longer-active (half-open interval)', () => {
    // At exactly +END, this match is done and there is nothing after it.
    expect(windowStatus(matches, at(WINDOW_END_MIN))).toEqual({ state: 'IDLE', seconds: -1 })
  })

  it('ignores far-future matches when an earlier window is already active', () => {
    const two = [{ ko: '2026-06-20T18:00:00Z' }, { ko: '2026-06-21T18:00:00Z' }]
    expect(windowStatus(two, at(120))).toEqual({ state: 'ACTIVE', seconds: (WINDOW_END_MIN - 120) * 60 })
  })
})
