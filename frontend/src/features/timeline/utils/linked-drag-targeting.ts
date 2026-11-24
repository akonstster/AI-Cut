import type { TimelineItem, TimelineTrack } from '@/types/timeline'
import {
  createClassicTrack,
  getTrackKind,
  renameTrackForKind,
  type TrackKind,
} from './classic-tracks'

export type LinkedDragDropZone = 'video' | 'audio'

interface EnsureTrackIndexParams {
  tracks: TimelineTrack[]
  kind: TrackKind
  index: number
  preferredTrackHeight: number
}

export interface LinkedDragTrackTargetResult {
  tracks: TimelineTrack[]
  videoTrackId: string
  audioTrackId: string
}

export interface CreateNewDragTrackItem {
  id: string
  initialTrackId: string
  type: TimelineItem['type']
}

export interface CreateNewDragTrackTargetResult {
  tracks: TimelineTrack[]
  trackAssignments: Map<string, string>
}

function getKindTracks(tracks: TimelineTrack[], kind: TrackKind): TimelineTrack[] {
  return [...tracks]
    .filter((track) => getTrackKind(track) === kind)
    .sort((left, right) => left.order - right.order)
}

function getClassicTrackNumber(track: TimelineTrack, kind: TrackKind): number | null {
  const prefix = kind === 'video' ? 'V' : 'A'
  const match = track.name.match(new RegExp(`^${prefix}(\\d+)$`, 'i'))
  if (!match?.[1]) {
    return null
  }

  const value = Number.parseInt(match[1], 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

function getTrackNumberIndex(tracks: TimelineTrack[], kind: TrackKind, trackId: string): number {
  return getKindTracks(tracks, kind).findIndex((track) => track.id === trackId)
}

function getNextSectionOrder(tracks: TimelineTrack[], kind: TrackKind): number {
  const sortedTracks = [...tracks].sort((left, right) => left.order - right.order)
  const kindTracks = getKindTracks(sortedTracks, kind)

  if (kind === 'video') {
    const lastVideoTrack = kindTracks[kindTracks.length - 1]
    const firstAudioTrack = getKindTracks(sortedTracks, 'audio')[0]

    if (lastVideoTrack && firstAudioTrack) {
      return (lastVideoTrack.order + firstAudioTrack.order) / 2
    }
    if (lastVideoTrack) {
      return lastVideoTrack.order + 1
    }
    if (firstAudioTrack) {
      return firstAudioTrack.order - 1
    }
    return 0
  }

  const lastAudioTrack = kindTracks[kindTracks.length - 1]
  if (lastAudioTrack) {
    return lastAudioTrack.order + 1
  }

  const lastVideoTrack = getKindTracks(sortedTracks, 'video').at(-1)
  return lastVideoTrack ? lastVideoTrack.order + 1 : 1
}

function getCreateNewTrackOrder(tracks: TimelineTrack[], kind: TrackKind): number {
  if (kind === 'video') {
    const firstVideoTrack = getKindTracks(tracks, 'video')[0]
    const firstAudioTrack = getKindTracks(tracks, 'audio')[0]
    if (firstVideoTrack) return firstVideoTrack.order - 1
    if (firstAudioTrack) return firstAudioTrack.order - 1
    return 0
  }

  const lastAudioTrack = getKindTracks(tracks, 'audio').at(-1)
  const lastVideoTrack = getKindTracks(tracks, 'video').at(-1)
  if (lastAudioTrack) return lastAudioTrack.order + 1
  if (lastVideoTrack) return lastVideoTrack.order + 1
  return 1
}

function addCreateNewTrack(params: {
  tracks: TimelineTrack[]
  kind: TrackKind
  preferredTrackHeight: number
}): TimelineTrack[] {
  const createdTrack = createClassicTrack({
    tracks: params.tracks,
    kind: params.kind,
    order: getCreateNewTrackOrder(params.tracks, params.kind),
    height: params.preferredTrackHeight,
  })
  return [...params.tracks, createdTrack]
}

function getDraggedItemTrackKind(type: TimelineItem['type']): TrackKind {
  return type === 'audio' ? 'audio' : 'video'
}

function buildContiguousTrackAssignment(params: {
  sourceTrackIds: string[]
  targetTracks: TimelineTrack[]
  zone: LinkedDragDropZone
}): Map<string, string> {
  const targetAssignments = new Map<string, string>()
  if (params.sourceTrackIds.length === 0 || params.targetTracks.length === 0) {
    return targetAssignments
  }

  const startIndex =
    params.zone === 'video'
      ? 0
      : Math.max(0, params.targetTracks.length - params.sourceTrackIds.length)

  params.sourceTrackIds.forEach((trackId, index) => {
    const targetTrack =
      params.targetTracks[startIndex + index] ??
      params.targetTracks[params.zone === 'video' ? params.targetTracks.length - 1 : 0]
    if (targetTrack) {
      targetAssignments.set(trackId, targetTrack.id)
    }
  })

  return targetAssignments
}

export function resolveCreateNewDragTrackTargets(params: {
  tracks: TimelineTrack[]
  draggedItems: CreateNewDragTrackItem[]
  zone: LinkedDragDropZone
  preferredTrackHeight: number
}): CreateNewDragTrackTargetResult | null {
  const { tracks, draggedItems, zone, preferredTrackHeight } = params
  if (draggedItems.length === 0) {
    return null
  }

  const selectionKinds = Array.from(
    new Set(draggedItems.map((item) => getDraggedItemTrackKind(item.type))),
  )
  if (selectionKinds.length !== 1) {
    return null
  }

  const kind = selectionKinds[0]!
  if (zone !== kind) {
    return null
  }

  let workingTracks = [...tracks]
  const sourceTrackIds = Array.from(new Set(draggedItems.map((item) => item.initialTrackId)))
  const existingKindTrackCount = getKindTracks(workingTracks, kind).length
  const tracksToCreate = Math.max(1, sourceTrackIds.length - existingKindTrackCount)

  for (let index = 0; index < tracksToCreate; index += 1) {
    workingTracks = addCreateNewTrack({
      tracks: workingTracks,
      kind,
      preferredTrackHeight,
    })
  }

  const targetKindTracks = getKindTracks(workingTracks, kind)
  const sourceTracks = sourceTrackIds
    .map((trackId) => tracks.find((track) => track.id === trackId))
    .filter((track): track is TimelineTrack => track !== undefined)
    .sort((left, right) => left.order - right.order)
  const sourceTrackAssignments = new Map<string, string>()

  const canPreserveSectionOffsets =
    sourceTracks.length === sourceTrackIds.length &&
    sourceTracks.every((track) => getTrackKind(track) === kind)

  if (canPreserveSectionOffsets) {
    const sourceIndices = sourceTracks.map((track) => getTrackNumberIndex(tracks, kind, track.id))
    const hasValidIndices = sourceIndices.every((index) => index >= 0)

    if (hasValidIndices) {
      if (zone === 'video') {
        const topSelectedIndex = Math.min(...sourceIndices)
        sourceTracks.forEach((track, index) => {
          const targetTrack = targetKindTracks[sourceIndices[index]! - topSelectedIndex]
          if (targetTrack) {
            sourceTrackAssignments.set(track.id, targetTrack.id)
          }
        })
      } else {
        const bottomSelectedIndex = Math.max(...sourceIndices)
        const lastTargetIndex = targetKindTracks.length - 1
        sourceTracks.forEach((track, index) => {
          const targetTrack =
            targetKindTracks[lastTargetIndex - (bottomSelectedIndex - sourceIndices[index]!)]
          if (targetTrack) {
            sourceTrackAssignments.set(track.id, targetTrack.id)
          }
        })
      }
    }
  }

  if (sourceTrackAssignments.size === 0) {
    const contiguousAssignments = buildContiguousTrackAssignment({
      sourceTrackIds:
        sourceTracks.length > 0 ? sourceTracks.map((track) => track.id) : sourceTrackIds,
      targetTracks: targetKindTracks,
      zone,
    })
    contiguousAssignments.forEach((targetTrackId, sourceTrackId) => {
      sourceTrackAssignments.set(sourceTrackId, targetTrackId)
    })
  }

  const defaultTrackId = zone === 'video' ? targetKindTracks[0]?.id : targetKindTracks.at(-1)?.id
  if (!defaultTrackId) {
    return null
  }

  const trackAssignments = new Map<string, string>()
  for (const draggedItem of draggedItems) {
    trackAssignments.set(
      draggedItem.id,
      sourceTrackAssignments.get(draggedItem.initialTrackId) ?? defaultTrackId,
    )
  }

  return {
    tracks: workingTracks,
    trackAssignments,
  }
}

function ensureTrackIndex(params: EnsureTrackIndexParams): {
  tracks: TimelineTrack[]
  trackId: string
} {
  const { kind, index, preferredTrackHeight } = params
  let workingTracks = [...params.tracks]

  while (getKindTracks(workingTracks, kind).length <= index) {
    const createdTrack = createClassicTrack({
      tracks: workingTracks,
      kind,
      order: getNextSectionOrder(workingTracks, kind),
      height: preferredTrackHeight,
    })
    workingTracks = [...workingTracks, createdTrack]
  }

  return {
    tracks: workingTracks,
    trackId: getKindTracks(workingTracks, kind)[index]!.id,
  }
}

function ensureTrackNumber(params: {
  tracks: TimelineTrack[]
  kind: TrackKind
  number: number
  preferredTrackHeight: number
}): { tracks: TimelineTrack[]; trackId: string } {
  let workingTracks = [...params.tracks]

  while (
    !getKindTracks(workingTracks, params.kind).some(
      (track) => getClassicTrackNumber(track, params.kind) === params.number,
    )
  ) {
    const createdTrack = createClassicTrack({
      tracks: workingTracks,
      kind: params.kind,
      order: getNextSectionOrder(workingTracks, params.kind),
      height: params.preferredTrackHeight,
    })
    workingTracks = [...workingTracks, createdTrack]
  }

  const resolvedTrack = getKindTracks(workingTracks, params.kind).find(
    (track) => getClassicTrackNumber(track, params.kind) === params.number,
  )

  return {
    tracks: workingTracks,
    trackId: resolvedTrack!.id,
  }
}

export function resolveLinkedDragTrackTargets(params: {
  tracks: TimelineTrack[]
  hoveredTrackId: string
  zone: LinkedDragDropZone
  createNew?: boolean
  preferredTrackHeight: number
  /**
   * The pair's own lanes before the drag. When the companion's lane is free and
   * unlocked it stays there, instead of being forced to match the picture's number.
   */
  initialVideoTrackId?: string
  initialAudioTrackId?: string
}): LinkedDragTrackTargetResult | null {
  const { tracks, hoveredTrackId, zone, createNew = false, preferredTrackHeight } = params
  const hoveredTrack = tracks.find((track) => track.id === hoveredTrackId)
  if (!hoveredTrack) {
    return null
  }

  if (createNew) {
    const newVideoTrack = createClassicTrack({
      tracks,
      kind: 'video',
      order: getCreateNewTrackOrder(tracks, 'video'),
      height: preferredTrackHeight,
    })
    const tracksWithVideo = [...tracks, newVideoTrack]
    const newAudioTrack = createClassicTrack({
      tracks: tracksWithVideo,
      kind: 'audio',
      order: getCreateNewTrackOrder(tracksWithVideo, 'audio'),
      height: preferredTrackHeight,
    })

    return {
      tracks: [...tracksWithVideo, newAudioTrack],
      videoTrackId: newVideoTrack.id,
      audioTrackId: newAudioTrack.id,
    }
  }

  const zoneKind: TrackKind = zone === 'video' ? 'video' : 'audio'
  const companionKind: TrackKind = zone === 'video' ? 'audio' : 'video'
  const hoveredKind = getTrackKind(hoveredTrack)
  let workingTracks = [...tracks]
  let zoneTrackId: string
  let sectionIndex: number
  const hoveredTrackNumber = hoveredKind ? getClassicTrackNumber(hoveredTrack, hoveredKind) : null

  if (!hoveredTrack.locked && (hoveredKind === zoneKind || hoveredKind === null)) {
    const upgradedTrack = renameTrackForKind(hoveredTrack, workingTracks, zoneKind)
    if (upgradedTrack !== hoveredTrack) {
      workingTracks = workingTracks.map((track) =>
        track.id === hoveredTrack.id ? upgradedTrack : track,
      )
    }
    zoneTrackId = hoveredTrack.id
    sectionIndex = getTrackNumberIndex(workingTracks, zoneKind, zoneTrackId)
  } else {
    const referenceKind = hoveredKind === companionKind ? companionKind : zoneKind
    const referenceTracks = getKindTracks(workingTracks, referenceKind)
    sectionIndex = Math.max(
      0,
      referenceTracks.findIndex((track) => track.id === hoveredTrack.id),
    )
    const ensuredZoneTrack =
      hoveredTrackNumber !== null
        ? ensureTrackNumber({
            tracks: workingTracks,
            kind: zoneKind,
            number: hoveredTrackNumber,
            preferredTrackHeight,
          })
        : ensureTrackIndex({
            tracks: workingTracks,
            kind: zoneKind,
            index: sectionIndex,
            preferredTrackHeight,
          })
    workingTracks = ensuredZoneTrack.tracks
    zoneTrackId = ensuredZoneTrack.trackId
    sectionIndex = getTrackNumberIndex(workingTracks, zoneKind, zoneTrackId)
  }

  const zoneTrackNumber = getClassicTrackNumber(
    workingTracks.find((track) => track.id === zoneTrackId)!,
    zoneKind,
  )

  // The companion can simply stay on its own lane: dragging the picture up one
  // video lane has nothing to do with the sound, and forcing the pair to matching
  // numbers used to shove the audio down (or create another lane) although its own
  // lane was free and unlocked.
  const ownCompanionTrackId =
    zone === 'video' ? params.initialAudioTrackId : params.initialVideoTrackId
  const ownCompanionTrack = ownCompanionTrackId
    ? workingTracks.find((track) => track.id === ownCompanionTrackId)
    : undefined
  const companionStaysOnOwnTrack =
    ownCompanionTrack !== undefined &&
    !ownCompanionTrack.locked &&
    (getTrackKind(ownCompanionTrack) ?? companionKind) === companionKind &&
    ownCompanionTrack.id !== zoneTrackId

  const companionTrackId = companionStaysOnOwnTrack
    ? ownCompanionTrack.id
    : (() => {
        const ensuredCompanionTrack =
          zoneTrackNumber !== null
            ? ensureTrackNumber({
                tracks: workingTracks,
                kind: companionKind,
                number: zoneTrackNumber,
                preferredTrackHeight,
              })
            : ensureTrackIndex({
                tracks: workingTracks,
                kind: companionKind,
                index: sectionIndex,
                preferredTrackHeight,
              })
        workingTracks = ensuredCompanionTrack.tracks
        return ensuredCompanionTrack.trackId
      })()

  if (zone === 'video') {
    return {
      tracks: workingTracks,
      videoTrackId: zoneTrackId,
      audioTrackId: companionTrackId,
    }
  }

  return {
    tracks: workingTracks,
    videoTrackId: companionTrackId,
    audioTrackId: zoneTrackId,
  }
}

export interface GroupDragTrackItem {
  id: string
  initialTrackId: string
  /** The physical lane kind: audio lanes or the universal video lanes. */
  kind: TrackKind
  /**
   * This item keeps its own lane even when the anchor's kind matches: subtitles
   * live on the same universal video lanes as pictures and photos, but moving the
   * picture must not drag its captions along.
   */
  staysOnOwnLane: boolean
}

/**
 * Assign lanes for a drag of any size (two clips, a pair with subtitles, five
 * clips across three lanes).
 *
 * Video lanes are universal — photos, pictures, text, adjustment layers and
 * subtitles all share them — so only the anchor's *kind* (video vs audio) moves
 * as a stack. Anything of the other kind, and anything flagged `staysOnOwnLane`,
 * keeps the lane it already sits on, as long as it is free, unlocked and not
 * claimed by another item of the same drag. No lane is ever excluded from the
 * candidates: subtitles can live anywhere, so a free video lane is a free video
 * lane regardless of what currently sits on it.
 */
export function resolveGroupDragTrackAssignments(params: {
  tracks: TimelineTrack[]
  items: GroupDragTrackItem[]
  anchorItemId: string
  targetTrackId: string
  createNew: boolean
  preferredTrackHeight: number
}): CreateNewDragTrackTargetResult | null {
  const { items, createNew, preferredTrackHeight } = params
  if (items.length === 0) return null

  const anchor = items.find((item) => item.id === params.anchorItemId) ?? items[0]!
  const anchorKind = anchor.kind

  let workingTracks = [...params.tracks]
  const usedTrackIds = new Set<string>()

  const createTrack = (kind: TrackKind): string => {
    const track = createClassicTrack({
      tracks: workingTracks,
      kind,
      order: getCreateNewTrackOrder(workingTracks, kind),
      height: preferredTrackHeight,
    })
    workingTracks = [...workingTracks, track]
    return track.id
  }

  const nearestFreeKindTrack = (kind: TrackKind, nearIndex: number): string | null => {
    const kindTracks = getKindTracks(workingTracks, kind)
    let bestId: string | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < kindTracks.length; index += 1) {
      const track = kindTracks[index]!
      if (track.locked || usedTrackIds.has(track.id)) continue
      const distance = Math.abs(index - nearIndex)
      if (distance < bestDistance) {
        bestDistance = distance
        bestId = track.id
      }
    }
    return bestId
  }

  // The anchor goes where the pointer is, or to the closest lane of its own kind.
  const hovered = workingTracks.find((track) => track.id === params.targetTrackId)
  const hoveredKind = hovered ? (getTrackKind(hovered) ?? anchorKind) : anchorKind
  let anchorTrackId: string | null = null
  if (hovered && !hovered.locked && hoveredKind === anchorKind) {
    anchorTrackId = hovered.id
  } else if (createNew) {
    anchorTrackId = createTrack(anchorKind)
  } else if (hovered) {
    const hoveredIndex = Math.max(
      0,
      getKindTracks(workingTracks, hoveredKind).findIndex((track) => track.id === hovered.id),
    )
    anchorTrackId = nearestFreeKindTrack(anchorKind, hoveredIndex)
  }
  if (!anchorTrackId) return null

  usedTrackIds.add(anchorTrackId)
  const trackAssignments = new Map<string, string>([[anchor.id, anchorTrackId]])
  const anchorIndex = Math.max(
    0,
    getKindTracks(workingTracks, anchorKind).findIndex((track) => track.id === anchorTrackId),
  )
  const anchorInitialIndex = Math.max(
    0,
    getTrackNumberIndex(workingTracks, anchorKind, anchor.initialTrackId),
  )

  const ordered = [...items].sort((left, right) => {
    const leftIndex = getTrackNumberIndex(workingTracks, left.kind, left.initialTrackId)
    const rightIndex = getTrackNumberIndex(workingTracks, right.kind, right.initialTrackId)
    return leftIndex - rightIndex || left.id.localeCompare(right.id)
  })

  for (const item of ordered) {
    if (item.id === anchor.id) continue
    const kind = item.kind
    const initialIndex = getTrackNumberIndex(workingTracks, kind, item.initialTrackId)
    let targetId: string | null = null

    if (!item.staysOnOwnLane && kind === anchorKind && initialIndex >= 0) {
      // Same kind as the anchor and not flagged to stay put: keep the stack
      // together and move it as a unit.
      const kindTracks = getKindTracks(workingTracks, kind)
      const desiredIndex = Math.min(
        Math.max(0, anchorIndex + (initialIndex - anchorInitialIndex)),
        Math.max(0, kindTracks.length - 1),
      )
      const candidate = kindTracks[desiredIndex]
      if (candidate && !candidate.locked && !usedTrackIds.has(candidate.id)) {
        targetId = candidate.id
      } else {
        targetId = nearestFreeKindTrack(kind, desiredIndex)
        if (!targetId && createNew) targetId = createTrack(kind)
      }
    } else {
      // Another kind, or an annotation that must not be dragged along: keep its own
      // lane — this is what lets the sound and the subtitles stay put while the
      // picture changes lane.
      const own = workingTracks.find((track) => track.id === item.initialTrackId)
      if (own && !own.locked && !usedTrackIds.has(own.id) && (getTrackKind(own) ?? kind) === kind) {
        targetId = own.id
      } else {
        targetId = nearestFreeKindTrack(kind, anchorIndex)
        if (!targetId && createNew) targetId = createTrack(kind)
      }
    }

    if (!targetId) return null
    usedTrackIds.add(targetId)
    trackAssignments.set(item.id, targetId)
  }

  return { tracks: workingTracks, trackAssignments }
}
