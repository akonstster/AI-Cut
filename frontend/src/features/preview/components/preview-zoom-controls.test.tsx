import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { PreviewZoomControls } from './preview-zoom-controls'

let monitor: HTMLDivElement

afterEach(() => {
  Reflect.deleteProperty(document, 'fullscreenElement')
  monitor?.remove()
})

describe('PreviewZoomControls', () => {
  it('renders the zoom menu inside the fullscreen monitor so it stays visible', async () => {
    monitor = document.createElement('div')
    monitor.setAttribute('data-preview-monitor', '')
    document.body.appendChild(monitor)
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => monitor,
    })

    render(<PreviewZoomControls />, { container: monitor })

    const trigger = screen.getByRole('button')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    const menu = await screen.findByRole('menu')
    expect(monitor.contains(menu)).toBe(true)
  })
})
