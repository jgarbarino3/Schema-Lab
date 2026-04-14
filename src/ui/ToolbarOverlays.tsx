import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export const SUGGESTION_FORM_NAME = 'schema-lab-suggestions'

export type SuggestionCategory =
  | 'Bug report'
  | 'Idea / feature request'
  | 'Confusing UX'
  | 'Other'

interface TooltipTarget {
  label: string
  element: HTMLButtonElement | null
}

interface FloatingToolbarTooltipProps {
  target: TooltipTarget | null
}

interface SuggestionBoxModalProps {
  isOpen: boolean
  onClose: () => void
}

const SUGGESTION_CATEGORIES: SuggestionCategory[] = [
  'Bug report',
  'Idea / feature request',
  'Confusing UX',
  'Other',
]

function positionTooltip(target: TooltipTarget) {
  if (!target.element) {
    return undefined
  }

  const rect = target.element.getBoundingClientRect()
  const width = Math.min(
    Math.max(58, target.label.trim().length * 7.2 + 22),
    window.innerWidth - 24,
  )
  const approxHeight = 30
  const centeredLeft = rect.left + rect.width / 2 - width / 2
  const left = Math.min(Math.max(12, centeredLeft), window.innerWidth - width - 12)
  const belowTop = rect.bottom + 10
  const aboveTop = rect.top - 10 - approxHeight
  const preferBelow = belowTop + approxHeight <= window.innerHeight - 12
  const top = preferBelow
    ? Math.min(Math.max(12, belowTop), window.innerHeight - approxHeight - 12)
    : Math.max(12, aboveTop)

  return {
    left,
    top,
    width,
  } satisfies CSSProperties
}

export function FloatingToolbarTooltip({ target }: FloatingToolbarTooltipProps) {
  const [style, setStyle] = useState<CSSProperties>()

  useLayoutEffect(() => {
    if (!target || typeof window === 'undefined') {
      setStyle(undefined)
      return
    }

    const updatePosition = () => {
      setStyle(positionTooltip(target))
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [target])

  if (!target || !style) {
    return null
  }

  return createPortal(
    <div className="toolbar__floating-tooltip" role="tooltip" style={style}>
      {target.label}
    </div>,
    document.body,
  )
}

export function SuggestionBoxModal({ isOpen, onClose }: SuggestionBoxModalProps) {
  const [category, setCategory] = useState<SuggestionCategory>('Bug report')
  const [message, setMessage] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const messageRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setCategory('Bug report')
    setMessage('')
    setScreenshot(null)
    setStatus('idle')
    setError(null)

    const timeout = window.setTimeout(() => {
      messageRef.current?.focus()
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [isOpen])

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

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  const canSubmit = message.trim().length > 0 && status !== 'submitting'

  const handleSubmit = async () => {
    if (!canSubmit) {
      return
    }

    setStatus('submitting')
    setError(null)

    try {
      const formData = new FormData()

      formData.append('form-name', SUGGESTION_FORM_NAME)
      formData.append('bot-field', '')
      formData.append('category', category)
      formData.append('message', message.trim())

      if (screenshot) {
        formData.append('screenshot', screenshot)
      }

      const response = await fetch('/', {
        body: formData,
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Suggestion submission failed with status ${response.status}`)
      }

      setStatus('success')
      setMessage('')
      setScreenshot(null)
      setCategory('Bug report')
    } catch (submissionError) {
      const messageText =
        submissionError instanceof Error
          ? submissionError.message
          : 'Suggestion submission failed.'

      setStatus('error')
      setError(messageText)
    }
  }

  return createPortal(
    <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Anonymous suggestions">
      <button className="modal-shell__backdrop" onClick={onClose} type="button" />
      <div className="modal-shell__card modal-shell__card--suggestions">
        <div className="modal-shell__header">
          <h2>Suggestions</h2>
          <p>
            Anonymous feedback only. Send bugs, friction points, or ideas; submissions go to the
            developer through Netlify Forms.
          </p>
        </div>

        <div className="toolbar-suggestions__notice">
          <strong>Anonymous by design</strong>
          <p>
            No contact field, no account link, and no app-side inbox. If you add a screenshot, it
            is sent with the form submission as a single optional image.
          </p>
        </div>

        {status === 'success' ? (
          <div className="toolbar-suggestions__result">
            <strong>Suggestion sent</strong>
            <p>Your anonymous message is ready for the developer in the Netlify Forms dashboard.</p>
          </div>
        ) : (
          <form
            className="modal-shell__form toolbar-suggestions__form"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSubmit()
            }}
          >
            <input name="form-name" type="hidden" value={SUGGESTION_FORM_NAME} />
            <input name="bot-field" type="text" className="visually-hidden" tabIndex={-1} autoComplete="off" />

            <fieldset className="modal-shell__fieldset">
              <legend>Category</legend>
              <select
                aria-label="Suggestion category"
                name="category"
                onChange={(event) => setCategory(event.target.value as SuggestionCategory)}
                value={category}
              >
                {SUGGESTION_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </fieldset>

            <fieldset className="modal-shell__fieldset toolbar-suggestions__message-fieldset">
              <legend>Message</legend>
              <textarea
                aria-label="Suggestion message"
                name="message"
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Describe what happened, what you wanted, or what would make the app easier to use."
                ref={messageRef}
                required
                value={message}
              />
            </fieldset>

            <fieldset className="modal-shell__fieldset">
              <legend>Screenshot</legend>
              <label className="toolbar-suggestions__upload">
                <span>Optional single image</span>
                <input
                  accept="image/*"
                  aria-label="Screenshot"
                  name="screenshot"
                  onChange={(event) => setScreenshot(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
              <p className="modal-shell__hint">
                Upload one image if it helps explain the issue. Leave it blank if not needed.
              </p>
              {screenshot ? (
                <div className="toolbar-suggestions__file-chip">
                  <span>{screenshot.name}</span>
                  <button
                    className="toolbar-suggestions__clear-file"
                    onClick={() => setScreenshot(null)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </fieldset>

            {error ? <p className="toolbar-suggestions__error">{error}</p> : null}

            <div className="modal-shell__actions">
              <button onClick={onClose} type="button">
                Close
              </button>
              <button className="modal-shell__primary" disabled={!canSubmit} type="submit">
                {status === 'submitting' ? 'Sending…' : 'Send anonymously'}
              </button>
            </div>
          </form>
        )}

        {status === 'success' ? (
          <div className="modal-shell__actions">
            <button onClick={onClose} type="button">
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
