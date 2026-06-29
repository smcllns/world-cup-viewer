// Cross-source confirmation badge (OpenFootball / ESPN / TheSportsDB). Shown in
// the match detail modal only — the mini bracket/list cards stay uncluttered. The
// `compact` form ("✓3" / "⚠") remains for any dense cell that wants it. Renders
// nothing until >= 2 sources have a final for the match.
export default function ScoreCheck({ match, compact = false }) {
  const sc = match.scoreCheck
  if (!sc) return null
  if (sc.agree) {
    const label = `Final score confirmed by ${sc.count} independent sources`
    return (
      <span className="score-check" title={label} aria-label={label}>
        {compact ? `✓${sc.count}` : `✓ confirmed by ${sc.count} sources`}
      </span>
    )
  }
  const label = 'Sources report different final scores'
  return (
    <span className="score-check score-check-warn" title={label} aria-label={label}>
      {compact ? '⚠' : '⚠ sources disagree on this score'}
    </span>
  )
}
