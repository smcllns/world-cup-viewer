import { describe, it, expect } from 'vitest'
import {
  applyEdit,
  fmtSide,
  scorerBlock,
  buildScore,
  goalToken,
  parseClock,
  orientFt,
  lineRegex,
  cupName,
} from '../scripts/cuptxt.mjs'

// A slice of cup.txt that mirrors the real file's exact spacing — scored lines,
// unscored lines (" v "), special-character team names, and a knockout line
// still on placeholder names. Tests edit THIS and assert the result is in the
// file's house style and in the right place.
const FIXTURE = `▪ Group A
Thu June 11
  13:00 UTC-6     Mexico  2-0 (1-0)  South Africa        @ Mexico City
               (Julián Quiñones 9' Raúl Jiménez 67')
  20:00 UTC-6     South Korea  v Czech Republic     @ Guadalajara (Zapopan)
Thu June 18
  12:00 UTC-4     Czech Republic    v South Africa   @ Atlanta

▪ Group B
Sat June 13
  12:00 UTC-7     Qatar    v Switzerland        @ San Francisco Bay Area (Santa Clara)
  15:00 UTC-4     Canada   v Bosnia & Herzegovina    @ Toronto

▪ Round of 16
Sun June 28
  16:00 UTC-4    Winner Group A   v Runner-up Group B   @ Los Angeles (Inglewood)

▪ Final
Sun July 19
  15:00 UTC-4    Argentina   v France   @ New York/New Jersey (East Rutherford)
`

const goal = (name, minute, extra, opts = {}) => ({ name, minute, extra, pen: false, og: false, ...opts })

describe('cup.txt low-level formatting', () => {
  it('parseClock handles plain and stoppage minutes', () => {
    expect(parseClock("17'")).toEqual({ minute: 17, extra: undefined })
    expect(parseClock("90'+4'")).toEqual({ minute: 90, extra: 4 })
    expect(parseClock('')).toEqual({ minute: null, extra: undefined })
  })

  it('goalToken renders plain, stoppage, penalty, and own-goal markers', () => {
    expect(goalToken(goal('A', 23))).toBe("23'")
    expect(goalToken(goal('A', 45, 2))).toBe("45+2'")
    expect(goalToken(goal('A', 16, undefined, { pen: true }))).toBe("16' (pen.)")
    expect(goalToken(goal('A', 7, undefined, { og: true }))).toBe("7'(OG)")
  })

  it('fmtSide comma-merges repeat scorers and space-joins distinct ones', () => {
    expect(fmtSide([goal('Folarin Balogun', 31), goal('Folarin Balogun', 45, 5)])).toBe(
      "Folarin Balogun 31', 45+5'",
    )
    expect(fmtSide([goal('Enner Valencia', 16, undefined, { pen: true }), goal('Enner Valencia', 31)])).toBe(
      "Enner Valencia 16' (pen.), 31'",
    )
    expect(fmtSide([goal('Hwang In-Beom', 67), goal('Oh Hyeon-Gyu', 80)])).toBe(
      "Hwang In-Beom 67' Oh Hyeon-Gyu 80'",
    )
  })

  it('scorerBlock uses two lines + ";" only when both teams scored', () => {
    expect(scorerBlock([goal('Cyle Larin', 78)], [goal('Jovo Lukić', 21)])).toBe(
      "                    (Cyle Larin 78';\n                       Jovo Lukić 21')",
    )
    // one-sided: single line, no semicolon
    expect(scorerBlock([goal('A', 10), goal('B', 20)], [])).toBe("                    (A 10' B 20')")
    expect(scorerBlock([], [goal('C', 30)])).toBe("                    (C 30')")
    expect(scorerBlock([], [])).toBeNull()
  })
})

