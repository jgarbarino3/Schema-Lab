import type { CSSProperties, ReactNode } from 'react'

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
  style?: CSSProperties
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
  style,
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
      style={style}
    >
      {canRotate ? (
        <SelectionActionButton label="Rotate +90°" onClick={onRotate}>
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M12.5 4.15a7.9 7.9 0 1 1-7 4.45"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.15"
            />
            <path
              d="M5.15 4.45v6.45h6.45"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.15"
            />
          </svg>
        </SelectionActionButton>
      ) : null}
      {canDuplicate ? (
        <SelectionActionButton label="Duplicate" onClick={onDuplicate}>
          <svg fill="none" viewBox="0 0 24 24">
            <rect
              height="9.6"
              rx="2.1"
              stroke="currentColor"
              strokeWidth="2"
              width="9.6"
              x="9.7"
              y="8.9"
            />
            <rect
              height="9.6"
              rx="2.1"
              stroke="currentColor"
              strokeWidth="2"
              width="9.6"
              x="4.7"
              y="5.5"
            />
          </svg>
        </SelectionActionButton>
      ) : null}
      {canDelete ? (
        <SelectionActionButton destructive label="Delete" onClick={onDelete}>
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M5.6 7.2h12.8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.1"
            />
            <path
              d="M9.1 4.9h5.8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.1"
            />
            <path
              d="M7.4 7.2v10.3a2.2 2.2 0 0 0 2.2 2.2h4.8a2.2 2.2 0 0 0 2.2-2.2V7.2"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.1"
            />
            <path
              d="M10.3 10v6.3M13.7 10v6.3"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </SelectionActionButton>
      ) : null}
      {canCenter ? (
        <SelectionActionButton label="Center Selection" onClick={onCenter}>
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M7 4.8H4.8V7M17 4.8h2.2V7M7 19.2H4.8V17M17 19.2h2.2V17"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <path
              d="M12 6.9v2.7M12 14.4v2.7M6.9 12h2.7M14.4 12h2.7"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.9"
            />
            <circle cx="12" cy="12" r="3.35" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" fill="currentColor" r="1.2" strokeWidth="0" />
          </svg>
        </SelectionActionButton>
      ) : null}
    </div>
  )
}
