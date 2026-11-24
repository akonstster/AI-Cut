/**
 * Grain shaping shared by every audio-skim engine.
 *
 * Skimming used to play a fixed 45–80 ms window on every pointer move. At slow
 * speeds that is choppy (each grain restarts before it is heard through), and at
 * fast speeds the grains machine-gun into clicks. The window is therefore sized
 * from how fast the playhead travels: long and smooth while you creep, short and
 * crisp while you throw the playhead across the timeline.
 */

/** Grain at rest, in seconds. */
export const SKIM_GRAIN_BASE_SECONDS = 0.05
export const SKIM_GRAIN_MIN_SECONDS = 0.03
export const SKIM_GRAIN_MAX_SECONDS = 0.12
/** Fastest tape-style playback rate, in multiples of real time. */
export const SKIM_MAX_PLAYBACK_RATE = 4

export interface SkimGrainOptions {
  base?: number
  min?: number
  max?: number
}

/**
 * Grain length for a playhead moving at `speed` seconds of media per second of
 * real time: 80 ms at rest, ~50 ms at 1×, 30 ms once the pointer is thrown across
 * the timeline. The floor stays at 30 ms on purpose — shorter grains are heard as
 * clicks even with crossfades.
 */
export function resolveSkimGrainSeconds(speed: number, options: SkimGrainOptions = {}): number {
  const base = options.base ?? SKIM_GRAIN_BASE_SECONDS
  const min = options.min ?? SKIM_GRAIN_MIN_SECONDS
  const max = options.max ?? SKIM_GRAIN_MAX_SECONDS
  const safeSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0
  const seconds = (base * 1.6) / (1 + safeSpeed * 0.55)
  return Math.max(min, Math.min(max, seconds))
}

/** Playback rate for tape-style skimming, clamped so the pitch stays usable. */
export function resolveSkimPlaybackRate(speed: number, max = SKIM_MAX_PLAYBACK_RATE): number {
  const safeSpeed = Number.isFinite(speed) ? Math.abs(speed) : 0
  return Math.max(0.25, Math.min(max, safeSpeed))
}

/** Below this the playhead is standing still and the tape should be silent. */
export const SKIM_MOVING_SPEED_THRESHOLD = 0.05

export interface SkimSpeedSample {
  frame: number
  atMs: number
}

/**
 * Seconds of media per second of real time between two playhead samples.
 * Returns 0 when the samples are too close together to mean anything.
 */
export function measureSkimSpeed(
  previous: SkimSpeedSample | null,
  current: SkimSpeedSample,
  fps: number,
): number {
  if (!previous) return 0
  const elapsedMs = current.atMs - previous.atMs
  if (elapsedMs <= 0) return 0
  const frames = Math.abs(current.frame - previous.frame)
  if (frames === 0) return 0
  const safeFps = fps > 0 ? fps : 30
  return frames / safeFps / (elapsedMs / 1000)
}
