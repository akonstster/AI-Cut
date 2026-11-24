/**
 * Timeline in/out shortcuts: I, O, Shift+I/O, Alt+X.
 */

import { useHotkeys } from 'react-hotkeys-hook'
import { HOTKEY_OPTIONS } from '@/config/hotkeys'
import { usePlaybackStore } from '@/shared/state/playback'
import { isEventInsideSourceMonitor } from '@/shared/state/source-player'
import { clearInOutPoints, setInPoint, setOutPoint } from '../../stores/timeline-actions'
import { useResolvedHotkeys } from '@/features/timeline/deps/settings'

/**
 * In and out points belong to the panel with focus: while the Source Monitor has the keyboard its
 * own I/O mark the source, so the timeline keys stand down.
 */
function ignoreWhenSourceMonitorFocused(event: KeyboardEvent): boolean {
  return isEventInsideSourceMonitor(event.target)
}

const IN_OUT_OPTIONS = {
  ...HOTKEY_OPTIONS,
  ignoreEventWhen: ignoreWhenSourceMonitorFocused,
}

function addShiftModifier(binding: string): string {
  const parts = binding
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.some((part) => part.toLowerCase() === 'shift')) {
    return binding
  }

  const key = parts.pop()
  if (!key) return `shift+${binding}`
  return [...parts, 'shift', key].join('+')
}

export function useInOutShortcuts() {
  const hotkeys = useResolvedHotkeys()
  const markInAtPreview = addShiftModifier(hotkeys.MARK_IN)
  const markOutAtPreview = addShiftModifier(hotkeys.MARK_OUT)

  useHotkeys(
    hotkeys.MARK_IN,
    (event) => {
      event.preventDefault()
      const { currentFrame } = usePlaybackStore.getState()
      setInPoint(currentFrame)
    },
    IN_OUT_OPTIONS,
    [],
  )

  useHotkeys(
    markInAtPreview,
    (event) => {
      event.preventDefault()
      const { previewFrame, currentFrame } = usePlaybackStore.getState()
      setInPoint(previewFrame ?? currentFrame)
    },
    IN_OUT_OPTIONS,
    [markInAtPreview],
  )

  useHotkeys(
    hotkeys.MARK_OUT,
    (event) => {
      event.preventDefault()
      const { currentFrame } = usePlaybackStore.getState()
      setOutPoint(currentFrame)
    },
    IN_OUT_OPTIONS,
    [],
  )

  useHotkeys(
    markOutAtPreview,
    (event) => {
      event.preventDefault()
      const { previewFrame, currentFrame } = usePlaybackStore.getState()
      setOutPoint(previewFrame ?? currentFrame)
    },
    IN_OUT_OPTIONS,
    [markOutAtPreview],
  )

  useHotkeys(
    hotkeys.CLEAR_IN_OUT,
    (event) => {
      event.preventDefault()
      clearInOutPoints()
    },
    IN_OUT_OPTIONS,
    [],
  )
}
