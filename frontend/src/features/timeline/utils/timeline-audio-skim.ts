import type { TimelineItem, TimelineTrack } from '@/types/timeline'
import { getMixerLiveGain } from '@/shared/state/mixer-live-gain'
import { getAudioFadeMultiplier } from '@/shared/utils/audio-fade-curve'
import { timelineToSourceFrames } from './source-calculations'
import { resolveEffectiveTrackStates } from './group-utils'
import { SKIM_GRAIN_MIN_SECONDS } from './skim-grain-timing'

const DEFAULT_TIMELINE_FPS = 30
const DEFAULT_GRAIN_DURATION_SECONDS = 0.045
const DEFAULT_GAIN = 0.8
/** How long a media element keeps sounding after the last scrub step. */
const SKIM_IDLE_STOP_MS = 140
/** Seek forward once the playhead is further than this ahead of the element. */
const SEEK_HORIZON_SECONDS = 0.05
/** Seek backward once the playhead is further than this behind the element. */
const SEEK_BACK_TOLERANCE_SECONDS = 0.06

interface TimelineMediaElementSkimRequest {
  mediaUrl: string
  mediaKind: 'audio' | 'video'
  timeSeconds: number
  gain?: number
  /** Overrides the fixed grain length; skimming passes an adaptive value. */
  grainDurationSeconds?: number
}

function normalizeFps(fps: number | undefined, fallback: number): number {
  if (fps === undefined || !Number.isFinite(fps) || fps <= 0) return fallback
  return fps
}

export interface LatestOnlyAsyncFrameRunner {
  schedule: (frame: number) => void
  cancelPending: () => void
}

/**
 * Run at most one asynchronous frame request at a time. Pointer motion that
 * arrives while a request is settling replaces the pending target, so a slow
 * media seek cannot make the skim path replay every obsolete position.
 */
export function createLatestOnlyAsyncFrameRunner(
  run: (frame: number) => Promise<void>,
): LatestOnlyAsyncFrameRunner {
  let inFlight = false
  let pendingFrame: number | null = null

  const schedule = (frame: number): void => {
    if (inFlight) {
      pendingFrame = frame
      return
    }

    inFlight = true
    void run(frame)
      .catch(() => {
        // Skimming is best-effort; a failed target must not block the newest one.
      })
      .finally(() => {
        inFlight = false
        const nextFrame = pendingFrame
        pendingFrame = null
        if (nextFrame !== null) schedule(nextFrame)
      })
  }

  return {
    schedule,
    cancelPending: () => {
      pendingFrame = null
    },
  }
}

export function getTimelineAudioSkimTimeSeconds(
  item: TimelineItem,
  timelineFrame: number,
  timelineFps: number,
  mediaDurationSeconds: number,
): number | null {
  if ((item.type !== 'audio' && item.type !== 'video') || !item.mediaId) {
    return null
  }
  if (!Number.isFinite(mediaDurationSeconds) || mediaDurationSeconds <= 0) {
    return null
  }

  const safeTimelineFps = normalizeFps(timelineFps, DEFAULT_TIMELINE_FPS)
  const sourceFps = normalizeFps(item.sourceFps, safeTimelineFps)
  const speed = item.speed ?? 1
  const localTimelineFrame = Math.max(
    0,
    Math.min(item.durationInFrames - 1, timelineFrame - item.from),
  )
  const sourceDeltaFrames = timelineToSourceFrames(
    localTimelineFrame,
    speed,
    safeTimelineFps,
    sourceFps,
  )
  const sourceStart = item.sourceStart ?? 0
  const sourceEnd =
    item.sourceEnd ??
    (item.sourceDuration !== undefined
      ? item.sourceDuration
      : Math.max(sourceStart + 1, Math.round(mediaDurationSeconds * sourceFps)))

  const sourceFrame = item.isReversed
    ? Math.max(sourceStart, sourceEnd - 1 - sourceDeltaFrames)
    : sourceStart + sourceDeltaFrames
  const clampedSourceFrame = Math.max(
    0,
    Math.min(Math.max(0, Math.round(mediaDurationSeconds * sourceFps) - 1), sourceFrame),
  )

  return clampedSourceFrame / sourceFps
}

