import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useSyncedText } from './use-synced-text'

function Harness({ stored, commit }: { stored: string; commit: (value: string) => void }) {
  const field = useSyncedText<HTMLTextAreaElement>({ value: stored, onChange: commit })
  return <textarea {...field.fieldProps} aria-label="text" />
}

function field(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'text' }) as HTMLTextAreaElement
}

describe('useSyncedText', () => {
  it('keeps the text and the caret when the store answers with the previous value', () => {
    const commit = vi.fn()
    const { rerender } = render(<Harness stored="abcdef" commit={commit} />)
    const textarea = field()
    textarea.focus()
    textarea.setSelectionRange(2, 2)

    fireEvent.change(textarea, { target: { value: 'abXcdef' } })
    expect(commit).toHaveBeenCalledWith('abXcdef')

    // The inspector's deferred snapshot still carries the old text for one render. Writing it back
    // would reset the DOM value — the browser moves the caret to the end when that happens.
    rerender(<Harness stored="abcdef" commit={commit} />)

    expect(field().value).toBe('abXcdef')
  })

  it('adopts a stored change once the field is not focused', () => {
    const { rerender } = render(<Harness stored="first" commit={vi.fn()} />)

    rerender(<Harness stored="second" commit={vi.fn()} />)

    expect(field().value).toBe('second')
  })

  it('does not overwrite what the person is typing with an outside change', () => {
    const { rerender } = render(<Harness stored="first" commit={vi.fn()} />)
    const textarea = field()
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'first and more' } })

    rerender(<Harness stored="undone" commit={vi.fn()} />)

    expect(field().value).toBe('first and more')
  })

  it('shows an undone text again once focus has left the field', async () => {
    const { rerender } = render(<Harness stored="first" commit={vi.fn()} />)
    const textarea = field()
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'first and more' } })
    // The timeline's undo puts the stored text back while the field is still focused.
    rerender(<Harness stored="first" commit={vi.fn()} />)
    expect(field().value).toBe('first and more')

    await act(async () => {
      textarea.blur()
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })

    expect(field().value).toBe('first')
  })
})
