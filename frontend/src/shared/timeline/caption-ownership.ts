import type { TimelineItem, VideoItem } from '@/types/timeline'
import { getSynchronizedMediaCompanion } from '@/shared/utils/linked-media'

function drawsTranscriptCaptions(item: TimelineItem): boolean {
  return item.transcriptCaptions?.type === 'transcript' && item.transcriptCaptions.cues.length > 0
}

/**
 * The video half of a synchronized media pair that already draws the same transcript
 * captions. Both halves can carry a caption copy, but only one of them may draw it —
 * otherwise the preview and the timeline stack two texts on top of each other.
 */
export function getPairedCaptionOwner(
  items: readonly TimelineItem[],
  item: TimelineItem,
): VideoItem | null {
  if (item.type !== 'audio') return null
  const companion = getSynchronizedMediaCompanion(items, item)
  if (!companion || companion.type !== 'video') return null
  return drawsTranscriptCaptions(companion) ? companion : null
}

/** True when another clip already draws this clip's transcript captions. */
export function isDuplicateTranscriptCaptionClip(
  items: readonly TimelineItem[],
  item: TimelineItem,
): boolean {
  return getPairedCaptionOwner(items, item) !== null
}

/** True when the clip's transcript already lives on its own subtitle track. */
export function hasTranscriptCaptionSegment(
  items: readonly TimelineItem[],
  clipId: string,
): boolean {
  return items.some(
    (item) =>
      item.type === 'subtitle' &&
      item.source.type === 'transcript' &&
      item.source.clipId === clipId,
  )
}

/**
 * True when this clip's transcript lives on a subtitle track — its own, or the one created for
 * the video/audio half of its pair. The clip copy then must not be drawn a second time.
 */
export function hasTranscriptCaptionSegmentInPair(
  items: readonly TimelineItem[],
  item: TimelineItem,
): boolean {
  if (hasTranscriptCaptionSegment(items, item.id)) return true
  const companion = getSynchronizedMediaCompanion(items, item)
  return companion ? hasTranscriptCaptionSegment(items, companion.id) : false
}

/** True when the audio clip belongs to a video/audio pair, so the video owns its captions. */
export function hasSynchronizedVideoCompanion(
  items: readonly TimelineItem[],
  item: TimelineItem,
): boolean {
  return item.type === 'audio' && getSynchronizedMediaCompanion(items, item)?.type === 'video'
}
