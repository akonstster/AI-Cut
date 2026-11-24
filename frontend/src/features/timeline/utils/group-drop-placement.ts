import {
  buildCollisionTrackItemsMap,
  findNearestAvailableSpaceInTrackItems,
  type CollisionRect,
} from './collision-utils'

export interface GroupDropItem extends CollisionRect {
  id: string
}

/**
 * Choose one shift that is free for EVERY item being dragged.
 *
 * A linked pair moves as a unit, but its halves live on different tracks with
 * different neighbours. Taking the largest per-item correction (or the one with the
 * biggest magnitude) can satisfy the audio half and drop the picture on top of a
 * text clip — the exact overlap reported after dragging a video. Deltas are
 * therefore collected as candidates and each is verified against the whole group;
 * when nothing satisfies all of them the drop is refused instead of overlapping.
 */
export function resolveGroupDropDelta(
  items: readonly GroupDropItem[],
  others: readonly CollisionRect[],
): number | null {
  if (items.length === 0) return 0
  const trackItems = buildCollisionTrackItemsMap(others)

  const isFreeAt = (item: GroupDropItem, from: number): boolean => {
    if (from < 0) return false
    const position = findNearestAvailableSpaceInTrackItems(
      from,
      item.durationInFrames,
      trackItems.get(item.trackId) ?? [],
    )
    return position === from
  }

  if (items.every((item) => isFreeAt(item, item.from))) return 0

  const candidates: number[] = []
  for (const item of items) {
    const nearest = findNearestAvailableSpaceInTrackItems(
      item.from,
      item.durationInFrames,
      trackItems.get(item.trackId) ?? [],
    )
    if (nearest === null) continue
    const delta = nearest - item.from
    if (delta !== 0 && !candidates.includes(delta)) candidates.push(delta)
  }

  // The smallest correction that clears every item wins; ties keep the first.
  candidates.sort((left, right) => Math.abs(left) - Math.abs(right))
  // A "nearest free space" thousands of frames away is not a drop the person meant:
  // refuse it instead of teleporting the group to the end of the timeline.
  const maxShift = Math.max(60, ...items.map((item) => item.durationInFrames * 2))
  for (const delta of candidates) {
    if (Math.abs(delta) > maxShift) break
    if (items.every((item) => isFreeAt(item, item.from + delta))) return delta
  }
  return null
}