type AudioOrVideoItem = Extract<TimelineItem, { type: 'audio' | 'video' }>

export interface TimelineSkimSource {
  item: AudioOrVideoItem
  timeSeconds: number
  gain: number
}

/** A sub-composition's playable contents, supplied by the caller. */
export interface CompositionLookup {
  items: TimelineItem[]
  tracks: TimelineTrack[]
  fps: number
}

// Compound clips can nest (a composition containing another composition). Recurse
// a few levels to reach real media; the depth guard prevents runaway/self-cycles.
const MAX_SKIM_COMPOSITION_DEPTH = 4

/** Map an outer-timeline frame to the inner frame of a referenced composition. */
function mapToInnerCompositionFrame(
  item: TimelineItem,
  frame: number,
  outerFps: number,
  innerFps: number,
): number {
  const sourceFps = normalizeFps(item.sourceFps, innerFps)
  const speed = item.speed ?? 1
  const localFrame = Math.max(0, Math.min(item.durationInFrames - 1, frame - item.from))
  const sourceDeltaFrames = timelineToSourceFrames(localFrame, speed, outerFps, sourceFps)
  const sourceStart = item.sourceStart ?? 0
  const sourceEnd = item.sourceEnd ?? sourceStart + item.durationInFrames
  return item.isReversed
    ? Math.max(sourceStart, sourceEnd - 1 - sourceDeltaFrames)
    : sourceStart + sourceDeltaFrames
}

function dbToLinear(db: number | undefined): number {
  if (db === undefined || !Number.isFinite(db)) return 1
  return Math.pow(10, db / 20)
}

function getTimelineSkimItemGain(
  item: TimelineItem,
  frame: number,
  timelineFps: number,
  trackVolumeDb: number | undefined,
): number {
  const localFrame = Math.max(0, Math.min(item.durationInFrames - 1, frame - item.from))
  const fadeGain =
    item.type === 'audio' || item.type === 'video'
      ? getAudioFadeMultiplier({
          frame: localFrame,
          durationInFrames: item.durationInFrames,
          fadeInFrames: (item.audioFadeIn ?? 0) * timelineFps,
          fadeOutFrames: (item.audioFadeOut ?? 0) * timelineFps,
          fadeInCurve: item.audioFadeInCurve ?? 0,
          fadeOutCurve: item.audioFadeOutCurve ?? 0,
          fadeInCurveX: item.audioFadeInCurveX ?? 0.52,
          fadeOutCurveX: item.audioFadeOutCurveX ?? 0.52,
        })
      : 1

  return dbToLinear(item.volume) * dbToLinear(trackVolumeDb) * fadeGain * getMixerLiveGain(item.id)
}

/**
 * Pick the audio source that should be heard when the playhead sits on a given
 * frame (ruler scrubbing). Considers every audio clip and every video clip with
 * embedded audio whose span covers the frame, honouring track mute/solo (group
 * states resolved). Prefers audio clips over video, then the topmost track, so a
 * single representative grain is played — the grain engine only supports one
 * voice at a time.
 *
 * Compound clips (composition items, or audio/video members that carry a
 * `compositionId` instead of a media file) have no standalone media to grain, so
 * the selector recurses one level into the referenced sub-composition and skims
 * whatever leaf clip is audible there. Returns null when nothing audible sits
 * under the frame.
 */
