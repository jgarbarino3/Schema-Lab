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
              d="M12.2 5.1a6.95 6.95 0 1 1-6.15 3.75"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
            <path
              d="M6.05 5.15v5.3h5.3"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
            <path
              d="M14.9 8.2v3.1h3.1"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.45"
            />
          </svg>
        </SelectionActionButton>
      ) : null}
      {canDuplicate ? (
        <SelectionActionButton label="Duplicate" onClick={onDuplicate}>
          <svg fill="none" viewBox="0 0 24 24">
            <rect
              height="8.2"
              rx="1.75"
              stroke="currentColor"
              strokeWidth="1.75"
              width="8.2"
              x="10.35"
              y="9.55"
            />
            <rect
              height="8.2"
              rx="1.75"
              stroke="currentColor"
              strokeWidth="1.75"
              width="8.2"
              x="5.45"
              y="6.25"
            />
            <path
              d="M15 5.2v3.2M13.4 6.8h3.2"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.45"
            />
          </svg>
        </SelectionActionButton>
      ) : null}
      {canDelete ? (
        <SelectionActionButton destructive label="Delete" onClick={onDelete}>
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M6.2 7.2h11.6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
            <path
              d="M9.55 5.1h4.9"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
            <path
              d="M8.25 7.2v10.15a1.9 1.9 0 0 0 1.9 1.9h3.7a1.9 1.9 0 0 0 1.9-1.9V7.2"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
            <path
              d="M10.55 10.05v5.95M13.45 10.05v5.95"
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
              d="M7.2 5.4H5.4v1.8M16.8 5.4h1.8v1.8M7.2 18.6H5.4v-1.8M16.8 18.6h1.8v-1.8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
            <path
              d="M12 7.3v2.15M12 14.55v2.15M7.3 12h2.15M14.55 12h2.15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.55"
            />
            <circle cx="12" cy="12" r="2.65" stroke="currentColor" strokeWidth="1.75" />
            <circle cx="12" cy="12" fill="currentColor" r="0.95" strokeWidth="0" />
          </svg>
        </SelectionActionButton>
      ) : null}
    </div>
  )
}
