/**
 * Transition Actions - cut-centered handle-based transitions.
 *
 * Transitions stay attached to the cut between adjacent clips. Adding,
 * updating, or removing a transition never moves clip timeline positions.
 */

import type {
  Transition,
  TransitionType,
  TransitionPresentation,
  WipeDirection,
  SlideDirection,
  FlipDirection,
} from '@/types/transition'
import { TRANSITION_CONFIGS } from '@/types/transition'
import { useItemsStore } from '../items-store'
import { useTransitionsStore } from '../transitions-store'
import { useTimelineSettingsStore } from '../timeline-settings-store'
import {
  canAddTransition,
  areFramesAligned,
  getMaxTransitionDurationForHandles,
} from '../../utils/transition-utils'
import { execute, getLogger } from './shared'
import { captureSnapshot, restoreSnapshot } from '../commands/snapshot'
import { useTimelineCommandStore } from '../timeline-command-store'
import { applyRippleTrim } from './edit/trim-actions'
import { isLinkedSelectionEnabled } from './edit/shared'
import { getSynchronizedLinkedItemsForEdit } from './linked-edit'
import { resolveTransitionTargetForEdge } from '../../utils/transition-targets'
import { planTransitionTrim, type TransitionTrimPlan } from '../../utils/transition-trim-plan'
import type { DraggedTransitionDescriptor } from '@/shared/state/transition-drag'

export function addTransition(
  leftClipId: string,
  rightClipId: string,
  type: TransitionType = 'crossfade',
  durationInFrames?: number,
  presentation?: TransitionPresentation,
  direction?: WipeDirection | SlideDirection | FlipDirection,
  alignment: number = 0.5,
): boolean {
  return execute(
    'ADD_TRANSITION',
    () => {
      const items = useItemsStore.getState().items
      const transitions = useTransitionsStore.getState().transitions
      // Find the clips
      const leftClip = items.find((i) => i.id === leftClipId)
      const rightClip = items.find((i) => i.id === rightClipId)

      if (!leftClip || !rightClip) {
        getLogger().warn('[addTransition] Clips not found')
        return false
      }

      const maxByClipDuration = Math.floor(
        Math.min(leftClip.durationInFrames, rightClip.durationInFrames) - 1,
      )
      if (maxByClipDuration < 1) {
        getLogger().warn('[addTransition] Cannot add transition: clips are too short')
        return false
      }

      const config = TRANSITION_CONFIGS[type]
      const requestedDuration = durationInFrames ?? config.defaultDuration
      let duration = Math.max(1, Math.min(Math.round(requestedDuration), maxByClipDuration))

      const leftEnd = leftClip.from + leftClip.durationInFrames
      const isAdjacent = areFramesAligned(leftEnd, rightClip.from)
      const timelineFps = useTimelineSettingsStore.getState().fps
      if (isAdjacent) {
        const maxHandleDuration = getMaxTransitionDurationForHandles(
          leftClip,
          rightClip,
          alignment,
          timelineFps,
        )
        if (maxHandleDuration < 1) {
          getLogger().warn(
            '[addTransition] Cannot add transition: insufficient source handle at cut',
          )
          return false
        }
        duration = Math.min(duration, maxHandleDuration)
      }

      // Validate that transition can be added (includes handle check)
      const validation = canAddTransition(leftClip, rightClip, duration, alignment, timelineFps)
      if (!validation.canAdd) {
        getLogger().warn('[addTransition] Cannot add transition:', validation.reason)
        return false
      }

      // Check if transition already exists
      const existingTransition = transitions.find(
        (t) => t.leftClipId === leftClipId && t.rightClipId === rightClipId,
      )
      if (existingTransition) {
        getLogger().warn('[addTransition] Transition already exists between these clips')
        return false
      }

      // Create transition record
      useTransitionsStore
        .getState()
        ._addTransition(
          leftClipId,
          rightClipId,
          leftClip.trackId,
          type,
          duration,
          presentation,
          direction,
          alignment,
        )

      useTimelineSettingsStore.getState().markDirty()
      return true
    },
    { leftClipId, rightClipId, type },
  )
}

