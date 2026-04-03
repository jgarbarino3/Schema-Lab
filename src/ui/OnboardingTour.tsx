import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface OnboardingStep {
  body: ReactNode
  selector?: string
  title: string
}

interface OnboardingTourProps {
  currentStep: number
  isOpen: boolean
  onClose: () => void
  onNeverShowAgain: () => void
  onNext: () => void
  onPrevious: () => void
  steps: OnboardingStep[]
}

interface SpotlightRect {
  height: number
  left: number
  top: number
  width: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function OnboardingTour({
  currentStep,
  isOpen,
  onClose,
  onNeverShowAgain,
  onNext,
  onPrevious,
  steps,
}: OnboardingTourProps) {
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect>()
  const step = steps[currentStep]

  useLayoutEffect(() => {
    if (!isOpen || !step?.selector) {
      setSpotlightRect(undefined)
      return
    }

    const element = document.querySelector(step.selector)

    if (!(element instanceof HTMLElement)) {
      setSpotlightRect(undefined)
      return
    }

    const rect = element.getBoundingClientRect()
    const padding = 10

    setSpotlightRect({
      height: rect.height + padding * 2,
      left: clamp(rect.left - padding, 12, window.innerWidth - 60),
      top: clamp(rect.top - padding, 12, window.innerHeight - 60),
      width: rect.width + padding * 2,
    })
  }, [isOpen, step?.selector])

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return
    }

    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyWidth = document.body.style.width

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
      document.body.style.position = previousBodyPosition
      document.body.style.top = previousBodyTop
      document.body.style.width = previousBodyWidth
      window.scrollTo(scrollX, scrollY)
    }
  }, [isOpen])

  const cardStyle = useMemo(() => {
    if (!spotlightRect) {
      return undefined
    }

    const targetCenterX = spotlightRect.left + spotlightRect.width / 2
    const targetCenterY = spotlightRect.top + spotlightRect.height / 2
    const style: Record<string, number> = {
      maxWidth: Math.min(360, window.innerWidth - 32),
    }

    if (targetCenterX > window.innerWidth / 2) {
      style.left = 20
    } else {
      style.right = 20
    }

    if (targetCenterY > window.innerHeight / 2) {
      style.top = 20
    } else {
      style.bottom = 20
    }

    return style
  }, [spotlightRect])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !step) {
    return null
  }

  return createPortal(
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Schema-Lab onboarding">
      <div className="tour-overlay__backdrop" onClick={onClose} />
      {spotlightRect ? (
        <div
          className="tour-overlay__spotlight"
          style={{
            height: spotlightRect.height,
            left: spotlightRect.left,
            top: spotlightRect.top,
            width: spotlightRect.width,
          }}
        />
      ) : null}

      <div className="tour-card" style={cardStyle}>
        <div className="tour-card__meta">
          <span>Getting Started</span>
          <strong>
            {currentStep + 1} / {steps.length}
          </strong>
        </div>

        <div className="tour-card__content">
          <h2>{step.title}</h2>
          <div>{step.body}</div>
        </div>

        <div className="tour-card__actions">
          <div className="tour-card__secondary-actions">
            <button onClick={onClose} type="button">
              Exit
            </button>
            <button className="tour-card__ghost" onClick={onNeverShowAgain} type="button">
              Don’t show again
            </button>
          </div>

          <div className="tour-card__primary-actions">
            <button disabled={currentStep === 0} onClick={onPrevious} type="button">
              Back
            </button>
            <button className="tour-card__primary" onClick={onNext} type="button">
              {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
