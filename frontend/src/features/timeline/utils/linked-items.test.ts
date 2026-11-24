// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { TimelineItem } from '@/types/timeline'
import {
  buildAttachedCaptionBoundsPreviewUpdates,
  expandItemIdsWithAttachedCaptions,
  buildLinkedMovePreviewUpdates,
  canLinkSelection,
  canLinkItems,
  expandSelectionWithLinkedItems,
  filterUnlockedItemIds,
  getAttachedCaptionItemIds,
  getLinkedAndAttachedItemIds,
  getLinkedItemIds,
  getLinkedSyncOffsetFrames,
  getLinkedSyncRestoreUpdates,
  getSelectionIdsForItem,
  getUniqueLinkedItemAnchorIds,
  hasLinkedItems,
} from './linked-items'

function makeItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'item-1',
    type: 'video',
    trackId: 'track-1',
    from: 0,
    durationInFrames: 30,
    label: 'clip',
    mediaId: 'media-1',
    src: 'blob:test',
    ...overrides,
  } as TimelineItem
}

describe('linked items', () => {
  it('returns all items in the same linked group', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'group-1', type: 'video' }),
      makeItem({ id: 'audio-1', linkedGroupId: 'group-1', type: 'audio' }),
      makeItem({ id: 'video-2', linkedGroupId: 'group-2', type: 'video' }),
    ]

    expect(getLinkedItemIds(items, 'video-1')).toEqual(['video-1', 'audio-1'])
  })

  it('falls back to legacy synced video/audio pairs', () => {
    const items = [
      makeItem({ id: 'video-1', type: 'video', originId: 'origin-1' }),
      makeItem({ id: 'audio-1', type: 'audio', originId: 'origin-1' }),
      makeItem({ id: 'audio-2', type: 'audio', originId: 'origin-1', from: 10 }),
    ]

    expect(getLinkedItemIds(items, 'video-1')).toEqual(['video-1', 'audio-1'])
  })

  it('filters out items that sit on locked tracks', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'group-1', type: 'video', trackId: 'track-video' }),
      makeItem({ id: 'audio-1', linkedGroupId: 'group-1', type: 'audio', trackId: 'track-audio' }),
    ]
    const tracks = [
      { id: 'track-video', locked: false },
      { id: 'track-audio', locked: true },
    ]

    expect(filterUnlockedItemIds(items, tracks, ['video-1', 'audio-1'])).toEqual(['video-1'])
  })

  it('expands mixed selections with linked companions', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'group-1', type: 'video' }),
      makeItem({ id: 'audio-1', linkedGroupId: 'group-1', type: 'audio' }),
      makeItem({ id: 'video-2', type: 'video' }),
    ]

    expect(expandSelectionWithLinkedItems(items, ['video-1', 'video-2'])).toEqual([
      'video-1',
      'audio-1',
      'video-2',
    ])
  })

  it('finds caption-role text attached to a clip', () => {
    const items = [
      makeItem({ id: 'video-1', type: 'video' }),
      makeItem({
        id: 'caption-1',
        type: 'text',
        text: 'Hello',
        color: '#fff',
        textRole: 'caption',
        captionSource: { type: 'transcript', clipId: 'video-1', mediaId: 'media-1' },
      }),
      makeItem({
        id: 'manual-text',
        type: 'text',
        text: 'Manual',
        color: '#fff',
      }),
    ]

    expect(getAttachedCaptionItemIds(items, 'video-1')).toEqual(['caption-1'])
    expect(expandItemIdsWithAttachedCaptions(items, ['video-1'])).toEqual(['video-1', 'caption-1'])
  })

  it('attaches a subtitle segment to the clip it was generated from', () => {
    const items = [
      makeItem({ id: 'video-1', type: 'video' }),
      makeItem({
        id: 'subtitle-1',
        type: 'subtitle',
        label: 'Transcript',
        source: { type: 'transcript', mediaId: 'media-1', clipId: 'video-1' },
        cues: [{ id: 'c1', startSeconds: 0, endSeconds: 1, text: 'Hi' }],
      } as unknown as TimelineItem),
    ]

    expect(getAttachedCaptionItemIds(items, 'video-1')).toEqual(['subtitle-1'])
    expect(expandItemIdsWithAttachedCaptions(items, ['video-1'])).toEqual(['video-1', 'subtitle-1'])
  })

  it('selects a subtitle segment alone even when it shares a group with the picture', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'group-1', type: 'video' }),
      makeItem({
        id: 'subtitle-1',
        type: 'subtitle',
        linkedGroupId: 'group-1',
        label: 'Transcript',
        source: { type: 'transcript', mediaId: 'media-1', clipId: 'video-1' },
        cues: [],
      } as unknown as TimelineItem),
    ]

    expect(getSelectionIdsForItem(items, 'subtitle-1', true)).toEqual(['subtitle-1'])
    expect(getSelectionIdsForItem(items, 'video-1', true)).toEqual(['video-1', 'subtitle-1'])
    expect(getSelectionIdsForItem(items, 'subtitle-1', false)).toEqual(['subtitle-1'])
  })

  it('moves a linked subtitle together with its picture', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'group-1', type: 'video' }),
      makeItem({
        id: 'subtitle-1',
        type: 'subtitle',
        linkedGroupId: 'group-1',
        label: 'Transcript',
        source: { type: 'transcript', mediaId: 'media-1', clipId: 'video-1' },
        cues: [{ id: 'c1', startSeconds: 0, endSeconds: 1, text: 'Hi' }],
      } as unknown as TimelineItem),
    ]

    expect(new Set(expandSelectionWithLinkedItems(items, ['subtitle-1']))).toEqual(
      new Set(['subtitle-1', 'video-1']),
    )
  })

  it('includes attached captions when expanding a linked clip pair', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'group-1', type: 'video' }),
      makeItem({ id: 'audio-1', linkedGroupId: 'group-1', type: 'audio' }),
      makeItem({
        id: 'caption-1',
        type: 'text',
        text: 'Caption',
        color: '#fff',
        textRole: 'caption',
        captionSource: { type: 'transcript', clipId: 'video-1', mediaId: 'media-1' },
      }),
    ]

    expect(getLinkedAndAttachedItemIds(items, 'audio-1')).toEqual([
      'video-1',
      'audio-1',
      'caption-1',
    ])
  })

  it('builds live trim preview updates for attached captions clipped by new bounds', () => {
    const items = [
      makeItem({ id: 'video-1', type: 'video', from: 10, durationInFrames: 40 }),
      makeItem({
        id: 'caption-before',
        type: 'text',
        text: 'Before',
        color: '#fff',
        from: 10,
        durationInFrames: 4,
        textRole: 'caption',
        captionSource: { type: 'transcript', clipId: 'video-1', mediaId: 'media-1' },
      }),
      makeItem({
        id: 'caption-overlap',
        type: 'text',
        text: 'Overlap',
        color: '#fff',
        from: 12,
        durationInFrames: 8,
        textRole: 'caption',
        captionSource: { type: 'transcript', clipId: 'video-1', mediaId: 'media-1' },
      }),
      makeItem({
        id: 'caption-inside',
        type: 'text',
        text: 'Inside',
        color: '#fff',
        from: 24,
        durationInFrames: 8,
        textRole: 'caption',
        captionSource: { type: 'transcript', clipId: 'video-1', mediaId: 'media-1' },
      }),
    ]

    expect(
      buildAttachedCaptionBoundsPreviewUpdates(items, [
        { id: 'video-1', from: 16, durationInFrames: 34 },
      ]),
    ).toEqual([
      { id: 'caption-before', hidden: true },
      { id: 'caption-overlap', from: 16, durationInFrames: 4 },
    ])
  })

  it('dedupes linked groups down to one split anchor', () => {
    const items = [
      makeItem({
        id: 'comp-video-1',
        linkedGroupId: 'group-1',
        type: 'composition',
        compositionId: 'comp-1',
      }),
      makeItem({
        id: 'comp-audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        compositionId: 'comp-1',
        src: '',
      }),
      makeItem({ id: 'video-2', linkedGroupId: 'group-2', type: 'video' }),
      makeItem({ id: 'audio-2', linkedGroupId: 'group-2', type: 'audio' }),
    ]

    expect(
      getUniqueLinkedItemAnchorIds(items, ['comp-video-1', 'comp-audio-1', 'video-2', 'audio-2']),
    ).toEqual(['comp-video-1', 'video-2'])
  })

  it('validates linkable audio/video pairs', () => {
    const video = makeItem({
      id: 'video-1',
      type: 'video',
      mediaId: 'media-1',
      from: 12,
      durationInFrames: 48,
    })
    const audio = makeItem({
      id: 'audio-1',
      type: 'audio',
      mediaId: 'media-1',
      from: 12,
      durationInFrames: 48,
    })
    const shiftedAudio = makeItem({
      id: 'audio-2',
      type: 'audio',
      mediaId: 'media-1',
      from: 18,
      durationInFrames: 48,
    })

    expect(canLinkItems([video, audio])).toBe(true)
    expect(canLinkItems([video, shiftedAudio])).toBe(false)
    expect(
      hasLinkedItems(
        [
          { ...video, linkedGroupId: 'group-1' },
          { ...audio, linkedGroupId: 'group-1' },
        ],
        'video-1',
      ),
    ).toBe(true)
  })

  it('allows linking arbitrary multi-selection groups', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'video-1', type: 'video' }),
      makeItem({ id: 'audio-1', linkedGroupId: 'audio-1', type: 'audio' }),
      makeItem({
        id: 'video-2',
        linkedGroupId: 'video-2',
        type: 'video',
        from: 100,
        mediaId: 'media-2',
        originId: 'origin-2',
      }),
    ]

    expect(canLinkSelection(items, ['video-1', 'audio-1', 'video-2'])).toBe(true)
  })

  it('allows linking a selected clip with an existing linked group', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'group-1', type: 'video' }),
      makeItem({ id: 'audio-1', linkedGroupId: 'group-1', type: 'audio' }),
      makeItem({
        id: 'video-2',
        linkedGroupId: 'video-2',
        type: 'video',
        from: 100,
        mediaId: 'media-2',
        originId: 'origin-2',
      }),
    ]

    expect(canLinkSelection(items, ['video-1', 'video-2'])).toBe(true)
  })

  it('blocks relinking a selection that is already one linked group', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'group-1', type: 'video' }),
      makeItem({ id: 'audio-1', linkedGroupId: 'group-1', type: 'audio' }),
    ]

    expect(canLinkSelection(items, ['video-1', 'audio-1'])).toBe(false)
  })

  it('reports opposing sync offsets when linked clips move independently', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 10,
        sourceStart: 0,
        sourceFps: 30,
      }),
    ]

    expect(getLinkedSyncOffsetFrames(items, 'video-1', 30)).toBe(-10)
    expect(getLinkedSyncOffsetFrames(items, 'audio-1', 30)).toBe(10)
  })

  it('reports sync offsets when linked clips are slipped apart', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 0,
        sourceStart: 12,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
    ]

    expect(getLinkedSyncOffsetFrames(items, 'video-1', 30)).toBe(-12)
    expect(getLinkedSyncOffsetFrames(items, 'audio-1', 30)).toBe(12)
  })

  it('ignores unrelated clips in a larger linked group when computing sync badges', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'video-2',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 120,
        sourceStart: 0,
        sourceFps: 30,
        mediaId: 'media-2',
        originId: 'origin-2',
      }),
    ]

    expect(getLinkedSyncOffsetFrames(items, 'video-1', 30)).toBe(null)
    expect(getLinkedSyncOffsetFrames(items, 'audio-1', 30)).toBe(null)
  })

  it('still reports the actual audio-video drift inside a larger linked group', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 10,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'video-2',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 120,
        sourceStart: 0,
        sourceFps: 30,
        mediaId: 'media-2',
        originId: 'origin-2',
      }),
    ]

    expect(getLinkedSyncOffsetFrames(items, 'video-1', 30)).toBe(-10)
    expect(getLinkedSyncOffsetFrames(items, 'audio-1', 30)).toBe(10)
  })

  it('chooses the closest opposite-type companion inside a larger linked group', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'video-2',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 60,
        sourceStart: 10,
        sourceFps: 30,
        mediaId: 'media-2',
        originId: 'origin-2',
      }),
      makeItem({
        id: 'audio-2',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 60,
        sourceStart: 10,
        sourceFps: 30,
        mediaId: 'media-2',
        originId: 'origin-2',
      }),
    ]

    expect(getLinkedSyncOffsetFrames(items, 'video-2', 30)).toBeNull()
    expect(getLinkedSyncOffsetFrames(items, 'audio-2', 30)).toBeNull()
  })

  it('suppresses rounding-only sync drift after linked splits at slightly different source fps', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 127,
        sourceStart: 101,
        sourceFps: 23.976,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 127,
        sourceStart: 102,
        sourceFps: 23.981,
      }),
    ]

    expect(getLinkedSyncOffsetFrames(items, 'video-1', 30)).toBeNull()
    expect(getLinkedSyncOffsetFrames(items, 'audio-1', 30)).toBeNull()
  })

  it('ignores trim preview drift while linked companions preview together', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
    ]

    const previewUpdatesById = {
      'video-1': { id: 'video-1', from: 10, sourceStart: 10 },
      'audio-1': { id: 'audio-1', from: 10, sourceStart: 10 },
    }

    expect(getLinkedSyncOffsetFrames(items, 'video-1', 30, previewUpdatesById)).toBe(null)
    expect(getLinkedSyncOffsetFrames(items, 'audio-1', 30, previewUpdatesById)).toBe(null)
  })

  it('ignores active trim preview drift when linked companions receive matching preview updates', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 0,
        sourceStart: 10,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
    ]

    const previewUpdatesById = {
      'audio-1': { id: 'audio-1', sourceStart: 10 },
    }

    expect(getLinkedSyncOffsetFrames(items, 'video-1', 30, previewUpdatesById)).toBe(null)
  })

  it('ignores active trim preview drift when the anchor item preview already includes the moved in-point', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 10,
        sourceStart: 10,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
    ]

    const previewUpdatesById = {
      'audio-1': { id: 'audio-1', from: 10, sourceStart: 10 },
    }

    expect(getLinkedSyncOffsetFrames(items, 'video-1', 30, previewUpdatesById)).toBe(null)
  })

  it('shows trim preview drift when only one linked clip previews independently', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 0,
        sourceStart: 10,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
    ]

    expect(getLinkedSyncOffsetFrames(items, 'video-1', 30)).toBe(-10)
  })

  it('never warns on captions or text that share a clip group', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'caption-1',
        linkedGroupId: 'group-1',
        type: 'text',
        textRole: 'caption',
        from: 120,
        mediaId: undefined,
      }),
    ]

    expect(getLinkedSyncOffsetFrames(items, 'caption-1', 30)).toBeNull()
    expect(getLinkedSyncRestoreUpdates(items, 'caption-1', 30)).toEqual([])
  })

  it('puts a drifted pair back in sync by moving the sound onto the picture', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 349,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 334,
        sourceStart: 0,
        sourceFps: 30,
      }),
    ]

    // The badge on the audio reads -00:15; the repair moves the audio onto the video.
    expect(getLinkedSyncOffsetFrames(items, 'audio-1', 30)).toBe(-15)
    expect(getLinkedSyncRestoreUpdates(items, 'audio-1', 30)).toEqual([
      { id: 'audio-1', from: 349 },
    ])
    // From the picture the same repair is offered, and it always moves the sound, never the picture.
    expect(getLinkedSyncRestoreUpdates(items, 'video-1', 30)).toEqual([
      { id: 'audio-1', from: 349 },
    ])
  })

  it('moves a late sound back onto its picture as well', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 100,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 130,
        sourceStart: 0,
        sourceFps: 30,
      }),
    ]

    expect(getLinkedSyncRestoreUpdates(items, 'video-1', 30)).toEqual([
      { id: 'audio-1', from: 100 },
    ])
  })

  it('offers no repair when the pair is already in sync', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'group-1', type: 'video', from: 40 }),
      makeItem({ id: 'audio-1', linkedGroupId: 'group-1', type: 'audio', from: 40 }),
    ]

    expect(getLinkedSyncRestoreUpdates(items, 'video-1', 30)).toEqual([])
  })

  it('repairs only the companion the badge is about in a group with extra copies', () => {
    const items = [
      makeItem({
        id: 'video-1',
        linkedGroupId: 'group-1',
        type: 'video',
        from: 0,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-1',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 10,
        sourceStart: 0,
        sourceFps: 30,
      }),
      makeItem({
        id: 'audio-2',
        linkedGroupId: 'group-1',
        type: 'audio',
        from: 500,
        sourceStart: 0,
        sourceFps: 30,
      }),
    ]

    expect(getLinkedSyncRestoreUpdates(items, 'video-1', 30)).toEqual([{ id: 'audio-1', from: 0 }])
  })

  it('builds move preview updates only for linked clips that actually move', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'group-1', type: 'video', from: 0 }),
      makeItem({ id: 'audio-1', linkedGroupId: 'group-1', type: 'audio', from: 0 }),
      makeItem({ id: 'text-1', type: 'text', from: 20 }),
    ]

    expect(
      buildLinkedMovePreviewUpdates(items, [
        { id: 'audio-1', from: 12 },
        { id: 'text-1', from: 32 },
        { id: 'video-1', from: 0 },
      ]),
    ).toEqual([{ id: 'audio-1', from: 12 }])
  })

  it('builds matching move preview updates when linked companions move together', () => {
    const items = [
      makeItem({ id: 'video-1', linkedGroupId: 'group-1', type: 'video', from: 30 }),
      makeItem({ id: 'audio-1', linkedGroupId: 'group-1', type: 'audio', from: 30 }),
    ]

    expect(
      buildLinkedMovePreviewUpdates(items, [
        { id: 'video-1', from: 42 },
        { id: 'audio-1', from: 42 },
      ]),
    ).toEqual([
      { id: 'video-1', from: 42 },
      { id: 'audio-1', from: 42 },
    ])
  })
})
