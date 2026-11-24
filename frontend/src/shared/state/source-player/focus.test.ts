import { describe, expect, it } from 'vite-plus/test'
import {
  SOURCE_MONITOR_ATTRIBUTE,
  isEventInsideSourceMonitor,
  isSourceMonitorFocused,
} from './focus'

function monitorWithButton(): { monitor: HTMLElement; inner: HTMLButtonElement } {
  const monitor = document.createElement('div')
  monitor.setAttribute(SOURCE_MONITOR_ATTRIBUTE, '')
  const inner = document.createElement('button')
  monitor.append(inner)
  document.body.append(monitor)
  return { monitor, inner }
}

describe('source monitor keyboard target', () => {
  it('recognises events inside the monitor and its controls', () => {
    const { monitor, inner } = monitorWithButton()

    expect(isEventInsideSourceMonitor(inner)).toBe(true)
    expect(isEventInsideSourceMonitor(monitor)).toBe(true)
    expect(isEventInsideSourceMonitor(document.body)).toBe(false)
    expect(isEventInsideSourceMonitor(null)).toBe(false)

    monitor.remove()
  })

  it('reports the monitor as focused while one of its controls holds focus', () => {
    const { monitor, inner } = monitorWithButton()

    inner.focus()

    expect(isSourceMonitorFocused()).toBe(true)

    monitor.remove()
    expect(isSourceMonitorFocused()).toBe(false)
  })
})
