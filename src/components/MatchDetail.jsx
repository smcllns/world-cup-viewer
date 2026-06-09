import { useEffect, useState } from 'react'
import { VENUES } from '../data/venues.js'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { STAGE_LABELS } from '../data/matches.js'
import { US_BROADCAST } from '../data/broadcast.js'
import { formatTime, formatDateLong, tzAbbrev, matchStatus, teamKickoffTooltip } from '../utils/time.js'
import { downloadICS } from '../utils/ics.js'
import { useFollow } from '../context/follow.jsx'

function FollowStar({ name }) {
  const { isFollowed, toggle } = useFollow()
  if (!FLAG_BY_TEAM[name]) return null
  const on = isFollowed(name)
  return (
    <button
      className={`star${on ? ' on' : ''}`}
      onClick={() => toggle(name)}
      aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
      title={on ? `Unfollow ${name}` : `Follow ${name}`}
      aria-pressed={on}
    >
      {on ? '★' : '☆'}
    </button>
  )
}

function Timeline({ match }) {
  if (!match.goals || (!match.goals.t1.length && !match.goals.t2.length)) {
    return <p className="md-nogoals">No goal data yet.</p>
  }
  const events = [
    ...match.goals.t1.map((g) => ({ ...g, side: 't1' })),
    ...match.goals.t2.map((g) => ({ ...g, side: 't2' })),
  ].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999))
  return (
    <ul className="timeline">
      {events.map((g, i) => (
        <li key={i} className={`tl-${g.side}`}>
          <span className="tl-min">{g.minute != null ? `${g.minute}'` : ''}</span>
          <span className="tl-ball">⚽</span>
          <span className="tl-name">
            {g.name}
            {g.penalty && <em> (pen)</em>}
            {g.og && <em> (OG)</em>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function MatchDetail({ match, tz, hideScores, onClose }) {
  const [reveal, setReveal] = useState(false)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!match) return null
  const venue = VENUES[match.venue]
  const stage = match.stage === 'Group' ? `Group ${match.group}` : STAGE_LABELS[match.stage]
  const status = matchStatus(match.ko)
  const hasScore = Array.isArray(match.score)
  const scoreHidden = hasScore && hideScores && !reveal

  return (
    <div className="md-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="md-card" onClick={(e) => e.stopPropagation()}>
        <button className="md-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="md-head">
          <span className="md-stage">{stage} · Match {match.num}</span>
          {status === 'live' && <span className="md-live">● LIVE</span>}
        </div>

        <div className="md-teams">
          <div className="md-team" title={teamKickoffTooltip(match.ko, match.t1) || undefined}>
            <span className="md-flag">{FLAG_BY_TEAM[match.t1] || '•'}</span>
            <span className="md-name">{match.t1}</span>
            <FollowStar name={match.t1} />
          </div>
          <div className="md-score">
            {hasScore ? (
              scoreHidden ? (
                <button className="md-reveal" onClick={() => setReveal(true)}>🙈 reveal</button>
              ) : (
                <>
                  {match.score[0]}–{match.score[1]}
                  {match.pens && <div className="md-extra">pens {match.pens[0]}–{match.pens[1]}</div>}
                  {match.aet && !match.pens && <div className="md-extra">after extra time</div>}
                </>
              )
            ) : (
              <span className="md-vs">vs</span>
            )}
          </div>
          <div className="md-team" title={teamKickoffTooltip(match.ko, match.t2) || undefined}>
            <span className="md-flag">{FLAG_BY_TEAM[match.t2] || '•'}</span>
            <span className="md-name">{match.t2}</span>
            <FollowStar name={match.t2} />
          </div>
        </div>

        <div className="md-meta">
          <div><strong>When</strong> {formatDateLong(match.ko, tz)} · {formatTime(match.ko, tz)} {tzAbbrev(match.ko, tz)}</div>
          <div><strong>Stadium local</strong> {formatTime(match.ko, venue.tz)} {tzAbbrev(match.ko, venue.tz)}</div>
          <div><strong>Venue</strong> {venue.countryFlag} {venue.name}, {venue.city}, {venue.country}</div>
        </div>

        {hasScore && !scoreHidden && (
          <div className="md-section">
            <h4>Goals</h4>
            <Timeline match={match} />
          </div>
        )}

        <div className="md-section">
          <h4>How to watch (US)</h4>
          <div className="md-watch">
            <div><span className="md-lang">English</span> {US_BROADCAST.english.tv.join(' / ')} · {US_BROADCAST.english.streaming.join(', ')}</div>
            <div><span className="md-lang">Spanish</span> {US_BROADCAST.spanish.tv.join(' / ')} · {US_BROADCAST.spanish.streaming.join(', ')}</div>
          </div>
        </div>

        <button className="md-cal" onClick={() => downloadICS(match)}>＋ Add to calendar</button>
      </div>
    </div>
  )
}
