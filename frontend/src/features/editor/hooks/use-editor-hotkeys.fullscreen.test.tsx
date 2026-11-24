import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { useEditorHotkeys } from './use-editor-hotkeys'

const requestFullscreen = vi.fn(async () => {})
let monitor: HTMLDivElement | null = null

function Harness() {
  useEditorHotkeys({})
  return null
}

describe('useEditorHotkeys preview fullscreen', () => {
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
    Reflect.deleteProperty(document, 'fullscreenElement')
    monitor?.remove()
    monitor = null
    requestFullscreen.mockClear()
  })

  it('toggles the program monitor with Ctrl+`', async () => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })
    monitor = document.createElement('div')
    monitor.setAttribute('data-preview-monitor', '')
    document.body.appendChild(monitor)

    render(<Harness />)

    fireEvent.keyDown(document, { key: '`', code: 'Backquote', ctrlKey: true })

    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledTimes(1))
  })
})
