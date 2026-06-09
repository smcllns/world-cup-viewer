import { VENUES } from '../data/venues.js'
import { ALL_TEAMS, TEAMS } from '../data/teams.js'
import { STAGE_LABELS, STAGE_ORDER } from '../data/matches.js'
import { timezoneOptions } from '../utils/time.js'

const GROUPS = Object.keys(TEAMS)
const COUNTRIES = ['USA', 'Canada', 'Mexico']
const REGIONS = ['Western', 'Central', 'Eastern']

// One-click example queries that demonstrate the scoped-search syntax.
const SEARCH_EXAMPLES = ['team: Mexico', 'city: Dallas', 'stage: Final', 'group: C']

// Venues sorted by city for the dropdown.
const VENUE_OPTIONS = Object.entries(VENUES)
  .map(([id, v]) => ({ id, label: `${v.city} — ${v.name}` }))
  .sort((a, b) => a.label.localeCompare(b.label))

export default function Filters({ filters, setFilters, tz, setTz, detectedTz, resultCount }) {
  const update = (patch) => setFilters((f) => ({ ...f, ...patch }))

  // Search is hidden by default; open it if a query is already active (e.g.
  // restored from the URL). Closing it clears the query.
  const [searchOpen, setSearchOpen] = useState(() => Boolean(filters.search))
  const closeSearch = () => {
    setSearchOpen(false)
    update({ search: '' })
  }

  const toggleStage = (stage) =>
    setFilters((f) => {
      const stages = f.stages.includes(stage)
        ? f.stages.filter((s) => s !== stage)
        : [...f.stages, stage]
      return { ...f, stages }
    })

  const reset = () =>
    setFilters({
      search: '',
      stages: [],
      group: 'all',
      team: 'all',
      country: 'all',
      region: 'all',
      venue: 'all',
      timeframe: 'all',
      feed: 'both',
    })

  return (
    <div className="filters">
      <div className="filters-row filters-top">
        {searchOpen ? (
          <>
            <input
              className="search"
              type="search"
              autoFocus
              placeholder='Search — try "team: Mexico" or "city: Dallas"'
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
            />
            <button className="search-close" onClick={closeSearch} title="Hide search">
              ✕
            </button>
          </>
        ) : (
          <button className="search-toggle" onClick={() => setSearchOpen(true)}>
            🔍 Search
          </button>
        )}
        <label className="tz-picker">
          <span>🕒 Timezone</span>
          <select value={tz} onChange={(e) => setTz(e.target.value)}>
            {timezoneOptions(detectedTz).map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
                {z === detectedTz ? '  (yours)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {searchOpen && (
        <div className="search-hints">
          <span className="hint-label">Try:</span>
          {SEARCH_EXAMPLES.map((ex) => (
            <button key={ex} className="hint-chip" onClick={() => update({ search: ex })}>
              {ex}
            </button>
          ))}
          <span className="hint-note">
            fields: team · city · stadium · country · group · stage · region
          </span>
        </div>
      )}

      <div className="stage-chips">
        {STAGE_ORDER.map((s) => (
          <button
            key={s}
            className={`stage-chip${filters.stages.includes(s) ? ' active' : ''}`}
            onClick={() => toggleStage(s)}
          >
            {STAGE_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="filters-row">
        <label className="field">
          <span>Group</span>
          <select value={filters.group} onChange={(e) => update({ group: e.target.value })}>
            <option value="all">All groups</option>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                Group {g}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Team</span>
          <select value={filters.team} onChange={(e) => update({ team: e.target.value })}>
            <option value="all">All teams</option>
            {ALL_TEAMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Host country</span>
          <select value={filters.country} onChange={(e) => update({ country: e.target.value })}>
            <option value="all">All countries</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Region</span>
          <select value={filters.region} onChange={(e) => update({ region: e.target.value })}>
            <option value="all">All regions</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-wide">
          <span>City / Stadium</span>
          <select value={filters.venue} onChange={(e) => update({ venue: e.target.value })}>
            <option value="all">All venues</option>
            {VENUE_OPTIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>When</span>
          <select value={filters.timeframe} onChange={(e) => update({ timeframe: e.target.value })}>
            <option value="all">Any time</option>
            <option value="live">Live now</option>
            <option value="upcoming">Upcoming</option>
            <option value="finished">Finished</option>
          </select>
        </label>

        <label className="field">
          <span>Broadcast</span>
          <select value={filters.feed} onChange={(e) => update({ feed: e.target.value })}>
            <option value="both">English + Spanish</option>
            <option value="english">English only</option>
            <option value="spanish">Spanish only</option>
          </select>
        </label>
      </div>

      <div className="filters-row filters-foot">
        <span className="result-count">
          {resultCount} {resultCount === 1 ? 'match' : 'matches'}
        </span>
        <button className="reset" onClick={reset}>
          Reset filters
        </button>
      </div>
    </div>
  )
}
