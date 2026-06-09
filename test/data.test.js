import { describe, it, expect } from 'vitest'
import { MATCHES, STAGE_ORDER } from '../src/data/matches.js'
import { VENUES } from '../src/data/venues.js'
import { TEAMS, ALL_TEAMS } from '../src/data/teams.js'
import { BRACKET } from '../src/utils/bracket.js'
import { OFFICIAL_ET } from './fixtures/official-kickoffs.js'

// Render a kickoff instant as Eastern Time 'YYYY-MM-DD HH:mm' (24h), so it can
// be compared to the authoritative fixture regardless of how ko is stored.
function easternKey(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const g = (t) => parts.find((p) => p.type === t).value
  const hour = g('hour') === '24' ? '00' : g('hour') // midnight quirk
  return `${g('year')}-${g('month')}-${g('day')} ${hour}:${g('minute')}`
}

describe('schedule data integrity', () => {
  it('has all 104 matches', () => {
    expect(MATCHES).toHaveLength(104)
  })

  it('has the correct stage distribution', () => {
    const counts = MATCHES.reduce((a, m) => ((a[m.stage] = (a[m.stage] || 0) + 1), a), {})
    expect(counts).toEqual({ Group: 72, R32: 16, R16: 8, QF: 4, SF: 2, '3rd': 1, Final: 1 })
  })

  it('has unique match numbers 1–104', () => {
    const nums = MATCHES.map((m) => m.num).sort((a, b) => a - b)
    expect(new Set(nums).size).toBe(104)
    expect(nums[0]).toBe(1)
    expect(nums[103]).toBe(104)
  })

  it('references only known venues', () => {
    expect(MATCHES.every((m) => VENUES[m.venue])).toBe(true)
  })

  it('has a parseable kickoff instant for every match', () => {
    expect(MATCHES.every((m) => !Number.isNaN(new Date(m.ko).getTime()))).toBe(true)
  })

  it('is sorted chronologically', () => {
    for (let i = 1; i < MATCHES.length; i++) {
      expect(new Date(MATCHES[i].ko).getTime()).toBeGreaterThanOrEqual(
        new Date(MATCHES[i - 1].ko).getTime(),
      )
    }
  })

  it('every group match references a real team in its group', () => {
    for (const m of MATCHES.filter((m) => m.stage === 'Group')) {
      const names = TEAMS[m.group].map((t) => t.name)
      expect(names).toContain(m.t1)
      expect(names).toContain(m.t2)
    }
  })

  it('has 48 teams across 12 groups', () => {
    expect(Object.keys(TEAMS)).toHaveLength(12)
    expect(ALL_TEAMS).toHaveLength(48)
  })

  it('has 16 venues', () => {
    expect(Object.keys(VENUES)).toHaveLength(16)
  })

  it('bracket covers every knockout match exactly once', () => {
    const bracketNums = [
      ...BRACKET.left.R32, ...BRACKET.left.R16, ...BRACKET.left.QF, ...BRACKET.left.SF,
      ...BRACKET.final,
      ...BRACKET.right.SF, ...BRACKET.right.QF, ...BRACKET.right.R16, ...BRACKET.right.R32,
      ...BRACKET.third,
    ].sort((a, b) => a - b)
    const knockoutNums = MATCHES.filter((m) => m.stage !== 'Group')
      .map((m) => m.num)
      .sort((a, b) => a - b)
    expect(bracketNums).toEqual(knockoutNums)
  })

  it('exposes stages in tournament order', () => {
    expect(STAGE_ORDER).toEqual(['Group', 'R32', 'R16', 'QF', 'SF', '3rd', 'Final'])
  })
})

describe('kickoff times match the official schedule', () => {
  it('has an official ET kickoff for every match (and vice versa)', () => {
    const matchNums = MATCHES.map((m) => m.num).sort((a, b) => a - b)
    const fixtureNums = Object.keys(OFFICIAL_ET).map(Number).sort((a, b) => a - b)
    expect(fixtureNums).toEqual(matchNums)
  })

  it('every kickoff matches the official Eastern Time to the minute', () => {
    const wrong = MATCHES.filter((m) => easternKey(m.ko) !== OFFICIAL_ET[m.num]).map(
      (m) => `M${m.num}: data ${easternKey(m.ko)} ≠ official ${OFFICIAL_ET[m.num]}`,
    )
    expect(wrong).toEqual([])
  })

  it('every stored kickoff uses the -04:00 (US Eastern) offset', () => {
    // The schedule stores every instant in ET; a stray offset would silently
    // shift a game by hours (the class of bug this suite guards against).
    expect(MATCHES.filter((m) => !m.ko.endsWith('-04:00')).map((m) => m.num)).toEqual([])
  })

  it('every kickoff lands at a plausible local hour (11:00–23:59) at its venue', () => {
    const odd = MATCHES.filter((m) => {
      const h = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: VENUES[m.venue].tz, hour: '2-digit', hour12: false,
        }).format(new Date(m.ko)),
      ) % 24
      return h < 11 || h > 23
    }).map((m) => m.num)
    expect(odd).toEqual([])
  })
})
