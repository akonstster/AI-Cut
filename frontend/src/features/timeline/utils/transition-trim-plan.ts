import { calculateTransitionPortions } from '@/shared/timeline/transitions/transition-planner'
import type { TimelineItem } from '@/types/timeline'
import { TRANSITION_CONFIGS } from '@/types/transition'
import type { ResolvedTransitionTarget } from './transition-targets'
import { getAvailableTransitionHandle } from './transition-utils'
import { calculateTrimSourceUpdate, clampTrimAmount, type TrimHandle } from './trim-utils'

export interface TransitionTrimPlan {
  leftClipId: string
  rightClipId: string
  durationInFrames: number
  alignment: number
  trimLeft: number
  trimRight: number
  fps: number
}

function findRequiredTrim(
  clip: TimelineItem,
  edge: TrimHandle,
  requiredFrames: number,
  duration: number,
  fps: number,
): number | null {
  if (getAvailableTransitionHandle(clip, edge, fps) >= requiredFrames) return 0

  let low = 1
  let high = Math.abs(
    clampTrimAmount(
      clip,
      edge,
      (clip.durationInFrames - duration - 1) * (edge === 'start' ? 1 : -1),
      fps,
    ).clampedAmount,
  )
  let best: number | null = null
  while (low <= high) {
    const amount = Math.floor((low + high) / 2)
    const delta = edge === 'start' ? amount : -amount
    const durationInFrames = clip.durationInFrames - amount
    const trimmed = {
      ...clip,
      durationInFrames,
      ...calculateTrimSourceUpdate(clip, edge, delta, durationInFrames, fps),
    }
    if (getAvailableTransitionHandle(trimmed, edge, fps) >= requiredFrames) {
      best = amount
      high = amount - 1
    } else {
      low = amount + 1
    }
  }
  return best
}

export function planTransitionTrim(
  target: ResolvedTransitionTarget,
  fps: number,
): TransitionTrimPlan | null {
  if (target.canApply || target.hasExisting) return null

  const { leftClip, rightClip, alignment } = target
  const maxDuration = Math.min(
    TRANSITION_CONFIGS.crossfade.defaultDuration,
    leftClip.durationInFrames - 1,
    rightClip.durationInFrames - 1,
  )
  for (let duration = Math.floor(maxDuration); duration >= 2; duration--) {
    const { leftPortion, rightPortion } = calculateTransitionPortions(duration, alignment)
    const trimLeft = findRequiredTrim(leftClip, 'end', rightPortion, duration, fps)
    if (trimLeft === null) continue
    const trimRight = findRequiredTrim(rightClip, 'start', leftPortion, duration, fps)
    if (trimRight === null || trimLeft + trimRight === 0) continue
    return {
      leftClipId: leftClip.id,
      rightClipId: rightClip.id,
      durationInFrames: duration,
      alignment,
      trimLeft,
      trimRight,
      fps,
    }
  }
  return null
}
