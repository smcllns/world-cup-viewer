import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import App from '../src/App.jsx'

// Mock the results feed so mount doesn't hit the network.
beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ matches: [] }) }))
  window.history.replaceState(null, '', '/')
})

describe('App renders (smoke test)', () => {
  // This is the test that would have caught the "black page" crash: a component
  // using a hook without importing it throws on render, and render() rejects.
  it('mounts without crashing and shows the header + views', () => {
    render(<App />)
    expect(screen.getByText(/World Cup 2026/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Schedule/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Week/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Groups/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bracket/ })).toBeInTheDocument()
  })

  it('keeps the filter panel and search collapsed by default', () => {
    render(<App />)
    // Only a compact toggle shows; the panel, search button, and dropdowns are hidden.
    expect(screen.getByRole('button', { name: /Filters & Search/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /🔍 Search/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Group')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/team: Mexico/)).not.toBeInTheDocument()
  })

  it('opens the panel, then the search, and filters with a scoped query', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Filters & Search/ }))
    fireEvent.click(screen.getByRole('button', { name: /🔍 Search/ }))
    const input = screen.getByPlaceholderText(/team: Mexico/)
    fireEvent.change(input, { target: { value: 'team: Mexico' } })
    // Mexico plays 3 group matches.
    expect(screen.getByText(/^3 matches$/)).toBeInTheDocument()
  })

  it('shows an active-filter count and "Clear all" when a filter is applied', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Filters & Search/ }))
    fireEvent.click(screen.getByRole('button', { name: /🔍 Search/ }))
    fireEvent.change(screen.getByPlaceholderText(/team: Mexico/), {
      target: { value: 'team: Brazil' },
    })
    expect(screen.getByRole('button', { name: /Clear all/ })).toBeInTheDocument()
    // Clearing resets results back to all 104 matches.
    fireEvent.click(screen.getByRole('button', { name: /Clear all/ }))
    expect(screen.queryByRole('button', { name: /Clear all/ })).not.toBeInTheDocument()
  })

  it('switches to each view without crashing', () => {
    render(<App />)
    for (const name of [/Week/, /Groups/, /Bracket/, /Schedule/]) {
      fireEvent.click(screen.getByRole('button', { name }))
    }
    // Bracket/standings rendered fine; header still present.
    expect(screen.getByText(/World Cup 2026/)).toBeInTheDocument()
  })

  it('renders all 4 group tables in the Groups view', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Groups/ }))
    expect(screen.getByText('Group A')).toBeInTheDocument()
    expect(screen.getByText('Group L')).toBeInTheDocument()
  })
})
