import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import App from '../src/App.jsx'
import { LIVE_SOURCE } from '../src/services/espn.js'
import { RESULTS_SOURCE } from '../src/services/results.js'

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ matches: [] }) }))
  window.history.replaceState(null, '', '/')
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// --- ESPN scoreboard payload builders -------------------------------------
function espnEvent({ home, away, date, state, hs, as, goals = [] }) {
  const homeId = '1'
  const awayId = '2'
  const details = goals.map((g) => ({
    scoringPlay: true,
    team: { id: g.side === 'home' ? homeId : awayId },
    clock: { displayValue: `${g.minute}'` },
    athletesInvolved: [{ shortName: g.name }],
  }))
  return {
    id: `${home}-${away}`,
    date,
    competitions: [
      {
        status: { type: { state } },
        competitors: [
          { homeAway: 'home', team: { id: homeId, displayName: home }, score: hs },
          { homeAway: 'away', team: { id: awayId, displayName: away }, score: as },
        ],
        details,
      },
    ],
    status: {
      type: {
        state,
        shortDetail: state === 'in' ? "67'" : state === 'post' ? 'FT' : '',
        description: state === 'in' ? 'In Progress' : state === 'post' ? 'Full Time' : '',
      },
    },
  }
}

function fetchWith(espnEvents) {
  return vi.fn(async (url) => {
    if (typeof url === 'string' && url.startsWith(LIVE_SOURCE.url)) {
      return { ok: true, json: async () => ({ events: espnEvents }) }
    }
    return { ok: true, json: async () => ({ matches: [] }) }
  })
}

