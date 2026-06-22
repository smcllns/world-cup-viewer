import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import MatchList from '../src/components/MatchList.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import { MATCHES } from '../src/data/matches.js'

const renderList = (props) => {
  const openDetail = vi.fn()
  render(
    <FollowProvider>
      <DetailContext.Provider value={openDetail}>
        <MatchList tz="America/New_York" hideScores={false} {...props} />
      </DetailContext.Provider>
    </FollowProvider>,
  )
  return { openDetail }
}

// Build date-relative fixtures so the test is stable regardless of "today":
// played matches carry a final score (always classified finished); upcoming
// matches are dated well into the future with no score.
const group = MATCHES.filter((m) => m.stage === 'Group')
const iso = (days, num, extra) => ({
  ...group[num % group.length],
  num: num,
  ko: new Date(Date.now() + days * 86400000).toISOString(),
  ...extra,
})
const played1 = iso(-5, 8001, { score: [2, 1], t1: 'Mexico', t2: 'South Africa' })
const played2 = iso(-4, 8002, { score: [0, 0], t1: 'Canada', t2: 'Croatia' })
const upcoming = [
  iso(5, 8003, { t1: 'Brazil', t2: 'Serbia', score: undefined, live: undefined }),
  iso(6, 8004, { t1: 'France', t2: 'Senegal', score: undefined, live: undefined }),
  iso(7, 8005, { t1: 'Spain', t2: 'Japan', score: undefined, live: undefined }),
]
const fixture = [played1, played2, ...upcoming]

describe('MatchList', () => {
  it('defaults to Upcoming and shows upcoming (unscored) matches', () => {
    renderList({ matches: fixture })
    expect(screen.getByRole('tab', { name: 'Upcoming' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(upcoming[0].t1)).toBeInTheDocument()
    // A played match should not be in the upcoming list.
    expect(screen.queryByText('2–1')).not.toBeInTheDocument()
  })

  it('toggling to Played shows finished matches with scores', () => {
    renderList({ matches: fixture })
    fireEvent.click(screen.getByRole('tab', { name: 'Played' }))
    expect(screen.getByText('2–1')).toBeInTheDocument()
    expect(screen.getByText(played1.t1)).toBeInTheDocument()
    // An upcoming match should now be hidden.
    expect(screen.queryByText(upcoming[0].t1)).not.toBeInTheDocument()
  })

  it('hides scores in Played when hideScores is set', () => {
    renderList({ matches: fixture, hideScores: true })
    fireEvent.click(screen.getByRole('tab', { name: 'Played' }))
    expect(screen.queryByText('2–1')).not.toBeInTheDocument()
    expect(screen.getAllByText('v').length).toBeGreaterThan(0)
  })

  it('opens the detail modal when a row is clicked', () => {
    const { openDetail } = renderList({ matches: fixture })
    fireEvent.click(screen.getByText(upcoming[0].t1).closest('button'))
    expect(openDetail).toHaveBeenCalled()
  })

  it('renders day headers grouping matches by date', () => {
    renderList({ matches: fixture })
    // Each upcoming match has a kickoff date; at least one "Wd · Mon D" header.
    expect(screen.getAllByText(/·/).length).toBeGreaterThan(0)
  })

  it('shows a live badge for a live match and keeps it in Upcoming', () => {
    const live = iso(0, 8099, { t1: 'Italy', t2: 'Ghana', score: undefined, live: { clock: "12'", detail: '1st Half' } })
    renderList({ matches: [live, played1] })
    expect(screen.getByText(/12'/)).toBeInTheDocument()
  })

  it('shows an empty state when a tab has no matches', () => {
    renderList({ matches: [played1, played2] })
    expect(screen.getByText('No upcoming matches.')).toBeInTheDocument()
  })

  it('orders played days reverse-chronologically', () => {
    // Two played matches on different days; most recent day should appear first.
    const early = { ...group[0], num: 9001, score: [1, 0], ko: '2026-06-12T15:00:00-04:00' }
    const late = { ...group[1], num: 9002, score: [2, 0], ko: '2026-06-20T15:00:00-04:00' }
    renderList({ matches: [early, late] })
    fireEvent.click(screen.getByRole('tab', { name: 'Played' }))
    const heads = screen.getAllByRole('heading', { level: 3 })
    expect(heads[0]).toHaveTextContent('Jun 20')
    expect(heads[1]).toHaveTextContent('Jun 12')
  })
})

describe('MatchList country filter', () => {
  const openPicker = () => {
    // The trigger's label is "Filter by country" when empty and "Filtering by
    // X. Change country" once a country is picked — match either.
    fireEvent.click(screen.getByRole('button', { name: /^(Filter by country|Filtering by)/ }))
    return screen.getByRole('dialog', { name: 'Filter by country' })
  }

  it('defaults to all countries', () => {
    renderList({ matches: fixture })
    expect(screen.getByRole('button', { name: /Filter by country/ })).toHaveTextContent('All')
    // Every upcoming match is visible while unfiltered.
    expect(screen.getByText('Serbia')).toBeInTheDocument()
    expect(screen.getByText('France')).toBeInTheDocument()
  })

  it('filters the list to a single country once picked', () => {
    renderList({ matches: fixture })
    const dialog = openPicker()
    fireEvent.click(within(dialog).getByRole('button', { name: /Brazil/ }))
    // Brazil v Serbia stays; the other countries' matches drop out.
    expect(screen.getByText('Serbia')).toBeInTheDocument()
    expect(screen.queryByText('France')).not.toBeInTheDocument()
    expect(screen.queryByText('Spain')).not.toBeInTheDocument()
  })

  it('clears the filter with the ✕ button', () => {
    renderList({ matches: fixture })
    const dialog = openPicker()
    fireEvent.click(within(dialog).getByRole('button', { name: /Brazil/ }))
    expect(screen.queryByText('France')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Clear country filter/ }))
    expect(screen.getByText('France')).toBeInTheDocument()
  })

  it('clears the filter via the All countries option', () => {
    renderList({ matches: fixture })
    fireEvent.click(within(openPicker()).getByRole('button', { name: /Brazil/ }))
    expect(screen.queryByText('France')).not.toBeInTheDocument()
    fireEvent.click(within(openPicker()).getByRole('button', { name: /All countries/ }))
    expect(screen.getByText('France')).toBeInTheDocument()
  })

  it('shows a country-specific empty state', () => {
    renderList({ matches: fixture })
    // Norway is a real team with no match in the fixture.
    fireEvent.click(within(openPicker()).getByRole('button', { name: /Norway/ }))
    expect(screen.getByText('No upcoming matches for Norway.')).toBeInTheDocument()
  })
})
