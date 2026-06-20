import { useState } from 'react'
import { TEAMS } from '../data/teams.js'
import { computeQualification, rowStatus } from '../utils/qualification.js'
import { clinchBadge } from '../utils/clinch.js'
import { useFollow } from '../context/follow.jsx'

const GROUPS = Object.keys(TEAMS)

const STATUS_BADGE = {
  in: { cls: 'q-in', label: '✓', title: 'Advances to the Round of 32' },
  best3: { cls: 'q-best3', label: '3⃣', title: 'Provisionally among the 8 best third-placed teams' },
  out3: { cls: 'q-out', label: '·', title: 'Third place, outside the best 8 so far' },
  out: { cls: 'q-out', label: '✕', title: 'Eliminated' },
}

function Star({ name }) {
  const { isFollowed, toggle } = useFollow()
  const on = isFollowed(name)
  return (
    <button className={`star${on ? ' on' : ''}`} onClick={() => toggle(name)} aria-pressed={on}
      aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
      title={on ? `Unfollow ${name}` : `Follow ${name}`}>
      {on ? '★' : '☆'}
    </button>
  )
}

function GroupTable({ group, rows, qual, clinch }) {
  const { isFollowed } = useFollow()
  const played = qual.completion[group] || rows.some((r) => r.P > 0)
  return (
    <div className="group-card">
      <h3 className="group-title">Group {group}</h3>
      <table className="standings-table">
        <thead>
          <tr>
            <th className="col-team">Team</th>
            <th>P</th><th>W</th><th>D</th><th>L</th>
            <th>GF</th><th>GA</th><th>GD</th><th className="col-pts">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            // A guaranteed clinch/elimination verdict (if any) is more informative
            // than the post-completion qualification badge, so it wins when present.
            const clinched = clinchBadge(clinch?.[r.name])
            const status = rowStatus(r, group, qual)
            const badge = status && STATUS_BADGE[status]
            return (
              <tr key={r.name} className={r.rank <= 2 ? 'qualifies' : ''}>
                <td className="col-team">
                  <span className="rank">{r.rank}</span>
                  <Star name={r.name} />
                  <span className="team-flag">{r.flag}</span>
                  <span className={`row-team${isFollowed(r.name) ? ' followed' : ''}`}>{r.name}</span>
                  {clinched ? (
                    <span className={`q-badge ${clinched.cls}`} title={clinched.title}>
                      {clinched.label} {clinched.text}
                    </span>
                  ) : (
                    badge && <span className={`q-badge ${badge.cls}`} title={badge.title}>{badge.label}</span>
                  )}
                </td>
                <td>{r.P}</td><td>{r.W}</td><td>{r.D}</td><td>{r.L}</td>
                <td>{r.GF}</td><td>{r.GA}</td>
                <td>{r.GD > 0 ? `+${r.GD}` : r.GD}</td>
                <td className="col-pts">{r.Pts}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!played && <p className="group-note">No matches played yet</p>}
    </div>
  )
}

function BestThirds({ qual }) {
  const anyPlayed = qual.thirds.some((t) => t.P > 0)
  if (!anyPlayed) return null
  return (
    <div className="thirds-card">
      <h3 className="group-title">Best third-placed teams</h3>
      <p className="thirds-note">
        The 8 best of the 12 third-placed teams advance (ranked by points, then goal difference,
        then goals scored, then FIFA ranking).{' '}
        {qual.allComplete ? '' : 'Provisional — group stage still in progress.'}
      </p>
      <table className="standings-table">
        <thead>
          <tr>
            <th className="col-team">Team</th><th>Grp</th>
            <th>P</th><th>GD</th><th>GF</th><th className="col-pts">Pts</th>
          </tr>
        </thead>
        <tbody>
          {qual.thirds.map((r, i) => (
            <tr key={r.name} className={i < 8 ? 'qualifies' : 'eliminated'}>
              <td className="col-team">
                <span className="rank">{i + 1}</span>
                <span className="team-flag">{r.flag}</span>
                <span className="row-team">{r.name}</span>
              </td>
              <td>{r.group}</td>
              <td>{r.P}</td>
              <td>{r.GD > 0 ? `+${r.GD}` : r.GD}</td>
              <td>{r.GF}</td>
              <td className="col-pts">{r.Pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Standings({ matches, hideScores, clinch }) {
  const [revealed, setRevealed] = useState(false)

  if (hideScores && !revealed) {
    return (
      <div className="standings-hidden">
        <p>🙈 Standings are hidden in spoiler-free mode.</p>
        <button className="reveal-btn" onClick={() => setRevealed(true)}>Reveal standings</button>
      </div>
    )
  }

  const qual = computeQualification(matches)

  return (
    <>
      <p className="standings-legend">
        <span className="legend-swatch" /> Top two advance · <span className="q-badge q-best3">3⃣</span>{' '}
        best-third spot · tie-breakers: points → head-to-head → goal difference → goals → FIFA ranking ·{' '}
        <span className="q-badge c-won">🥇 Won group</span> /{' '}
        <span className="q-badge c-in">✅ Through</span> /{' '}
        <span className="q-badge c-out">❌ Out</span> mark mathematically clinched outcomes.
      </p>
      <div className="standings-grid">
        {GROUPS.map((g) => (
          <GroupTable key={g} group={g} rows={qual.groups[g]} qual={qual} clinch={clinch} />
        ))}
      </div>
      <BestThirds qual={qual} />
    </>
  )
}
