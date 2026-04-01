import { useEffect, useState } from 'react'

interface JsonModalProps {
  error?: string
  initialValue: string
  isOpen: boolean
  onClose: () => void
  onLoad: (rawText: string) => void
}

export function JsonModal({
  error,
  initialValue,
  isOpen,
  onClose,
  onLoad,
}: JsonModalProps) {
  const [draft, setDraft] = useState(initialValue)
  const [localError, setLocalError] = useState<string | undefined>()

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setDraft(initialValue)
    setLocalError(undefined)
  }, [initialValue, isOpen])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="json-modal"
      onClick={() => {
        onClose()
      }}
      role="presentation"
    >
      <section
        className="json-modal__dialog"
        onClick={(event) => {
          event.stopPropagation()
        }}
        role="dialog"
      >
        <div className="json-modal__header">
          <div>
            <h2>Scene JSON</h2>
            <p>Load or edit the serialized scene document directly.</p>
          </div>
          <button onClick={onClose} type="button">
            Close
          </button>
        </div>

        {error || localError ? (
          <p className="json-modal__error">{error ?? localError}</p>
        ) : null}

        <textarea
          onChange={(event) => {
            setLocalError(undefined)
            setDraft(event.target.value)
          }}
          spellCheck={false}
          value={draft}
        />

        <div className="json-modal__actions">
          <button
            onClick={() => {
              setDraft(initialValue)
              setLocalError(undefined)
            }}
            type="button"
          >
            Reset Text
          </button>
          <button
            onClick={() => {
              try {
                const formatted = JSON.stringify(JSON.parse(draft), null, 2)
                setDraft(formatted)
              } catch {
                setLocalError('JSON formatting failed. Fix syntax first.')
              }
            }}
            type="button"
          >
            Format
          </button>
          <button
            onClick={() => {
              try {
                onLoad(draft)
              } catch (nextError) {
                setLocalError(
                  nextError instanceof Error
                    ? nextError.message
                    : 'Scene JSON could not be loaded.',
                )
              }
            }}
            type="button"
          >
            Load Scene
          </button>
        </div>
      </section>
    </div>
  )
}
