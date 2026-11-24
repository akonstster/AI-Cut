import type { TimelineItem, TimelineTranscriptCaptionCue } from '@/types/timeline'
import { editCaptionCue } from './edit-caption-cue'

type TranscriptCaptions = NonNullable<TimelineItem['transcriptCaptions']>

export type CaptionCuePatch = Partial<
  Pick<TimelineTranscriptCaptionCue, 'text' | 'startSeconds' | 'endSeconds'>
>

/** How long a subtitle added from the editor lasts until its end is dragged. */
export const NEW_CAPTION_CUE_SECONDS = 2

/** The captions with one cue edited; `null` when the cue belongs to another caption set. */
export function editedTranscriptCaptions(
  captions: TranscriptCaptions,
  cueId: string,
  patch: CaptionCuePatch,
  updatedAt: number,
): TranscriptCaptions | null {
  if (!captions.cues.some((cue) => cue.id === cueId)) return null
  return {
    ...captions,
    enabled: true,
    cues: captions.cues
      .map((cue) => (cue.id === cueId ? editCaptionCue(cue, patch) : cue))
      .sort((left, right) => left.startSeconds - right.startSeconds),
    updatedAt,
  }
}

/** The captions with a cue added (or replaced when its id is already there), kept in time order. */
export function withTranscriptCaptionCue(
  captions: TranscriptCaptions,
  cue: TimelineTranscriptCaptionCue,
  updatedAt: number,
): TranscriptCaptions {
  return {
    ...captions,
    enabled: true,
    cues: [...captions.cues.filter((existing) => existing.id !== cue.id), cue].sort(
      (left, right) => left.startSeconds - right.startSeconds,
    ),
    updatedAt,
  }
}

/** The captions with one cue removed, kept in time order. */
export function withoutTranscriptCaptionCue(
  captions: TranscriptCaptions,
  cueId: string,
  updatedAt: number,
): TranscriptCaptions {
  return {
    ...captions,
    cues: captions.cues.filter((cue) => cue.id !== cueId),
    updatedAt,
  }
}

/**
 * A subtitle that starts under the playhead and lasts two seconds, clamped to the clip.
 * Caption cues are in the media's own seconds, so the clip's source offset and speed apply.
 */
export function newTranscriptCaptionCue(
  item: {
    id: string
    from: number
    durationInFrames: number
    sourceStart?: number
    sourceFps?: number
    speed?: number
  },
  fps: number,
  playheadFrame: number,
  text: string,
  cueId: string = crypto.randomUUID(),
): TimelineTranscriptCaptionCue {
  const sourceFps = item.sourceFps && item.sourceFps > 0 ? item.sourceFps : fps
  const speed = item.speed ?? 1
  const sourceStart = (item.sourceStart ?? 0) / sourceFps
  const clipEndSeconds = sourceStart + (item.durationInFrames / Math.max(fps, 1)) * speed
  const framesIntoClip = Math.max(0, Math.min(item.durationInFrames - 1, playheadFrame - item.from))
  const startSeconds = Math.min(
    sourceStart + (framesIntoClip / Math.max(fps, 1)) * speed,
    Math.max(sourceStart, clipEndSeconds - NEW_CAPTION_CUE_SECONDS),
  )
  return {
    id: cueId,
    startSeconds,
    endSeconds: Math.max(
      startSeconds + 0.04,
      Math.min(startSeconds + NEW_CAPTION_CUE_SECONDS, clipEndSeconds),
    ),
    text,
  }
}
