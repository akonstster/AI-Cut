import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'

interface SyncedTextOptions {
  /** The stored text: what the field shows whenever the person is not typing in it. */
  value: string
  /** Called on every keystroke so the store (and undo) sees the text as it is typed. */
  onChange?: (value: string) => void
}

export interface SyncedTextField<Element extends HTMLInputElement | HTMLTextAreaElement> {
  /** Props for the input or textarea element. */
  fieldProps: {
    ref: RefObject<Element | null>
    value: string
    onChange: (event: ChangeEvent<Element>) => void
    onBlur: () => void
  }
  /** Drops what was typed and shows the stored text again (Escape in a field). */
  reset: () => void
}

/**
 * A text field whose value lives in a store that can answer a frame late.
 *
 * The properties inspector hands its panels a deferred snapshot and the canvas keeps node data in
 * React Flow's own store, so a plain controlled field receives the *previous* text right after a
 * keystroke. Writing that stale value back resets the DOM value and the caret jumps to the end of
 * the line. While the field is focused its own text wins; the stored value is adopted again once
 * focus leaves (undo, a style preset, another clip, a storyboard prompt).
 */
export function useSyncedText<Element extends HTMLInputElement | HTMLTextAreaElement>({
  value,
  onChange,
}: SyncedTextOptions): SyncedTextField<Element> {
  const ref = useRef<Element | null>(null)
  const [draft, setDraft] = useState(value)
  const storedRef = useRef(value)
  storedRef.current = value
  // The last text this field sent to the store: whatever the store echoes back is our own typing.
  const committedRef = useRef<string | null>(null)

  useEffect(() => {
    if (document.activeElement === ref.current) return
    setDraft((current) => (current === value ? current : value))
  }, [value])

  return {
    fieldProps: {
      ref,
      value: draft,
      onChange: (event) => {
        committedRef.current = event.target.value
        setDraft(event.target.value)
        onChange?.(event.target.value)
      },
      // Leaving the field takes the store's text when it is not what this field typed — an undo
      // made elsewhere, a preset, another clip. Two frames let a deferred echo catch up first.
      onBlur: () => {
        const committed = committedRef.current
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (storedRef.current !== committed) setDraft(storedRef.current)
          })
        })
      },
    },
    reset: () => setDraft(value),
  }
}