export function addTransitionWithTrim(
  requested: TransitionTrimPlan,
  descriptor: DraggedTransitionDescriptor,
): boolean {
  const { leftClipId, rightClipId, alignment } = requested
  const before = captureSnapshot()
  if (before.fps !== requested.fps) return false
  const target = resolveTransitionTargetForEdge({
    itemId: leftClipId,
    edge: 'right',
    items: before.items,
    transitions: before.transitions,
    timelineFps: before.fps,
    alignment,
  })
  if (!target || target.rightClipId !== rightClipId) return false
  const plan = planTransitionTrim(target, before.fps)
  if (
    !plan ||
    plan.trimLeft !== requested.trimLeft ||
    plan.trimRight !== requested.trimRight ||
    plan.durationInFrames !== requested.durationInFrames
  )
    return false

  const { trackId } = target.leftClip
  const synchronizedGroups = isLinkedSelectionEnabled()
    ? before.items
        .filter((item) => item.trackId === trackId && item.from >= target.leftClip.from)
        .map((item) => getSynchronizedLinkedItemsForEdit(before.items, item.id, true))
        .filter((group) => group.length > 1)
    : []
  const { isDirty } = useTimelineSettingsStore.getState()
  let committed = false
  try {
    applyRippleTrim(leftClipId, 'end', -plan.trimLeft, true)
    applyRippleTrim(rightClipId, 'start', plan.trimRight, true)
    const { itemById } = useItemsStore.getState()
    const left = itemById[leftClipId]
    const right = itemById[rightClipId]
    const transitions = useTransitionsStore.getState()
    const transitionsById = new Map(transitions.transitions.map((entry) => [entry.id, entry]))
    if (
      !left ||
      !right ||
      left.durationInFrames !== target.leftClip.durationInFrames - plan.trimLeft ||
      right.durationInFrames !== target.rightClip.durationInFrames - plan.trimRight ||
      !areFramesAligned(left.from + left.durationInFrames, right.from) ||
      !canAddTransition(left, right, plan.durationInFrames, alignment, before.fps).canAdd ||
      synchronizedGroups.some(([first, ...companions]) => {
        const anchor = itemById[first!.id]
        return (
          !anchor ||
          companions.some(({ id }) => {
            const companion = itemById[id]
            return (
              companion?.from !== anchor.from ||
              companion?.durationInFrames !== anchor.durationInFrames
            )
          })
        )
      }) ||
      before.transitions.some((transition) => {
        if (transition.trackId !== trackId) return false
        const current = transitionsById.get(transition.id)
        return (
          !current ||
          current.leftClipId !== transition.leftClipId ||
          current.rightClipId !== transition.rightClipId ||
          current.durationInFrames !== transition.durationInFrames ||
          current.alignment !== transition.alignment
        )
      })
    ) {
      return false
    }

    transitions._addTransition(
      leftClipId,
      rightClipId,
      trackId,
      'crossfade',
      plan.durationInFrames,
      descriptor.presentation,
      descriptor.direction,
      alignment,
    )
    useTimelineSettingsStore.getState().markDirty()
    useTimelineCommandStore
      .getState()
      .addUndoEntry(
        { type: 'ADD_TRANSITION', payload: { leftClipId, rightClipId, type: 'crossfade' } },
        before,
      )
    committed = true
    return true
  } catch (error) {
    getLogger().error('Failed to add transition with trim', error)
    return false
  } finally {
    if (!committed) {
      restoreSnapshot(before)
      useTimelineSettingsStore.getState().setIsDirty(isDirty)
    }
  }
}

type TransitionUpdates = Partial<
  Pick<
    Transition,
    | 'durationInFrames'
    | 'type'
    | 'presentation'
    | 'direction'
    | 'timing'
    | 'alignment'
    | 'bezierPoints'
    | 'presetId'
    | 'properties'
  >
>

function _validateAndUpdateTransition(id: string, updates: TransitionUpdates): boolean {
  const transitions = useTransitionsStore.getState().transitions
  const transition = transitions.find((t) => t.id === id)
  if (!transition) return false
  const items = useItemsStore.getState().items
  const leftClip = items.find((i) => i.id === transition.leftClipId)
  const rightClip = items.find((i) => i.id === transition.rightClipId)
  const nextTransition = { ...transition, ...updates }

  if (leftClip && rightClip) {
    const validation = canAddTransition(
      leftClip,
      rightClip,
      nextTransition.durationInFrames,
      nextTransition.alignment,
      useTimelineSettingsStore.getState().fps,
    )
    if (!validation.canAdd) {
      getLogger().warn('[updateTransition] Cannot update transition:', validation.reason)
      return false
    }
  }

  useTransitionsStore.getState()._updateTransition(id, updates)
  return true
}

export function updateTransition(id: string, updates: TransitionUpdates): void {
  execute(
    'UPDATE_TRANSITION',
    () => {
      if (_validateAndUpdateTransition(id, updates)) {
        useTimelineSettingsStore.getState().markDirty()
      }
    },
    { id, updates },
  )
}

export function removeTransition(id: string): void {
  execute(
    'REMOVE_TRANSITION',
    () => {
      useTransitionsStore.getState()._removeTransition(id)
      useTimelineSettingsStore.getState().markDirty()
    },
    { id },
  )
}