export function selectTimelineSkimSourceAtFrame(
  frame: number,
  items: TimelineItem[],
  tracks: TimelineTrack[],
  timelineFps: number,
  getMediaDurationSeconds: (item: TimelineItem, timelineFps: number) => number,
  resolveComposition?: (compositionId: string) => CompositionLookup | undefined,
  depth = 0,
  gainMultiplier = 1,
): TimelineSkimSource | null {
  const effectiveTracks = resolveEffectiveTrackStates(tracks)
  const trackById = new Map(effectiveTracks.map((track) => [track.id, track] as const))
  const soloActive = effectiveTracks.some((track) => track.solo)

  // Audio wins over video (-1000 bias); within a kind, the topmost track (lowest
  // order) wins. Leaf sources (real media) are preferred over recursing into a
  // composition at the same rank.
  let bestLeaf: { item: AudioOrVideoItem; gain: number } | null = null
  let bestLeafRank = Number.POSITIVE_INFINITY
  let bestNested: { item: TimelineItem; gain: number } | null = null
  let bestNestedRank = Number.POSITIVE_INFINITY

  for (const item of items) {
    if (frame < item.from || frame >= item.from + item.durationInFrames) continue

    const track = trackById.get(item.trackId)
    if (!track || track.muted) continue
    if (soloActive && !track.solo) continue

    const order = track.order ?? 0
    const compositionId = (item as { compositionId?: string }).compositionId
    const isLeaf = (item.type === 'audio' || item.type === 'video') && !!item.mediaId
    const itemGain =
      gainMultiplier * getTimelineSkimItemGain(item, frame, timelineFps, track.volume)

    if (isLeaf) {
      if (item.type === 'video' && item.embeddedAudioMuted) continue
      const rank = order + (item.type === 'audio' ? -1000 : 0)
      if (rank < bestLeafRank) {
        bestLeafRank = rank
        bestLeaf = { item: item as AudioOrVideoItem, gain: itemGain }
      }
    } else if (compositionId && resolveComposition && depth < MAX_SKIM_COMPOSITION_DEPTH) {
      // Audio members rank like audio; the composition (video) item ranks like video.
      const rank = order + (item.type === 'audio' ? -1000 : 0)
      if (rank < bestNestedRank) {
        bestNestedRank = rank
        bestNested = { item, gain: itemGain }
      }
    }
  }

  const resolveLeaf = (entry: {
    item: AudioOrVideoItem
    gain: number
  }): TimelineSkimSource | null => {
    const timeSeconds = getTimelineAudioSkimTimeSeconds(
      entry.item,
      frame,
      timelineFps,
      getMediaDurationSeconds(entry.item, timelineFps),
    )
    return timeSeconds === null ? null : { item: entry.item, timeSeconds, gain: entry.gain }
  }

  // A direct leaf beats recursion when it ranks at least as well.
  if (bestLeaf && bestLeafRank <= bestNestedRank) {
    const leaf = resolveLeaf(bestLeaf)
    if (leaf) return leaf
  }

  if (bestNested && resolveComposition) {
    const compositionId = (bestNested.item as { compositionId?: string }).compositionId
    const composition = compositionId ? resolveComposition(compositionId) : undefined
    if (composition) {
      const innerFrame = mapToInnerCompositionFrame(
        bestNested.item,
        frame,
        timelineFps,
        composition.fps,
      )
      const nested = selectTimelineSkimSourceAtFrame(
        innerFrame,
        composition.items,
        composition.tracks,
        composition.fps,
        getMediaDurationSeconds,
        resolveComposition,
        depth + 1,
        bestNested.gain,
      )
      if (nested) return nested
    }
  }

  // Nested resolution failed — fall back to any leaf we found.
  if (bestLeaf) {
    const leaf = resolveLeaf(bestLeaf)
    if (leaf) return leaf
  }

  return null
}

