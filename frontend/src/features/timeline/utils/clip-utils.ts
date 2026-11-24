import type { TimelineItem } from '@/types/timeline'
import { areFramesAligned } from './frame-alignment'

/**
 * Check if two items can be joined (inverse of split)
 * Items must satisfy ALL conditions:
 * - Same originId (from a split operation)
 * - Same trackId (on same track)
 * - Same mediaId (from same source)
 * - Adjacent position (left ends where right begins)
 * - Same speed
 * - Source continuity (left.sourceEnd === right.sourceStart)
 */
export function canJoinItems(leftItem: TimelineItem, rightItem: TimelineItem): boolean {
  // Must share same origin (from a split operation)
  if (leftItem.originId !== rightItem.originId) return false
  // Must be on same track
  if (leftItem.trackId !== rightItem.trackId) return false
  // Must be from the same source / compound
  const leftSourceKey = leftItem.compositionId ?? leftItem.mediaId
  const rightSourceKey = rightItem.compositionId ?? rightItem.mediaId
  if (!leftSourceKey || leftSourceKey !== rightSourceKey) return false
  // Must be adjacent (left ends where right begins)
  if (!areFramesAligned(leftItem.from + leftItem.durationInFrames, rightItem.from)) return false
  // Must have same speed
  if ((leftItem.speed || 1) !== (rightItem.speed || 1)) return false

  // Verify source continuity (no trim gap between clips)
  const leftSourceEnd =
    leftItem.sourceEnd ??
    (leftItem.sourceStart ?? 0) + leftItem.durationInFrames * (leftItem.speed || 1)
  const rightSourceStart = rightItem.sourceStart ?? 0
  if (Math.abs(leftSourceEnd - rightSourceStart) > 0.5) return false // Allow small floating point tolerance

  return true
}

/**
 * Check if multiple items can be joined (form a contiguous joinable chain)
 * Items must be sorted by position and each adjacent pair must pass canJoinItems
 */
export function canJoinMultipleItems(items: TimelineItem[]): boolean {
  if (items.length < 2) return false

  // Sort by position
  const sorted = [...items].sort((a, b) => a.from - b.from)

  // Check each adjacent pair
  for (let i = 0; i < sorted.length - 1; i++) {
    if (!canJoinItems(sorted[i]!, sorted[i + 1]!)) {
      return false
    }
  }

  return true
}

/**
 * The selected clips of one track that form a joinable chain, or null when there is none.
 *
 * A timeline selection often spans several tracks at once: a linked video/audio pair selected
 * together has each half on its own track, so `canJoinMultipleItems` over the whole selection
 * fails even though both halves can be rejoined. Joining works per track — this picks the
 * joinable chain to hand to `joinItems`, which merges the linked counterpart by itself.
 *
 * @param items - Every timeline item
 * @param selectedIds - Ids of the selected items
 */
export function getJoinableSelection(
  items: readonly TimelineItem[],
  selectedIds: readonly string[],
): TimelineItem[] | null {
  const selected = selectedIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is TimelineItem => item !== undefined)
  if (selected.length < 2) return null

  const byTrack = new Map<string, TimelineItem[]>()
  for (const item of selected) {
    const group = byTrack.get(item.trackId)
    if (group) {
      group.push(item)
    } else {
      byTrack.set(item.trackId, [item])
    }
  }

  let best: TimelineItem[] | null = null
  for (const group of byTrack.values()) {
    if (group.length < 2 || !canJoinMultipleItems(group)) continue
    if (!best || group.length > best.length) {
      best = group
    }
  }
  return best
}
