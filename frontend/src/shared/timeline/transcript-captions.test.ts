import { describe, expect, it } from 'vite-plus/test'
import type { TimelineItem } from '@/types/timeline'
import {
  editedTranscriptCaptions,
  newTranscriptCaptionCue,
  withTranscriptCaptionCue,
  withoutTranscriptCaptionCue,
} from './transcript-captions'
import { getSynchronizedMediaCompanion } from '../utils/linked-media'

function videoItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'video-1',
    type: 'video',
    trackId: 'track-v1',
    from: 90,
    durationInFrames: 122,
    label: 'shot.mp4',
    mediaId: 'media-1',
    src: 'blob:video',
    sourceStart: 0,
    sourceFps: 24,
    originId: 'origin-1',
    transcriptCaptions: {
      type: 'transcript',
      mediaId: 'media-1',
      enabled: true,
      updatedAt: 1,
      cues: [
        {
          id: 'cue-0',
          startSeconds: 0.16,
          endSeconds: 1.02,
          text: 'Old line',
          words: [{ text: 'Old line', startSeconds: 0.16, endSeconds: 1.02 }],
        },
      ],
    },
    ...overrides,
  } as TimelineItem
}

function audioItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'audio-1',
    type: 'audio',
    trackId: 'track-a1',
    from: 90,
    durationInFrames: 122,
    label: 'shot.mp4',
    mediaId: 'media-1',
    src: 'blob:audio',
    sourceStart: 0,
    sourceFps: 24,
    originId: 'origin-1',
    transcriptCaptions: {
      type: 'transcript',
      mediaId: 'media-1',
      enabled: true,
      updatedAt: 1,
      cues: [{ id: 'cue-0', startSeconds: 0.16, endSeconds: 1.02, text: 'Old line' }],
    },
    ...overrides,
  } as TimelineItem
}

describe('transcript caption edits', () => {
  it('drops the recognition words of an edited cue so karaoke stops using the old text', () => {
    const captions = videoItem().transcriptCaptions!
    const next = editedTranscriptCaptions(captions, 'cue-0', { text: 'New line' }, 42)

    expect(next?.cues[0]).toMatchObject({ text: 'New line', startSeconds: 0.16 })
    expect(next?.cues[0]?.words).toBeUndefined()
    expect(next?.updatedAt).toBe(42)
    expect(captions.cues[0]?.text).toBe('Old line')
  })

  it('ignores a cue that belongs to another caption set', () => {
    expect(
      editedTranscriptCaptions(videoItem().transcriptCaptions!, 'other', { text: 'x' }, 1),
    ).toBeNull()
  })

  it('inserts a new cue in time order and replaces a cue with the same id', () => {
    const captions = videoItem().transcriptCaptions!
    const added = withTranscriptCaptionCue(
      captions,
      { id: 'cue-1', startSeconds: 0.05, endSeconds: 0.1, text: 'Earlier' },
      7,
    )
    expect(added.cues.map((cue) => cue.id)).toEqual(['cue-1', 'cue-0'])

    const replaced = withTranscriptCaptionCue(
      added,
      { id: 'cue-1', startSeconds: 0.05, endSeconds: 0.1, text: 'Renamed' },
      8,
    )
    expect(replaced.cues).toHaveLength(2)
    expect(replaced.cues[0]?.text).toBe('Renamed')
  })

  it('removes a single cue and keeps the rest in time order', () => {
    const captions = videoItem().transcriptCaptions!
    const next = withoutTranscriptCaptionCue(captions, 'cue-0', 9)

    expect(next.cues).toEqual([])
    expect(next.updatedAt).toBe(9)
    expect(captions.cues).toHaveLength(1)
  })

  it('puts a subtitle added at the playhead into the clip source seconds', () => {
    const clip = videoItem() as TimelineItem & { from: number; durationInFrames: number }
    const cue = newTranscriptCaptionCue(clip, 30, clip.from + 30, 'Hello', 'cue-new')

    expect(cue.id).toBe('cue-new')
    expect(cue.startSeconds).toBeCloseTo(1, 5)
    expect(cue.endSeconds).toBeCloseTo(3, 5)
    expect(cue.text).toBe('Hello')
  })

  it('clamps a subtitle added near the clip end to the clip', () => {
    const clip = videoItem()
    const cue = newTranscriptCaptionCue(clip, 30, clip.from + clip.durationInFrames - 1, 'Hello')

    expect(cue.startSeconds).toBeLessThanOrEqual(cue.endSeconds)
    expect(cue.endSeconds).toBeCloseTo(122 / 30, 5)
  })
})

describe('getSynchronizedMediaCompanion', () => {
  it('finds the audio half of a video/audio pair', () => {
    const items = [videoItem(), audioItem()]
    expect(getSynchronizedMediaCompanion(items, items[0]!)?.id).toBe('audio-1')
    expect(getSynchronizedMediaCompanion(items, items[1]!)?.id).toBe('video-1')
  })

  it('ignores a clip of another media, another range, or the same media type', () => {
    const anchor = videoItem()
    expect(
      getSynchronizedMediaCompanion(
        [anchor, audioItem({ mediaId: 'media-2', transcriptCaptions: undefined })],
        anchor,
      ),
    ).toBeNull()
    expect(
      getSynchronizedMediaCompanion(
        [anchor, audioItem({ from: 200, transcriptCaptions: undefined })],
        anchor,
      ),
    ).toBeNull()
    expect(
      getSynchronizedMediaCompanion(
        [anchor, videoItem({ id: 'video-2', transcriptCaptions: undefined })],
        anchor,
      ),
    ).toBeNull()
  })
})
