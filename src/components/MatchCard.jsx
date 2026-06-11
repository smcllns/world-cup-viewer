import { useState } from 'react'
import { VENUES } from '../data/venues.js'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { STAGE_LABELS } from '../data/matches.js'
import { US_BROADCAST } from '../data/broadcast.js'
import { formatTime, tzAbbrev, liveState, teamKickoffTooltip } from '../utils/time.js'
import { downloadICS } from '../utils/ics.js'
import { useFollow } from '../context/follow.jsx'
import { useDetail } from '../context/detail.js'
import LiveBadge from './LiveBadge.jsx'
import ScoreCheck from './ScoreCheck.jsx'

function Team({ name, ko }) {
  const flag = FLAG_BY_TEAM[name]
  const { isFollowed, toggle } = useFollow()
  const on = Boolean(flag) && isFollowed(name)
  const localKickoff = teamKickoffTooltip(ko, name)
  return (
    <div className={`team${on ? ' followed' : ''}`} title={localKickoff || undefined}>
      {flag && (
        <button
          className={`star${on ? ' on' : ''}`}
          onClick={() => toggle(name)}
          aria-pressed={on}
          aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
          title={on ? `Unfollow ${name}` : `Follow ${name}`}
        >
          {on ? '★' : '☆'}
        </button>
      )}
      <span className="team-flag">{flag || '🏳️'}</span>
      <span className={`team-name${flag ? '' : ' team-tbd'}`}>{name}</span>
    </div>
  )
}

function Channels({ feed }) {
  return (
    <div className="feed">
      <div className="feed-lang">{feed.language}</div>
      <div className="feed-detail">
        <span className="feed-label">TV</span>
        {feed.tv.map((c) => (
          <span key={c} className={`chip${c === feed.freeOverTheAir ? ' chip-free' : ''}`}>
            {c}
            {c === feed.freeOverTheAir && <span className="free-tag">free</span>}
          </span>
        ))}
      </div>
      <div className="feed-detail">
        <span className="feed-label">Stream</span>
        {feed.streaming.map((s) => (
          <span key={s} className="chip chip-stream">
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function MatchCard({ match, tz, feed = 'both', hidden = false }) {
  const [showWatch, setShowWatch] = useState(false)
  const [revealScore, setRevealScore] = useState(false)
  const openDetail = useDetail()
  const venue = VENUES[match.venue]
  const status = liveState(match)
  const viewerTime = formatTime(match.ko, tz)
  const viewerAbbr = tzAbbrev(match.ko, tz)
  const localTime = formatTime(match.ko, venue.tz)
  const localAbbr = tzAbbrev(match.ko, venue.tz)
  const sameClock = viewerTime === localTime && viewerAbbr === localAbbr

  const stageLabel =
    match.stage === 'Group' ? `Group ${match.group}` : STAGE_LABELS[match.stage]

  // A score only exists once a match is recorded. In spoiler-free mode it stays
  // hidden behind a tap-to-reveal pill (per-card override of the day/global setting).
  const hasScore = Array.isArray(match.score)
  const scoreHidden = hasScore && hidden && !revealScore

  return (
    <article className={`card status-${status}`}>
      <div className="card-time">
        <div className="kickoff">{viewerTime}</div>
        <div className="kickoff-tz">{viewerAbbr}</div>
        {/* Real in-match status from ESPN (clock/HT) beats the time-based guess;
            a match with a final score reads FT even if still inside the window. */}
        {match.live ? (
          <LiveBadge match={match} />
        ) : status === 'live' ? (
          <div className="badge-live">● LIVE</div>
        ) : status === 'finished' ? (
          <div className="badge-done" aria-label="Full time">FT</div>
        ) : null}
      </div>

      <div className="card-body">
        <div className="card-head">
          <span className={`stage-badge stage-${match.stage}`}>{stageLabel}</span>
          <span className="match-num">Match {match.num}</span>
        </div>

        <div className="matchup">
          <Team name={match.t1} ko={match.ko} />
          {hasScore ? (
            scoreHidden ? (
              <button
                className="score score-hidden"
                onClick={() => setRevealScore(true)}
                title="Reveal score"
              >
                🙈 <span className="score-hidden-label">tap to reveal</span>
              </button>
            ) : (
              <span className="score">
                {match.score[0]}<span className="score-dash">–</span>{match.score[1]}
                {match.pens && (
                  <span className="score-extra">pens {match.pens[0]}–{match.pens[1]}</span>
                )}
                {match.aet && !match.pens && <span className="score-extra">AET</span>}
              </span>
            )
          ) : (
            <span className="vs">v</span>
          )}
          <Team name={match.t2} ko={match.ko} />
        </div>

        {/* Cross-source confirmation of the final score (OpenFootball / ESPN /
            TheSportsDB). Hidden in spoiler mode along with the score itself. */}
        {!scoreHidden && <ScoreCheck match={match} />}

        <div className="venue">
          <span className="venue-flag">{venue.countryFlag}</span>
          <span className="venue-stadium">{venue.name}</span>
          <span className="venue-city">
            {venue.city}, {venue.country}
          </span>
          {!sameClock && (
            <span className="venue-local">
              · {localTime} {localAbbr} local
            </span>
          )}
        </div>

        <div className="card-actions">
          <button
            className="watch-toggle"
            onClick={() => setShowWatch((s) => !s)}
            aria-expanded={showWatch}
          >
            📺 How to watch (US) {showWatch ? '▲' : '▼'}
          </button>
          <button
            className="cal-btn"
            onClick={() => downloadICS(match)}
            title="Download .ics calendar file"
          >
            ＋ Add to calendar
          </button>
          <button className="cal-btn" onClick={() => openDetail(match)}>
            ℹ Details
          </button>
        </div>
        {showWatch && (
          <div className="watch">
            {feed !== 'spanish' && <Channels feed={US_BROADCAST.english} />}
            {feed !== 'english' && <Channels feed={US_BROADCAST.spanish} />}
          </div>
        )}
      </div>
    </article>
  )
}
