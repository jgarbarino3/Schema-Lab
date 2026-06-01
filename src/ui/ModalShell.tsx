import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

interface ModalShellProps {
  ariaLabel?: string
  cardClassName?: string
  children: ReactNode
  className?: string
  onClose: () => void
  testId?: string
  titleId?: string
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.getClientRects().length > 0,
  )
}

export function ModalShell({
  ariaLabel,
  cardClassName = 'modal-shell__card',
  children,
  className,
  onClose,
  testId,
  titleId,
}: ModalShellProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const root = rootRef.current
    const focusTarget = root ? (getFocusableElements(root)[0] ?? root) : undefined
    focusTarget?.focus()

    return () => {
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()

    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key !== 'Tab' || !rootRef.current) {
      return
    }

    const focusableElements = getFocusableElements(rootRef.current)
    if (focusableElements.length === 0) {
      event.preventDefault()
      rootRef.current.focus()
      return
    }

    const first = focusableElements[0]
    const last = focusableElements[focusableElements.length - 1]

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      aria-label={titleId ? undefined : ariaLabel}
      aria-labelledby={titleId}
      aria-modal="true"
      className={className ? `modal-shell ${className}` : 'modal-shell'}
      onKeyDown={handleKeyDown}
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="modal-shell__backdrop" onClick={onClose} />
      <div className={cardClassName} data-testid={testId}>
        {children}
      </div>
    </div>
  )
}
