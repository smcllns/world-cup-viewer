// "As it stands" — project the Round of 32 from the CURRENT group standings, so
// each group can show where its 1st / 2nd / (qualifying) 3rd would land right now.
//
// Winner and runner-up slots resolve directly from the live standings. The 3rd-
// place slots ("3rd C/E/F/H/I") are the hard part: FIFA assigns the 8 qualifying
// thirds to the 8 such slots via a 495-row lookup table (one row per combination
// of which 8 of the 12 groups produce a qualifying third). We don't have that
// table, so we resolve the CURRENT combination by constraint-matching the eight
// qualifying third-place groups to the eight slots using FIFA's own per-slot
// candidate-group lists (the "C/E/F/H/I" sets, taken from the bracket data). That
// always produces a valid bracket; for combinations with more than one valid
// matching it may differ from FIFA's specific published choice — see the PR note.

import { TEAMS } from '../data/teams.js'
import { computeQualification } from './qualification.js'

const GROUPS = Object.keys(TEAMS)
const ADVANCING_THIRDS = 8

// Parse an R32 placeholder label into a slot descriptor.
function parseSlot(label) {
  let m = /^Winner Group ([A-L])$/.exec(label)
  if (m) return { type: 'winner', group: m[1] }
  m = /^Runner-up Group ([A-L])$/.exec(label)
  if (m) return { type: 'runner', group: m[1] }
  m = /^3rd ([A-L/]+)$/.exec(label)
  if (m) return { type: 'third', groups: m[1].split('/') }
  return { type: 'other', label }
}

// Bipartite matching (Kuhn's): assign each qualifying third-place group to one
// 3rd-place slot whose candidate list contains it. `groups` is processed in
// best-third-first order for a deterministic result. Returns Map(slot → group).
function matchThirds(groups, slots) {
  const groupForSlot = new Map()
  const assign = (group, visited) => {
    for (const s of slots) {
      if (!s.slot.groups.includes(group) || visited.has(s)) continue
      visited.add(s)
      if (!groupForSlot.has(s) || assign(groupForSlot.get(s), visited)) {
        groupForSlot.set(s, group)
        return true
      }
    }
    return false
  }
  for (const g of groups) assign(g, new Set())
  return groupForSlot
}

// Returns { perGroup, complete } where perGroup[g] = {
//   first:  { team, opponent, matchNum } | null,
//   second: { team, opponent, matchNum } | null,
//   third:  { team, opponent, matchNum } | null,   // only if the 3rd is in the best 8
//   thirdTeam, thirdQualifies,
// }
// `complete` is false if any winner/runner-up slot can't be resolved yet.
export function projectKnockout(matches) {
  const qual = computeQualification(matches)
  const first = {}
  const second = {}
  const third = {}
  for (const g of GROUPS) {
    first[g] = qual.groups[g]?.[0] || null
    second[g] = qual.groups[g]?.[1] || null
    third[g] = qual.groups[g]?.[2] || null
  }

  // The eight groups whose third place is currently in the qualifying eight,
  // ranked best-first (so matching is deterministic and prefers stronger thirds).
  const qualifyingThirdGroups = qual.thirds.slice(0, ADVANCING_THIRDS).map((t) => t.group)
  const qualifyingSet = new Set(qualifyingThirdGroups)

  // Every R32 side, with its parsed slot.
  const sides = []
  for (const m of matches) {
    if (m.stage !== 'R32') continue
    sides.push({ matchNum: m.num, sideIdx: 0, slot: parseSlot(m.t1) })
    sides.push({ matchNum: m.num, sideIdx: 1, slot: parseSlot(m.t2) })
  }
  const thirdSides = sides.filter((s) => s.slot.type === 'third')
  const slotGroup = matchThirds(qualifyingThirdGroups, thirdSides)

  const teamForSide = (s) => {
    if (!s) return null
    if (s.slot.type === 'winner') return first[s.slot.group]
    if (s.slot.type === 'runner') return second[s.slot.group]
    if (s.slot.type === 'third') {
      const g = slotGroup.get(s)
      return g ? third[g] : null
    }
    return null
  }

  // Index sides by match so we can find each side's opponent.
  const byMatch = new Map()
  for (const s of sides) {
    if (!byMatch.has(s.matchNum)) byMatch.set(s.matchNum, [])
    byMatch.get(s.matchNum).push(s)
  }
  const opponentOf = (s) => {
    const pair = byMatch.get(s.matchNum) || []
    return teamForSide(pair.find((o) => o !== s))
  }

  const perGroup = {}
  for (const g of GROUPS) {
    perGroup[g] = {
      first: null,
      second: null,
      thirdTeam: third[g]?.name || null,
      thirdQualifies: qualifyingSet.has(g),
      third: null,
    }
  }
  let complete = true
  for (const s of sides) {
    const me = teamForSide(s)
    const opp = opponentOf(s)
    if (s.slot.type === 'winner') {
      perGroup[s.slot.group].first = { team: first[s.slot.group]?.name || null, opponent: opp?.name || null, matchNum: s.matchNum }
      if (!me || !opp) complete = false
    } else if (s.slot.type === 'runner') {
      perGroup[s.slot.group].second = { team: second[s.slot.group]?.name || null, opponent: opp?.name || null, matchNum: s.matchNum }
      if (!me || !opp) complete = false
    } else if (s.slot.type === 'third') {
      const g = slotGroup.get(s)
      if (g) perGroup[g].third = { team: third[g]?.name || null, opponent: opp?.name || null, matchNum: s.matchNum }
    }
  }
  return { perGroup, complete }
}