export function createTimelineMediaElementAudioSkimPreview(
  options: {
    grainDurationSeconds?: number
    gain?: number
    createAudioElement?: () => HTMLAudioElement
    createVideoElement?: () => HTMLVideoElement
  } = {},
) {
  const grainDurationSeconds = options.grainDurationSeconds ?? DEFAULT_GRAIN_DURATION_SECONDS
  const gain = options.gain ?? DEFAULT_GAIN
  const createAudioElement = options.createAudioElement ?? (() => document.createElement('audio'))
  const createVideoElement = options.createVideoElement ?? (() => document.createElement('video'))

  let media: HTMLMediaElement | null = null
  let mediaKind: 'audio' | 'video' | null = null
  let stopTimer: number | null = null
  let requestId = 0

  const stop = () => {
    requestId += 1
    if (stopTimer !== null) {
      window.clearTimeout(stopTimer)
      stopTimer = null
    }
    if (!media) return
    media.pause()
  }

  const getMedia = (kind: 'audio' | 'video') => {
    if (!media || mediaKind !== kind) {
      if (media) {
        media.pause()
      }
      if (stopTimer !== null) {
        window.clearTimeout(stopTimer)
        stopTimer = null
      }
      media = kind === 'video' ? createVideoElement() : createAudioElement()
      mediaKind = kind
      media.preload = 'auto'
      media.crossOrigin = 'anonymous'
      media.volume = gain
      media.muted = false
      if (media instanceof HTMLVideoElement) {
        media.playsInline = true
      }
    }

    return media
  }

  const waitForEventOrTimeout = (
    element: HTMLMediaElement,
    eventName: 'loadedmetadata' | 'seeked',
    timeoutMs: number,
  ) =>
    new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        element.removeEventListener(eventName, finish)
        resolve()
      }
      const timeoutId = window.setTimeout(finish, timeoutMs)
      element.addEventListener(eventName, finish, { once: true })
    })

  const scrub = async ({
    mediaUrl,
    mediaKind,
    timeSeconds,
    gain: requestGain = 1,
    grainDurationSeconds: requestGrainSeconds,
  }: TimelineMediaElementSkimRequest) => {
    if (!mediaUrl || typeof document === 'undefined') return

    const grainSeconds = Math.max(
      SKIM_GRAIN_MIN_SECONDS,
      Math.min(0.4, requestGrainSeconds ?? grainDurationSeconds),
    )
    const currentRequest = ++requestId
    const element = getMedia(mediaKind)
    const sameSource = element.currentSrc === mediaUrl || element.src === mediaUrl

    if (stopTimer !== null) {
      window.clearTimeout(stopTimer)
      stopTimer = null
    }

    if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForEventOrTimeout(element, 'loadedmetadata', 250)
      if (currentRequest !== requestId) return
    }

    const duration = Number.isFinite(element.duration) ? element.duration : Number.POSITIVE_INFINITY
    const offset = Math.max(0, Math.min(timeSeconds, Math.max(0, duration - grainSeconds)))

    // Keep the element PLAYING and move it with a seek. Pausing between frames was
    // what broke the sound as soon as the pointer moved faster than one grain: each
    // step became pause → seek → play, so a quick pass stuttered into silence. The
    // element now only stops after the pointer has been still for a moment.
    const horizon = Math.max(grainSeconds, SEEK_HORIZON_SECONDS)
    const ahead = offset - element.currentTime
    const behind = -ahead
    const needsSeek =
      !sameSource || element.ended || behind > SEEK_BACK_TOLERANCE_SECONDS || ahead > horizon

    if (!sameSource) {
      element.pause()
      element.src = mediaUrl
      element.load()
      if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
        await waitForEventOrTimeout(element, 'loadedmetadata', 250)
        if (currentRequest !== requestId) return
      }
    }

    element.volume = Math.max(0, Math.min(1, gain * requestGain))
    element.muted = false

    if (element.paused) {
      await element.play()
      if (currentRequest !== requestId) {
        element.pause()
        return
      }
    }
    if (needsSeek) {
      // Not awaited: waiting for `seeked` on every frame would cap the scrub rate at
      // the decoder's seek latency instead of the pointer's speed.
      element.currentTime = offset
    }

    stopTimer = window.setTimeout(() => {
      if (currentRequest === requestId) {
        element.pause()
      }
    }, SKIM_IDLE_STOP_MS)
  }

  const dispose = () => {
    stop()
    if (media) {
      media.removeAttribute('src')
      media.load()
      media = null
      mediaKind = null
    }
  }

  return { scrub, stop, dispose }
}

export const timelineMediaElementAudioSkimPreview = createTimelineMediaElementAudioSkimPreview()

export function getTimelineAudioBufferPeak({
  buffer,
  sliceStartTimeSeconds,
  timeSeconds,
  windowSeconds = DEFAULT_GRAIN_DURATION_SECONDS,
}: {
  buffer: AudioBuffer
  sliceStartTimeSeconds: number
  timeSeconds: number
  windowSeconds?: number
}): { left: number; right: number } {
  const sampleRate = buffer.sampleRate
  const startFrame = Math.max(0, Math.floor((timeSeconds - sliceStartTimeSeconds) * sampleRate))
  const endFrame = Math.min(
    buffer.length,
    Math.max(startFrame + 1, startFrame + Math.ceil(windowSeconds * sampleRate)),
  )
  if (startFrame >= endFrame) return { left: 0, right: 0 }

  const leftChannel = buffer.getChannelData(0)
  const rightChannel = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : leftChannel
  let leftPeak = 0
  let rightPeak = 0

  for (let i = startFrame; i < endFrame; i++) {
    leftPeak = Math.max(leftPeak, Math.abs(leftChannel[i] ?? 0))
    rightPeak = Math.max(rightPeak, Math.abs(rightChannel[i] ?? 0))
  }

  return { left: leftPeak, right: rightPeak }
}

