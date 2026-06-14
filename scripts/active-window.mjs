// Match-finishing window calculator for the autofill loop. The autofill only
// needs to run while a game is wrapping up and its result is being confirmed —
// not around the clock. This decides whether "now" is inside any match's
// [kickoff + START, kickoff + END] window:
//   • START ≈ late second half, so we're already polling when full time hits.
//   • END   ≈ full time + a buffer for the slowest source (TheSportsDB) to post.
//
// CLI prints "ACTIVE <secs-until-window-ends>" or "IDLE <secs-until-next-window>"
// (IDLE -1 when no future window) for the workflow loop to act on. The pure
// windowStatus() is unit-tested in test/active-window.test.js.

import { MATCHES } from '../src/data/matches.js'

export const WINDOW_START_MIN = 85 // ~late second half (allowing for the HT break)
export const WINDOW_END_MIN = 180 // full time (~120') + ~60 min source-confirmation buffer

export function windowStatus(matches, now) {
  let activeEnd = -Infinity
  let nextStart = Infinity
  for (const m of matches) {
    const ko = new Date(m.ko).getTime()
    const start = ko + WINDOW_START_MIN * 60_000
    const end = ko + WINDOW_END_MIN * 60_000
    if (now >= start && now < end) {
      if (end > activeEnd) activeEnd = end // extend across overlapping/simultaneous matches
    } else if (start > now && start < nextStart) {
      nextStart = start
    }
  }
  if (activeEnd > -Infinity) return { state: 'ACTIVE', seconds: Math.ceil((activeEnd - now) / 1000) }
  return { state: 'IDLE', seconds: nextStart < Infinity ? Math.ceil((nextStart - now) / 1000) : -1 }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = windowStatus(MATCHES, Date.now())
  process.stdout.write(`${s.state} ${s.seconds}\n`)
}
