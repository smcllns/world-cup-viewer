import { isRealTeam } from '../services/results.js'

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

// Winner of a decided knockout match, by team name — or null if it isn't settled
// yet (no final score, or a level score with no shootout) or a participant is
// still a placeholder. A penalty shootout breaks a level score.
export function knockoutWinner(m) {
  if (!Array.isArray(m.score)) return null
  const [a, b] = m.score
  let side = null
  if (a > b) side = m.t1
  else if (b > a) side = m.t2
  else if (m.pens) {
    if (m.pens[0] > m.pens[1]) side = m.t1
    else if (m.pens[1] > m.pens[0]) side = m.t2
  }
  return side && isRealTeam(side) ? side : null
}

// Beaten side of a decided knockout match (the semifinal losers feed the
// third-place match). Null under the same conditions as knockoutWinner.
export function knockoutLoser(m) {
  const w = knockoutWinner(m)
  if (!w) return null
  const loser = w === m.t1 ? m.t2 : m.t1
  return isRealTeam(loser) ? loser : null
}

// Fill "Winner Match N" / "Loser Match N" placeholders in later rounds with the
// actual result of match N once it's decided, so resolved teams flow all the way
// up the bracket (R32 → R16 → QF → SF → Final, plus the semifinal losers into the
// third-place match) without waiting for the feed to publish each downstream
// matchup. Feeder matches always carry a lower number than the match they feed,
// so a single ascending-number pass cascades in one go.
const MATCH_SLOT = /^(Winner|Loser) Match (\d+)$/
export function resolveKnockoutSlots(matches) {
  const winners = {} // match num -> winning team name
  const losers = {} // match num -> beaten team name
  const sub = (name) => {
    const hit = MATCH_SLOT.exec(name)
    if (!hit) return name
    return (hit[1] === 'Winner' ? winners : losers)[hit[2]] || name
  }
  let changed = false
  const byNum = {}
  for (const m of [...matches].sort((x, y) => x.num - y.num)) {
    const t1 = sub(m.t1)
    const t2 = sub(m.t2)
    const nm = t1 === m.t1 && t2 === m.t2 ? m : ((changed = true), { ...m, t1, t2 })
    const w = knockoutWinner(nm)
    if (w != null) {
      winners[nm.num] = w
      // Guard the loser the same way knockoutWinner guards the winner: a decided
      // match can still carry a placeholder on the beaten side (the feed sets a
      // score independently of resolving both team names), and we must not
      // propagate that placeholder into a "Loser Match N" slot.
      const loser = w === nm.t1 ? nm.t2 : nm.t1
      if (isRealTeam(loser)) losers[nm.num] = loser
    }
    byNum[m.num] = nm
  }
  // Preserve the caller's array order; return the original array untouched when
  // nothing resolved so referential-equality memoization still holds.
  return changed ? matches.map((m) => byNum[m.num]) : matches
}
