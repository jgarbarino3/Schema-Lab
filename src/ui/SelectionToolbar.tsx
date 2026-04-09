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
      className={`selection-toolbar__icon-button${destructive ? ' is-destructive' : ''}`}
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
              d="M12 5a7 7 0 1 1-4.95 2.05"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path
              d="M5 5v5h5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </SelectionActionButton>
      ) : null}
      {canDuplicate ? (
        <SelectionActionButton label="Duplicate" onClick={onDuplicate}>
          <svg fill="none" viewBox="0 0 24 24">
            <rect
              height="10"
              rx="1.6"
              stroke="currentColor"
              strokeWidth="1.7"
              width="10"
              x="9"
              y="9"
            />
            <path
              d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </svg>
        </SelectionActionButton>
      ) : null}
      {canDelete ? (
        <SelectionActionButton destructive label="Delete" onClick={onDelete}>
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M5 7h14"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path
              d="M10 4h4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path
              d="M8 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </SelectionActionButton>
      ) : null}
      {canCenter ? (
        <SelectionActionButton label="Center Selection" onClick={onCenter}>
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M12 4v4M12 16v4M4 12h4M16 12h4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        </SelectionActionButton>
      ) : null}
    </div>
  )
}
