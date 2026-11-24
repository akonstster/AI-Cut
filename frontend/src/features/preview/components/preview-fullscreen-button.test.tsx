import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { PreviewFullscreenButton } from './preview-fullscreen-button'

const requestFullscreen = vi.fn(async () => {})

describe('PreviewFullscreenButton', () => {
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
    requestFullscreen.mockClear()
  })

  it('fullscreens the program monitor the button sits in', async () => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })

    render(
      <div data-preview-monitor>
        <PreviewFullscreenButton />
      </div>,
    )

    const button = screen.getByRole('button', { name: 'Fullscreen' })
    expect(button).toBeInTheDocument()

    fireEvent.click(button)

    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledTimes(1))
    expect(requestFullscreen.mock.contexts[0]).toBeInstanceOf(HTMLElement)
    expect(
      (requestFullscreen.mock.contexts[0] as HTMLElement).hasAttribute('data-preview-monitor'),
    ).toBe(true)
  })
})
