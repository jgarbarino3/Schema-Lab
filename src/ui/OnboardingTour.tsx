import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

export function OnboardingTour({
  currentStep,
  isOpen,
  onClose,
  onNeverShowAgain,
  onNext,
  onPrevious,
  steps,
}: OnboardingTourProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect>()
  const [offscreenDir, setOffscreenDir] = useState<'up' | 'down' | null>(null)
  const cardStyleRef = useRef<Record<string, number> | undefined>(undefined)
  const step = steps[currentStep]

  const recalcSpotlight = useCallback(() => {
    if (!step?.selector) {
      setSpotlightRect(undefined)
      setOffscreenDir(null)
      return
    }

    const element = document.querySelector(step.selector)

    if (!(element instanceof HTMLElement)) {
      setSpotlightRect(undefined)
      setOffscreenDir(null)
      return
    }

    const rect = element.getBoundingClientRect()
    const padding = 10

    setSpotlightRect({
      height: rect.height + padding * 2,
      left: rect.left - padding,
      top: rect.top - padding,
      width: rect.width + padding * 2,
    })
    setOffscreenDir(null)
  }, [step?.selector])

  const checkVisibility = useCallback(() => {
    if (!step?.selector) {
      setOffscreenDir(null)
      return
    }

    const element = document.querySelector(step.selector)

    if (!(element instanceof HTMLElement)) {
      setOffscreenDir(null)
      return
    }

    const rect = element.getBoundingClientRect()

    if (rect.bottom < -10) {
      setOffscreenDir('up')
      setSpotlightRect(undefined)
    } else if (rect.top > window.innerHeight + 10) {
      setOffscreenDir('down')
      setSpotlightRect(undefined)
    } else {
      if (offscreenDir !== null) {
        const padding = 10
        setSpotlightRect({
          height: rect.height + padding * 2,
          left: rect.left - padding,
          top: rect.top - padding,
          width: rect.width + padding * 2,
        })
      }
      setOffscreenDir(null)
    }
  }, [step?.selector, offscreenDir])

  useLayoutEffect(() => {
    if (!isOpen) {
      setSpotlightRect(undefined)
      setOffscreenDir(null)
      return
    }

    recalcSpotlight()
  }, [isOpen, recalcSpotlight])

  useEffect(() => {
    if (!isOpen || !step?.selector) {
      return
    }

    window.addEventListener('scroll', checkVisibility, { capture: true, passive: true })
    window.addEventListener('resize', recalcSpotlight)

    return () => {
      window.removeEventListener('scroll', checkVisibility, { capture: true } as EventListenerOptions)
      window.removeEventListener('resize', recalcSpotlight)
    }
  }, [isOpen, step?.selector, recalcSpotlight, checkVisibility])

  const cardStyle = useMemo(() => {
    if (!spotlightRect) {
      return cardStyleRef.current
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

    cardStyleRef.current = style
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

    const handlePointerDown = (event: PointerEvent) => {
      if (
        cardRef.current &&
        event.target instanceof Node &&
        !cardRef.current.contains(event.target)
      ) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isOpen, onClose])

  if (!isOpen || !step) {
    return null
  }

  return createPortal(
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Schema-Lab onboarding">
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

      {offscreenDir ? (
        <div className={`tour-scroll-hint tour-scroll-hint--${offscreenDir}`}>
          <span className="tour-scroll-hint__arrow">{offscreenDir === 'up' ? '↑' : '↓'}</span>
          Scroll {offscreenDir}
        </div>
      ) : null}

      <div className="tour-card" ref={cardRef} style={cardStyle}>
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
