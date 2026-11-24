import { useVirtualizer } from '@tanstack/react-virtual'
import { memo, useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Captions, Trash2 } from 'lucide-react'
import { i18n } from '@/i18n'
import { editCaptionCue } from '@/shared/timeline/edit-caption-cue'
import {
  editedTranscriptCaptions,
  newTranscriptCaptionCue,
  withTranscriptCaptionCue,
  withoutTranscriptCaptionCue,
} from '@/shared/timeline/transcript-captions'
import { hasTranscriptCaptionSegment } from '@/shared/timeline/caption-ownership'
import { importMediaTranscriptionService } from '@/features/editor/deps/media-library'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
import {
  executeTimelineCommand,
  updateItem,
  useItemsStore,
  useTimelineSettingsStore,
} from '@/features/editor/deps/timeline-store'
import { usePlaybackStore } from '@/shared/state/playback'
import {
  buildCueText,
  getCueFormatFlags,
  parseSubtitleCueText,
  toggleCueFormat,
  type CueFormatFlags,
} from '@/shared/utils/subtitle-cue-format'
import { cn } from '@/shared/ui/cn'
import { useSyncedText } from '@/shared/ui/use-synced-text'
import type {
  AudioItem,
  SubtitleSegmentItem,
  TextItem,
  TimelineItem,
  VideoItem,
} from '@/types/timeline'

import { CaptionStyleControls } from './caption-style-controls'
import { PropertySection } from '../components'

interface SubtitleSectionProps {
  items: TimelineItem[]
}

/**
 * Properties panel for selected subtitle segments.
 *
 * Renders three stacked blocks:
 *  1. Style presets + quick controls (font/color/position/background)
 *  2. Source label + cue count
 *  3. Cue list editor
 *
 * Multi-select hides the cue list (cue identities differ across segments)
 * but keeps style controls active so a "make all my subtitle tracks
 * Netflix-style" workflow takes one click.
 */
interface CanvasContext {
  width: number
  height: number
}

interface SubtitleSectionPropsWithCanvas extends SubtitleSectionProps {
  canvas?: CanvasContext
}

type TranscriptCaptionClip = (AudioItem | VideoItem) & {
  transcriptCaptions: NonNullable<(AudioItem | VideoItem)['transcriptCaptions']>
}

/** A video/audio clip that can carry transcript captions, with or without them yet. */
type CaptionableClip = AudioItem | VideoItem

function isCaptionableClip(item: TimelineItem): item is CaptionableClip {
  return (
    (item.type === 'video' || item.type === 'audio') &&
    item.isReversed !== true &&
    typeof item.mediaId === 'string' &&
    item.mediaId.length > 0
  )
}

function isTranscriptCaptionClip(item: TimelineItem): item is TranscriptCaptionClip {
  return isCaptionableClip(item) && item.transcriptCaptions?.type === 'transcript'
}

/** Seconds → `mm:ss` (or `h:mm:ss`) for the clip scope label. */
function formatClipTime(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const seconds = whole % 60
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  const hh = hours > 0 ? `${hours}:` : ''
  return `${hh}${mm}:${String(seconds).padStart(2, '0')}`
}

/**
 * Writes a subtitle edit to the clip it belongs to. Reading the store instead of the render
 * props keeps fast typing from folding a stale cue list back into the clip.
 */
function writeClipTranscriptCaptions(
  clipId: string,
  update: (
    captions: TranscriptCaptionClip['transcriptCaptions'],
    updatedAt: number,
  ) => TranscriptCaptionClip['transcriptCaptions'] | null,
): boolean {
  const clip = useItemsStore.getState().itemById[clipId]
  if (!clip || !isTranscriptCaptionClip(clip)) return false
  const next = update(clip.transcriptCaptions, Date.now())
  if (!next) return false
  executeTimelineCommand(
    'UPDATE_TRANSCRIPT_CAPTIONS',
    () => {
      useItemsStore
        .getState()
        ._updateItem(clipId, { transcriptCaptions: next } as Partial<TimelineItem>)
      useTimelineSettingsStore.getState().markDirty()
    },
    { ids: [clipId] },
  )
  return true
}

