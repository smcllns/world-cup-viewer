import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MATCHES } from './data/matches.js'
import Bracket from './components/Bracket.jsx'
import Standings from './components/Standings.jsx'
import MatchList from './components/MatchList.jsx'
import MatchDetail from './components/MatchDetail.jsx'
import { detectTimezone, timezoneOptions } from './utils/time.js'
import { readState, writeState } from './utils/urlState.js'
import { fetchResults, applyResults, RESULTS_SOURCE, openFootballFinalScore } from './services/results.js'
import { fetchLive, applyLive, LIVE_SOURCE, espnFinalScore, historyDates } from './services/espn.js'
import { fetchBackup, BACKUP_SOURCE, sdbFinalScore } from './services/thesportsdb.js'
import { annotateScoreChecks } from './services/reconcile.js'
import { computeClinch, resolveClinchedSlots } from './utils/clinch.js'
import { resolveKnockoutSlots } from './utils/bracket.js'
import { useFollow } from './context/follow.jsx'
import { DetailContext } from './context/detail.js'

const REFRESH_MS = 120000 // auto-refresh every 2 minutes when nothing is live
const LIVE_REFRESH_MS = 30000 // poll every 30s while a match is in progress

export default function App() {
  const detectedTz = useMemo(detectTimezone, [])
  const initial = useMemo(() => readState(detectedTz), [detectedTz])

  const [theme, setTheme] = useState(
    () => (typeof document !== 'undefined' && document.documentElement.dataset.theme) || 'dark',
  )
  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light'
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem('wc2026:theme', next)
      } catch {
        /* ignore */
      }
      return next
    })

  const [detailMatch, setDetailMatch] = useState(null)

  // A match number to focus in the bracket (set when an "As it stands" link is
  // clicked); the Bracket scrolls to and highlights it, then clears this.
  const [focusMatch, setFocusMatch] = useState(null)
  const bracketRef = useRef(null)
  const goToBracketMatch = (num) => {
    setFocusMatch(num)
    bracketRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const [tz, setTz] = useState(initial.tz)
  const [hideScores, setHideScores] = useState(initial.hideScores)

  // Results merged into the static schedule from three independent sources:
  //   • OpenFootball (`results`) — source of record (post-match final scores).
  //   • ESPN (`live`) — best-effort live overlay (running score + clock).
  //   • TheSportsDB (`backup`) — best-effort backup + final-score cross-check.
  const [results, setResults] = useState(null)
  const [live, setLive] = useState(null)
  const [history, setHistory] = useState(null)
  const [backup, setBackup] = useState(null)
  const abortRef = useRef(null)

  // Poll all three feeds; merge silently into the schedule. There's no UI
  // status bar — live matches surface themselves via their LiveBadge in the list.
  const loadResults = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const [of, espn, sdb] = await Promise.allSettled([
      fetchResults(ctrl.signal),
      fetchLive(ctrl.signal),
      fetchBackup(ctrl.signal),
    ])
    if (espn.status === 'fulfilled') setLive(espn.value)
    if (sdb.status === 'fulfilled') setBackup(sdb.value)
    if (of.status === 'fulfilled') setResults(of.value)
  }, [])

  useEffect(() => {
    loadResults()
    return () => abortRef.current?.abort()
  }, [loadResults])

  // Backfill cards/subs for matches that finished before the live window. ESPN
  // drops them from the rolling scoreboard after a couple of days, so without an
  // explicit by-date fetch their detail timelines lose their 🟨🟥. This data is
  // static once a match ends, so we fetch it once (no polling) and overlay it
  // beneath the live window, which still wins for anything recent.
  useEffect(() => {
    const ctrl = new AbortController()
    fetchLive(ctrl.signal, historyDates(MATCHES))
      .then((map) => map.size && setHistory(map))
      .catch(() => {}) // best-effort; live + OpenFootball still render
    return () => ctrl.abort()
  }, [])

  // Merge into the schedule (immutably): OpenFootball first (source of record),
  // overlay ESPN's live/just-finished scores where OpenFootball has none, then
  // annotate each final with how many independent sources confirm it.
  const matches = useMemo(() => {
    const merged = applyLive(applyLive(applyResults(MATCHES, results), history), live)
    const sources = [
      results && { name: RESULTS_SOURCE.name, score: (m) => openFootballFinalScore(m, results) },
      // ESPN confirms via the live window OR the by-date backfill — otherwise a
      // finished match silently drops to "1 source" once it ages out of ESPN's
      // rolling 3-day scoreboard, even though ESPN still has the final.
      (live || history) && {
        name: LIVE_SOURCE.name,
        score: (m) => (live && espnFinalScore(m, live)) || (history && espnFinalScore(m, history)),
      },
      backup && { name: BACKUP_SOURCE.name, score: (m) => sdbFinalScore(m, backup) },
    ].filter(Boolean)
    return annotateScoreChecks(merged, sources)
  }, [results, live, history, backup])
  const liveCount = useMemo(() => matches.filter((m) => m.live).length, [matches])
  // Guaranteed clinch/elimination status per team (see utils/clinch.js).
  const clinch = useMemo(() => computeClinch(matches), [matches])
  // Fill clinched group winners into knockout "Winner Group X" slots, then
  // propagate each decided knockout result into the "Winner Match N" slot it
  // feeds, so a resolved team reaches every view consistently (list, bracket,
  // detail modal, calendar) instead of waiting for the feed to publish each
  // downstream matchup.
  const displayMatches = useMemo(
    () => resolveKnockoutSlots(resolveClinchedSlots(matches, clinch)),
    [matches, clinch],
  )

  // Auto-refresh (always on): poll fast (30s) while a match is live so the score
  // and clock track ESPN closely, and slow (2 min) otherwise to go easy on the
  // feeds. Polling is silent — no UI control.
  useEffect(() => {
    const id = setInterval(loadResults, liveCount > 0 ? LIVE_REFRESH_MS : REFRESH_MS)
    return () => clearInterval(id)
  }, [loadResults, liveCount])

  // Keep the URL in sync with shareable state.
  useEffect(() => {
    writeState({ tz, hideScores }, detectedTz)
  }, [tz, hideScores, detectedTz])

  return (
    <DetailContext.Provider value={setDetailMatch}>
    <div className="app">
      <header className="app-header">
        <div className="hero-corner">
          <button
            className="icon-btn"
            onClick={toggleTheme}
            title="Toggle light / dark theme"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? '🌙' : '🌞'}
          </button>
        </div>
        <div className="title-block">
          <h1>
            <span className="trophy">🏆</span> World Cup 2026
          </h1>
          <p className="subtitle">
            All 104 matches · USA · Canada · Mexico · shown in{' '}
            <select
              className="tz-inline"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              aria-label="Timezone"
            >
              {timezoneOptions(detectedTz).map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>{' '}
            timezone
          </p>
        </div>
      </header>

      <section ref={bracketRef} className="bracket-view">
        <Bracket
          matches={displayMatches}
          tz={tz}
          hideScores={hideScores}
          focusMatch={focusMatch}
          onFocusHandled={() => setFocusMatch(null)}
        />
      </section>

      <hr className="section-rule" />

      <section className="list-view">
        <MatchList matches={displayMatches} tz={tz} hideScores={hideScores} setHideScores={setHideScores} />
      </section>

      <hr className="section-rule" />

      <footer className="app-footer">
        <details className="groups-disclosure">
          <summary>📊 Show group tables</summary>
          <div className="groups-view">
            <Standings
              matches={matches}
              hideScores={hideScores}
              clinch={clinch}
              onGoToMatch={goToBracketMatch}
            />
          </div>
        </details>

        <div className="footer-fineprint">
          <p>
            Kickoff times convert automatically to your selected timezone. Broadcast info is for the
            United States — FOX &amp; Telemundo are free over the air. Schedule per the FIFA Final
            Draw (Dec 5, 2025); kickoff times are cross-checked daily against FIFA&rsquo;s official
            schedule. Your timezone &amp; spoiler mode are saved to the URL — bookmark or share it.
          </p>
          <p className="disclaimer">
            An unofficial fan-made project. Not affiliated with, endorsed by, or sponsored by FIFA.
            “World Cup”, team, broadcaster, and tournament names are trademarks of their respective
            owners. Schedule &amp; results data via{' '}
            <a href={RESULTS_SOURCE.homepage} target="_blank" rel="noopener noreferrer">OpenFootball</a>{' '}
            (public domain); live in-match scores via{' '}
            <a href={LIVE_SOURCE.homepage} target="_blank" rel="noopener noreferrer">ESPN</a>; final
            scores cross-checked against{' '}
            <a href={BACKUP_SOURCE.homepage} target="_blank" rel="noopener noreferrer">TheSportsDB</a>.
          </p>
          <p className="credit">
            Created by{' '}
            <a href="https://samcollins.blog" target="_blank" rel="noopener noreferrer">
              Sam Collins
            </a>{' '}
            ·{' '}
            <a href="https://github.com/smcllns/world-cup-tracker" target="_blank" rel="noopener noreferrer">
              github
            </a>{' '}
            (fork of{' '}
            <a href="https://github.com/ismayc/world-cup-viewer" target="_blank" rel="noopener noreferrer">
              ismayc/world-cup-viewer
            </a>
            )
          </p>
        </div>
      </footer>

      {detailMatch && (
        <MatchDetail
          match={detailMatch}
          tz={tz}
          hideScores={hideScores}
          onClose={() => setDetailMatch(null)}
        />
      )}
    </div>
    </DetailContext.Provider>
  )
}
