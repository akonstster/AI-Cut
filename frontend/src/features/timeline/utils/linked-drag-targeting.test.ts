// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { TimelineTrack } from '@/types/timeline'
import {
  resolveCreateNewDragTrackTargets,
  resolveGroupDragTrackAssignments,
  resolveLinkedDragTrackTargets,
} from './linked-drag-targeting'

function makeTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: 'track-1',
    name: 'Track 1',
    height: 80,
    locked: false,
    visible: true,
    muted: false,
    solo: false,
    volume: 0,
    order: 0,
    items: [],
    ...overrides,
  }
}

describe('resolveLinkedDragTrackTargets', () => {
  it('uses the hovered video lane and its audio companion for a video drop zone', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 1 }),
      ],
      hoveredTrackId: 'v1',
      zone: 'video',
      preferredTrackHeight: 80,
    })

    expect(result).toMatchObject({ videoTrackId: 'v1', audioTrackId: 'a1' })
  })

  it('creates a new video lane above an audio lane when dropping into the video zone', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 1 })],
      hoveredTrackId: 'a1',
      zone: 'video',
      preferredTrackHeight: 72,
    })

    expect(result?.tracks.find((track) => track.id === result.videoTrackId)).toMatchObject({
      kind: 'video',
      name: 'V1',
    })
    expect(result?.audioTrackId).toBe('a1')
  })

  it('creates a new audio lane below a video lane when dropping into the audio zone', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 })],
      hoveredTrackId: 'v1',
      zone: 'audio',
      preferredTrackHeight: 72,
    })

    expect(result?.videoTrackId).toBe('v1')
    expect(result?.tracks.find((track) => track.id === result.audioTrackId)).toMatchObject({
      kind: 'audio',
      name: 'A1',
    })
  })

  it('maps linked pairs by matching section index across video and audio lanes', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'v2', name: 'V2', kind: 'video', order: 1 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 2 }),
      ],
      hoveredTrackId: 'v2',
      zone: 'audio',
      preferredTrackHeight: 72,
    })

    expect(result?.videoTrackId).toBe('v2')
    expect(result?.tracks.find((track) => track.id === result.audioTrackId)).toMatchObject({
      kind: 'audio',
      name: 'A2',
    })
  })

  // Dragging the picture up one video lane has nothing to do with the sound: when
  // the sound's own lane is free, it stays there instead of being pushed down to
  // match the picture's lane number.
  it('keeps the companion on its own audio lane when that lane is free', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'v2', name: 'V2', kind: 'video', order: 1 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 2 }),
        makeTrack({ id: 'a2', name: 'A2', kind: 'audio', order: 3 }),
      ],
      hoveredTrackId: 'v1',
      zone: 'video',
      preferredTrackHeight: 72,
      initialVideoTrackId: 'v2',
      initialAudioTrackId: 'a2',
    })

    expect(result?.videoTrackId).toBe('v1')
    expect(result?.audioTrackId).toBe('a2')
    expect(result?.tracks.map((track) => track.id)).toEqual(['v1', 'v2', 'a1', 'a2'])
  })

  it('falls back to matching lanes when the companion lane is locked', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'v2', name: 'V2', kind: 'video', order: 1 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 2 }),
        makeTrack({ id: 'a2', name: 'A2', kind: 'audio', order: 3, locked: true }),
      ],
      hoveredTrackId: 'v1',
      zone: 'video',
      preferredTrackHeight: 72,
      initialVideoTrackId: 'v2',
      initialAudioTrackId: 'a2',
    })

    expect(result?.videoTrackId).toBe('v1')
    expect(result?.audioTrackId).toBe('a1')
  })

  it('creates a fresh top video lane and bottom audio lane for new-track drop zones', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 1 }),
      ],
      hoveredTrackId: 'v1',
      zone: 'video',
      createNew: true,
      preferredTrackHeight: 72,
    })

    expect(result?.tracks.find((track) => track.id === result.videoTrackId)).toMatchObject({
      kind: 'video',
      name: 'V2',
    })
    expect(result?.tracks.find((track) => track.id === result.audioTrackId)).toMatchObject({
      kind: 'audio',
      name: 'A2',
    })
  })
})

