import { describe, expect, it } from 'vite-plus/test'
import type { TimelineItem } from '@/types/timeline'
import {
  getPairedCaptionOwner,
  hasSynchronizedVideoCompanion,
  hasTranscriptCaptionSegmentInPair,
  isDuplicateTranscriptCaptionClip,
} from './caption-ownership'

function captionCues(text = 'Line') {
  return {
    type: 'transcript' as const,
    mediaId: 'media-1',
    enabled: true,
    updatedAt: 1,
    cues: [{ id: 'cue-0', startSeconds: 0, endSeconds: 1, text }],
  }
}

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
    transcriptCaptions: captionCues(),
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
    transcriptCaptions: captionCues(),
    ...overrides,
  } as TimelineItem
}

describe('transcript caption ownership', () => {
  it('lets the video half draw the pair captions and hides the audio copy', () => {
    const items = [videoItem(), audioItem()]

    expect(getPairedCaptionOwner(items, items[1]!)?.id).toBe('video-1')
    expect(isDuplicateTranscriptCaptionClip(items, items[1]!)).toBe(true)
    expect(isDuplicateTranscriptCaptionClip(items, items[0]!)).toBe(false)
    expect(hasSynchronizedVideoCompanion(items, items[1]!)).toBe(true)
  })

  it('keeps the audio captions when the video half has none', () => {
    const video = videoItem({ transcriptCaptions: undefined })
    const audio = audioItem()
    const items = [video, audio]

    expect(isDuplicateTranscriptCaptionClip(items, audio)).toBe(false)
    expect(hasSynchronizedVideoCompanion(items, audio)).toBe(true)
  })

  it('keeps captions of an audio clip that has no video half', () => {
    const audio = audioItem()
    const items = [audio, { ...videoItem(), id: 'video-2', mediaId: 'media-2' }]

    expect(isDuplicateTranscriptCaptionClip(items, audio)).toBe(false)
    expect(hasSynchronizedVideoCompanion(items, audio)).toBe(false)
  })

  it('never treats a video clip as a duplicate', () => {
    const items = [videoItem(), audioItem()]

    expect(getPairedCaptionOwner(items, items[0]!)).toBeNull()
    expect(getPairedCaptionOwner(items, items[1]!)).not.toBeNull()
  })

  it('hides the clip copy when the paired video transcript moved to a subtitle track', () => {
    const video = videoItem({ transcriptCaptions: undefined })
    const audio = audioItem()
    const items = [
      video,
      audio,
      {
        id: 'subtitle-1',
        type: 'subtitle',
        trackId: 'track-captions',
        from: 90,
        durationInFrames: 122,
        label: 'Transcript',
        source: { type: 'transcript', mediaId: 'media-1', clipId: 'video-1' },
        cues: [],
      } as unknown as TimelineItem,
    ]

    expect(hasTranscriptCaptionSegmentInPair(items, audio)).toBe(true)
    expect(hasTranscriptCaptionSegmentInPair(items, video)).toBe(true)
  })
})