export const SubtitleSection = memo(function SubtitleSection({
  items,
  canvas,
}: SubtitleSectionPropsWithCanvas) {
  const segments = useMemo(
    () => items.filter((item): item is SubtitleSegmentItem => item.type === 'subtitle'),
    [items],
  )
  const virtualTranscriptClips = useMemo(
    () =>
      items.filter(
        (
          item,
        ): item is (AudioItem | VideoItem) & {
          transcriptCaptions: NonNullable<(AudioItem | VideoItem)['transcriptCaptions']>
        } =>
          (item.type === 'video' || item.type === 'audio') &&
          item.isReversed !== true &&
          item.transcriptCaptions?.type === 'transcript',
      ),
    [items],
  )
  const restorableClips = useMemo(
    () =>
      items.filter(
        (item): item is CaptionableClip =>
          isCaptionableClip(item) &&
          !!item.autoCaptionedAt &&
          !item.transcriptCaptions &&
          !hasTranscriptCaptionSegment(items, item.id),
      ),
    [items],
  )

  if (
    segments.length === 0 &&
    virtualTranscriptClips.length === 0 &&
    restorableClips.length === 0
  ) {
    return null
  }

  const canvasWidth = canvas?.width ?? DEFAULT_PROJECT_WIDTH
  const canvasHeight = canvas?.height ?? DEFAULT_PROJECT_HEIGHT

  if (segments.length === 0 && virtualTranscriptClips.length === 0) {
    return <RestoreTranscriptCaptionsEditor clip={restorableClips[0]!} />
  }

  if (segments.length === 0 && virtualTranscriptClips.length > 0) {
    return (
      <VirtualTranscriptSubtitleEditor
        clips={virtualTranscriptClips}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
      />
    )
  }

  if (segments.length > 1) {
    const totalCues = segments.reduce((sum, segment) => sum + segment.cues.length, 0)
    return (
      <PropertySection
        title={i18n.t('editor.subtitleSection.title')}
        icon={Captions}
        defaultOpen={true}
      >
        <div className="space-y-3 px-1">
          <CaptionStyleControls
            items={segments}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
          />

          <p className="text-xs text-muted-foreground">
            {i18n.t('editor.subtitleSection.multiSelectHint', {
              segments: segments.length,
              cues: totalCues,
            })}
          </p>
        </div>
      </PropertySection>
    )
  }

  return (
    <SingleSubtitleSegmentEditor
      segment={segments[0]!}
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
    />
  )
})

type VirtualTranscriptCaptionClip = (AudioItem | VideoItem) & {
  transcriptCaptions: NonNullable<(AudioItem | VideoItem)['transcriptCaptions']>
}

interface VirtualTranscriptSubtitleEditorProps {
  clips: VirtualTranscriptCaptionClip[]
  canvasWidth: number
  canvasHeight: number
}

