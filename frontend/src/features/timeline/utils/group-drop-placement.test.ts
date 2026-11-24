import { describe, expect, it } from 'vite-plus/test'
import { resolveGroupDropDelta } from './group-drop-placement'

const videoTrack = 'v1'
const audioTrack = 'a1'

describe('resolveGroupDropDelta', () => {
  it('keeps the group where it was dropped when every half has room', () => {
    const delta = resolveGroupDropDelta(
      [
        { id: 'video', from: 100, durationInFrames: 100, trackId: videoTrack },
        { id: 'audio', from: 100, durationInFrames: 100, trackId: audioTrack },
      ],
      [],
    )
    expect(delta).toBe(0)
  })

  it('shifts the whole group when the picture would land on a text clip', () => {
    // Text occupies 14..100 on the video track; the audio track is empty.
    const delta = resolveGroupDropDelta(
      [
        { id: 'video', from: 76, durationInFrames: 122, trackId: videoTrack },
        { id: 'audio', from: 76, durationInFrames: 122, trackId: audioTrack },
      ],
      [{ trackId: videoTrack, from: 14, durationInFrames: 86 }],
    )
    expect(delta).toBe(24)
  })

  it('does not satisfy one half at the expense of the other', () => {
    // The video needs +24, the audio needs -76; a single shift cannot do both, so
    // the drop must be refused rather than leaving the picture over the text.
    const delta = resolveGroupDropDelta(
      [
        { id: 'video', from: 76, durationInFrames: 122, trackId: videoTrack },
        { id: 'audio', from: 300, durationInFrames: 122, trackId: audioTrack },
      ],
      [
        { trackId: videoTrack, from: 14, durationInFrames: 86 },
        { trackId: audioTrack, from: 340, durationInFrames: 400 },
      ],
    )
    expect(delta).toBeNull()
  })

  it('refuses a group with no room anywhere', () => {
    const delta = resolveGroupDropDelta(
      [{ id: 'video', from: 0, durationInFrames: 100, trackId: videoTrack }],
      [{ trackId: videoTrack, from: 0, durationInFrames: 10_000 }],
    )
    expect(delta).toBeNull()
  })
})