describe('applyEdit — format + placement', () => {
  it('fills the Qatar v Switzerland line with FT (HT) + scorers, in place', () => {
    const res = applyEdit(FIXTURE, {
      t1: 'Qatar',
      t2: 'Switzerland',
      ft: [1, 1],
      t1Goals: [goal('Boualem Khoukhi', 90, 4)],
      t2Goals: [goal('Breel Embolo', 17, undefined, { pen: true })],
    })
    expect(res.applied).toBe(true)
    expect(res.withDetail).toBe(true)
    expect(res.newBlock).toBe(
      '  12:00 UTC-7     Qatar    1-1 (0-1) Switzerland        @ San Francisco Bay Area (Santa Clara)\n' +
        "                    (Boualem Khoukhi 90+4';\n" +
        "                       Breel Embolo 17' (pen.))",
    )
    // Placement: the scorer block sits directly above the next match line, and
    // nothing else in the file moved.
    expect(res.text).toContain(
      "                       Breel Embolo 17' (pen.))\n  15:00 UTC-4     Canada   v Bosnia & Herzegovina    @ Toronto",
    )
    // The other unscored lines are untouched.
    expect(res.text).toContain('  20:00 UTC-6     South Korea  v Czech Republic     @ Guadalajara (Zapopan)')
    expect(res.text).toContain('  16:00 UTC-4    Winner Group A   v Runner-up Group B   @ Los Angeles (Inglewood)')
  })

  it('reorients score + scorers to the team listed first on the cup.txt line', () => {
    // cup.txt lists "Czech Republic v South Africa"; our schedule order is the
    // reverse (t1=South Africa, t2=Czech Republic). The written line must follow
    // the FILE's order: Czech Republic home.
    const res = applyEdit(FIXTURE, {
      t1: 'South Africa',
      t2: 'Czech Republic',
      ft: [0, 2], // South Africa 0, Czech Republic 2
      t1Goals: [],
      t2Goals: [goal('Patrik Schick', 30), goal('Patrik Schick', 70)],
    })
    expect(res.applied).toBe(true)
    // Czech Republic is home on the line → "2-2"? no: Czech scored 2, SA 0 → "2-0".
    expect(res.newBlock.split('\n')[0]).toContain('Czech Republic    2-0 (1-0) South Africa')
    // One-sided block, Czech scorers only, single line.
    expect(res.newBlock).toContain("                    (Patrik Schick 30', 70')")
  })

  it('handles special characters in team names (regex-escaped)', () => {
    const res = applyEdit(FIXTURE, {
      t1: 'Canada',
      t2: 'Bosnia & Herzegovina',
      ft: [1, 0],
      t1Goals: [goal('Jonathan David', 55)],
      t2Goals: [],
    })
    expect(res.applied).toBe(true)
    expect(res.newBlock.split('\n')[0]).toContain('Canada   1-0 (0-0) Bosnia & Herzegovina')
    expect(res.newBlock).toContain("                    (Jonathan David 55')")
  })

  it('writes a valid score-only line when goals are unavailable', () => {
    const res = applyEdit(FIXTURE, { t1: 'Qatar', t2: 'Switzerland', ft: [1, 1] })
    expect(res.applied).toBe(true)
    expect(res.withDetail).toBe(false)
    expect(res.newBlock).toBe(
      '  12:00 UTC-7     Qatar    1-1 Switzerland        @ San Francisco Bay Area (Santa Clara)',
    )
  })

  it('falls back to score-only when goals do not reconcile with the final', () => {
    // ft says 1-1 but only one goal supplied → cannot trust HT/scorers.
    const res = applyEdit(FIXTURE, {
      t1: 'Qatar',
      t2: 'Switzerland',
      ft: [1, 1],
      t1Goals: [goal('Boualem Khoukhi', 90, 4)],
      t2Goals: [],
    })
    expect(res.applied).toBe(true)
    expect(res.withDetail).toBe(false)
    // Score-only: a single match line, no scorer-block line appended.
    expect(res.newBlock.split('\n')).toHaveLength(1)
    expect(res.newBlock).toContain('Qatar    1-1 Switzerland')
  })

  it('computes half-time from goal minutes (45+x is first half, 90+x is not)', () => {
    const res = applyEdit(FIXTURE, {
      t1: 'Qatar',
      t2: 'Switzerland',
      ft: [2, 1],
      t1Goals: [goal('A', 45, 2), goal('B', 80)], // one first-half, one second
      t2Goals: [goal('C', 10)], // first-half
    })
    expect(res.newBlock.split('\n')[0]).toContain('Qatar    2-1 (1-1) Switzerland')
  })

  it('is idempotent: an already-scored line is not matched again', () => {
    // The Mexico line already carries "2-0 (1-0)" in the fixture.
    const res = applyEdit(FIXTURE, { t1: 'Mexico', t2: 'South Africa', ft: [2, 0] })
    expect(res.applied).toBe(false)
    expect(res.reason).toBe('line-not-found')
  })

  it('skips knockout lines still on placeholder names', () => {
    const res = applyEdit(FIXTURE, { t1: 'France', t2: 'Brazil', ft: [1, 0] })
    expect(res.applied).toBe(false)
    expect(res.reason).toBe('line-not-found')
  })

  it('renders own goals with the 2026 (OG) marker under the scoring team', () => {
    const res = applyEdit(FIXTURE, {
      t1: 'Qatar',
      t2: 'Switzerland',
      ft: [1, 1],
      // Qatar's goal is an own goal by a Switzerland player, credited to Qatar.
      t1Goals: [goal('Manuel Akanji', 30, undefined, { og: true })],
      t2Goals: [goal('Breel Embolo', 60)],
    })
    expect(res.newBlock).toContain("(Manuel Akanji 30'(OG);")
    expect(res.newBlock).toContain("Breel Embolo 60')")
  })

  it('matches the file’s CRLF line endings (no mixed endings introduced)', () => {
    const crlf = FIXTURE.replace(/\n/g, '\r\n')
    const res = applyEdit(crlf, {
      t1: 'Qatar',
      t2: 'Switzerland',
      ft: [1, 1],
      t1Goals: [goal('Boualem Khoukhi', 90, 4)],
      t2Goals: [goal('Breel Embolo', 17, undefined, { pen: true })],
    })
    expect(res.applied).toBe(true)
    // The inserted block uses CRLF…
    expect(res.newBlock).toContain("90+4';\r\n")
    // …and the file as a whole never contains a bare LF.
    expect(res.text.includes('\n')).toBe(true)
    expect(/[^\r]\n/.test(res.text)).toBe(false)
  })

  it('does not corrupt the rest of the file (only the matched line changes)', () => {
    const res = applyEdit(FIXTURE, { t1: 'Qatar', t2: 'Switzerland', ft: [1, 1] })
    // Everything before Group B is byte-for-byte identical.
    const head = FIXTURE.slice(0, FIXTURE.indexOf('▪ Group B'))
    expect(res.text.startsWith(head)).toBe(true)
  })
})

