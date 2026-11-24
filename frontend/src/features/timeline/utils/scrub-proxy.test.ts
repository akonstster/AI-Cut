import { describe, expect, it } from 'vite-plus/test'
import { mixChannelsToMono, resampleMonoLinear } from './scrub-proxy'

describe('mixChannelsToMono', () => {
  it('averages stereo channels into one array', () => {
    const left = new Float32Array([1, 0, -1])
    const right = new Float32Array([0, 1, 0])
    expect([...mixChannelsToMono([left, right])]).toEqual([0.5, 0.5, -0.5])
  })

  it('passes a single channel through and copes with none', () => {
    const mono = new Float32Array([0.25, 0.5])
    expect(mixChannelsToMono([mono])).toBe(mono)
    expect(mixChannelsToMono([]).length).toBe(0)
  })
})

describe('resampleMonoLinear', () => {
  it('scales the sample count by the rate ratio', () => {
    const source = new Float32Array(48000)
    expect(resampleMonoLinear(source, 48000, 12000).length).toBe(12000)
    expect(resampleMonoLinear(source, 48000, 48000)).toBe(source)
  })

  it('interpolates between samples', () => {
    const source = new Float32Array([0, 1, 0, 1])
    expect([...resampleMonoLinear(source, 4, 4)]).toEqual([0, 1, 0, 1])
    const doubled = resampleMonoLinear(new Float32Array([0, 1]), 2, 4)
    expect(doubled.length).toBe(4)
    expect(doubled[0]).toBe(0)
    expect(doubled[3]).toBeCloseTo(1, 5)
  })
})