describe('resolveCreateNewDragTrackTargets', () => {
  it('creates a new top video lane for a visual item drag', () => {
    const result = resolveCreateNewDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 1 }),
      ],
      draggedItems: [{ id: 'image-1', initialTrackId: 'v1', type: 'image' }],
      zone: 'video',
      preferredTrackHeight: 72,
    })

    const assignedTrackId = result?.trackAssignments.get('image-1')
    expect(result?.tracks.find((track) => track.id === assignedTrackId)).toMatchObject({
      kind: 'video',
      name: 'V2',
    })
  })

  it('creates a new bottom audio lane for an audio drag', () => {
    const result = resolveCreateNewDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 1 }),
      ],
      draggedItems: [{ id: 'audio-1', initialTrackId: 'a1', type: 'audio' }],
      zone: 'audio',
      preferredTrackHeight: 72,
    })

    const assignedTrackId = result?.trackAssignments.get('audio-1')
    expect(result?.tracks.find((track) => track.id === assignedTrackId)).toMatchObject({
      kind: 'audio',
      name: 'A2',
    })
  })

  it('preserves video lane gaps when moving a multi-track visual selection into the new-track zone', () => {
    const result = resolveCreateNewDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'v2', name: 'V2', kind: 'video', order: 1 }),
        makeTrack({ id: 'v3', name: 'V3', kind: 'video', order: 2 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 3 }),
      ],
      draggedItems: [
        { id: 'text-1', initialTrackId: 'v1', type: 'text' },
        { id: 'shape-1', initialTrackId: 'v3', type: 'shape' },
      ],
      zone: 'video',
      preferredTrackHeight: 72,
    })

    const textTrack = result?.tracks.find(
      (track) => track.id === result.trackAssignments.get('text-1'),
    )
    const shapeTrack = result?.tracks.find(
      (track) => track.id === result.trackAssignments.get('shape-1'),
    )
    expect(textTrack).toMatchObject({ kind: 'video', name: 'V4' })
    expect(shapeTrack).toMatchObject({ kind: 'video', name: 'V2' })
  })

  it('ignores mismatched create-new zones for non-linked items', () => {
    const result = resolveCreateNewDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 1 }),
      ],
      draggedItems: [{ id: 'video-1', initialTrackId: 'v1', type: 'video' }],
      zone: 'audio',
      preferredTrackHeight: 72,
    })

    expect(result).toBeNull()
  })
})

describe('resolveGroupDragTrackAssignments', () => {
  const tracks = () => [
    makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
    makeTrack({ id: 'v2', name: 'V2', kind: 'video', order: 1 }),
    makeTrack({ id: 'v3', name: 'V3', kind: 'video', order: 2 }),
    makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 3 }),
    makeTrack({ id: 'a2', name: 'A2', kind: 'audio', order: 4 }),
  ]

  it('moves only the picture when a pair with subtitles changes video lane', () => {
    const result = resolveGroupDragTrackAssignments({
      tracks: tracks(),
      items: [
        { id: 'video', initialTrackId: 'v3', kind: 'video', staysOnOwnLane: false },
        { id: 'audio', initialTrackId: 'a2', kind: 'audio', staysOnOwnLane: false },
        { id: 'subtitle', initialTrackId: 'v1', kind: 'video', staysOnOwnLane: true },
      ],
      anchorItemId: 'video',
      targetTrackId: 'v2',
      createNew: false,
      preferredTrackHeight: 72,
    })

    expect(result?.trackAssignments.get('video')).toBe('v2')
    // The sound keeps its own lane and the subtitles stay on theirs.
    expect(result?.trackAssignments.get('audio')).toBe('a2')
    expect(result?.trackAssignments.get('subtitle')).toBe('v1')
    expect(result?.tracks.map((track) => track.id)).toEqual(['v1', 'v2', 'v3', 'a1', 'a2'])
  })

  it('moves only the sound when the audio half is the anchor', () => {
    const result = resolveGroupDragTrackAssignments({
      tracks: tracks(),
      items: [
        { id: 'video', initialTrackId: 'v2', kind: 'video', staysOnOwnLane: false },
        { id: 'audio', initialTrackId: 'a2', kind: 'audio', staysOnOwnLane: false },
        { id: 'subtitle', initialTrackId: 'v1', kind: 'video', staysOnOwnLane: true },
      ],
      anchorItemId: 'audio',
      targetTrackId: 'a1',
      createNew: false,
      preferredTrackHeight: 72,
    })

    expect(result?.trackAssignments.get('audio')).toBe('a1')
    expect(result?.trackAssignments.get('video')).toBe('v2')
    expect(result?.trackAssignments.get('subtitle')).toBe('v1')
  })

  it('keeps a stack of same-kind pictures together when the group moves', () => {
    const result = resolveGroupDragTrackAssignments({
      tracks: tracks(),
      items: [
        { id: 'top', initialTrackId: 'v3', kind: 'video', staysOnOwnLane: false },
        { id: 'bottom', initialTrackId: 'v2', kind: 'video', staysOnOwnLane: false },
        { id: 'audio', initialTrackId: 'a1', kind: 'audio', staysOnOwnLane: false },
      ],
      anchorItemId: 'top',
      targetTrackId: 'v2',
      createNew: false,
      preferredTrackHeight: 72,
    })

    expect(result?.trackAssignments.get('top')).toBe('v2')
    expect(result?.trackAssignments.get('bottom')).toBe('v1')
    expect(result?.trackAssignments.get('audio')).toBe('a1')
  })

  it('refuses when every lane of a kind is taken by the same drag', () => {
    const result = resolveGroupDragTrackAssignments({
      tracks: [makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 })],
      items: [
        { id: 'one', initialTrackId: 'v1', kind: 'video', staysOnOwnLane: false },
        { id: 'two', initialTrackId: 'v1', kind: 'video', staysOnOwnLane: false },
      ],
      anchorItemId: 'one',
      targetTrackId: 'v1',
      createNew: false,
      preferredTrackHeight: 72,
    })

    expect(result).toBeNull()
  })
})
