// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vite-plus/test'
import type { AudioItem, CompositionItem, VideoItem } from '@/types/timeline'
import {
  makeTimelineAudioItem,
  makeTimelineTrack as makeTrack,
  makeTimelineVideoItem,
} from '../../test-helpers'
import { useItemsStore } from '../items-store'
import { useTransitionsStore } from '../transitions-store'
import { useKeyframesStore } from '../keyframes-store'
import { useTimelineCommandStore } from '../timeline-command-store'
import { useTimelineSettingsStore } from '../timeline-settings-store'
import {
  addTransition,
  addTransitionWithTrim,
  removeTransition,
  updateTransition,
} from './transition-actions'
import { updateItem } from './item-actions'
import { getManagedLinkedAudioTransitions } from '@/shared/utils/linked-media'
import { useEditorStore } from '@/shared/state/editor'
import { resolveTransitionTargetForEdge } from '../../utils/transition-targets'
import { planTransitionTrim } from '../../utils/transition-trim-plan'

function makeVideoItem(overrides: Partial<VideoItem> = {}): VideoItem {
  return makeTimelineVideoItem({
    trackId: 'video-track',
    linkedGroupId: 'group-1',
    sourceDuration: 180,
    ...overrides,
  })
}

function makeAudioItem(overrides: Partial<AudioItem> = {}): AudioItem {
  return makeTimelineAudioItem({
    trackId: 'audio-track',
    label: 'clip.mp4',
    linkedGroupId: 'group-1',
    sourceDuration: 180,
    ...overrides,
  })
}

function makeCompositionItem(overrides: Partial<CompositionItem> = {}): CompositionItem {
  return {
    id: 'comp-1',
    type: 'composition',
    trackId: 'video-track',
    from: 0,
    durationInFrames: 60,
    label: 'Compound 1',
    compositionId: 'composition-1',
    compositionWidth: 1920,
    compositionHeight: 1080,
    linkedGroupId: 'group-1',
    sourceStart: 0,
    sourceEnd: 60,
    sourceDuration: 120,
    sourceFps: 30,
    ...overrides,
  } as CompositionItem
}

