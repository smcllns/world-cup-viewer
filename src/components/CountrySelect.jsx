import { FLAG_BY_TEAM, ALL_TEAMS } from '../data/teams.js'
import { useModalA11y } from '../hooks/useModalA11y.js'

// Single-select country picker shown as a modal over the match list. Picking a
// country (or "All countries") filters both the Upcoming and Played lists; the
// caller owns the selected value and clears it via the row's ✕.
export default function CountrySelect({ selected, onSelect, onClose }) {
  const cardRef = useModalA11y(onClose)
  const choose = (name) => {
    onSelect(name)
    onClose()
  }

  return (
    <div className="md-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Filter by country">
      <div className="cs-card md-card" ref={cardRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button className="md-close" onClick={onClose} aria-label="Close">✕</button>
        <h2 className="cs-title">Filter by country</h2>
        <div className="cs-list">
          <button
            type="button"
            className={`cs-item cs-item-all${selected == null ? ' active' : ''}`}
            onClick={() => choose(null)}
          >
            <span className="cs-flag">🌐</span>
            <span className="cs-name">All countries</span>
          </button>
          {ALL_TEAMS.map((name) => (
            <button
              type="button"
              key={name}
              className={`cs-item${selected === name ? ' active' : ''}`}
              aria-pressed={selected === name}
              onClick={() => choose(name)}
            >
              <span className="cs-flag">{FLAG_BY_TEAM[name] || '•'}</span>
              <span className="cs-name">{name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
