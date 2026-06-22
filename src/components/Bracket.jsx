import { useEffect } from 'react'
import { STAGE_LABELS } from '../data/matches.js'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { BRACKET_LINEAR, matchesByNum } from '../utils/bracket.js'
import { teamKickoffTooltip } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import { useDetail } from '../context/detail.js'
import LiveBadge from './LiveBadge.jsx'
import ScoreCheck from './ScoreCheck.jsx'

// One team row: flag + name on the left, score (when played) flush right.
function Side({ name, ko, score }) {
  const { isFollowed } = useFollow()
  const flag = FLAG_BY_TEAM[name]
  const on = Boolean(flag) && isFollowed(name)
  return (
    <div className={`bx-side${on ? ' followed' : ''}`} title={teamKickoffTooltip(ko, name) || undefined}>
      <span className="bx-flag">{flag || '·'}</span>
      <span className={flag ? 'bx-team' : 'bx-tbd'}>{name}</span>
      {score != null && <span className="bx-side-score">{score}</span>}
    </div>
  )
}

function BracketMatch({ num, byNum, tz, hideScores }) {
  const openDetail = useDetail()
  const m = byNum[num]
  if (!m) return null
  // Compact date only ("Jun 13") — no year, no timezone abbrev, to save width.
  const date = new Date(m.ko).toLocaleDateString('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
  })
  const showScore = m.score && !hideScores
  return (
    <div className="bx-match" id={`bx-m${m.num}`} role="button" tabIndex={0}
      aria-label={`${m.t1} versus ${m.t2}, ${STAGE_LABELS[m.stage]}, Match ${m.num}`}
      onClick={() => openDetail(m)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetail(m)}>
      <div className="bx-meta">
        <span className="bx-num">M{m.num}</span>
        {m.live ? <LiveBadge match={m} /> : <span className="bx-date">{date}</span>}
      </div>
      <div className="bx-teams">
        <Side name={m.t1} ko={m.ko} score={showScore ? m.score[0] : null} />
        <Side name={m.t2} ko={m.ko} score={showScore ? m.score[1] : null} />
        {showScore && (m.pens || m.aet) && (
          <div className="bx-score-extra">
            {m.pens ? `p ${m.pens[0]}–${m.pens[1]}` : 'AET'}
            <ScoreCheck match={m} compact />
          </div>
        )}
        {showScore && !m.pens && !m.aet && m.scoreCheck && (
          <div className="bx-score-extra"><ScoreCheck match={m} compact /></div>
        )}
      </div>
    </div>
  )
}

// `connect` controls which connectors a column draws. In the single-sided
// pyramid every column feeds rightward, so all but the Final emit a stub, and
// every column but R32 draws the incoming vertical arm.
function Column({ title, nums, emit, arm, byNum, tz, hideScores }) {
  return (
    <div className={`bx-col${emit ? ' bx-emit' : ''}${arm ? ' bx-arm' : ''}`}>
      <div className="bx-col-head">{title}</div>
      <div className="bx-col-body">
        {nums.map((n) => (
          <div className="bx-cell" key={n}>
            <BracketMatch num={n} byNum={byNum} tz={tz} hideScores={hideScores} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Bracket({ matches, tz, hideScores, focusMatch, onFocusHandled }) {
  const byNum = matchesByNum(matches)
  const common = { byNum, tz, hideScores }

  // When arriving from an "As it stands" link, scroll the target match into
  // view (the bracket can scroll horizontally on narrow screens) and flash a
  // highlight, then clear.
  useEffect(() => {
    if (focusMatch == null) return
    const el = document.getElementById(`bx-m${focusMatch}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'center' })
      el.classList.add('bx-focus')
      setTimeout(() => el.classList.remove('bx-focus'), 2200)
    }
    onFocusHandled?.()
  }, [focusMatch, onFocusHandled])

  return (
    <div className="bracket-wrap">
      <div className="bracket">
        <Column title={STAGE_LABELS.R32} nums={BRACKET_LINEAR.R32} emit {...common} />
        <Column title={STAGE_LABELS.R16} nums={BRACKET_LINEAR.R16} emit arm {...common} />
        <Column title={STAGE_LABELS.QF} nums={BRACKET_LINEAR.QF} emit arm {...common} />
        <Column title={STAGE_LABELS.SF} nums={BRACKET_LINEAR.SF} emit arm {...common} />

        <div className="bx-col bx-col-final bx-arm">
          <div className="bx-col-head bx-final-head">🏆 {STAGE_LABELS.Final}</div>
          <div className="bx-col-body">
            <div className="bx-cell">
              <BracketMatch num={BRACKET_LINEAR.Final[0]} {...common} />
            </div>
            <div className="bx-third-label">{STAGE_LABELS['3rd']}</div>
            <div className="bx-cell bx-cell-third">
              <BracketMatch num={BRACKET_LINEAR.third[0]} {...common} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
