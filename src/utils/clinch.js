// Clinch / elimination detection. For each group we enumerate every possible
// outcome of its remaining matches and ask what is already GUARANTEED for each
// team — using the exact FIFA tie-breakers in qualification.js (points → goal
// difference → goals scored → head-to-head). The cross-group "8 best third-
// placed teams" race is resolved with sound per-group bounds.
//
// Design rule: NEVER over-claim. When a situation is too large to enumerate
// exactly (early in the group stage there are too many permutations), or a
// competing group can't be bounded, we report nothing rather than guess. The
// goal cap is sized well above any tie-breaker-relevant margin in a 4-team
// group, so within an enumerated group the answer is exact; the only failure
// mode is staying silent (conservative), never a false "clinched".

import { TEAMS } from '../data/teams.js'
import { rankGroup } from './qualification.js'

const GROUPS = Object.keys(TEAMS)
const ADVANCING_THIRDS = 8 // 8 of the 12 third-placed teams advance
// Upper bound on enumerated scorelines per group. Sized so the real clinch
// window (each team with one match left → 2 remaining) is always exact, while
// larger fan-outs fall back to "undetermined" (and thus claim nothing).
const SCENARIO_BUDGET = 500000

// Compare two third-place profiles by criteria 1–3 (no cross-group head-to-head
// exists). Positive => a ranks ahead of b.
const cmpThird = (a, b) => a.Pts - b.Pts || a.GD - b.GD || a.GF - b.GF
const profile = (r) => ({ name: r.name, group: r.group, Pts: r.Pts, GD: r.GD, GF: r.GF })

// A goal cap comfortably larger than any margin that could flip a tie-breaker
// in a 4-team group: it must exceed the worst current GD gap a team might need
// to overturn, with headroom. Being generous keeps enumeration EXACT (an under-
// sized cap could miss a counterexample and falsely claim a clinch).
function goalCap(rows) {
  let maxAbsGD = 0
  for (const r of rows) maxAbsGD = Math.max(maxAbsGD, Math.abs(r.GD))
  return Math.max(8, maxAbsGD + 6)
}

function scorelinesUpTo(cap) {
  const out = []
  for (let a = 0; a <= cap; a++) for (let b = 0; b <= cap; b++) out.push([a, b])
  return out
}

// Enumerate every completion of one group's remaining matches and collect, per
// team, the set of final ranks it can reach; plus the strongest/weakest third-
// place profile the group can produce and (per team) its own best/worst profile
// when it finishes third.
function analyzeGroup(group, matches) {
  const all = matches.filter((m) => m.stage === 'Group' && m.group === group)
  // A match counts as decided only once it's FINAL. A live match carries a
  // running score (m.live set), but its outcome isn't settled — so it's treated
  // as remaining, exactly like an unplayed fixture. Counting a live score as
  // final would clinch teams a result early (e.g. while they're still winning).
  const decided = (m) => m.score && !m.live
  const played = all.filter(decided)
  const remaining = all.filter((m) => !decided(m))
  const names = TEAMS[group].map((t) => t.name)

  const cap = goalCap(rankGroup(group, played))
  const scorelines = scorelinesUpTo(cap)
  const total = remaining.length === 0 ? 1 : Math.pow(scorelines.length, remaining.length)
  if (total > SCENARIO_BUDGET) return { group, feasible: false }

  const ranks = {} // name -> Set<rank>
  const thirdBest = {} // name -> best profile when finishing 3rd
  const thirdWorst = {} // name -> worst profile when finishing 3rd
  for (const n of names) ranks[n] = new Set()
  let groupThirdBest = null
  let groupThirdWorst = null

  const assign = new Array(remaining.length)
  const visit = (i) => {
    if (i === remaining.length) {
      const synthetic = played.concat(
        remaining.map((m, idx) => ({ ...m, score: assign[idx] })),
      )
      const ordered = rankGroup(group, synthetic)
      for (const r of ordered) ranks[r.name].add(r.rank)
      const third = profile(ordered[2])
      if (!groupThirdBest || cmpThird(third, groupThirdBest) > 0) groupThirdBest = third
      if (!groupThirdWorst || cmpThird(third, groupThirdWorst) < 0) groupThirdWorst = third
      const tn = third.name
      if (!thirdBest[tn] || cmpThird(third, thirdBest[tn]) > 0) thirdBest[tn] = third
      if (!thirdWorst[tn] || cmpThird(third, thirdWorst[tn]) < 0) thirdWorst[tn] = third
      return
    }
    for (const s of scorelines) {
      assign[i] = s
      visit(i + 1)
    }
  }
  visit(0)

  return { group, feasible: true, names, ranks, thirdBest, thirdWorst, groupThirdBest, groupThirdWorst }
}

