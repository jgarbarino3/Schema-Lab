import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  getAnnotationFontStack,
} from '../domain/annotations'
import type { AnnotationText } from '../domain/types'

interface AnnotationTextEditorProps {
  annotation: AnnotationText
  leftPx: number
  topPx: number
  widthPx: number
  onCancel: () => void
  onCommit: (text: string) => void
}

export function AnnotationTextEditor({
  annotation,
  leftPx,
  topPx,
  widthPx,
  onCancel,
  onCommit,
}: AnnotationTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [value, setValue] = useState(annotation.text)

  useEffect(() => {
    setValue(annotation.text)
  }, [annotation.id, annotation.text])

  useLayoutEffect(() => {
    const textarea = textareaRef.current

    if (!textarea) {
      return
    }

    textarea.focus()
    textarea.select()
  }, [annotation.id])

  useLayoutEffect(() => {
    const textarea = textareaRef.current

    if (!textarea) {
      return
    }

    textarea.style.height = '0px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [value])

  return (
    <textarea
      aria-label="Edit annotation text"
      className="annotation-text-editor"
      onBlur={() => onCommit(value)}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
          return
        }

        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault()
          onCommit(value)
        }
      }}
      ref={textareaRef}
      spellCheck={false}
      style={{
        color: annotation.style.color,
        fontFamily: getAnnotationFontStack(annotation.style.fontFamily),
        fontSize: `${annotation.style.fontSizeMm * 3.7795}px`,
        fontStyle: annotation.style.italic ? 'italic' : 'normal',
        fontWeight: annotation.style.bold ? 700 : 400,
        left: leftPx,
        textAlign: annotation.style.align,
        top: topPx,
        width: widthPx,
      }}
      value={value}
    />
  )
}
