/**
 * Scrub proxy: the audio skimming engines never need full-band stereo.
 *
 * A 12 kHz mono copy is a quarter of the data of a 48 kHz stereo one and is
 * indistinguishable while scrubbing at 0.25–4×. Building it once per decoded
 * slice keeps tape-style playback cheap enough to follow the pointer.
 */

export const SCRUB_PROXY_SAMPLE_RATE = 12000

/** Average all channels into one, so the proxy is a single array. */
export function mixChannelsToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0)
  if (channels.length === 1) return channels[0]!
  const length = channels[0]!.length
  const mono = new Float32Array(length)
  for (let channel = 0; channel < channels.length; channel += 1) {
    const samples = channels[channel]!
    for (let index = 0; index < length; index += 1) {
      mono[index] = mono[index]! + samples[index]! / channels.length
    }
  }
  return mono
}

/** Linear resampling; enough for a scrub proxy, and cheap. */
export function resampleMonoLinear(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (samples.length === 0 || fromRate <= 0 || toRate <= 0 || fromRate === toRate) {
    return samples
  }
  const ratio = toRate / fromRate
  const length = Math.max(1, Math.floor(samples.length * ratio))
  const out = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const source = index / ratio
    const lower = Math.floor(source)
    const upper = Math.min(samples.length - 1, lower + 1)
    const fraction = source - lower
    out[index] = samples[lower]! * (1 - fraction) + samples[upper]! * fraction
  }
  return out
}

/** Mono, low-rate copy of a buffer, built for one playback buffer. */
export function buildScrubProxySamples(
  buffer: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'sampleRate' | 'getChannelData'>,
  targetRate = SCRUB_PROXY_SAMPLE_RATE,
): Float32Array {
  const channels: Float32Array[] = []
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    // `getChannelData` returns the live array; copying is not needed because the
    // proxy is only read here.
    channels.push(buffer.getChannelData(channel))
  }
  return resampleMonoLinear(mixChannelsToMono(channels), buffer.sampleRate, targetRate)
}
