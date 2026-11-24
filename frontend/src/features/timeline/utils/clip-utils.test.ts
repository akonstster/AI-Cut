import { describe, expect, it } from 'vite-plus/test'
import { getJoinableSelection } from './clip-utils'
import { makeTimelineAudioItem, makeTimelineVideoItem } from '../test-helpers'

/** Two halves of one split video clip on V1, and the linked audio pair on A1. */
function makeSplitPair() {
  const videoLeft = makeTimelineVideoItem({
    id: 'video-left',
    trackId: 'track-v1',
    originId: 'origin-video',
    from: 0,
    durationInFrames: 30,
    sourceStart: 0,
    sourceEnd: 30,
  })
  const videoRight = makeTimelineVideoItem({
    id: 'video-right',
    trackId: 'track-v1',
    originId: 'origin-video',
    from: 30,
    durationInFrames: 30,
    sourceStart: 30,
    sourceEnd: 60,
  })
  const audioLeft = makeTimelineAudioItem({
    id: 'audio-left',
    trackId: 'track-a1',
    originId: 'origin-audio',
    from: 0,
    durationInFrames: 30,
    sourceStart: 0,
    sourceEnd: 30,
  })
  const audioRight = makeTimelineAudioItem({
    id: 'audio-right',
    trackId: 'track-a1',
    originId: 'origin-audio',
    from: 30,
    durationInFrames: 30,
    sourceStart: 30,
    sourceEnd: 60,
  })
  return { videoLeft, videoRight, audioLeft, audioRight }
}

describe('getJoinableSelection', () => {
  it('returns the two halves of a split clip', () => {
    const { videoLeft, videoRight, audioLeft, audioRight } = makeSplitPair()

    const joinable = getJoinableSelection([videoLeft, videoRight], ['video-left', 'video-right'])

    expect(joinable?.map((item) => item.id)).toEqual(['video-left', 'video-right'])
    // Unselected clips do not count.
    expect(getJoinableSelection([videoLeft, audioLeft, audioRight], ['video-left'])).toBeNull()
  })

  it('joins a linked pair per track instead of rejecting the whole selection', () => {
    const { videoLeft, videoRight, audioLeft, audioRight } = makeSplitPair()
    const items = [videoLeft, videoRight, audioLeft, audioRight]

    const joinable = getJoinableSelection(items, [
      'video-left',
      'video-right',
      'audio-left',
      'audio-right',
    ])

    expect(joinable).toHaveLength(2)
    expect(new Set(joinable!.map((item) => item.trackId)).size).toBe(1)
  })

  it('refuses clips that did not come from one cut', () => {
    const { videoLeft, audioRight } = makeSplitPair()
    const other = makeTimelineVideoItem({
      id: 'other',
      trackId: 'track-v1',
      originId: 'origin-other',
      from: 30,
      sourceStart: 0,
      sourceEnd: 30,
    })

    expect(getJoinableSelection([videoLeft, other], ['video-left', 'other'])).toBeNull()
    expect(getJoinableSelection([videoLeft, audioRight], ['video-left', 'audio-right'])).toBeNull()
  })
})