const VirtualTranscriptSubtitleEditor = memo(function VirtualTranscriptSubtitleEditor({
  clips,
  canvasWidth,
  canvasHeight,
}: VirtualTranscriptSubtitleEditorProps) {
  const fps = useTimelineSettingsStore((s) => s.fps)
  const setCurrentFrame = usePlaybackStore((s) => s.setCurrentFrame)
  const firstClip = clips[0]!
  const totalCues = clips.reduce((sum, clip) => sum + clip.transcriptCaptions.cues.length, 0)
  const captionsVisible = clips.every((clip) => clip.transcriptCaptions.enabled)

  const styleSample = useMemo<SubtitleSegmentItem>(() => {
    const style = firstClip.transcriptCaptions.style ?? {}
    return {
      id: `${firstClip.id}:transcript-captions-style`,
      type: 'subtitle',
      trackId: firstClip.trackId,
      from: firstClip.from,
      durationInFrames: firstClip.durationInFrames,
      label: i18n.t('editor.subtitleSection.transcript'),
      mediaId: firstClip.mediaId,
      source: {
        type: 'transcript',
        mediaId: firstClip.transcriptCaptions.mediaId,
        clipId: firstClip.id,
      },
      cues: [],
      color: style.color ?? '#ffffff',
      ...style,
    }
  }, [firstClip])

  const styleItems = useMemo(() => [styleSample], [styleSample])

  const applyStylePatch = useCallback(
    (patch: Partial<SubtitleSegmentItem | TextItem>) => {
      for (const clip of clips) {
        writeClipTranscriptCaptions(clip.id, (captions, updatedAt) => ({
          ...captions,
          style: {
            ...(captions.style ?? {}),
            ...patch,
          },
          updatedAt,
        }))
      }
    },
    [clips],
  )

  const setCaptionsVisible = useCallback(
    (enabled: boolean) => {
      for (const clip of clips) {
        writeClipTranscriptCaptions(clip.id, (captions, updatedAt) => ({
          ...captions,
          enabled,
          updatedAt,
        }))
      }
    },
    [clips],
  )

  const updateCue = useCallback(
    (cueId: string, patch: Partial<{ text: string; startSeconds: number; endSeconds: number }>) => {
      writeClipTranscriptCaptions(firstClip.id, (captions, updatedAt) =>
        editedTranscriptCaptions(captions, cueId, patch, updatedAt),
      )
    },
    [firstClip.id],
  )

  const addCue = useCallback(() => {
    const cue = newTranscriptCaptionCue(
      firstClip,
      fps,
      usePlaybackStore.getState().currentFrame,
      i18n.t('editor.subtitleSection.newCue', { defaultValue: 'New subtitle' }),
    )
    writeClipTranscriptCaptions(firstClip.id, (captions, updatedAt) =>
      withTranscriptCaptionCue(captions, cue, updatedAt),
    )
  }, [firstClip, fps])

  const deleteCue = useCallback(
    (cueId: string) => {
      writeClipTranscriptCaptions(firstClip.id, (captions, updatedAt) =>
        withoutTranscriptCaptionCue(captions, cueId, updatedAt),
      )
    },
    [firstClip.id],
  )

  // A clip-owned caption copy can be moved onto its own subtitle track without re-transcribing:
  // the cues, their word timings and the style travel as they are.
  const canMoveCaptionsToTrack = useItemsStore(
    useCallback(
      (state) =>
        (firstClip.transcriptCaptions?.cues.length ?? 0) > 0 &&
        !hasTranscriptCaptionSegment(state.items, firstClip.id),
      [firstClip.id, firstClip.transcriptCaptions],
    ),
  )

  const moveCaptionsToSubtitleTrack = useCallback(() => {
    const mediaId = firstClip.mediaId
    if (!mediaId) return
    void importMediaTranscriptionService()
      .then(({ mediaTranscriptionService }) =>
        mediaTranscriptionService.insertTranscriptAsCaptions(mediaId, {
          clipIds: [firstClip.id],
          moveExistingCaptions: true,
          selectUpdatedClips: false,
        }),
      )
      .catch(() => {
        // Silent: the explicit Generate Captions action stays the fallback.
      })
  }, [firstClip.id, firstClip.mediaId])

  const trackName = useItemsStore(
    useCallback(
      (s) => s.tracks.find((track) => track.id === firstClip.trackId)?.name ?? null,
      [firstClip.trackId],
    ),
  )
  const clipScopeLabel = useMemo(() => {
    if (fps <= 0) return trackName ?? ''
    const start = formatClipTime(firstClip.from / fps)
    const end = formatClipTime((firstClip.from + firstClip.durationInFrames) / fps)
    return [trackName, `${start}–${end}`].filter(Boolean).join(' · ')
  }, [firstClip.durationInFrames, firstClip.from, fps, trackName])

  const seekToCue = useCallback(
    (startSeconds: number) => {
      const sourceFps = firstClip.sourceFps ?? fps
      const sourceStartSeconds = (firstClip.sourceStart ?? 0) / sourceFps
      const speed = firstClip.speed ?? 1
      const timelineSeconds = Math.max(0, (startSeconds - sourceStartSeconds) / speed)
      setCurrentFrame(Math.max(0, firstClip.from + Math.round(timelineSeconds * fps)))
    },
    [firstClip, fps, setCurrentFrame],
  )

  if (clips.length > 1) {
    return (
      <PropertySection
        title={i18n.t('editor.subtitleSection.title')}
        icon={Captions}
        defaultOpen={true}
      >
        <div className="space-y-3 px-1">
          <div className="flex items-center justify-between gap-3 rounded border border-border bg-muted/20 px-2 py-1.5">
            <Label htmlFor="virtual-transcript-captions-visible" className="text-xs font-medium">
              {i18n.t('editor.subtitleSection.showSubtitle')}
            </Label>
            <input
              id="virtual-transcript-captions-visible"
              type="checkbox"
              checked={captionsVisible}
              onChange={(event) => setCaptionsVisible(event.currentTarget.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
          </div>

          <CaptionStyleControls
            items={styleItems}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            onApplyPatch={applyStylePatch}
          />

          <p className="text-xs text-muted-foreground">
            {i18n.t('editor.subtitleSection.multiSelectHint', {
              segments: clips.length,
              cues: totalCues,
            })}
          </p>
        </div>
      </PropertySection>
    )
  }

  return (
    <PropertySection
      title={i18n.t('editor.subtitleSection.title')}
      icon={Captions}
      defaultOpen={true}
    >
      <div className="space-y-3 px-1">
        <p className="text-xs text-muted-foreground">
          {i18n.t('editor.subtitleSection.cueCount', {
            count: firstClip.transcriptCaptions.cues.length,
          })}{' '}
          - {i18n.t('editor.subtitleSection.transcript')}
        </p>
        {clipScopeLabel && (
          <p className="text-[11px] text-muted-foreground/80" data-subtitle-scope>
            {clipScopeLabel}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 rounded border border-border bg-muted/20 px-2 py-1.5">
          <Label htmlFor="virtual-transcript-captions-visible" className="text-xs font-medium">
            {i18n.t('editor.subtitleSection.showSubtitle')}
          </Label>
          <input
            id="virtual-transcript-captions-visible"
            type="checkbox"
            checked={captionsVisible}
            onChange={(event) => setCaptionsVisible(event.currentTarget.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
        </div>

        <CaptionStyleControls
          items={styleItems}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          onApplyPatch={applyStylePatch}
        />

        <VirtualCueList
          cues={firstClip.transcriptCaptions.cues}
          onChange={updateCue}
          onSeek={seekToCue}
          onDelete={deleteCue}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={addCue}>
            {i18n.t('editor.subtitleSection.addCue', { defaultValue: 'Add subtitle' })}
          </Button>
          {canMoveCaptionsToTrack && (
            <Button
              variant="outline"
              size="sm"
              onClick={moveCaptionsToSubtitleTrack}
              title={i18n.t('editor.subtitleSection.moveToTrackHint', {
                defaultValue: 'Move these subtitles to their own subtitle track',
              })}
            >
              {i18n.t('editor.subtitleSection.moveToTrack', {
                defaultValue: 'Move to subtitle track',
              })}
            </Button>
          )}
        </div>
      </div>
    </PropertySection>
  )
})

/**
 * The caption track for a clip was removed, but its transcript is still on disk. Offer to build
 * the subtitles again from that transcript without running speech recognition a second time.
 */
const RestoreTranscriptCaptionsEditor = memo(function RestoreTranscriptCaptionsEditor({
  clip,
}: {
  clip: CaptionableClip
}) {
  const restore = useCallback(() => {
    const mediaId = clip.mediaId
    if (!mediaId) return
    void importMediaTranscriptionService()
      .then(({ mediaTranscriptionService }) =>
        mediaTranscriptionService.insertTranscriptAsCaptions(mediaId, {
          clipIds: [clip.id],
          replaceExisting: true,
          selectUpdatedClips: false,
        }),
      )
      .catch(() => {
        // Silent: the explicit Generate Captions action stays the fallback.
      })
  }, [clip.id, clip.mediaId])

  return (
    <PropertySection
      title={i18n.t('editor.subtitleSection.title')}
      icon={Captions}
      defaultOpen={true}
    >
      <div className="space-y-2 px-1">
        <p className="text-xs text-muted-foreground">
          {i18n.t('editor.subtitleSection.restoreHint', {
            defaultValue:
              'Subtitles for this clip were removed. Build them again from the saved transcript.',
          })}
        </p>
        <Button variant="outline" size="sm" onClick={restore}>
          {i18n.t('editor.subtitleSection.restore', {
            defaultValue: 'Create subtitles from transcript',
          })}
        </Button>
      </div>
    </PropertySection>
  )
})

interface SingleSubtitleSegmentEditorProps {
  segment: SubtitleSegmentItem
  canvasWidth: number
  canvasHeight: number
}

const SingleSubtitleSegmentEditor = memo(function SingleSubtitleSegmentEditor({
  segment,
  canvasWidth,
  canvasHeight,
}: SingleSubtitleSegmentEditorProps) {
  const fps = useTimelineSettingsStore((s) => s.fps)
  const setCurrentFrame = usePlaybackStore((s) => s.setCurrentFrame)

  // Keep a ref to the latest cues so `updateCue`'s identity stays stable
  // across edits. Without this the callback re-creates on every keystroke
  // (segment.cues becomes a new array each edit), which busts every memoed
  // SubtitleCueRow and re-renders the entire 600-row list when the user
  // edits a single cue.
  const cuesRef = useRef(segment.cues)
  useEffect(() => {
    cuesRef.current = segment.cues
  }, [segment.cues])

  const updateCue = useCallback(
    (cueId: string, patch: Partial<{ text: string; startSeconds: number; endSeconds: number }>) => {
      const next = cuesRef.current
        .map((cue) => (cue.id === cueId ? editCaptionCue(cue, patch) : cue))
        .sort((a, b) => a.startSeconds - b.startSeconds)
      cuesRef.current = next
      updateItem(segment.id, { cues: next })
    },
    [segment.id],
  )

  const deleteCue = useCallback(
    (cueId: string) => {
      const cues = cuesRef.current.filter((cue) => cue.id !== cueId)
      cuesRef.current = cues
      updateItem(segment.id, { cues })
    },
    [segment.id],
  )

  const seekToCue = useCallback(
    (startSeconds: number) => {
      const targetFrame = segment.from + Math.round(startSeconds * fps)
      setCurrentFrame(Math.max(0, targetFrame))
    },
    [fps, segment.from, setCurrentFrame],
  )

  const sourceLabel =
    segment.source.type === 'embedded-subtitles'
      ? (segment.source.trackName ??
        segment.source.language ??
        i18n.t('editor.subtitleSection.trackLabel', { number: segment.source.trackNumber }))
      : segment.source.type === 'subtitle-import'
        ? segment.source.fileName
        : i18n.t('editor.subtitleSection.transcript')

  // Memoize the items array passed to CaptionStyleControls so identity is
  // stable across re-renders that don't actually change the segment object.
  const styleItems = useMemo(() => [segment], [segment])

  return (
    <PropertySection
      title={i18n.t('editor.subtitleSection.title')}
      icon={Captions}
      defaultOpen={true}
    >
      <div className="space-y-3 px-1">
        <p className="text-xs text-muted-foreground">
          {i18n.t('editor.subtitleSection.cueCount', { count: segment.cues.length })} -{' '}
          {sourceLabel}
        </p>

        <CaptionStyleControls
          items={styleItems}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
        />

        <VirtualCueList
          cues={segment.cues}
          onChange={updateCue}
          onSeek={seekToCue}
          onDelete={deleteCue}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const startSeconds =
              Math.max(
                0,
                Math.min(
                  segment.durationInFrames - 1,
                  usePlaybackStore.getState().currentFrame - segment.from,
                ),
              ) / fps
            const cues = [
              ...cuesRef.current,
              {
                id: crypto.randomUUID(),
                startSeconds,
                endSeconds: Math.min(startSeconds + 2, segment.durationInFrames / fps),
                text: i18n.t('editor.subtitleSection.newCue', { defaultValue: 'New subtitle' }),
              },
            ].sort((a, b) => a.startSeconds - b.startSeconds)
            cuesRef.current = cues
            updateItem(segment.id, { cues })
          }}
        >
          {i18n.t('editor.subtitleSection.addCue', { defaultValue: 'Add subtitle' })}
        </Button>
      </div>
    </PropertySection>
  )
})

/** Estimated rendered height of a {@link SubtitleCueRow} including the
 *  `gap-2` between siblings. Used as the virtualizer's seed; rows then
 *  self-measure for any variation (e.g. alignment badge present/absent). */
const CUE_ROW_ESTIMATE_PX = 116

/** Minimum cue duration (10ms) — prevents start/end inputs from collapsing
 *  the cue to a zero or negative-length range. */
const MIN_CUE_DURATION_SECONDS = 0.01

interface VirtualCueListProps {
  cues: readonly { id: string; startSeconds: number; endSeconds: number; text: string }[]
  onChange: SubtitleCueRowProps['onChange']
  onSeek: SubtitleCueRowProps['onSeek']
  onDelete?: SubtitleCueRowProps['onDelete']
}

/**
 * Windowed cue list for long subtitle segments. A 65-min episode can
 * easily carry 600+ cues; rendering them all blows out the React tree
 * even with memoed rows. The virtualizer keeps only the visible rows
 * (plus a small overscan) mounted.
 */
const VirtualCueList = memo(function VirtualCueList({
  cues,
  onChange,
  onSeek,
  onDelete,
}: VirtualCueListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: cues.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CUE_ROW_ESTIMATE_PX,
    overscan: 4,
    getItemKey: (index) => cues[index]?.id ?? index,
  })

  const items = virtualizer.getVirtualItems()

  return (
    <div ref={scrollRef} className="h-[40vh] overflow-auto pr-2">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {items.map((virtualRow) => {
          const cue = cues[virtualRow.index]
          if (!cue) return null
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 right-0 pb-2"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <SubtitleCueRow
                index={virtualRow.index}
                cueId={cue.id}
                text={cue.text}
                startSeconds={cue.startSeconds}
                endSeconds={cue.endSeconds}
                onChange={onChange}
                onSeek={onSeek}
                onDelete={onDelete}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
})

interface SubtitleCueRowProps {
  index: number
  cueId: string
  text: string
  startSeconds: number
  endSeconds: number
  onChange: (
    cueId: string,
    patch: Partial<{ text: string; startSeconds: number; endSeconds: number }>,
  ) => void
  onSeek?: (startSeconds: number) => void
  onDelete?: (cueId: string) => void
}

/**
 * Editor row for a single cue.
 *
 * The textarea shows plain text — markup is hidden so users don't see
 * literal `<i>` brackets. The Italic/Bold/Underline toggles below wrap
 * (or unwrap) the entire cue with the corresponding tag, and any ASS
 * `{\anN}` alignment in the original cue text is preserved across edits.
 *
 * Trade-off: cues with mixed-run formatting (e.g. half italic) collapse
 * to whole-cue formatting on first text edit. That's rare in real subs
 * and the alternative — rich-text editing — is a much bigger surface.
 */
const SubtitleCueRow = memo(function SubtitleCueRow({
  index,
  cueId,
  text,
  startSeconds,
  endSeconds,
  onChange,
  onSeek,
  onDelete,
}: SubtitleCueRowProps) {
  const { t } = useTranslation()
  const parsed = useMemo(() => parseSubtitleCueText(text), [text])
  const flags = useMemo(() => getCueFormatFlags(parsed), [parsed])

  const handlePlainTextChange = useCallback(
    (nextPlainText: string) => {
      onChange(cueId, { text: buildCueText(nextPlainText, flags, text) })
    },
    [cueId, flags, onChange, text],
  )

  // Typing mid-cue keeps the caret: the stored cue text comes from a deferred inspector snapshot.
  const field = useSyncedText<HTMLTextAreaElement>({
    value: parsed.plainText,
    onChange: handlePlainTextChange,
  })

  const handleToggle = useCallback(
    (format: keyof CueFormatFlags) => {
      onChange(cueId, { text: toggleCueFormat(text, format) })
    },
    [cueId, onChange, text],
  )

  return (
    <li className="rounded border border-border bg-card/40 p-2">
      <div className="flex items-center gap-2 pb-1.5">
        <button
          type="button"
          title={t('editor.subtitleSection.seekToCue')}
          onClick={() => onSeek?.(startSeconds)}
          className="rounded text-[10px] font-semibold uppercase tracking-wide tabular-nums px-1.5 py-0.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
        >
          #{index + 1}
        </button>
        <Label className="sr-only" htmlFor={`cue-${cueId}-start`}>
          {t('editor.subtitleSection.start')}
        </Label>
        <Input
          id={`cue-${cueId}-start`}
          type="number"
          step="0.01"
          min="0"
          value={Number(startSeconds.toFixed(3))}
          onChange={(event) => {
            const value = Number(event.target.value)
            if (!Number.isFinite(value)) return
            // Clamp against the cue's end so dragging start past end can't
            // produce a zero/negative-length cue.
            const clamped = Math.max(0, Math.min(value, endSeconds - MIN_CUE_DURATION_SECONDS))
            onChange(cueId, { startSeconds: clamped })
          }}
          className="h-6 w-28 text-right text-xs tabular-nums"
        />
        <span className="text-[10px] text-muted-foreground">→</span>
        <Label className="sr-only" htmlFor={`cue-${cueId}-end`}>
          {t('editor.subtitleSection.end')}
        </Label>
        <Input
          id={`cue-${cueId}-end`}
          type="number"
          step="0.01"
          min="0"
          value={Number(endSeconds.toFixed(3))}
          onChange={(event) => {
            const value = Number(event.target.value)
            if (!Number.isFinite(value)) return
            const clamped = Math.max(startSeconds + MIN_CUE_DURATION_SECONDS, value)
            onChange(cueId, { endSeconds: clamped })
          }}
          className="h-6 w-28 text-right text-xs tabular-nums"
        />
      </div>
      <textarea
        {...field.fieldProps}
        rows={2}
        className="w-full resize-none rounded border border-input bg-transparent px-2 py-1 text-xs leading-snug focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center gap-1 pt-1">
        <FormatToggleButton
          active={flags.italic}
          onClick={() => handleToggle('italic')}
          label={t('editor.subtitleSection.italic')}
          glyph="I"
          glyphStyle={{ fontStyle: 'italic' }}
        />
        <FormatToggleButton
          active={flags.bold}
          onClick={() => handleToggle('bold')}
          label={t('editor.subtitleSection.bold')}
          glyph="B"
          glyphStyle={{ fontWeight: 700 }}
        />
        <FormatToggleButton
          active={flags.underline}
          onClick={() => handleToggle('underline')}
          label={t('editor.subtitleSection.underline')}
          glyph="U"
          glyphStyle={{ textDecoration: 'underline' }}
        />
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(cueId)}
            title={t('editor.subtitleSection.deleteCue')}
            aria-label={t('editor.subtitleSection.deleteCue')}
            className="ml-auto h-5 w-5 rounded border border-border text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-destructive"
          >
            <Trash2 className="mx-auto h-3 w-3" />
          </button>
        )}
        {parsed.alignment && (
          <span
            className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground"
            title={t('editor.subtitleSection.cuePosition', {
              vertical: parsed.alignment.verticalAlign,
              horizontal: parsed.alignment.textAlign,
            })}
          >
            {parsed.alignment.verticalAlign === 'top'
              ? '▲'
              : parsed.alignment.verticalAlign === 'bottom'
                ? '▼'
                : '◆'}{' '}
            {parsed.alignment.textAlign}
          </span>
        )}
      </div>
    </li>
  )
})

interface FormatToggleButtonProps {
  active: boolean
  onClick: () => void
  label: string
  glyph: string
  glyphStyle?: CSSProperties
}

function FormatToggleButton({
  active,
  onClick,
  label,
  glyph,
  glyphStyle,
}: FormatToggleButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-5 w-5 rounded border text-[11px] leading-none transition-colors',
        active
          ? 'border-primary bg-primary/15 text-foreground'
          : 'border-border text-muted-foreground hover:bg-secondary/40',
      )}
      style={glyphStyle}
    >
      {glyph}
    </button>
  )
}
