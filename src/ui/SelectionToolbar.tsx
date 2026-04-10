import type { ReactNode } from 'react'

interface SelectionToolbarProps {
  canCenter?: boolean
  canDelete?: boolean
  canDuplicate?: boolean
  canRotate?: boolean
  className?: string
  onCenter?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  onRotate?: () => void
}

function SelectionActionButton({
  children,
  destructive = false,
  label,
  onClick,
}: {
  children: ReactNode
  destructive?: boolean
  label: string
  onClick?: () => void
}) {
  return (
    <button
      aria-label={label}
      className={`toolbar__icon-button selection-toolbar__icon-button${destructive ? ' is-destructive' : ''}`}
      data-tooltip={label}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function SelectionToolbar({
  canCenter = false,
  canDelete = false,
  canDuplicate = false,
  canRotate = false,
  className,
  onCenter,
  onDelete,
  onDuplicate,
  onRotate,
}: SelectionToolbarProps) {
  if (!canCenter && !canDelete && !canDuplicate && !canRotate) {
    return null
  }

  return (
    <div
      aria-label="Selection actions"
      className={`selection-toolbar${className ? ` ${className}` : ''}`}
      data-testid="selection-toolbar"
      role="toolbar"
    >
      {canRotate ? (
        <SelectionActionButton label="Rotate +90°" onClick={onRotate}>
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M12 5.25a6.75 6.75 0 1 1-5.18 2.42"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
            <path
              d="M5.2 5.6v4.95h4.95"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
          </svg>
        </SelectionActionButton>
      ) : null}
      {canDuplicate ? (
        <SelectionActionButton label="Duplicate" onClick={onDuplicate}>
          <svg fill="none" viewBox="0 0 24 24">
            <rect
              height="8.5"
              rx="1.75"
              stroke="currentColor"
              strokeWidth="1.75"
              width="8.5"
              x="10.1"
              y="9.4"
            />
            <rect
              height="8.5"
              rx="1.75"
              stroke="currentColor"
              strokeWidth="1.75"
              width="8.5"
              x="5.4"
              y="6.1"
            />
          </svg>
        </SelectionActionButton>
      ) : null}
      {canDelete ? (
        <SelectionActionButton destructive label="Delete" onClick={onDelete}>
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M6.4 7.35h11.2"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
            <path
              d="M9.45 5.15h5.1"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
            <path
              d="M8.55 7.35v9.95a2 2 0 0 0 2 2h2.9a2 2 0 0 0 2-2V7.35"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
            <path
              d="M10.75 10.2v5.8M13.25 10.2v5.8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.65"
            />
          </svg>
        </SelectionActionButton>
      ) : null}
      {canCenter ? (
        <SelectionActionButton label="Center Selection" onClick={onCenter}>
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M12 5v3.05M12 15.95V19M5 12h3.05M15.95 12H19"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
            <circle cx="12" cy="12" r="3.35" stroke="currentColor" strokeWidth="1.75" />
            <circle cx="12" cy="12" fill="currentColor" r="0.9" strokeWidth="0" />
          </svg>
        </SelectionActionButton>
      ) : null}
    </div>
  )
}