describe('buildScore', () => {
  it('renders regulation, a.e.t., and a.e.t. + penalties', () => {
    expect(buildScore([2, 1])).toBe('2-1')
    expect(buildScore([2, 0], { ht: [1, 0] })).toBe('2-0 (1-0)')
    expect(buildScore([2, 1], { ht: [1, 0], ft90: [1, 1], aet: true })).toBe('2-1 a.e.t. (1-0, 1-1)')
    expect(buildScore([3, 3], { ht: [2, 0], ft90: [2, 2], aet: true, pens: [4, 2] })).toBe(
      '3-3 a.e.t. (2-0, 2-2), 4-2 pen.',
    )
  })
})

describe('applyEdit — knockouts (a.e.t. / penalties)', () => {
  // The 2022 final, verified against ESPN: Argentina 3-3 a.e.t. (2-0, 2-2),
  // 4-2 pens. Shootout kicks are excluded from the goals passed in.
  const argentina = [
    { name: 'Lionel Messi', minute: 23, pen: true, og: false },
    { name: 'Ángel Di María', minute: 36, pen: false, og: false },
    { name: 'Lionel Messi', minute: 108, pen: false, og: false },
  ]
  const france = [
    { name: 'Kylian Mbappé', minute: 80, pen: true, og: false },
    { name: 'Kylian Mbappé', minute: 81, pen: false, og: false },
    { name: 'Kylian Mbappé', minute: 118, pen: true, og: false },
  ]

  it('writes the full a.e.t. + penalty line with extra-time-aware HT/FT90', () => {
    const res = applyEdit(FIXTURE, {
      t1: 'Argentina',
      t2: 'France',
      ft: [3, 3],
      t1Goals: argentina,
      t2Goals: france,
      aet: true,
      pens: [4, 2],
    })
    expect(res.applied).toBe(true)
    expect(res.newBlock.split('\n')[0]).toContain(
      'Argentina   3-3 a.e.t. (2-0, 2-2), 4-2 pen. France',
    )
    // Non-consecutive repeat scorer (Messi 23', then Di María, then Messi 108')
    // lists the name twice; consecutive (Mbappé) comma-merges.
    expect(res.newBlock).toContain(
      "(Lionel Messi 23' (pen.) Ángel Di María 36' Lionel Messi 108';",
    )
    expect(res.newBlock).toContain("Kylian Mbappé 80' (pen.), 81', 118' (pen.))")
  })

  it('writes a.e.t. without a pen. suffix when the tie is settled in extra time', () => {
    const res = applyEdit(FIXTURE, {
      t1: 'Argentina',
      t2: 'France',
      ft: [2, 1],
      t1Goals: [
        { name: 'A', minute: 20, pen: false, og: false },
        { name: 'B', minute: 100, pen: false, og: false },
      ],
      t2Goals: [{ name: 'C', minute: 30, pen: false, og: false }],
      aet: true,
    })
    expect(res.newBlock.split('\n')[0]).toContain('Argentina   2-1 a.e.t. (1-1, 1-1) France')
  })

  it('treats a knockout decided in regulation like any other match', () => {
    const res = applyEdit(FIXTURE, {
      t1: 'Argentina',
      t2: 'France',
      ft: [2, 0],
      t1Goals: [
        { name: 'A', minute: 10, pen: false, og: false },
        { name: 'B', minute: 70, pen: false, og: false },
      ],
      t2Goals: [],
    })
    expect(res.newBlock.split('\n')[0]).toContain('Argentina   2-0 (1-0) France')
    expect(res.newBlock).not.toContain('a.e.t.')
  })

  it('refuses to write a knockout it cannot reconcile (no bare score)', () => {
    const res = applyEdit(FIXTURE, {
      t1: 'Argentina',
      t2: 'France',
      ft: [3, 3],
      t1Goals: argentina, // only 3 here, but missing France goals
      t2Goals: [{ name: 'Kylian Mbappé', minute: 80, pen: true, og: false }],
      aet: true,
      pens: [4, 2],
    })
    expect(res.applied).toBe(false)
    expect(res.reason).toBe('knockout-unreconciled')
  })
})

