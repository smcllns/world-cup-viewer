import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { STAGE_LABELS } from '../data/matches.js'
import { FLAG_BY_TEAM } from '../data/teams.js'
import { BRACKET_LINEAR, matchesByNum } from '../utils/bracket.js'
import { teamKickoffTooltip } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import { useDetail } from '../context/detail.js'
import LiveBadge from './LiveBadge.jsx'

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

// `heading`, when given, renders the round title INSIDE the card (used for the
// late rounds whose column header would otherwise float far from its card).
function BracketMatch({ num, byNum, tz, hideScores, heading }) {
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
    <div className={`bx-match${heading ? ' bx-match-titled' : ''}`} id={`bx-m${m.num}`} role="button" tabIndex={0}
      aria-label={`${m.t1} versus ${m.t2}, ${STAGE_LABELS[m.stage]}, Match ${m.num}`}
      onClick={() => openDetail(m)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetail(m)}>
      {heading && <div className="bx-card-head">{heading}</div>}
      <div className="bx-card-row">
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// `emit`/`arm` mark which side the SVG connectors attach to. `heading` puts the
// round title inside each card and `noHead` drops the column header (used for
// the late rounds — see BracketMatch).
function Column({ title, nums, emit, arm, heading, noHead, byNum, tz, hideScores }) {
  return (
    <div className={`bx-col${emit ? ' bx-emit' : ''}${arm ? ' bx-arm' : ''}`}>
      {!noHead && <div className="bx-col-head">{title}</div>}
      <div className="bx-col-body">
        {nums.map((n) => (
          <div className="bx-cell" key={n}>
            <BracketMatch num={n} byNum={byNum} tz={tz} hideScores={hideScores} heading={heading} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Each parent node is fed by an adjacent pair of children in the previous round
// (BRACKET_LINEAR keeps feeders vertically adjacent), so the tree edges are just
// parent i ← children 2i, 2i+1 across each round transition.
function buildEdges() {
  const rounds = [
    BRACKET_LINEAR.R32,
    BRACKET_LINEAR.R16,
    BRACKET_LINEAR.QF,
    BRACKET_LINEAR.SF,
    BRACKET_LINEAR.Final,
  ]
  const edges = []
  for (let r = 0; r < rounds.length - 1; r++) {
    const child = rounds[r]
    const parent = rounds[r + 1]
    for (let i = 0; i < parent.length; i++) {
      edges.push({ parent: parent[i], a: child[2 * i], b: child[2 * i + 1] })
    }
  }
  return edges
}

export default function Bracket({ matches, tz, hideScores, focusMatch, onFocusHandled }) {
  const byNum = matchesByNum(matches)
  const common = { byNum, tz, hideScores }
  const edges = useMemo(buildEdges, [])
  const bracketRef = useRef(null)
  const [lines, setLines] = useState([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Draw the connector tree as a computed SVG overlay. Reading each card's real
  // box (relative to the bracket) means the elbows land exactly between a node
  // and its two feeders regardless of card height, gaps, or column spacing —
  // which a pure-CSS pseudo-element approach can't guarantee.
  useLayoutEffect(() => {
    const wrap = bracketRef.current
    if (!wrap) return
    const compute = () => {
      const base = wrap.getBoundingClientRect()
      const pos = (n) => {
        const el = wrap.querySelector(`#bx-m${n}`)
        if (!el) return null
        const r = el.getBoundingClientRect()
        const x0 = r.left - base.left + wrap.scrollLeft
        const y0 = r.top - base.top + wrap.scrollTop
        return { left: x0, right: x0 + r.width, midY: y0 + r.height / 2 }
      }
      const segs = []
      for (const { parent, a, b } of edges) {
        const pa = pos(a)
        const pb = pos(b)
        const pp = pos(parent)
        if (!pa || !pb || !pp) continue
        const childRight = Math.max(pa.right, pb.right)
        const midX = Math.round((childRight + pp.left) / 2)
        const ya = Math.round(pa.midY)
        const yb = Math.round(pb.midY)
        const yp = Math.round(pp.midY)
        // Two stubs out of the children, a vertical join, one stub into the parent.
        segs.push(`M${Math.round(pa.right)} ${ya}H${midX}`)
        segs.push(`M${Math.round(pb.right)} ${yb}H${midX}`)
        segs.push(`M${midX} ${ya}V${yb}`)
        segs.push(`M${midX} ${yp}H${Math.round(pp.left)}`)
      }
      setLines(segs)
      setSize({ w: wrap.scrollWidth, h: wrap.scrollHeight })
    }
    compute()
    // ResizeObserver is absent in some environments (e.g. jsdom); degrade to a
    // one-shot compute + window-resize there rather than crashing.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(compute) : null
    ro?.observe(wrap)
    window.addEventListener('resize', compute)
    // Fonts can settle after first paint and shift card heights; recompute once.
    if (document.fonts?.ready) document.fonts.ready.then(compute)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [edges, matches, tz, hideScores])

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
      <div className="bracket" ref={bracketRef}>
        <svg className="bx-lines" width={size.w} height={size.h} aria-hidden="true">
          {lines.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
        <Column title={STAGE_LABELS.R32} nums={BRACKET_LINEAR.R32} emit {...common} />
        <Column title={STAGE_LABELS.R16} nums={BRACKET_LINEAR.R16} emit arm {...common} />
        {/* From the quarterfinals in, each card carries its own title (the column
            header would float too far from the cards in these tall columns); the
            earlier, denser rounds keep their column headers. */}
        <Column title={STAGE_LABELS.QF} nums={BRACKET_LINEAR.QF} emit arm noHead heading={STAGE_LABELS.QF} {...common} />
        <Column title={STAGE_LABELS.SF} nums={BRACKET_LINEAR.SF} emit arm noHead heading={STAGE_LABELS.SF} {...common} />

        {/* Final + third-place: titled cards clustered at the vertical centre,
            forming the peak of the pyramid. */}
        <div className="bx-col bx-col-final bx-arm">
          <div className="bx-col-body">
            <div className="bx-cell">
              <BracketMatch num={BRACKET_LINEAR.Final[0]} heading={`🏆 ${STAGE_LABELS.Final}`} {...common} />
            </div>
            <div className="bx-cell bx-cell-third">
              <BracketMatch num={BRACKET_LINEAR.third[0]} heading={`🥉 ${STAGE_LABELS['3rd']}`} {...common} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
