import { useMemo, useState } from 'react'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { STAGE_LABELS } from '../data/matches.js'
import { colorForMatch } from '../data/groupColors.js'
import { dayKey, formatTime, tzAbbrev, liveState, teamKickoffTooltip } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import { useDetail } from '../context/detail.js'
import LiveBadge from './LiveBadge.jsx'

// A match is "played" once it has a final score, or the feed/clock says it's
// finished. Everything else (including live games) is "upcoming".
function isPlayed(m) {
  return Array.isArray(m.score) || liveState(m) === 'finished'
}

// "Sat · Jun 13" for a day-group header, in the viewer's timezone.
function dayHeaderLabel(iso, tz) {
  const d = new Date(iso)
  const wd = d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' })
  const md = d.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' })
  return `${wd} · ${md}`
}

function MatchRow({ m, tz, hideScores }) {
  const { isFollowed } = useFollow()
  const openDetail = useDetail()
  const color = colorForMatch(m)
  const label = m.stage === 'Group' ? `Group ${m.group}` : STAGE_LABELS[m.stage]
  const showScore = Array.isArray(m.score) && !hideScores
  const scoreText = showScore
    ? `${m.score[0]}–${m.score[1]}${m.pens ? ` (p ${m.pens[0]}–${m.pens[1]})` : m.aet ? ' AET' : ''}`
    : 'v'
  const nameCls = (name) => `ml-name${isFollowed(name) ? ' followed' : ''}`
  const aria = `${label}, ${m.t1} ${showScore ? scoreText : 'versus'} ${m.t2}, ${formatTime(m.ko, tz)}`

  return (
    <button
      type="button"
      className="ml-row"
      style={{ borderLeftColor: color }}
      onClick={() => openDetail(m)}
      aria-label={aria}
    >
      <span className="ml-time">
        <span className="ml-ko">{formatTime(m.ko, tz)}</span>
        <span className="ml-tz">{tzAbbrev(m.ko, tz)}</span>
      </span>
      <span className="ml-chip" style={{ color, borderColor: color }}>
        {label}
      </span>
      <span className="ml-team ml-team-1" title={teamKickoffTooltip(m.ko, m.t1) || undefined}>
        <span className={nameCls(m.t1)}>{m.t1}</span>
        <span className="ml-flag">{FLAG_BY_TEAM[m.t1] || '•'}</span>
      </span>
      <span className="ml-score">
        {m.live ? <LiveBadge match={m} className="ml-live" /> : scoreText}
      </span>
      <span className="ml-team ml-team-2" title={teamKickoffTooltip(m.ko, m.t2) || undefined}>
        <span className="ml-flag">{FLAG_BY_TEAM[m.t2] || '•'}</span>
        <span className={nameCls(m.t2)}>{m.t2}</span>
      </span>
    </button>
  )
}

export default function MatchList({ matches, tz, hideScores, setHideScores = () => {} }) {
  const [tab, setTab] = useState('upcoming') // 'upcoming' | 'played'

  const groups = useMemo(() => {
    const want = tab === 'played'
    const filtered = matches.filter((m) => isPlayed(m) === want)
    const byDay = {}
    for (const m of filtered) {
      const k = dayKey(m.ko, tz)
      ;(byDay[k] ||= []).push(m)
    }
    // Within a day, chronological; played days flip to most-recent-first.
    for (const k in byDay) {
      byDay[k].sort((a, b) => new Date(a.ko) - new Date(b.ko))
      if (want) byDay[k].reverse()
    }
    const keys = Object.keys(byDay).sort()
    if (want) keys.reverse() // reverse-chronological for played
    return keys.map((k) => ({ key: k, matches: byDay[k] }))
  }, [matches, tz, tab])

  const total = groups.reduce((n, g) => n + g.matches.length, 0)

  return (
    <div className="matchlist">
      <div className="ml-controls">
        <div className="ml-toggle" role="tablist" aria-label="Match list filter">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upcoming'}
            className={`ml-tab${tab === 'upcoming' ? ' active' : ''}`}
            onClick={() => setTab('upcoming')}
          >
            Upcoming
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'played'}
            className={`ml-tab${tab === 'played' ? ' active' : ''}`}
            onClick={() => setTab('played')}
          >
            Played
          </button>
        </div>
        {/* Global spoiler toggle. Scores also appear in the knockout bracket, so
            this governs there too — it just lives where scores are most visible. */}
        <label className="scores-toggle" title="Toggle spoiler-free mode for all scores">
          <span className="scores-toggle-label">{hideScores ? '🙈' : '👁'} Scores</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Show scores"
            checked={!hideScores}
            onChange={() => setHideScores((h) => !h)}
          />
          <span className="switch-track"><span className="switch-thumb" /></span>
        </label>
      </div>

      {total === 0 ? (
        <p className="ml-empty">No {tab} matches.</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="ml-day">
            <h3 className="ml-day-head">{dayHeaderLabel(g.matches[0].ko, tz)}</h3>
            <div className="ml-rows">
              {g.matches.map((m) => (
                <MatchRow key={m.num} m={m} tz={tz} hideScores={hideScores} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
