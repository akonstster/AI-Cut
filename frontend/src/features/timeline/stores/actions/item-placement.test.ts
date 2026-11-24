// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { makeTimelineAudioItem, makeTimelineTrack, makeTimelineVideoItem } from '../../test-helpers'
import { useItemsStore } from '../items-store'
import { placeItemsWithoutTimelineOverlap } from './item-placement'

describe('placeItemsWithoutTimelineOverlap', () => {
  beforeEach(() => {
    useItemsStore
      .getState()
      .setTracks([
        makeTimelineTrack({ id: 'track-v1', name: 'V1', kind: 'video', order: 0 }),
        makeTimelineTrack({ id: 'track-v2', name: 'V2', kind: 'video', order: 1 }),
        makeTimelineTrack({ id: 'track-a1', name: 'A1', kind: 'audio', order: 2 }),
      ])
    useItemsStore.getState().setItems([])
  })

  it('keeps items at their proposed position when the track is free', () => {
    const incoming = makeTimelineVideoItem({ id: 'new-1', from: 25 })

    const placed = placeItemsWithoutTimelineOverlap([incoming])

    expect(placed).toHaveLength(1)
    expect(placed[0]?.from).toBe(25)
    // Unmoved items are returned by reference, not copied
    expect(placed[0]).toBe(incoming)
  })

  it('pushes an item past an occupying clip', () => {
    useItemsStore.getState().setItems([makeTimelineVideoItem({ id: 'existing', from: 0 })])

    const placed = placeItemsWithoutTimelineOverlap([
      makeTimelineVideoItem({ id: 'new-1', from: 30 }),
    ])

    // existing occupies [0, 60) — the new clip lands right after it
    expect(placed[0]?.from).toBe(60)
  })

  it('slots an item into a gap that fits it exactly', () => {
    useItemsStore
      .getState()
      .setItems([
        makeTimelineVideoItem({ id: 'left', from: 0 }),
        makeTimelineVideoItem({ id: 'right', from: 120 }),
      ])

    const placed = placeItemsWithoutTimelineOverlap([
      makeTimelineVideoItem({ id: 'new-1', from: 50, durationInFrames: 60 }),
    ])

    // Gap [60, 120) fits the 60-frame clip
    expect(placed[0]?.from).toBe(60)
  })

  it('stacks multiple incoming items on the same track sequentially', () => {
    useItemsStore.getState().setItems([makeTimelineVideoItem({ id: 'existing', from: 0 })])

    const placed = placeItemsWithoutTimelineOverlap([
      makeTimelineVideoItem({ id: 'new-2', from: 10 }),
      makeTimelineVideoItem({ id: 'new-1', from: 5 }),
    ])

    // Sorted by from regardless of input order, then placed back-to-back after `existing`
    const byId = new Map(placed.map((item) => [item.id, item]))
    expect(byId.get('new-1')?.from).toBe(60)
    expect(byId.get('new-2')?.from).toBe(120)
  })

  it('treats tracks independently', () => {
    useItemsStore.getState().setItems([makeTimelineVideoItem({ id: 'existing', from: 0 })])

    const placed = placeItemsWithoutTimelineOverlap([
      makeTimelineVideoItem({ id: 'new-1', from: 0, trackId: 'track-v2' }),
    ])

    expect(placed[0]?.from).toBe(0)
  })

  it('clamps negative proposed positions to frame 0', () => {
    const placed = placeItemsWithoutTimelineOverlap([
      makeTimelineVideoItem({ id: 'new-1', from: -20 }),
    ])

    expect(placed[0]?.from).toBe(0)
  })

  it('moves a linked pair as one unit so adding it never tears the sound from the picture', () => {
    // The audio track is busy right where the pair wants to land; the video track is free.
    useItemsStore
      .getState()
      .setItems([makeTimelineAudioItem({ id: 'music', from: 0, durationInFrames: 200 })])

    const placed = placeItemsWithoutTimelineOverlap([
      makeTimelineVideoItem({ id: 'video-1', from: 50, linkedGroupId: 'group-1' }),
      makeTimelineAudioItem({
        id: 'audio-1',
        from: 50,
        linkedGroupId: 'group-1',
        trackId: 'track-a1',
      }),
    ])
    const byId = new Map(placed.map((item) => [item.id, item]))

    expect(byId.get('audio-1')?.from).toBe(byId.get('video-1')?.from)
    // Pushed past the occupying music as a pair, not one half at a time.
    expect(byId.get('video-1')?.from).toBe(200)
  })
})
