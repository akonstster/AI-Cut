/**
 * The Source Monitor tags its root element so the rest of the editor can tell which panel owns
 * the keyboard: in every desktop editor `I`/`O` mark in/out in the viewer that has focus, and the
 * timeline's own keys only act when the timeline is the focused panel.
 */
export const SOURCE_MONITOR_ATTRIBUTE = 'data-source-monitor'

const SOURCE_MONITOR_SELECTOR = `[${SOURCE_MONITOR_ATTRIBUTE}]`

/** Whether a keyboard event happened inside the Source Monitor. */
export function isEventInsideSourceMonitor(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SOURCE_MONITOR_SELECTOR) !== null
}

/** Whether the Source Monitor (or a control inside it) holds keyboard focus right now. */
export function isSourceMonitorFocused(): boolean {
  return isEventInsideSourceMonitor(document.activeElement)
}
