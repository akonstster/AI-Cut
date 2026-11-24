import { describe, expect, it } from 'vite-plus/test'
import {
  measureSkimSpeed,
  resolveSkimGrainSeconds,
  resolveSkimPlaybackRate,
  SKIM_GRAIN_MAX_SECONDS,
  SKIM_GRAIN_MIN_SECONDS,
} from './skim-grain-timing'

describe('resolveSkimGrainSeconds', () => {
  it('is longest at rest and shrinks as the playhead speeds up', () => {
    const rest = resolveSkimGrainSeconds(0)
    const one = resolveSkimGrainSeconds(1)
    const four = resolveSkimGrainSeconds(4)
    const fast = resolveSkimGrainSeconds(40)

    expect(rest).toBeGreaterThan(one)
    expect(one).toBeGreaterThan(four)
    expect(four).toBeGreaterThanOrEqual(fast)
    expect(rest).toBeGreaterThan(0.07)
    expect(fast).toBe(SKIM_GRAIN_MIN_SECONDS)
  })

  it('clamps into the configured window', () => {
    expect(resolveSkimGrainSeconds(0, { max: 0.06 })).toBe(0.06)
    expect(resolveSkimGrainSeconds(-5)).toBeLessThanOrEqual(SKIM_GRAIN_MAX_SECONDS)
    expect(resolveSkimGrainSeconds(Number.NaN)).toBeGreaterThan(0)
  })
})

describe('resolveSkimPlaybackRate', () => {
  it('mirrors the movement speed and clamps both ends', () => {
    expect(resolveSkimPlaybackRate(2)).toBe(2)
    expect(resolveSkimPlaybackRate(-2)).toBe(2)
    expect(resolveSkimPlaybackRate(0)).toBe(0.25)
    expect(resolveSkimPlaybackRate(99)).toBe(4)
  })
})

describe('measureSkimSpeed', () => {
  it('returns 0 without a previous sample or movement', () => {
    expect(measureSkimSpeed(null, { frame: 10, atMs: 0 }, 30)).toBe(0)
    expect(measureSkimSpeed({ frame: 10, atMs: 0 }, { frame: 10, atMs: 16 }, 30)).toBe(0)
  })

  it('converts a frame delta over elapsed time into media seconds per second', () => {
    // 30 frames in 500 ms at 30 fps = 1 s of media per 0.5 s of real time.
    expect(measureSkimSpeed({ frame: 0, atMs: 0 }, { frame: 30, atMs: 500 }, 30)).toBeCloseTo(2)
    // Backwards movement counts the same as forwards.
    expect(measureSkimSpeed({ frame: 30, atMs: 0 }, { frame: 0, atMs: 500 }, 30)).toBeCloseTo(2)
  })
})
