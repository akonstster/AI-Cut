import { describe, expect, it } from 'vite-plus/test'
import { createTimelineTapeSkimPreview } from './timeline-tape-skim'

interface FakeSource {
  buffer: FakeBuffer | null
  playbackRate: { value: number; setValueAtTime: (value: number) => void }
  started: Array<{ offset: number }>
  stopped: boolean
}

interface FakeBuffer {
  duration: number
  sampleRate: number
  numberOfChannels: number
  length: number
  data: Float32Array
  getChannelData: () => Float32Array
  copyToChannel: (samples: Float32Array) => void
}

function makeBuffer(duration = 2, sampleRate = 48000): FakeBuffer {
  const length = Math.round(duration * sampleRate)
  const data = new Float32Array(length)
  data[0] = 0.5
  return {
    duration,
    sampleRate,
    numberOfChannels: 2,
    length,
    data,
    getChannelData: () => data,
    copyToChannel: (samples: Float32Array) => data.set(samples.subarray(0, data.length)),
  }
}

function createHarness() {
  const sources: FakeSource[] = []
  const context = {
    currentTime: 0,
    state: 'running' as AudioContextState,
    destination: {},
    resume: async () => {},
    createBuffer: (_channels: number, length: number, sampleRate: number) => ({
      ...makeBuffer(length / sampleRate, sampleRate),
      numberOfChannels: 1,
    }),
    createBufferSource: () => {
      const source: FakeSource = {
        buffer: null,
        playbackRate: {
          value: 1,
          setValueAtTime(value) {
            this.value = value
          },
        },
        started: [],
        stopped: false,
      }
      sources.push(source)
      return {
        get buffer() {
          return source.buffer
        },
        set buffer(value: FakeBuffer | null) {
          source.buffer = value
        },
        playbackRate: source.playbackRate,
        connect: () => {},
        disconnect: () => {},
        start: (_when: number, offset: number) => {
          source.started.push({ offset })
        },
        stop: () => {
          source.stopped = true
        },
        set onended(handler: (() => void) | null) {
          void handler
        },
      }
    },
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        cancelScheduledValues: () => {},
        setTargetAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    }),
  }
  return { context, sources }
}

describe('createTimelineTapeSkimPreview', () => {
  it('plays forward at the pointer speed on a low-rate mono proxy', async () => {
    const harness = createHarness()
    const tape = createTimelineTapeSkimPreview({
      createAudioContext: () => harness.context as unknown as AudioContext,
    })
    const buffer = makeBuffer() as unknown as AudioBuffer

    await tape.scrub({ buffer, sliceStartTimeSeconds: 0, timeSeconds: 1, speed: 2 })

    expect(harness.sources).toHaveLength(1)
    const source = harness.sources[0]!
    expect(source.playbackRate.value).toBe(2)
    expect(source.buffer?.numberOfChannels).toBe(1)
    expect(source.buffer?.sampleRate).toBe(12000)
    expect(source.started[0]!.offset).toBeCloseTo(1, 2)
  })

  it('keeps the running tape while the playhead stays close', async () => {
    const harness = createHarness()
    const tape = createTimelineTapeSkimPreview({
      createAudioContext: () => harness.context as unknown as AudioContext,
    })
    const buffer = makeBuffer() as unknown as AudioBuffer

    await tape.scrub({ buffer, sliceStartTimeSeconds: 0, timeSeconds: 1, speed: 1 })
    // The tape has been running for 20 ms at 1×: it sits at 1.02 s.
    harness.context.currentTime = 0.02
    await tape.scrub({ buffer, sliceStartTimeSeconds: 0, timeSeconds: 1.02, speed: 1.5 })

    expect(harness.sources).toHaveLength(1)
    expect(harness.sources[0]!.playbackRate.value).toBe(1.5)
  })

  it('re-cues when the playhead jumped away, and runs backwards on a reversed proxy', async () => {
    const harness = createHarness()
    const tape = createTimelineTapeSkimPreview({
      createAudioContext: () => harness.context as unknown as AudioContext,
    })
    const buffer = makeBuffer() as unknown as AudioBuffer

    await tape.scrub({ buffer, sliceStartTimeSeconds: 0, timeSeconds: 1, speed: 1 })
    const forwardProxy = harness.sources[0]!.buffer

    harness.context.currentTime = 0.5
    await tape.scrub({ buffer, sliceStartTimeSeconds: 0, timeSeconds: 0.5, speed: -2 })

    expect(harness.sources).toHaveLength(2)
    const reversed = harness.sources[1]!
    expect(reversed.buffer).not.toBe(forwardProxy)
    expect(reversed.playbackRate.value).toBe(2)
    // Reversed timebase: 0.5 s from the end of a 2 s buffer.
    expect(reversed.started[0]!.offset).toBeCloseTo(1.5, 2)
    expect(harness.sources[0]!.stopped).toBe(true)
  })

  it('stays silent while the playhead is at rest', async () => {
    const harness = createHarness()
    const tape = createTimelineTapeSkimPreview({
      createAudioContext: () => harness.context as unknown as AudioContext,
    })
    const buffer = makeBuffer() as unknown as AudioBuffer

    await tape.scrub({ buffer, sliceStartTimeSeconds: 0, timeSeconds: 1, speed: 2 })
    await tape.scrub({ buffer, sliceStartTimeSeconds: 0, timeSeconds: 1.01, speed: 0 })

    expect(harness.sources).toHaveLength(1)
    expect(harness.sources[0]!.stopped).toBe(true)
  })
})