function createTimelineAudioBufferSkimPreview(
  options: {
    grainDurationSeconds?: number
    fadeSeconds?: number
    gain?: number
    createAudioContext?: () => AudioContext
  } = {},
) {
  const grainDurationSeconds = options.grainDurationSeconds ?? DEFAULT_GRAIN_DURATION_SECONDS
  const fadeSeconds = options.fadeSeconds ?? 0.006
  const gainValue = options.gain ?? DEFAULT_GAIN
  const createAudioContext = options.createAudioContext ?? (() => new AudioContext())

  let context: AudioContext | null = null
  let activeGrain: { source: AudioBufferSourceNode; gain: GainNode } | null = null

  const getContext = () => {
    if (!context) {
      context = createAudioContext()
    }
    return context
  }

  /** Ramp a grain down and release it once the ramp is over. */
  const fadeOutGrain = (grain: { source: AudioBufferSourceNode; gain: GainNode }) => {
    const ctx = context
    if (!ctx) {
      try {
        grain.source.stop()
      } catch {
        // Source may already be stopped.
      }
      return
    }
    const now = ctx.currentTime
    try {
      grain.gain.gain.cancelScheduledValues(now)
      grain.gain.gain.setValueAtTime(grain.gain.gain.value, now)
      grain.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds)
    } catch {
      // Parameter may already be detached.
    }
    try {
      grain.source.stop(now + fadeSeconds)
    } catch {
      // Source may already be stopped.
    }
  }

  const stop = () => {
    const grain = activeGrain
    activeGrain = null
    if (grain) fadeOutGrain(grain)
  }

  const scrub = async ({
    buffer,
    sliceStartTimeSeconds,
    timeSeconds,
    gain: requestGain = 1,
    grainDurationSeconds: requestGrainSeconds,
  }: {
    buffer: AudioBuffer
    sliceStartTimeSeconds: number
    timeSeconds: number
    gain?: number
    grainDurationSeconds?: number
  }) => {
    const ctx = getContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    // Overlap the outgoing grain with the incoming one instead of cutting it: the
    // old grain fades out over the fade window while the new one fades in, which
    // removes the click on every scrub step (previously a hard stop).
    const previous = activeGrain
    activeGrain = null
    if (previous) fadeOutGrain(previous)

    const grainSeconds = Math.max(
      SKIM_GRAIN_MIN_SECONDS,
      requestGrainSeconds ?? grainDurationSeconds,
    )
    const grainDuration = Math.min(grainSeconds, Math.max(0, buffer.duration))
    if (grainDuration <= 0) return

    const sliceTime = Math.max(0, timeSeconds - sliceStartTimeSeconds)
    const offset = Math.max(0, Math.min(sliceTime, Math.max(0, buffer.duration - grainDuration)))
    const now = ctx.currentTime
    const nextSource = ctx.createBufferSource()
    const gainNode = ctx.createGain()

    nextSource.buffer = buffer
    nextSource.connect(gainNode)
    gainNode.connect(ctx.destination)
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(gainValue * requestGain, now + fadeSeconds)
    gainNode.gain.linearRampToValueAtTime(0, now + grainDuration)
    nextSource.onended = () => {
      if (activeGrain?.source === nextSource) {
        activeGrain = null
      }
      try {
        nextSource.disconnect()
      } catch {
        // Best-effort cleanup.
      }
      try {
        gainNode.disconnect()
      } catch {
        // Best-effort cleanup.
      }
    }
    activeGrain = { source: nextSource, gain: gainNode }
    nextSource.start(now, offset, grainDuration)
  }

  const dispose = () => {
    stop()
    if (context) {
      void context.close().catch(() => {})
      context = null
    }
  }

  return { scrub, stop, dispose }
}

export const timelineAudioBufferSkimPreview = createTimelineAudioBufferSkimPreview()
