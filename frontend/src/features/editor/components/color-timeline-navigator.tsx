import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import {
  useItemsStore,
  useMarkersStore,
  useTimelineSettingsStore,
} from '@/features/editor/deps/timeline-store'
import type { GpuEffectInstance } from '@/infrastructure/gpu-effects'
import type { GpuEffect, ItemEffect } from '@/types/effects'
import { renderGradedTileFrame } from '@/features/editor/utils/color-grade-tile-renderer'
import { usePlaybackStore } from '@/shared/state/playback'
import { useSelectionStore } from '@/shared/state/selection'
import { useGizmoStore } from '@/features/editor/deps/preview'
import type { TimelineItem, TimelineTrack } from '@/types/timeline'
import {
  buildTimelineAnnotationModel,
  type TimelineAnnotationMarker,
} from '@/shared/timeline/timeline-annotations'
import {
  resolveColorGradeThumbnailTreatment,
  type ColorGradeThumbnailTreatment,
} from '@/features/editor/utils/color-grade-thumbnail-treatment'
import {
  formatMiniTimelineTimecode,
  MiniFilmTile,
  MiniTimelineAnnotations,
  MiniTimelineIoLane,
  MiniTimelinePlayhead,
  MiniTimelineRuler,
  MiniTimelineTrackLanes,
  resolveMiniTimelineMaxFrame,
  useClipStartFrameUrl,
  useMediaPosterUrls,
  useMiniTimelineScrub,
  MINI_FILM_TILE_SCROLLBAR_GUTTER,
  MINI_FILM_TILE_STRIP_HEIGHT,
  MINI_TIMELINE_IO_LANE_HEIGHT,
  MINI_TIMELINE_LABEL_WIDTH,
  MINI_TIMELINE_RULER_HEIGHT,
  type MiniFilmTileClip,
  type MiniTimelineClip,
} from './mini-timeline'

/** Coalesce drag/slider bursts to one store update per animation frame. */
function useRafThrottled<T extends unknown[]>(callback: ((...args: T) => void) | undefined) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  const rafRef = useRef<number | null>(null)
  const argsRef = useRef<T | null>(null)
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )
  return useCallback((...args: T) => {
    argsRef.current = args
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const pending = argsRef.current
      if (pending) callbackRef.current?.(...pending)
    })
  }, [])
}

const TEST_ID_PREFIX = 'color-timeline'
const STRIP_HEIGHT = 212
// filmstrip (92) + IO lane (14) + ruler (20) + track area = STRIP_HEIGHT, so
// every extra pixel goes to the track rows.
const TRACK_AREA_HEIGHT =
  STRIP_HEIGHT -
  MINI_FILM_TILE_STRIP_HEIGHT -
  MINI_TIMELINE_IO_LANE_HEIGHT -
  MINI_TIMELINE_RULER_HEIGHT
const VIDEO_TRACK_NAME_REGEX = /^V\d+$/i

/** Film-tile clip extended with track id (for mini lanes) + the live grade. */
interface ColorTimelineClip extends MiniFilmTileClip {
  trackId: string
  effects: readonly ItemEffect[]
  gradeThumbnail: ColorGradeThumbnailTreatment
}

function isVisualNavigatorItem(item: TimelineItem): boolean {
  return item.type !== 'audio' && item.type !== 'subtitle'
}

function isNavigatorVideoTrack(track: TimelineTrack): boolean {
  if (track.isGroup) return false
  if (track.kind === 'audio') return false
  if (track.kind === 'video') return true
  return VIDEO_TRACK_NAME_REGEX.test(track.name)
}

function getNavigatorLabel(item: TimelineItem): string {
  const label = item.label.trim()
  if (label) return label
  return item.type === 'adjustment' ? 'Grade' : item.type
}

function getThumbnailUrl(item: TimelineItem): string | undefined {
  return 'thumbnailUrl' in item ? item.thumbnailUrl : undefined
}