describe('transition actions with linked audio companions', () => {
  beforeEach(() => {
    useTimelineCommandStore.getState().clearHistory()
    useTimelineSettingsStore.setState({ fps: 30, isDirty: false })
    useItemsStore
      .getState()
      .setTracks([
        makeTrack({ id: 'video-track', name: 'V1', order: 0, kind: 'video' }),
        makeTrack({ id: 'audio-track', name: 'A1', order: 1, kind: 'audio' }),
      ])
    useItemsStore.getState().setItems([])
    useTransitionsStore.getState().setTransitions([])
    useKeyframesStore.getState().setKeyframes([])
  })

  function planTrimAtCut() {
    const target = resolveTransitionTargetForEdge({
      itemId: 'video-1',
      edge: 'right',
      items: useItemsStore.getState().items,
      transitions: useTransitionsStore.getState().transitions,
      timelineFps: 30,
    })
    return planTransitionTrim(target!, 30)!
  }

  it('trims fully used video, removes the same interval from sync-locked audio, and undoes once', () => {
    const store = useItemsStore.getState()
    store.setTracks([
      ...store.tracks,
      makeTrack({ id: 'music', name: 'Music', order: 2, kind: 'audio', syncLock: false }),
    ])
    store.setItems([
      makeVideoItem({ id: 'video-1', sourceDuration: 60 }),
      makeVideoItem({ id: 'video-2', from: 60, sourceDuration: 60, linkedGroupId: 'group-2' }),
      makeVideoItem({ id: 'video-3', from: 120, linkedGroupId: 'group-3' }),
      makeAudioItem({
        id: 'audio-1',
        linkedGroupId: undefined,
        durationInFrames: 120,
        sourceEnd: 120,
      }),
      makeAudioItem({ id: 'music-1', trackId: 'music', from: 90, linkedGroupId: undefined }),
    ])
    const before = useItemsStore.getState().items
    const plan = planTrimAtCut()
    expect(plan).toMatchObject({ trimLeft: 15, trimRight: 15, durationInFrames: 30 })
    expect(addTransitionWithTrim(plan, { presentation: 'fade' })).toBe(true)

    const { items, itemById } = useItemsStore.getState()
    expect(itemById['video-1']).toMatchObject({ from: 0, sourceEnd: 45, durationInFrames: 45 })
    expect(itemById['video-2']).toMatchObject({ from: 45, sourceStart: 15, durationInFrames: 45 })
    expect(itemById['video-3']).toMatchObject({ from: 90 })
    expect(itemById['music-1']).toMatchObject({ from: 90, durationInFrames: 60 })
    expect(
      items
        .filter((item) => item.trackId === 'audio-track')
        .map((item) => ({
          from: item.from,
          duration: item.durationInFrames,
          sourceStart: item.sourceStart,
        })),
    ).toEqual([
      { from: 0, duration: 45, sourceStart: 0 },
      { from: 45, duration: 45, sourceStart: 75 },
    ])
    expect(useTransitionsStore.getState().transitions).toHaveLength(1)
    expect(useTimelineCommandStore.getState().undoStack).toHaveLength(1)

    useTimelineCommandStore.getState().undo()
    expect(useItemsStore.getState().items).toEqual(before)
    expect(useTransitionsStore.getState().transitions).toHaveLength(0)
    useTimelineCommandStore.getState().redo()
    expect(useItemsStore.getState().itemById['video-3']?.from).toBe(90)
    expect(useTransitionsStore.getState().transitions).toHaveLength(1)
  })

  it('rolls back the first trim if the second clip has linked audio on a locked track', () => {
    const store = useItemsStore.getState()
    store.setTracks(
      store.tracks.map((track) =>
        track.id === 'audio-track' ? { ...track, locked: true } : track,
      ),
    )
    store.setItems([
      makeVideoItem({ id: 'video-1', sourceDuration: 60 }),
      makeVideoItem({ id: 'video-2', from: 60, sourceDuration: 60, linkedGroupId: 'group-2' }),
      makeAudioItem({ id: 'audio-2', from: 60, sourceDuration: 60, linkedGroupId: 'group-2' }),
    ])
    const before = useItemsStore.getState().items
    const { linkedSelectionEnabled } = useEditorStore.getState()
    useEditorStore.setState({ linkedSelectionEnabled: true })
    try {
      expect(addTransitionWithTrim(planTrimAtCut(), { presentation: 'fade' })).toBe(false)
      expect(useItemsStore.getState().items).toEqual(before)
      expect(useTransitionsStore.getState().transitions).toHaveLength(0)
      expect(useTimelineCommandStore.getState().undoStack).toHaveLength(0)
      expect(useTimelineSettingsStore.getState().isDirty).toBe(false)
    } finally {
      useEditorStore.setState({ linkedSelectionEnabled })
    }
  })

  it('creates handles on the playback edges of reversed video at a different source frame rate', () => {
    const source = { sourceEnd: 48, sourceDuration: 48, sourceFps: 24, isReversed: true }
    useItemsStore
      .getState()
      .setItems([
        makeVideoItem({ ...source, id: 'video-1', linkedGroupId: undefined }),
        makeVideoItem({ ...source, id: 'video-2', from: 60, linkedGroupId: undefined }),
      ])
    const plan = planTrimAtCut()
    expect(plan).toMatchObject({ trimLeft: 15, trimRight: 15, durationInFrames: 30 })
    expect(addTransitionWithTrim(plan, { presentation: 'fade' })).toBe(true)
    const { itemById } = useItemsStore.getState()
    expect(itemById['video-1']).toMatchObject({ sourceStart: 12, sourceEnd: 48 })
    expect(itemById['video-2']).toMatchObject({ sourceStart: 0, sourceEnd: 36, from: 45 })
  })

  it('keeps synchronized linked audio geometry centered on the cut when adding a transition', () => {
    useItemsStore.getState().setItems([
      makeVideoItem({ id: 'video-1', linkedGroupId: 'group-1' }),
      makeAudioItem({ id: 'audio-1', linkedGroupId: 'group-1' }),
      makeVideoItem({
        id: 'video-2',
        from: 60,
        linkedGroupId: 'group-2',
        sourceStart: 30,
        sourceEnd: 90,
        mediaId: 'media-2',
      }),
      makeAudioItem({
        id: 'audio-2',
        from: 60,
        linkedGroupId: 'group-2',
        sourceStart: 30,
        sourceEnd: 90,
        mediaId: 'media-2',
      }),
      makeAudioItem({ id: 'audio-3', from: 150, linkedGroupId: undefined, mediaId: 'music-bed' }),
    ])

    const added = addTransition('video-1', 'video-2', 'crossfade', 30)

    expect(added).toBe(true)
    expect(useItemsStore.getState().itemById['video-2']).toMatchObject({ from: 60 })
    expect(useItemsStore.getState().itemById['audio-2']?.from).toBe(60)
    expect(useItemsStore.getState().itemById['audio-2']?.audioFadeIn ?? 0).toBe(0)
    expect(useItemsStore.getState().itemById['audio-1']?.audioFadeOut ?? 0).toBe(0)
    expect(useItemsStore.getState().itemById['audio-3']).toMatchObject({ from: 150 })
  })

  it('manages linked compound audio transitions from compound visual transitions', () => {
    useItemsStore.getState().setItems([
      makeCompositionItem({
        id: 'comp-1',
        linkedGroupId: 'group-1',
        compositionId: 'composition-1',
        sourceStart: 0,
        sourceEnd: 80,
        sourceDuration: 120,
      }),
      makeAudioItem({
        id: 'comp-audio-1',
        mediaId: undefined,
        src: '',
        label: 'Compound 1',
        linkedGroupId: 'group-1',
        compositionId: 'composition-1',
        sourceStart: 0,
        sourceEnd: 80,
        sourceDuration: 120,
      }),
      makeCompositionItem({
        id: 'comp-2',
        from: 60,
        linkedGroupId: 'group-2',
        compositionId: 'composition-2',
        label: 'Compound 2',
        sourceStart: 20,
        sourceEnd: 80,
        sourceDuration: 120,
      }),
      makeAudioItem({
        id: 'comp-audio-2',
        from: 60,
        mediaId: undefined,
        src: '',
        label: 'Compound 2',
        linkedGroupId: 'group-2',
        compositionId: 'composition-2',
        sourceStart: 20,
        sourceEnd: 80,
        sourceDuration: 120,
      }),
    ])

    const added = addTransition('comp-1', 'comp-2', 'crossfade', 20)

    expect(added).toBe(true)
    const managedTransitions = getManagedLinkedAudioTransitions(
      useItemsStore.getState().items,
      useTransitionsStore.getState().transitions,
    )
    expect(managedTransitions).toEqual([
      expect.objectContaining({
        leftAudio: expect.objectContaining({ id: 'comp-audio-1' }),
        rightAudio: expect.objectContaining({ id: 'comp-audio-2' }),
        transition: expect.objectContaining({ leftClipId: 'comp-1', rightClipId: 'comp-2' }),
      }),
    ])
  })

  it('clamps the default applied duration to the valid handle at the cut', () => {
    useItemsStore.getState().setItems([
      makeVideoItem({ id: 'video-1', sourceEnd: 68, sourceDuration: 180 }),
      makeVideoItem({
        id: 'video-2',
        from: 60,
        sourceStart: 6,
        sourceEnd: 66,
        sourceDuration: 180,
        linkedGroupId: 'group-2',
        mediaId: 'media-2',
      }),
    ])

    const added = addTransition('video-1', 'video-2')

    expect(added).toBe(true)
    expect(useTransitionsStore.getState().transitions).toEqual([
      expect.objectContaining({ durationInFrames: 13 }),
    ])
  })

  it('stores an explicit side placement when adding a transition', () => {
    useItemsStore.getState().setItems([
      makeVideoItem({ id: 'video-1', sourceEnd: 90, sourceDuration: 180 }),
      makeVideoItem({
        id: 'video-2',
        from: 60,
        sourceStart: 30,
        sourceEnd: 90,
        sourceDuration: 180,
        linkedGroupId: 'group-2',
        mediaId: 'media-2',
      }),
    ])

    const added = addTransition('video-1', 'video-2', 'crossfade', 30, 'fade', undefined, 1)

    expect(added).toBe(true)
    expect(useTransitionsStore.getState().transitions).toEqual([
      expect.objectContaining({ alignment: 1, durationInFrames: 30 }),
    ])
  })

  it('does not move synchronized linked audio when transition duration changes', () => {
    useItemsStore.getState().setItems([
      makeVideoItem({ id: 'video-1', linkedGroupId: 'group-1' }),
      makeAudioItem({ id: 'audio-1', linkedGroupId: 'group-1' }),
      makeVideoItem({
        id: 'video-2',
        from: 60,
        linkedGroupId: 'group-2',
        sourceStart: 45,
        sourceEnd: 105,
        mediaId: 'media-2',
      }),
      makeAudioItem({
        id: 'audio-2',
        from: 60,
        linkedGroupId: 'group-2',
        sourceStart: 45,
        sourceEnd: 105,
        mediaId: 'media-2',
      }),
    ])
    addTransition('video-1', 'video-2', 'crossfade', 30)
    const transitionId = useTransitionsStore.getState().transitions[0]?.id

    expect(transitionId).toBeDefined()
    updateTransition(transitionId!, { durationInFrames: 45 })

    expect(useItemsStore.getState().itemById['video-2']).toMatchObject({ from: 60 })
    expect(useItemsStore.getState().itemById['audio-2']?.from).toBe(60)
    expect(useItemsStore.getState().itemById['audio-2']?.audioFadeIn ?? 0).toBe(0)
    expect(useItemsStore.getState().itemById['audio-1']?.audioFadeOut ?? 0).toBe(0)
  })

  it('leaves synchronized linked audio in place when removing the transition', () => {
    useItemsStore.getState().setItems([
      makeVideoItem({ id: 'video-1', linkedGroupId: 'group-1' }),
      makeAudioItem({ id: 'audio-1', linkedGroupId: 'group-1' }),
      makeVideoItem({
        id: 'video-2',
        from: 60,
        linkedGroupId: 'group-2',
        sourceStart: 30,
        sourceEnd: 90,
        mediaId: 'media-2',
      }),
      makeAudioItem({
        id: 'audio-2',
        from: 60,
        linkedGroupId: 'group-2',
        sourceStart: 30,
        sourceEnd: 90,
        mediaId: 'media-2',
      }),
    ])
    addTransition('video-1', 'video-2', 'crossfade', 30)
    const transitionId = useTransitionsStore.getState().transitions[0]?.id

    removeTransition(transitionId!)

    expect(useItemsStore.getState().itemById['video-2']).toMatchObject({ from: 60 })
    expect(useItemsStore.getState().itemById['audio-2']?.from).toBe(60)
    expect(useItemsStore.getState().itemById['audio-2']?.audioFadeIn ?? 0).toBe(0)
    expect(useItemsStore.getState().itemById['audio-1']?.audioFadeOut ?? 0).toBe(0)
    expect(useTransitionsStore.getState().transitions).toEqual([])
  })

  it('preserves manual linked-audio fades across transition edits', () => {
    useItemsStore.getState().setItems([
      makeVideoItem({ id: 'video-1', linkedGroupId: 'group-1' }),
      makeAudioItem({ id: 'audio-1', linkedGroupId: 'group-1' }),
      makeVideoItem({
        id: 'video-2',
        from: 60,
        linkedGroupId: 'group-2',
        sourceStart: 45,
        sourceEnd: 105,
        mediaId: 'media-2',
      }),
      makeAudioItem({
        id: 'audio-2',
        from: 60,
        linkedGroupId: 'group-2',
        sourceStart: 45,
        sourceEnd: 105,
        mediaId: 'media-2',
      }),
    ])
    addTransition('video-1', 'video-2', 'crossfade', 30)
    const transitionId = useTransitionsStore.getState().transitions[0]?.id

    updateItem('audio-1', { audioFadeOut: 0.25 })
    updateTransition(transitionId!, { durationInFrames: 45 })

    expect(useItemsStore.getState().itemById['audio-1']).toMatchObject({ audioFadeOut: 0.25 })
    expect(useItemsStore.getState().itemById['audio-2']?.from).toBe(60)
    expect(useItemsStore.getState().itemById['audio-2']?.audioFadeIn ?? 0).toBe(0)

    removeTransition(transitionId!)

    expect(useItemsStore.getState().itemById['audio-1']).toMatchObject({ audioFadeOut: 0.25 })
    expect(useItemsStore.getState().itemById['audio-2']?.from).toBe(60)
    expect(useItemsStore.getState().itemById['audio-2']?.audioFadeIn ?? 0).toBe(0)
  })
})
