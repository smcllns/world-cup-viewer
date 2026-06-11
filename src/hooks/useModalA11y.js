import { useEffect, useRef } from 'react'

// Accessibility plumbing shared by the modals: close on Escape, trap Tab focus
// inside the dialog, focus the first control on open, and restore focus to
// whatever was focused before (the trigger) on close. Returns a ref to put on
// the dialog container (which should have tabIndex={-1} as a focus fallback).
export function useModalA11y(onClose) {
  const ref = useRef(null)
  useEffect(() => {
    const previouslyFocused = document.activeElement
    const node = ref.current
    const focusable = () =>
      node
        ? [...node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
            (el) => !el.disabled && el.offsetParent !== null,
          )
        : []

    const els = focusable()
    ;(els[0] || node)?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const f = focusable()
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus()
    }
  }, [onClose])
  return ref
}
