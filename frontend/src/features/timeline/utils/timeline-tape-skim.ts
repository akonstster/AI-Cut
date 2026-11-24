import {
  resolveSkimPlaybackRate,
  SKIM_MAX_PLAYBACK_RATE,
  SKIM_MOVING_SPEED_THRESHOLD,
} from './skim-grain-timing'
import { buildScrubProxySamples, SCRUB_PROXY_SAMPLE_RATE } from './scrub-proxy'

export interface TapeSkimRequest {
  buffer: AudioBuffer
  sliceStartTimeSeconds: number
  timeSeconds: number
  gain?: number
  /** Signed media seconds per second of real time: magnitude is the tape speed. */
  speed?: number
}

export interface TapeSkimOptions {
  createAudioContext?: () => AudioContext
  fadeSeconds?: number
  maxRate?: number
}

const FADE_SECONDS = 0.012
/** How far the tape may drift from the playhead before it is re-cued. */
const DRIFT_TOLERANCE_SECONDS = 0.08

interface PlayingTape {
  source: AudioBufferSourceNode
  gain: GainNode
  buffer: AudioBuffer
  reversed: boolean
  startedAt: number
  startOffset: number
  rate: number
}

/**
 * Tape-style skimming: instead of firing a short grain on every pointer move, one
 * buffer keeps playing and its playback rate follows the pointer speed — the sound
 * of dragging a reel, with the pitch sliding the way it does on a tape machine.
 *
 * The clip's decoded audio is reduced to a 12 kHz mono scrub proxy first (see
 * `scrub-proxy.ts`), so a 4× pass still costs a quarter of the original data and
 * the proxy can be reversed once for backwards motion (a buffer source cannot run
 * at a negative rate).
 */
export function createTimelineTapeSkimPreview(options: TapeSkimOptions = {}) {
  const createAudioContext = options.createAudioContext ?? (() => new AudioContext())
  const fadeSeconds = options.fadeSeconds ?? FADE_SECONDS
  const maxRate = options.maxRate ?? SKIM_MAX_PLAYBACK_RATE

  let context: AudioContext | null = null
  let playing: PlayingTape | null = null
  const proxyByBuffer = new WeakMap<AudioBuffer, AudioBuffer>()
  const reversedProxyByBuffer = new WeakMap<AudioBuffer, AudioBuffer>()

  const getContext = () => {
    if (!context) {
      context = createAudioContext()
    }
    return context
  }

  const proxyFor = (ctx: AudioContext, buffer: AudioBuffer): AudioBuffer => {
    const existing = proxyByBuffer.get(buffer)
    if (existing) return existing
    const samples = buildScrubProxySamples(buffer, SCRUB_PROXY_SAMPLE_RATE)
    const proxy = ctx.createBuffer(1, Math.max(1, samples.length), SCRUB_PROXY_SAMPLE_RATE)
    proxy.copyToChannel(new Float32Array(samples), 0)
    proxyByBuffer.set(buffer, proxy)
    return proxy
  }

  const reversedProxyFor = (ctx: AudioContext, buffer: AudioBuffer): AudioBuffer => {
    const existing = reversedProxyByBuffer.get(buffer)
    if (existing) return existing
    const forward = proxyFor(ctx, buffer)
    const samples = forward.getChannelData(0)
    const reversed = new Float32Array(samples.length)
    for (let index = 0; index < samples.length; index += 1) {
      reversed[index] = samples[samples.length - 1 - index]!
    }
    const proxy = ctx.createBuffer(1, Math.max(1, reversed.length), forward.sampleRate)
    proxy.copyToChannel(reversed, 0)
    reversedProxyByBuffer.set(buffer, proxy)
    return proxy
  }

  /** Where the tape is right now, in the timebase of the buffer it plays. */
  const positionOf = (state: PlayingTape, now: number): number =>
    state.startOffset + (now - state.startedAt) * state.rate

  const release = (state: PlayingTape, fade: boolean) => {
    const ctx = context
    const now = ctx?.currentTime ?? 0
    if (fade && ctx) {
      try {
        state.gain.gain.cancelScheduledValues(now)
        state.gain.gain.setValueAtTime(state.gain.gain.value, now)
        state.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds)
        state.source.stop(now + fadeSeconds)
        return
      } catch {
        // Fall through to a hard stop when a parameter is already detached.
      }
    }
    try {
      state.source.stop()
    } catch {
      // Source may already be stopped.
    }
  }

  const stop = () => {
    const state = playing
    playing = null
    if (state) release(state, true)
  }

  const scrub = async ({
    buffer,
    sliceStartTimeSeconds,
    timeSeconds,
    gain = 1,
    speed = 0,
  }: TapeSkimRequest) => {
    if (buffer.duration <= 0) return
    const magnitude = Math.abs(speed)
    if (magnitude < SKIM_MOVING_SPEED_THRESHOLD) {
      // Playhead at rest: let the tape run down instead of stopping dead.
      stop()
      return
    }

    const ctx = getContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const backward = speed < 0
    const rate = resolveSkimPlaybackRate(magnitude, maxRate)
    const targetSeconds = Math.max(
      0,
      Math.min(buffer.duration, timeSeconds - sliceStartTimeSeconds),
    )

    const current = playing
    if (current && current.buffer === buffer && current.reversed === backward) {
      const currentTarget = backward ? buffer.duration - targetSeconds : targetSeconds
      const drift = Math.abs(positionOf(current, ctx.currentTime) - currentTarget)
      if (drift <= DRIFT_TOLERANCE_SECONDS) {
        // Still on the tape: only the speed and the volume have to follow.
        try {
          current.source.playbackRate.setValueAtTime(rate, ctx.currentTime)
          current.rate = rate
          current.gain.gain.setTargetAtTime(Math.max(0, gain), ctx.currentTime, 0.01)
        } catch {
          // Parameter may already be detached; the next cue restarts cleanly.
        }
        return
      }
    }

    // Re-cue: fade the old tape out, start the new one under the playhead.
    if (current) {
      playing = null
      release(current, true)
    }

    const playbackBuffer = backward ? reversedProxyFor(ctx, buffer) : proxyFor(ctx, buffer)
    const usedTarget = backward ? playbackBuffer.duration - targetSeconds : targetSeconds
    const offset = Math.max(0, Math.min(usedTarget, Math.max(0, playbackBuffer.duration - 0.005)))
    const now = ctx.currentTime
    const source = ctx.createBufferSource()
    const gainNode = ctx.createGain()

    source.buffer = playbackBuffer
    source.playbackRate.setValueAtTime(rate, now)
    source.connect(gainNode)
    gainNode.connect(ctx.destination)
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(Math.max(0, gain), now + fadeSeconds)
    source.onended = () => {
      if (playing?.source === source) playing = null
      try {
        source.disconnect()
      } catch {
        // Best-effort cleanup.
      }
      try {
        gainNode.disconnect()
      } catch {
        // Best-effort cleanup.
      }
    }
    playing = {
      source,
      gain: gainNode,
      buffer,
      reversed: backward,
      startedAt: now,
      startOffset: offset,
      rate,
    }
    source.start(now, offset)
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

export const timelineTapeSkimPreview = createTimelineTapeSkimPreview()