describe('App coverage', () => {
  it('mounts and shows the header', () => {
    render(<App />)
    expect(screen.getByText(/World Cup 2026/)).toBeInTheDocument()
  })

  it('toggles the global spoiler (hideScores) switch', () => {
    render(<App />)
    const sw = screen.getByRole('switch', { name: /Show scores/ })
    expect(sw).toBeChecked() // scores shown by default
    fireEvent.click(sw)
    expect(sw).not.toBeChecked() // scores hidden
    fireEvent.click(sw)
    expect(sw).toBeChecked()
  })

  it('changes the timezone from the inline subtitle select and reflects it', () => {
    render(<App />)
    const tz = document.querySelector('.subtitle select.tz-inline')
    expect(tz).toBeTruthy()
    fireEvent.change(tz, { target: { value: 'Europe/London' } })
    expect(tz.value).toBe('Europe/London')
  })

  it('switches the match list between Upcoming and Played tabs', () => {
    render(<App />)
    const played = screen.getByRole('tab', { name: /Played/ })
    fireEvent.click(played)
    expect(played).toHaveAttribute('aria-selected', 'true')
    const upcoming = screen.getByRole('tab', { name: /Upcoming/ })
    fireEvent.click(upcoming)
    expect(upcoming).toHaveAttribute('aria-selected', 'true')
  })

  it('expands the groups disclosure to show the group tables', () => {
    render(<App />)
    fireEvent.click(screen.getByText(/Show group tables/))
    expect(screen.getByRole('heading', { name: 'Group A' })).toBeInTheDocument()
  })

  it('toggles theme (covers toggleTheme writing localStorage + dataset)', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Toggle theme/ }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('wc2026:theme')).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: /Toggle theme/ }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('hydrates tz and hideScores from the URL', () => {
    window.history.replaceState(null, '', '/?tz=America/New_York&hide=1')
    render(<App />)
    expect(screen.getByRole('combobox', { name: /Timezone/ }).value).toBe('America/New_York')
    expect(screen.getByRole('switch', { name: /Show scores/ })).not.toBeChecked()
  })

  it('"As it stands" link in Groups focuses a match in the bracket', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-20T16:00:00Z'))
    try {
      // Finished Group A matches so "As it stands" projects matchNum links.
      global.fetch = fetchWith([
        espnEvent({
          home: 'Mexico',
          away: 'South Africa',
          date: '2026-06-11T19:00:00Z',
          state: 'post',
          hs: '2',
          as: '0',
        }),
        espnEvent({
          home: 'South Korea',
          away: 'Czechia',
          date: '2026-06-12T02:00:00Z',
          state: 'post',
          hs: '1',
          as: '1',
        }),
      ])
      render(<App />)
      // Groups standings live behind the footer disclosure now; open it, then
      // wait for the finished-match data to project an "As it stands" link.
      fireEvent.click(screen.getByText(/Show group tables/))
      let link
      await vi.waitFor(() => {
        link = document.querySelector('button.ais-match-link')
        expect(link).toBeTruthy()
      })
      fireEvent.click(link)
      // The bracket is always mounted; clicking the link scrolls to it.
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // --- live / results merge --------------------------------------------------
  it('renders live + finished scores from the merged feeds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T19:30:00Z'))
    try {
      const live = espnEvent({
        home: 'Mexico',
        away: 'South Africa',
        date: '2026-06-11T19:00:00Z',
        state: 'in',
        hs: '1',
        as: '0',
        goals: [{ side: 'home', name: 'Jimenez', minute: 23 }],
      })
      const finished = espnEvent({
        home: 'South Korea',
        away: 'Czechia',
        date: '2026-06-12T02:00:00Z',
        state: 'post',
        hs: '2',
        as: '1',
      })
      global.fetch = fetchWith([live, finished])
      render(<App />)
      // Both played + live (live carries a running score) land in the "Played"
      // list. Wait for the merge, switch tabs, then assert the live LiveBadge
      // and the finished final score both render.
      await vi.waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(1))
      fireEvent.click(screen.getByRole('tab', { name: /Played/ }))
      await vi.waitFor(() => expect(document.querySelector('.ml-live')).toBeInTheDocument())
      expect(screen.getByText('2–1')).toBeInTheDocument() // finished score
    } finally {
      vi.useRealTimers()
    }
  })

  it('still renders the schedule when the OpenFootball feed fails', async () => {
    global.fetch = vi.fn(async (url) => {
      if (typeof url === 'string' && url.startsWith(RESULTS_SOURCE.url)) {
        return { ok: false, status: 500, json: async () => ({}) }
      }
      return { ok: true, json: async () => ({ events: [], matches: [] }) }
    })
    render(<App />)
    // No status bar to surface the error anymore; the app must still render the
    // static schedule (bracket + list) regardless of the feed rejecting.
    expect(screen.getByText(/World Cup 2026/)).toBeInTheDocument()
    expect(document.querySelector('.bracket')).toBeInTheDocument()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  })

  it('advances the live poll timer (30s when something is live)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T19:30:00Z'))
    try {
      const live = espnEvent({
        home: 'Mexico',
        away: 'South Africa',
        date: '2026-06-11T19:00:00Z',
        state: 'in',
        hs: '1',
        as: '0',
      })
      global.fetch = fetchWith([live])
      render(<App />)
      // A live match is on screen (its LiveBadge shows in the Played list), so
      // polling runs at the fast 30s cadence; advancing past 30s must trigger
      // another fetch round.
      await vi.waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(1))
      fireEvent.click(screen.getByRole('tab', { name: /Played/ }))
      await vi.waitFor(() => expect(document.querySelector('.ml-live')).toBeInTheDocument())
      const before = global.fetch.mock.calls.length
      await vi.advanceTimersByTimeAsync(31000)
      expect(global.fetch.mock.calls.length).toBeGreaterThan(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('toggleTheme swallows a localStorage.setItem failure', () => {
    render(<App />)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    try {
      fireEvent.click(screen.getByRole('button', { name: /Toggle theme/ }))
      // Theme still flips even though persistence failed.
      expect(document.documentElement.dataset.theme).toBe('light')
    } finally {
      spy.mockRestore()
    }
  })

  it('opens detail modal from a list row and closes it', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: /versus/ })[0])
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /Close/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
