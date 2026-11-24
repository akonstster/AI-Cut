import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  isPreviewFullscreen,
  previewMonitorElement,
  togglePreviewFullscreen,
} from './preview-fullscreen'

const requestFullscreen = vi.fn(async () => {})
const exitFullscreen = vi.fn(async () => {})
let monitor: HTMLDivElement | null = null

function installFullscreenStubs() {
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: requestFullscreen,
  })
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: exitFullscreen,
  })
}

describe('preview fullscreen', () => {
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
    Reflect.deleteProperty(document, 'exitFullscreen')
    Reflect.deleteProperty(document, 'fullscreenElement')
    monitor?.remove()
    monitor = null
    requestFullscreen.mockClear()
    exitFullscreen.mockClear()
  })

  it('fullscreens the program monitor and reports the state', async () => {
    installFullscreenStubs()
    monitor = document.createElement('div')
    monitor.setAttribute('data-preview-monitor', '')
    document.body.appendChild(monitor)

    expect(previewMonitorElement()).toBe(monitor)
    expect(isPreviewFullscreen()).toBe(false)

    await togglePreviewFullscreen()
    expect(requestFullscreen).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => monitor,
    })
    expect(isPreviewFullscreen()).toBe(true)

    await togglePreviewFullscreen()
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no program monitor is on screen', async () => {
    installFullscreenStubs()

    await togglePreviewFullscreen()

    expect(requestFullscreen).not.toHaveBeenCalled()
  })
})
