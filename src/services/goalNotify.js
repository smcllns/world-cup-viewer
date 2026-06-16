// Goal-notification logic: detect newly-scored goals across successive merged
// snapshots so the app can raise a browser notification the moment one lands.
// Pure + unit-tested (see test/goalNotify.test.js); App.jsx owns the side
// effects (Notification permission + firing). The static site has no backend, so
// this only runs while the app is open in a tab — the existing ESPN poll (~30s
// while a match is live) is what surfaces the new goal.

// A stable identity for one goal so we can tell a brand-new goal from one we've
// already seen across polls. ESPN occasionally nudges a goal's minute as it
// finalizes stoppage time, so we lead with side + scorer (stable) and include the
// minute to disambiguate a player who scores twice.
export function goalKey(side, g) {
  return [side, g.name || '', g.minute ?? '', g.extra ?? '', g.og ? 'og' : ''].join('|')
}

// The set of goal keys currently shown for a match (both teams).
export function goalKeys(m) {
  const keys = new Set()
  for (const side of ['t1', 't2']) {
    for (const g of m.goals?.[side] || []) keys.add(goalKey(side, g))
  }
  return keys
}

// Only matches ESPN is actively driving can gain a *new* live goal: either still
// in progress (m.live) or just-finished and overlaid from ESPN before
// OpenFootball posts (m.liveSource). A finished match whose goals arrive later
// from OpenFootball must NOT notify.
export function isLiveish(m) {
  return Boolean(m.live || m.liveSource)
}

// Does this match fall within the user's chosen scope?
export function inScope(m, scope, followed) {
  if (scope === 'all') return true
  return Boolean(followed && (followed.has(m.t1) || followed.has(m.t2)))
}

// Diff the previous snapshot's goal keys against the current matches. Returns the
// next snapshot (to store for the following poll) and the list of new-goal events
// to notify on. A match seen for the FIRST TIME is only recorded, never notified
// — that prevents dumping every existing goal when the app loads or when goal
// alerts are first enabled. Notifications are further limited to live-ish matches
// within scope; the snapshot tracks every match so identities stay warm.
//
// The per-match snapshot ACCUMULATES (unions) every goal key ever seen rather than
// replacing it each poll. A transient ESPN gap — a poll that briefly returns fewer
// events and drops a live match's goals — would otherwise make those goals look
// "new" and re-fire when the next poll restores them, flooding the user with dozens
// of stale alerts. Once seen, a goal stays seen, so a disappear/reappear is silent.
export function detectGoals(prev, matches, { scope = 'followed', followed } = {}) {
  const next = new Map()
  const events = []
  for (const m of matches) {
    const before = prev?.get(m.num)
    const seen = before ? new Set(before) : new Set()
    const eligible = Boolean(before) && isLiveish(m) && inScope(m, scope, followed)
    for (const side of ['t1', 't2']) {
      for (const g of m.goals?.[side] || []) {
        const k = goalKey(side, g)
        if (eligible && !seen.has(k)) events.push({ match: m, side, goal: g })
        seen.add(k)
      }
    }
    next.set(m.num, seen)
  }
  return { next, events }
}

// Format one new-goal event into a browser-Notification payload. `tag` collapses
// duplicates so a re-fire (e.g. a re-render) can't stack the same goal twice.
export function goalNotification({ match, side, goal }) {
  const team = side === 't1' ? match.t1 : match.t2
  const min =
    goal.minute != null ? `${goal.minute}${goal.extra ? '+' + goal.extra : ''}'` : ''
  const flags = `${goal.og ? ' (OG)' : ''}${goal.penalty ? ' (pen)' : ''}`
  // Derive the score line from the goal lists, NOT match.score: ESPN appends a
  // goal to its event list a beat before it bumps the aggregate score, so reading
  // match.score here can show a stale 0–0 next to the scorer who just netted. The
  // goal lists already credit own goals to the right side and exclude shootout
  // kicks, so their lengths are the live score that's consistent with this goal.
  const t1n = match.goals?.t1?.length
  const t2n = match.goals?.t2?.length
  const score =
    t1n != null && t2n != null
      ? `${match.t1} ${t1n}–${t2n} ${match.t2}`
      : Array.isArray(match.score)
        ? `${match.t1} ${match.score[0]}–${match.score[1]} ${match.t2}`
        : `${match.t1} v ${match.t2}`
  const scorer = goal.name ? `${goal.name}${flags} ${min}`.trim() : `${team}${flags} ${min}`.trim()
  return {
    title: `⚽ GOAL — ${team}`,
    body: `${scorer}\n${score}`,
    tag: goalKey(side, goal) + `|${match.num}`,
  }
}
