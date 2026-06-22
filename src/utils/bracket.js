// Knockout bracket layout. The "Winner Match N" feed labels don't line up by
// adjacent match number, so we hard-order each round so that the boxes that
// feed a later box sit next to each other vertically — producing a readable
// two-sided bracket that meets at the Final.

export const BRACKET = {
  left: {
    R32: [74, 77, 73, 75, 83, 84, 81, 82],
    R16: [89, 90, 93, 94],
    QF: [97, 98],
    SF: [101],
  },
  final: [104],
  right: {
    SF: [102],
    QF: [99, 100],
    R16: [91, 92, 95, 96],
    R32: [76, 78, 79, 80, 86, 88, 85, 87],
  },
  third: [103],
}

// Single-sided pyramid: columns flow left→right R32 → R16 → QF → SF → Final,
// with the 3rd-place match shown under the Final (no connectors). Each round is
// the old left-half stacked on top of the old right-half, so feeder boxes stay
// vertically adjacent and the connectors meet cleanly.
export const BRACKET_LINEAR = {
  R32: [...BRACKET.left.R32, ...BRACKET.right.R32],
  R16: [...BRACKET.left.R16, ...BRACKET.right.R16],
  QF: [...BRACKET.left.QF, ...BRACKET.right.QF],
  SF: [...BRACKET.left.SF, ...BRACKET.right.SF],
  Final: [...BRACKET.final],
  third: [...BRACKET.third],
}

export function matchesByNum(matches) {
  return matches.reduce((acc, m) => {
    acc[m.num] = m
    return acc
  }, {})
}

// Map each group letter to the Round-of-32 match its winner / runner-up feed
// into, parsed from the R32 placeholder labels ("Winner Group A" etc.). Third-
// place routes are intentionally omitted: a group's 3rd-placed team can land in
// one of several ties depending on which third-placed teams advance.
const WINNER_LABEL = /^Winner Group ([A-L])$/
const RUNNERUP_LABEL = /^Runner-up Group ([A-L])$/

export function groupSlotMap(matches) {
  const map = {}
  const slot = (g) => (map[g] ||= { win: null, runnerUp: null })
  for (const m of matches) {
    if (m.stage !== 'R32') continue
    for (const side of [m.t1, m.t2]) {
      let hit = WINNER_LABEL.exec(side)
      if (hit) { slot(hit[1]).win = m.num; continue }
      hit = RUNNERUP_LABEL.exec(side)
      if (hit) slot(hit[1]).runnerUp = m.num
    }
  }
  return map
}
