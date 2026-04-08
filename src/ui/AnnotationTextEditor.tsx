import { useLayoutEffect, useRef } from 'react'
import {
  getAnnotationFontStack,
} from '../domain/annotations'
import type { AnnotationText } from '../domain/types'

interface AnnotationTextEditorProps {
  annotation: AnnotationText
  leftPx: number
  topPx: number
  text: string
  widthPx: number
  onCancel: () => void
  onChangeText: (text: string) => void
  onCommit: () => void
}

export function AnnotationTextEditor({
  annotation,
  leftPx,
  topPx,
  text,
  widthPx,
  onCancel,
  onChangeText,
  onCommit,
}: AnnotationTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

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
  }, [text])

  return (
    <textarea
      aria-label="Edit annotation text"
      className="annotation-text-editor"
      onBlur={() => onCommit()}
      onChange={(event) => onChangeText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
          return
        }

        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault()
          onCommit()
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
      value={text}
    />
  )
}
