import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import Bracket from '../src/components/Bracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import { MATCHES } from '../src/data/matches.js'

Element.prototype.scrollIntoView = vi.fn()

// Decorate a few knockout matches with scores/pens/aet/live so the score-display
// branches render.
function withScores() {
  return MATCHES.map((m) => {
    if (m.num === 104) return { ...m, score: [1, 1], pens: [4, 2] } // Final w/ pens
    if (m.num === 103) return { ...m, score: [2, 1], aet: true } // 3rd-place AET
    if (m.num === 74) return { ...m, score: [3, 0] } // plain score
    if (m.num === 77) return { ...m, live: true, score: [0, 0] } // live
    return m
  })
}

const renderBracket = (matches, props = {}) => {
  const openDetail = vi.fn()
  render(
    <FollowProvider>
      <DetailContext.Provider value={openDetail}>
        <Bracket matches={matches} tz="America/New_York" hideScores={false} {...props} />
      </DetailContext.Provider>
    </FollowProvider>,
  )
  return { openDetail }
}

describe('Bracket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all columns including final and third-place', () => {
    renderBracket(MATCHES)
    expect(screen.getAllByText(/Final/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Round of 32/).length).toBeGreaterThan(0)
  })

  it('renders scores, penalties, AET, and the live badge', () => {
    renderBracket(withScores())
    // Scores render as a per-team value flush-right on each team row.
    const finalCard = document.getElementById('bx-m104')
    expect(within(finalCard).getByText(/p 4–2/)).toBeInTheDocument() // pens
    const finalScores = finalCard.querySelectorAll('.bx-side-score')
    expect([...finalScores].map((s) => s.textContent)).toEqual(['1', '1']) // 1–1

    const thirdCard = document.getElementById('bx-m103')
    expect(within(thirdCard).getByText(/AET/)).toBeInTheDocument()
    expect([...thirdCard.querySelectorAll('.bx-side-score')].map((s) => s.textContent)).toEqual([
      '2',
      '1',
    ]) // 2–1 AET

    const plainCard = document.getElementById('bx-m74')
    expect([...plainCard.querySelectorAll('.bx-side-score')].map((s) => s.textContent)).toEqual([
      '3',
      '0',
    ]) // plain 3–0

    // Live badge for the in-progress match.
    const liveCard = document.getElementById('bx-m77')
    expect(within(liveCard).getByText(/LIVE/i)).toBeInTheDocument()
  })

  it('hides scores when hideScores is set', () => {
    renderBracket(withScores(), { hideScores: true })
    expect(document.querySelector('.bx-side-score')).toBeNull()
  })

  it('opens detail on click and on keyboard activation', () => {
    const { openDetail } = renderBracket(MATCHES)
    const card = document.getElementById('bx-m74')
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    fireEvent.keyDown(card, { key: 'Escape' }) // ignored branch
    expect(openDetail).toHaveBeenCalledTimes(3)
  })

  it('scrolls a focused match into view and calls onFocusHandled', () => {
    const onFocusHandled = vi.fn()
    renderBracket(MATCHES, { focusMatch: 74, onFocusHandled })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(onFocusHandled).toHaveBeenCalled()
  })

  it('handles a focusMatch that does not exist (no element)', () => {
    const onFocusHandled = vi.fn()
    renderBracket(MATCHES, { focusMatch: 99999, onFocusHandled })
    expect(onFocusHandled).toHaveBeenCalled()
  })

  it('does nothing when focusMatch is null', () => {
    const onFocusHandled = vi.fn()
    renderBracket(MATCHES, { focusMatch: null, onFocusHandled })
    expect(onFocusHandled).not.toHaveBeenCalled()
  })

  it('clears the focus highlight after the timeout', () => {
    vi.useFakeTimers()
    try {
      renderBracket(MATCHES, { focusMatch: 74 })
      const el = document.getElementById('bx-m74')
      expect(el.classList.contains('bx-focus')).toBe(true)
      vi.advanceTimersByTime(2300)
      expect(el.classList.contains('bx-focus')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