// Public: map of team name -> clinch status string (or null).
//   'won-group' — guaranteed to finish 1st in the group
//   'top2'      — guaranteed to finish 1st or 2nd (advances directly)
//   'third'     — guaranteed to advance as one of the 8 best third-placed teams
//   'eliminated'— cannot advance under any remaining results
//   null        — still undecided (or not yet computable)
export function computeClinch(matches) {
  const groups = {}
  for (const g of GROUPS) groups[g] = analyzeGroup(g, matches)
  const allFeasible = GROUPS.every((g) => groups[g].feasible)

  const status = {}
  for (const g of GROUPS) {
    const ga = groups[g]
    if (!ga.feasible) {
      for (const t of TEAMS[g]) status[t.name] = null
      continue
    }
    for (const name of ga.names) {
      const rset = ga.ranks[name]
      const maxRank = Math.max(...rset)
      const minRank = Math.min(...rset)

      if (rset.size === 1 && rset.has(1)) {
        status[name] = 'won-group'
        continue
      }
      if (maxRank <= 2) {
        status[name] = 'top2'
        continue
      }

      // Beyond top two, the verdict depends on the cross-group third-place race,
      // which we only judge when every group is exactly enumerable.
      if (!allFeasible) {
        status[name] = null
        continue
      }

      const others = GROUPS.filter((x) => x !== g)

      // Guaranteed to advance as a third? Only if the team always finishes 1st–
      // 3rd (never 4th) and even its WORST third-place profile out-ranks all but
      // ≤7 of the other groups' STRONGEST possible thirds (ties counted against
      // it, so this never over-claims).
      const canFinish4thOrLower = maxRank >= 4
      const worst3 = ga.thirdWorst[name]
      if (!canFinish4thOrLower && worst3) {
        const aheadAtBest = others.filter(
          (x) => cmpThird(groups[x].groupThirdBest, worst3) >= 0,
        ).length
        if (aheadAtBest <= ADVANCING_THIRDS - 1) {
          status[name] = 'third'
          continue
        }
      }

      // Eliminated? Only if it can't reach the top two AND, even in its BEST
      // third-place case against every other group's WEAKEST third, more than 7
      // teams are strictly ahead (so no advancing slot is reachable).
      const best3 = ga.thirdBest[name]
      let canAdvance = minRank <= 2
      if (!canAdvance && best3) {
        const aheadAtWorst = others.filter(
          (x) => cmpThird(groups[x].groupThirdWorst, best3) > 0,
        ).length
        canAdvance = aheadAtWorst <= ADVANCING_THIRDS - 1
      }
      status[name] = canAdvance ? null : 'eliminated'
    }
  }
  return status
}

// group letter -> the team that has clinched winning it (if any).
export function groupWinners(clinch) {
  const winners = {}
  for (const g of GROUPS) {
    const w = TEAMS[g].find((t) => clinch?.[t.name] === 'won-group')
    if (w) winners[g] = w.name
  }
  return winners
}

// Fill in knockout "Winner Group X" placeholders with the team that has clinched
// that group, so the resolved team flows through to EVERY consumer (bracket,
// match-detail modal, schedule cards, calendar) — not just one view. Only the
// group-winner slot is determinable from clinch status; runner-up / third-place
// slots stay as placeholders until results settle them.
const WINNER_SLOT = /^Winner Group ([A-L])$/
export function resolveClinchedSlots(matches, clinch) {
  const winners = groupWinners(clinch)
  if (!Object.keys(winners).length) return matches
  const sub = (name) => {
    const hit = WINNER_SLOT.exec(name)
    return hit && winners[hit[1]] ? winners[hit[1]] : name
  }
  return matches.map((m) => {
    const t1 = sub(m.t1)
    const t2 = sub(m.t2)
    return t1 === m.t1 && t2 === m.t2 ? m : { ...m, t1, t2 }
  })
}

// Short label + tooltip for a status, for the UI. Returns null for null status.
export function clinchBadge(status) {
  switch (status) {
    case 'won-group':
      return { cls: 'c-won', label: '🥇', text: 'Won group', title: 'Has clinched first place in the group' }
    case 'top2':
      return { cls: 'c-in', label: '✅', text: 'Through', title: 'Has clinched a top-two finish — through to the Round of 32' }
    case 'third':
      return { cls: 'c-in', label: '✅', text: 'Through (3rd)', title: 'Has clinched advancement as one of the 8 best third-placed teams' }
    case 'eliminated':
      return { cls: 'c-out', label: '❌', text: 'Eliminated', title: 'Cannot advance under any remaining results' }
    default:
      return null
  }
}
