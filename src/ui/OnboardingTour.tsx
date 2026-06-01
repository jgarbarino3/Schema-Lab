import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface OnboardingStep {
  body: ReactNode
  selector?: string
  title: string
}

interface OnboardingTourProps {
  currentStep: number
  finalPrimaryLabel?: string
  isOpen: boolean
  onClose: () => void
  onFinalPrimary?: () => void
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
  finalPrimaryLabel,
  isOpen,
  onClose,
  onFinalPrimary,
  onNeverShowAgain,
  onNext,
  onPrevious,
  steps,
}: OnboardingTourProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect>()
  const [offscreenDir, setOffscreenDir] = useState<'up' | 'down' | null>(null)
  const step = steps[currentStep]
  const stepSelector = step?.selector

  const recalcSpotlight = useCallback(() => {
    if (!stepSelector) {
      setSpotlightRect(undefined)
      setOffscreenDir(null)
      return
    }

    const element = document.querySelector(stepSelector)

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
  }, [stepSelector])

  const checkVisibility = useCallback(() => {
    if (!stepSelector) {
      setOffscreenDir(null)
      return
    }

    const element = document.querySelector(stepSelector)

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
  }, [offscreenDir, stepSelector])

  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }

    recalcSpotlight()
  }, [isOpen, recalcSpotlight])

  useEffect(() => {
    if (!isOpen || !stepSelector) {
      return
    }

    window.addEventListener('scroll', checkVisibility, { capture: true, passive: true })
    window.addEventListener('resize', recalcSpotlight)

    return () => {
      window.removeEventListener('scroll', checkVisibility, { capture: true } as EventListenerOptions)
      window.removeEventListener('resize', recalcSpotlight)
    }
  }, [checkVisibility, isOpen, recalcSpotlight, stepSelector])

  const cardStyle = useMemo(() => {
    const maxWidth =
      typeof window === 'undefined' ? 360 : Math.min(360, window.innerWidth - 32)

    if (!spotlightRect) {
      return { bottom: 20, maxWidth, right: 20 }
    }

    const targetCenterX = spotlightRect.left + spotlightRect.width / 2
    const targetCenterY = spotlightRect.top + spotlightRect.height / 2
    const style: Record<string, number> = {
      maxWidth,
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

  const isFinalStep = currentStep === steps.length - 1
  const primaryLabel = isFinalStep ? finalPrimaryLabel ?? 'Finish' : 'Next'
  const handlePrimaryAction = isFinalStep && onFinalPrimary ? onFinalPrimary : onNext

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
            <button className="tour-card__primary" onClick={handlePrimaryAction} type="button">
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
