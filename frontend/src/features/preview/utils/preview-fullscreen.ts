/**
 * Fullscreen for the program monitor. The button in the preview controls and the
 * `Ctrl+`` shortcut (the full-screen key editors use) share these helpers.
 */

/** The program monitor that goes fullscreen, when it is on screen. */
export function previewMonitorElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-preview-monitor]')
}

export function isPreviewFullscreen(): boolean {
  return (
    document.fullscreenElement !== null && document.fullscreenElement === previewMonitorElement()
  )
}

/**
 * Fullscreens the program monitor, or leaves fullscreen when it is already on. `target` lets the
 * button pick the monitor it sits in; the shortcut falls back to the first monitor on the page.
 */
export async function togglePreviewFullscreen(target?: Element | null): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen?.().catch(() => {})
    return
  }
  const monitor = target instanceof HTMLElement ? target : previewMonitorElement()
  await monitor?.requestFullscreen?.().catch(() => {})
}