describe('cup.txt name spelling', () => {
  it('maps the app’s official names to cup.txt’s match-line spellings', () => {
    expect(cupName('Türkiye')).toBe('Turkey')
    expect(cupName('Czechia')).toBe('Czech Republic')
    expect(cupName('Brazil')).toBe('Brazil') // unaffected
  })

  it('matches a cup.txt line by its spelling even when given the app name', () => {
    // The fixture line reads "Czech Republic v South Africa"; our feeds say "Czechia".
    // (This is the class of bug that left Australia v Türkiye unsynced.)
    const res = applyEdit(FIXTURE, {
      t1: 'Czechia',
      t2: 'South Africa',
      ft: [2, 0],
      t1Goals: [goal('A', 30), goal('B', 70)],
      t2Goals: [],
    })
    expect(res.applied).toBe(true)
    expect(res.newBlock.split('\n')[0]).toContain('Czech Republic    2-0 (1-0) South Africa')
  })
})

describe('orientFt', () => {
  const m = { t1: 'Qatar', t2: 'Switzerland' }
  it('keeps order when report home is t1', () => {
    expect(orientFt({ home: 'Qatar', away: 'Switzerland', ft: [1, 0] }, m)).toEqual([1, 0])
  })
  it('swaps when report home is t2', () => {
    expect(orientFt({ home: 'Switzerland', away: 'Qatar', ft: [1, 0] }, m)).toEqual([0, 1])
  })
  it('returns null when names do not match', () => {
    expect(orientFt({ home: 'Brazil', away: 'France', ft: [1, 0] }, m)).toBeNull()
  })
})

describe('lineRegex', () => {
  it('matches only unscored lines (with " v ")', () => {
    expect(lineRegex('Qatar', 'Switzerland').test(FIXTURE)).toBe(true)
    // A scored line (no " v ") must not match.
    expect(lineRegex('Mexico', 'South Africa').test(FIXTURE)).toBe(false)
  })
})
