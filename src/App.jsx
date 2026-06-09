import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MATCHES } from './data/matches.js'
import { VENUES } from './data/venues.js'
import Filters from './components/Filters.jsx'
import MatchCard from './components/MatchCard.jsx'
import Bracket from './components/Bracket.jsx'
import Standings from './components/Standings.jsx'
import WeekView from './components/WeekView.jsx'
import { detectTimezone, formatDateLong, dayKey, matchStatus } from './utils/time.js'
import { readState, writeState } from './utils/urlState.js'
import { parseQuery, matchesSearch } from './utils/search.js'
import { fetchResults, applyResults, RESULTS_SOURCE } from './services/results.js'

const REFRESH_MS = 120000 // auto-refresh scores every 2 minutes while open

const VIEWS = [
  { id: 'schedule', label: '📅 Schedule' },
  { id: 'week', label: '📆 Week' },
  { id: 'groups', label: '📊 Groups' },
  { id: 'bracket', label: '🏆 Bracket' },
]

const INITIAL_FILTERS = {
  search: '',
  stages: [],
  group: 'all',
  team: 'all',
  country: 'all',
  region: 'all',
  venue: 'all',
  timeframe: 'all',
  feed: 'both',
}

// How many filters are actively narrowing the results (ignores tz & feed view).
function countActiveFilters(f) {
  let n = 0
  if (f.search.trim()) n++
  n += f.stages.length
  for (const k of ['group', 'team', 'country', 'region', 'venue', 'timeframe']) {
    if (f[k] !== 'all') n++
  }
  return n
}