// Largest source dimension to grade at — keeps the GPU pass + readback cheap
// while leaving enough detail for the tile's object-cover crop.
const GRADE_TILE_MAX_DIMENSION = 256
// Coalesce live color-wheel drags into ~10fps GPU renders so a drag doesn't
// queue a readback per pointer frame.
const GRADE_RENDER_DEBOUNCE_MS = 100

function toGpuEffectInstances(effects: readonly ItemEffect[]): GpuEffectInstance[] {
  return effects
    .filter((entry) => entry.enabled && entry.effect.type === 'gpu-effect')
    .map((entry) => {
      const gpu = entry.effect as GpuEffect
      return {
        id: entry.id,
        type: gpu.gpuEffectType,
        name: gpu.gpuEffectType,
        enabled: true,
        params: { ...gpu.params },
      }
    })
}

/**
 * Bake the clip's real GPU grade onto `baseUrl`, returning a graded object URL
 * (or undefined while rendering / when there is nothing to grade / no GPU).
 * Re-renders are debounced so live color-wheel drags don't thrash the readback.
 */
function useGradedTileThumbnail(
  baseUrl: string | undefined,
  instances: GpuEffectInstance[],
): string | undefined {
  const signature = useMemo(() => JSON.stringify(instances), [instances])
  const [gradedUrl, setGradedUrl] = useState<string | undefined>(undefined)

  // Read the latest instances inside the effect without making its array
  // identity a dependency — `signature` is the reactive digest that gates reruns.
  const instancesRef = useRef(instances)
  instancesRef.current = instances

  useEffect(() => {
    const current = instancesRef.current
    // Drop any previously baked frame immediately so a stale grade/source frame
    // isn't shown while the new one renders (the revoke effect frees its URL).
    setGradedUrl(undefined)
    if (!baseUrl || current.length === 0) {
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void renderGradedTileFrame(baseUrl, current, GRADE_TILE_MAX_DIMENSION).then((blob) => {
        if (cancelled || !blob) return
        setGradedUrl(URL.createObjectURL(blob))
      })
    }, GRADE_RENDER_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [baseUrl, signature])

  // Revoke the previous URL whenever it is replaced or on unmount.
  useEffect(() => {
    return () => {
      if (gradedUrl) URL.revokeObjectURL(gradedUrl)
    }
  }, [gradedUrl])

  return instances.length > 0 ? gradedUrl : undefined
}

interface ColorFilmTileProps {
  clip: ColorTimelineClip
  index: number
  selected: boolean
  fps: number
  posterUrl?: string
  /** Fill the grid cell (media-style filmstrip column). */
  fluid?: boolean
  onSelect: (clip: ColorTimelineClip) => void
}

/**
 * Prefer the clip's actual start frame; fall back to the import poster (or any
 * stored thumbnail) so the tile shows real content immediately.
 */
function resolveColorTileBaseUrl(
  startFrameUrl: string | null | undefined,
  clip: ColorTimelineClip,
  posterUrl: string | undefined,
): string | undefined {
  return startFrameUrl ?? clip.thumbnailUrl ?? posterUrl
}

/**
 * Derive the tile's display thumbnail and grade indicators. The real GPU grade
 * baked into the frame wins; until it lands (or when WebGPU is unavailable) the
 * base frame shows with the CSS-approximation grade.
 */
function resolveColorTileVisuals(
  clip: ColorTimelineClip,
  baseUrl: string | undefined,
  gradedUrl: string | undefined,
) {
  const hasGrade = clip.gradeThumbnail.hasGrade
  const showCssGradeFallback = !gradedUrl && hasGrade
  return {
    thumbnailUrl: gradedUrl ?? baseUrl,
    showCssGradeFallback,
    imageGradeStyle: showCssGradeFallback ? clip.gradeThumbnail.imageStyle : undefined,
    imageDataAttributes: {
      'data-graded-thumbnail': hasGrade ? 'true' : undefined,
      'data-grade-source': gradedUrl ? 'gpu' : hasGrade ? 'css' : undefined,
    },
  }
}

/**
 * Color film tile = the shared {@link MiniFilmTile} plus the baked GPU grade:
 * the real grade is rendered onto the start frame (debounced), falling back to
 * the CSS-approximation grade until it lands, with an RGB grade indicator.
 */
const ColorFilmTile = memo(function ColorFilmTile({
  clip,
  index,
  selected,
  fps,
  posterUrl,
  fluid,
  onSelect,
}: ColorFilmTileProps) {
  const startFrameUrl = useClipStartFrameUrl(clip, fps)
  const baseUrl = resolveColorTileBaseUrl(startFrameUrl, clip, posterUrl)

  const gradeInstances = useMemo(() => toGpuEffectInstances(clip.effects), [clip.effects])
  const gradedUrl = useGradedTileThumbnail(baseUrl, gradeInstances)

  const { thumbnailUrl, showCssGradeFallback, imageGradeStyle, imageDataAttributes } =
    resolveColorTileVisuals(clip, baseUrl, gradedUrl)

  return (
    <MiniFilmTile
      index={index}
      label={clip.label}
      trackName={clip.trackName}
      timecodeText={formatMiniTimelineTimecode(clip.from, fps)}
      thumbnailUrl={thumbnailUrl}
      selected={selected}
      onSelect={() => onSelect(clip)}
      testId={`${TEST_ID_PREFIX}-film-tile`}
      dataClipId={clip.id}
      imageStyle={imageGradeStyle}
      imageDataAttributes={imageDataAttributes}
      fluid={fluid}
      overlay={
        <>
          {showCssGradeFallback && clip.gradeThumbnail.overlayStyle ? (
            <span
              className="pointer-events-none absolute inset-0"
              data-testid={`${TEST_ID_PREFIX}-grade-overlay`}
              style={clip.gradeThumbnail.overlayStyle}
            />
          ) : null}
          {clip.gradeThumbnail.hasGrade ? (
            <span
              className="pointer-events-none absolute right-1 top-1 flex h-1.5 w-6 overflow-hidden rounded-full border border-black/45 shadow-sm"
              aria-hidden="true"
            >
              <span className="h-full flex-1 bg-red-500" />
              <span className="h-full flex-1 bg-lime-400" />
              <span className="h-full flex-1 bg-sky-500" />
            </span>
          ) : null}
        </>
      }
    />
  )
})

/**
 * Color workspace timeline navigator: a film-tile clip row over the shared mini
 * timeline (IO bar + annotations + ruler + track lanes + self-tracking
 * playhead). Clicking a tile or mini-clip seeks to + selects that clip; the
 * playhead is pinned while dragging the IO bar so it doesn't chase the markers.
 */
interface ColorTimelineNavigatorProps {
  /**
   * Film tiles: a row above the mini timeline (default), a vertical column to the
   * left of the viewer, or hidden (when the column is rendered separately).
   */
  filmStrip?: 'row' | 'column' | 'none'
  /** Render the mini timeline itself; off for the standalone film-tile column. */
  showTimeline?: boolean
  /** Column width in px (filmStrip="column"); tiles scale with it. */
  filmStripWidth?: number
  /** Drag callback for the column's right-edge resize handle. */
  onFilmStripWidthChange?: (width: number) => void
  /** Minimum tile width in the column grid (px); larger = bigger previews. */
  filmTileSize?: number
  onFilmTileSizeChange?: (size: number) => void
  /**
   * Color page split: filmstrip column on the left, this preview in the middle,
   * mini timeline underneath — all driven by ONE navigator instance (no
   * duplicated derivation, subscriptions or thumbnail work).
   */
  preview?: ReactNode
}

export const FILMSTRIP_DEFAULT_WIDTH = 134
export const FILMSTRIP_MIN_WIDTH = 96
export const FILMSTRIP_MAX_WIDTH = 640
export const FILM_TILE_SIZE_DEFAULT = 118
export const FILM_TILE_SIZE_MIN = 80
export const FILM_TILE_SIZE_MAX = 320

export const ColorTimelineNavigator = memo(function ColorTimelineNavigator({
  filmStrip = 'row',
  showTimeline = true,
  filmStripWidth = FILMSTRIP_DEFAULT_WIDTH,
  onFilmStripWidthChange,
  filmTileSize = FILM_TILE_SIZE_DEFAULT,
  onFilmTileSizeChange,
  preview,
}: ColorTimelineNavigatorProps) {
  const { t } = useTranslation()
  const { items, tracks } = useItemsStore(useShallow((s) => ({ items: s.items, tracks: s.tracks })))
  const { markers, inPoint, outPoint } = useMarkersStore(
    useShallow((s) => ({ markers: s.markers, inPoint: s.inPoint, outPoint: s.outPoint })),
  )
  const setCurrentFrame = usePlaybackStore((s) => s.setCurrentFrame)
  const setPreviewFrame = usePlaybackStore((s) => s.setPreviewFrame)
  const pausePlayback = usePlaybackStore((s) => s.pause)
  const fps = useTimelineSettingsStore((s) => s.fps)
  const selectedItemIds = useSelectionStore((s) => s.selectedItemIds)
  const selectedMarkerId = useSelectionStore((s) => s.selectedMarkerId)
  const selectItems = useSelectionStore((s) => s.selectItems)
  const selectMarker = useSelectionStore((s) => s.selectMarker)
  const livePreviewEdits = useGizmoStore((s) => s.preview)
  // Set while an IO drag is active so the playhead stops chasing the preview
  // frame (the preview canvas itself keeps updating).
  const suppressPlayheadPreviewRef = useRef(false)

  const selectedItemIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds])
  const videoTrackRows = useMemo(
    () => tracks.filter(isNavigatorVideoTrack).sort((a, b) => a.order - b.order),
    [tracks],
  )
  const trackNameById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track.name || track.id])),
    [tracks],
  )
  const filmClips = useMemo<ColorTimelineClip[]>(
    () =>
      items
        .filter(isVisualNavigatorItem)
        .map((item) => ({
          id: item.id,
          type: item.type,
          label: getNavigatorLabel(item),
          trackName: trackNameById.get(item.trackId) ?? 'V1',
          mediaId: item.mediaId,
          from: item.from,
          durationInFrames: item.durationInFrames,
          sourceStartFrames: Math.max(0, item.sourceStart ?? 0),
          sourceDurationFrames: Math.max(1, item.sourceDuration ?? item.durationInFrames),
          sourceFps: item.sourceFps && item.sourceFps > 0 ? item.sourceFps : fps,
          trimStartFrames: item.trimStart ?? 0,
          thumbnailUrl: getThumbnailUrl(item),
          // Mini-clip lanes key off trackId; films tiles don't, but carrying it
          // keeps the two clip lists derived from one pass.
          trackId: item.trackId,
          effects: livePreviewEdits?.[item.id]?.effects ?? item.effects ?? [],
          gradeThumbnail: resolveColorGradeThumbnailTreatment(
            livePreviewEdits?.[item.id]?.effects ?? item.effects,
          ),
        }))
        .sort((a, b) => a.from - b.from || a.trackId.localeCompare(b.trackId)),
    [items, livePreviewEdits, trackNameById, fps],
  )
  const miniClips = useMemo<MiniTimelineClip[]>(
    () =>
      filmClips.map((clip) => ({
        id: clip.id,
        trackId: clip.trackId,
        from: clip.from,
        durationInFrames: clip.durationInFrames,
        label: clip.label,
      })),
    [filmClips],
  )
  const posterMediaIds = useMemo(
    () =>
      Array.from(
        new Set(filmClips.map((clip) => clip.mediaId).filter((id): id is string => Boolean(id))),
      ),
    [filmClips],
  )
  const posterUrls = useMediaPosterUrls(posterMediaIds)
  const scheduleTileSizeChange = useRafThrottled(onFilmTileSizeChange)
  const timelineMaxFrame = resolveMiniTimelineMaxFrame({ items, markers, inPoint, outPoint })
  const annotationModel = useMemo(
    () => buildTimelineAnnotationModel({ markers, inPoint, outPoint, maxFrame: timelineMaxFrame }),
    [inPoint, markers, outPoint, timelineMaxFrame],
  )

  const scrubHandlers = useMiniTimelineScrub({
    maxFrame: timelineMaxFrame,
    fps,
    labelWidth: MINI_TIMELINE_LABEL_WIDTH,
  })

  const seekToClip = useCallback(
    (clip: { id: string; from: number }) => {
      pausePlayback()
      setPreviewFrame(null)
      setCurrentFrame(clip.from)
      selectItems([clip.id])
    },
    [pausePlayback, selectItems, setCurrentFrame, setPreviewFrame],
  )

  const seekToMarker = useCallback(
    (marker: TimelineAnnotationMarker) => {
      pausePlayback()
      setPreviewFrame(null)
      setCurrentFrame(marker.frame)
      selectMarker(marker.id)
    },
    [pausePlayback, selectMarker, setCurrentFrame, setPreviewFrame],
  )

  const scheduleWidthChange = useRafThrottled(onFilmStripWidthChange)

  const startFilmstripResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!onFilmStripWidthChange) return
      event.preventDefault()
      const startX = event.clientX
      const startWidth = filmStripWidth
      const handleMove = (moveEvent: PointerEvent) => {
        const next = Math.min(
          FILMSTRIP_MAX_WIDTH,
          Math.max(FILMSTRIP_MIN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX)),
        )
        scheduleWidthChange(next)
      }
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleUp)
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleUp)
    },
    [filmStripWidth, scheduleWidthChange, onFilmStripWidthChange],
  )

  const renderNavigatorSection = (strip: 'row' | 'column' | 'none', timeline: boolean) => {
    const isFilmColumn = strip === 'column'
    const sectionHeight = isFilmColumn
      ? undefined
      : timeline
        ? strip === 'none'
          ? STRIP_HEIGHT - MINI_FILM_TILE_STRIP_HEIGHT
          : STRIP_HEIGHT
        : MINI_FILM_TILE_STRIP_HEIGHT

    return (
      <section
        className={
          isFilmColumn
            ? 'panel-bg relative h-full shrink-0 overflow-hidden border-r border-border bg-[#24252b]'
            : 'panel-bg shrink-0 overflow-hidden border-y border-border bg-[#24252b]'
        }
        aria-label={t('editor.colorTimeline.label')}
        data-testid="color-timeline-navigator"
        data-film-strip={strip}
        style={sectionHeight ? { height: sectionHeight } : { width: filmStripWidth }}
      >
        <div className="flex h-full flex-col">
          {isFilmColumn && onFilmTileSizeChange && (
            <div className="flex h-6 shrink-0 items-center gap-1.5 border-b border-black/40 px-2">
              <span className="truncate text-[10px] text-zinc-400">
                {t('editor.colorTimeline.clipCount', { count: filmClips.length })}
              </span>
              <input
                type="range"
                min={FILM_TILE_SIZE_MIN}
                max={FILM_TILE_SIZE_MAX}
                step={4}
                value={filmTileSize}
                onChange={(event) => scheduleTileSizeChange(Number(event.target.value))}
                aria-label={t('editor.colorTimeline.tileSize')}
                title={t('editor.colorTimeline.tileSize')}
                data-testid="color-filmstrip-tile-size"
                className="ml-auto h-1 w-20 min-w-0 cursor-pointer accent-primary"
              />
            </div>
          )}
          {strip !== 'none' && (
            <div
              className={
                isFilmColumn
                  ? 'grid min-h-0 flex-1 content-start gap-1 overflow-y-auto overflow-x-hidden px-1 pb-1 pt-1'
                  : 'flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-black/40 px-1 pt-1'
              }
              data-testid="color-timeline-filmstrip-scroll"
              style={
                isFilmColumn
                  ? // Media-library style grid: as many columns as fit, tiles grow
                    // to fill the row, the slider sets the minimum tile width.
                    { gridTemplateColumns: `repeat(auto-fill, minmax(${filmTileSize}px, 1fr))` }
                  : {
                      height: MINI_FILM_TILE_STRIP_HEIGHT,
                      paddingBottom: MINI_FILM_TILE_SCROLLBAR_GUTTER,
                    }
              }
            >
              {filmClips.length > 0 ? (
                filmClips.map((clip, index) => (
                  <ColorFilmTile
                    key={`${clip.id}-film-tile`}
                    clip={clip}
                    index={index}
                    selected={selectedItemIdSet.has(clip.id)}
                    fps={fps}
                    posterUrl={clip.mediaId ? posterUrls.get(clip.mediaId) : undefined}
                    fluid={isFilmColumn}
                    onSelect={seekToClip}
                  />
                ))
              ) : (
                <div className="flex h-full items-center px-2 text-[10px] font-medium text-zinc-500">
                  {t('editor.colorTimeline.noClip')}
                </div>
              )}
            </div>
          )}

          {timeline && (
            <div
              className="relative flex min-h-0 flex-1 cursor-ew-resize flex-col bg-[#1d1e23]"
              data-testid="color-timeline-scrub-surface"
              {...scrubHandlers}
            >
              <div
                className="relative shrink-0 border-b border-black/40 bg-[#202127]"
                style={{ height: MINI_TIMELINE_IO_LANE_HEIGHT }}
              >
                <MiniTimelineIoLane
                  model={annotationModel}
                  timelineMaxFrame={timelineMaxFrame}
                  labelWidth={MINI_TIMELINE_LABEL_WIDTH}
                  suppressPlayheadPreviewRef={suppressPlayheadPreviewRef}
                  testIdPrefix={TEST_ID_PREFIX}
                />
              </div>
              <div className="relative flex min-h-0 flex-1 flex-col">
                <MiniTimelineAnnotations
                  model={annotationModel}
                  selectedMarkerId={selectedMarkerId}
                  onMarkerPress={seekToMarker}
                  labelWidth={MINI_TIMELINE_LABEL_WIDTH}
                  testIdPrefix={TEST_ID_PREFIX}
                />
                <MiniTimelineRuler
                  labelWidth={MINI_TIMELINE_LABEL_WIDTH}
                  maxFrame={timelineMaxFrame}
                  fps={fps}
                />
                <MiniTimelineTrackLanes
                  tracks={videoTrackRows}
                  clips={miniClips}
                  selectedIds={selectedItemIdSet}
                  maxFrame={timelineMaxFrame}
                  trackAreaHeight={TRACK_AREA_HEIGHT}
                  labelWidth={MINI_TIMELINE_LABEL_WIDTH}
                  onSelectClip={seekToClip}
                  fallbackLabelPrefix="V"
                  clipTestId="color-timeline-mini-clip"
                />
                <MiniTimelinePlayhead
                  labelWidth={MINI_TIMELINE_LABEL_WIDTH}
                  maxFrame={timelineMaxFrame}
                  handle="flag"
                  pointer
                  suppressPreviewRef={suppressPlayheadPreviewRef}
                  testId="color-timeline-playhead"
                />
              </div>
            </div>
          )}
        </div>
        {isFilmColumn && onFilmStripWidthChange && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('editor.colorTimeline.resizeFilmstrip')}
            title={t('editor.colorTimeline.resizeFilmstrip')}
            data-testid="color-filmstrip-resize-handle"
            className="absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40 active:bg-primary/60"
            onPointerDown={startFilmstripResize}
          />
        )}
      </section>
    )
  }

  if (preview) {
    // One navigator instance drives both surfaces: filmstrip column on the left,
    // preview in the middle, mini timeline below. Two separately mounted
    // navigators used to duplicate every derivation and subscription.
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {renderNavigatorSection('column', false)}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{preview}</div>
          {renderNavigatorSection('none', true)}
        </div>
      </div>
    )
  }

  return renderNavigatorSection(filmStrip, showTimeline)
})
