import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface CanvasContextMenuAction {
  destructive?: boolean
  disabled?: boolean
  label: string
  onSelect: () => void
}

interface CanvasContextMenuProps {
  actions: CanvasContextMenuAction[]
  isOpen: boolean
  onClose: () => void
  x: number
  y: number
}

export function CanvasContextMenu({
  actions,
  isOpen,
  onClose,
  x,
  y,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) {
        return
      }

      onClose()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen || actions.length === 0) {
    return null
  }

  return createPortal(
    <div
      aria-label="Canvas context menu"
      className="canvas-context-menu"
      ref={menuRef}
      role="menu"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      {actions.map((action) => (
        <button
          className={action.destructive ? 'is-destructive' : undefined}
          disabled={action.disabled}
          key={action.label}
          onClick={() => {
            action.onSelect()
            onClose()
          }}
          role="menuitem"
          type="button"
        >
          {action.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
