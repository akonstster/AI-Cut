import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { PreviewScopesToggle } from './preview-scopes-toggle'

const mocks = vi.hoisted(() => {
  const editorState = {
    colorScopesOpen: false,
    toggleColorScopesOpen: vi.fn(() => {
      editorState.colorScopesOpen = !editorState.colorScopesOpen
    }),
  }
  return { editorState }
})

vi.mock('@/shared/state/editor', () => ({
  useEditorStore: Object.assign(
    (selector: (state: typeof mocks.editorState) => unknown) => selector(mocks.editorState),
    { getState: () => mocks.editorState },
  ),
}))

describe('PreviewScopesToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.editorState.colorScopesOpen = false
  })

  it('toggles the color scopes panel and exposes the pressed state', () => {
    const { rerender } = render(<PreviewScopesToggle />)

    const button = screen.getByRole('button', { name: 'Show color scopes' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(button)
    expect(mocks.editorState.toggleColorScopesOpen).toHaveBeenCalledTimes(1)

    rerender(<PreviewScopesToggle />)
    const openButton = screen.getByRole('button', { name: 'Hide color scopes' })
    expect(openButton).toHaveAttribute('aria-pressed', 'true')
  })
})