export default function App() {
  const detectedTz = useMemo(detectTimezone, [])
  const initial = useMemo(() => readState(detectedTz), [detectedTz])

  const [view, setView] = useState(initial.view)
  const [tz, setTz] = useState(initial.tz)
  const [filters, setFilters] = useState(initial.filters)
  const [hideScores, setHideScores] = useState(initial.hideScores)
  // Filter panel is collapsed by default; opens automatically if a shared URL
  // arrives with filters already applied.
  const [filtersOpen, setFiltersOpen] = useState(() => countActiveFilters(initial.filters) > 0)
  // Per-day spoiler overrides: dayKey -> bool. Undefined means "follow global".
  const [dayOverrides, setDayOverrides] = useState({})

  // Live results fetched from the API and merged into the static schedule.
  const [results, setResults] = useState(null)
  const [resultsState, setResultsState] = useState('loading') // loading | ok | error
  const [updatedAt, setUpdatedAt] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const abortRef = useRef(null)

  const loadResults = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setResultsState((s) => (s === 'ok' ? 'ok' : 'loading'))
    try {
      const map = await fetchResults(ctrl.signal)
      setResults(map)
      setResultsState('ok')
      setUpdatedAt(Date.now())
    } catch (err) {
      if (err.name !== 'AbortError') setResultsState('error')
    }
  }, [])

  useEffect(() => {
    loadResults()
    return () => abortRef.current?.abort()
  }, [loadResults])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(loadResults, REFRESH_MS)
    return () => clearInterval(id)
  }, [autoRefresh, loadResults])

  // Merge API scores / resolved knockout teams into the schedule (immutably).
  const matches = useMemo(() => applyResults(MATCHES, results), [results])
  const finishedCount = useMemo(() => matches.filter((m) => m.score).length, [matches])

  // Keep the URL in sync with shareable state.
  useEffect(() => {
    writeState({ view, tz, hideScores, filters }, detectedTz)
  }, [view, tz, hideScores, filters, detectedTz])

  const dayHidden = (key) =>
    dayOverrides[key] !== undefined ? dayOverrides[key] : hideScores

  const toggleDay = (key) =>
    setDayOverrides((o) => ({ ...o, [key]: !dayHidden(key) }))

  const activeCount = useMemo(() => countActiveFilters(filters), [filters])

  const filtered = useMemo(() => {
    const parsed = parseQuery(filters.search)
    return matches.filter((m) => {
      const venue = VENUES[m.venue]
      if (filters.stages.length && !filters.stages.includes(m.stage)) return false
      if (filters.group !== 'all' && m.group !== filters.group) return false
      if (filters.team !== 'all' && m.t1 !== filters.team && m.t2 !== filters.team) return false
      if (filters.country !== 'all' && venue.country !== filters.country) return false
      if (filters.region !== 'all' && venue.region !== filters.region) return false
      if (filters.venue !== 'all' && m.venue !== filters.venue) return false
      if (filters.timeframe !== 'all' && matchStatus(m.ko) !== filters.timeframe) return false
      if (!matchesSearch(m, venue, parsed)) return false
      return true
    })
  }, [filters, matches])

  const days = useMemo(() => {
    const map = new Map()
    for (const m of filtered) {
      const key = dayKey(m.ko, tz)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(m)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered, tz])

  return (
    <div className="app">
      <header className="app-header">
        <div className="title-block">
          <h1>
            <span className="trophy">🏆</span> World Cup 2026
          </h1>
          <p className="subtitle">
            All 104 matches · USA · Canada · Mexico · shown in{' '}
            <strong>{tz.replace(/_/g, ' ')}</strong>
          </p>
        </div>
        <div className="view-bar">
          <div className="view-switch">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={`view-btn${view === v.id ? ' active' : ''}`}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button
            className={`spoiler-btn${hideScores ? ' active' : ''}`}
            onClick={() => {
              setHideScores((h) => !h)
              setDayOverrides({}) // global change resets per-day overrides
            }}
            title="Toggle spoiler-free mode for all scores"
          >
            {hideScores ? '🙈 Scores hidden' : '👁 Scores shown'}
          </button>
        </div>
      </header>

      <div className={`results-bar results-${resultsState}`}>
        <span className="results-dot" />
        <span className="results-text">
          {resultsState === 'loading' && 'Loading live results…'}
          {resultsState === 'error' && 'Couldn’t reach results feed — showing schedule only.'}
          {resultsState === 'ok' && finishedCount > 0 && `${finishedCount} match${finishedCount === 1 ? '' : 'es'} with scores`}
          {resultsState === 'ok' && finishedCount === 0 && 'No results yet — kickoff is June 11, 2026'}
        </span>
        {updatedAt && resultsState === 'ok' && (
          <span className="results-updated">
            updated{' '}
            {new Date(updatedAt).toLocaleTimeString('en-US', {
              timeZone: tz,
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        )}
        <span className="results-source">
          via{' '}
          <a href={RESULTS_SOURCE.homepage} target="_blank" rel="noopener noreferrer">
            {RESULTS_SOURCE.name}
          </a>
        </span>
        <label className="results-auto">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          auto
        </label>
        <button className="results-refresh" onClick={loadResults} disabled={resultsState === 'loading'}>
          ⟳ Refresh
        </button>
      </div>

      {(view === 'schedule' || view === 'week') && (
        <>
          <div className="controls-bar">
            <button
              className={`filters-toggle${filtersOpen ? ' open' : ''}`}
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
            >
              ⚙ Filters &amp; Search
              {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
              <span className="chev">{filtersOpen ? '▲' : '▼'}</span>
            </button>
            {activeCount > 0 && (
              <button className="clear-mini" onClick={() => setFilters(INITIAL_FILTERS)}>
                Clear all
              </button>
            )}
          </div>
          {filtersOpen && (
            <Filters
              filters={filters}
              setFilters={setFilters}
              tz={tz}
              setTz={setTz}
              detectedTz={detectedTz}
              resultCount={filtered.length}
            />
          )}
        </>
      )}

      {view === 'week' && (
        <main className="week-view">
          <WeekView allMatches={matches} shown={filtered} tz={tz} dayHidden={dayHidden} />
        </main>
      )}

      {view === 'schedule' && (
        <>
          <main className="schedule">
            {days.length === 0 && (
              <div className="empty">
                <p>No matches match your filters.</p>
              </div>
            )}
            {days.map(([key, matches]) => {
              const hidden = dayHidden(key)
              return (
                <section key={key} className="day">
                  <div className="day-header">
                    <h2>{formatDateLong(matches[0].ko, tz)}</h2>
                    <button className="day-spoiler" onClick={() => toggleDay(key)}>
                      {hidden ? '🙈 Show scores' : '👁 Hide scores'}
                    </button>
                  </div>
                  <div className="day-matches">
                    {matches.map((m) => (
                      <MatchCard key={m.num} match={m} tz={tz} feed={filters.feed} hidden={hidden} />
                    ))}
                  </div>
                </section>
              )
            })}
          </main>
        </>
      )}

      {view === 'groups' && (
        <main className="groups-view">
          <Standings matches={matches} hideScores={hideScores} />
        </main>
      )}

      {view === 'bracket' && (
        <main className="bracket-view">
          <Bracket matches={matches} tz={tz} hideScores={hideScores} />
        </main>
      )}

      <footer className="app-footer">
        <p>
          Kickoff times convert automatically to your selected timezone. Broadcast info is for the
          United States — FOX &amp; Telemundo are free over the air. Schedule per the FIFA Final
          Draw (Dec 5, 2025). Filters, timezone &amp; view are saved to the URL — bookmark or share
          it.
        </p>
      </footer>
    </div>
  )
}
