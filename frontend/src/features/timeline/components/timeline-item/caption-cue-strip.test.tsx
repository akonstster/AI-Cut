import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { render } from '@testing-library/react'
import type { TimelineItem } from '@/types/timeline'
import { useSettingsStore } from '@/features/timeline/deps/settings'
import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
import { useItemsStore } from '../../stores/items-store'
import { useCompositionsStore } from '../../stores/compositions-store'
import { useSequencesStore } from '../../stores/sequences-store'
import { setTimelineState } from '../../test-helpers'
import { useZoomStore, _resetZoomStoreForTest } from '../../stores/zoom-store'
import { useTimelineViewportStore } from '../../stores/timeline-viewport-store'
import { ClipContent } from './clip-content'

vi.mock('../clip-filmstrip', () => ({
  ClipFilmstrip: () => <div data-testid="clip-filmstrip" />,
}))

vi.mock('../clip-filmstrip/image-filmstrip', () => ({
  ImageFilmstrip: () => <div data-testid="image-filmstrip" />,
}))

vi.mock('../clip-waveform', () => ({
  ClipWaveform: () => <div data-testid="clip-waveform" />,
}))

vi.mock('../clip-waveform/compound-clip-waveform', () => ({
  CompoundClipWaveform: () => <div data-testid="compound-clip-waveform" />,
}))

function makeVideoItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'video-1',
    type: 'video',
    trackId: 'track-1',
    from: 90,
    durationInFrames: 122,
    label: 'Speaking clip',
    mediaId: 'media-1',
    src: 'blob:test',
    sourceStart: 0,
    sourceFps: 24,
    transcriptCaptions: {
      type: 'transcript',
      mediaId: 'media-1',
      enabled: true,
      updatedAt: 1,
      cues: [
        { id: 'cue-0', startSeconds: 0.16, endSeconds: 1.02, text: 'First line' },
        { id: 'cue-1', startSeconds: 1.38, endSeconds: 2.2, text: 'Edited line' },
      ],
    },
    ...overrides,
  } as TimelineItem
}

describe('CaptionCueStrip', () => {
  beforeEach(() => {
    setTimelineState({ fps: 30 })
    _resetZoomStoreForTest()
    useZoomStore.setState({
      level: 1,
      pixelsPerSecond: 100,
      contentLevel: 1,
      contentPixelsPerSecond: 100,
      isZoomInteracting: false,
    })
    useTimelineViewportStore.setState({
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 1920,
      viewportHeight: 400,
    })
    useSettingsStore.setState({
      showFilmstrips: false,
      enableFilmstripExtraction: false,
      showWaveforms: false,
    })
    useMediaLibraryStore.setState({
      mediaItems: [],
      mediaById: {},
      brokenMediaIds: [],
      selectedMediaIds: [],
      notification: null,
    })
    useItemsStore.getState().setItems([])
    useCompositionsStore.getState().setCompositions([])
    useSequencesStore.getState().reset()
  })

  it('draws the clip transcript cues inside a media clip', () => {
    const item = makeVideoItem()
    const { container } = render(
      <ClipContent item={item} clipLeftFrames={90} clipWidthFrames={122} fps={30} />,
    )

    const strip = container.querySelector('[data-caption-cues]')
    expect(strip).not.toBeNull()
    expect(strip?.textContent).toContain('Edited line')
  })

  it('keeps the strip when captions are disabled', () => {
    const item = makeVideoItem({
      transcriptCaptions: {
        type: 'transcript',
        mediaId: 'media-1',
        enabled: false,
        updatedAt: 1,
        cues: [{ id: 'cue-0', startSeconds: 0.16, endSeconds: 1.02, text: 'First line' }],
      },
    } as Partial<TimelineItem>)

    const { container } = render(
      <ClipContent item={item} clipLeftFrames={90} clipWidthFrames={122} fps={30} />,
    )

    expect(container.querySelector('[data-caption-cues]')).toBeNull()
  })

  it('draws the strip on a subtitle segment at any width', () => {
    const item = {
      id: 'subtitle-1',
      type: 'subtitle',
      trackId: 'track-1',
      from: 0,
      durationInFrames: 90,
      label: 'Transcript',
      cues: [{ id: 'cue-0', startSeconds: 0.5, endSeconds: 2, text: 'Segment line' }],
    } as TimelineItem

    const { container } = render(
      <ClipContent item={item} clipLeftFrames={0} clipWidthFrames={90} fps={30} />,
    )

    const strip = container.querySelector('[data-caption-cues]')
    expect(strip).not.toBeNull()
    expect(strip?.textContent).toContain('Segment line')
  })

  it('draws the strip at the zoomed-out level of the real project', () => {
    useZoomStore.setState({
      level: 0.1405,
      pixelsPerSecond: 14.05,
      contentLevel: 0.1405,
      contentPixelsPerSecond: 14.05,
      isZoomInteracting: false,
    })
    const item = makeVideoItem()
    const { container } = render(
      <ClipContent item={item} clipLeftFrames={90} clipWidthFrames={122} fps={30} />,
    )

    expect(container.querySelector('[data-caption-cues]')).not.toBeNull()
  })

  it('draws the strip when the clip leaves the promoted detail range', () => {
    const item = makeVideoItem()
    const { container } = render(
      <ClipContent
        item={item}
        clipLeftFrames={90}
        clipWidthFrames={122}
        fps={30}
        isDetailEligible={false}
      />,
    )

    expect(container.querySelector('[data-caption-cues]')).not.toBeNull()
  })

  it('draws a video/audio pair once, on the video half', () => {
    const video = makeVideoItem()
    const audio = makeVideoItem({ id: 'audio-1', type: 'audio', trackId: 'track-a1' })
    useItemsStore.getState().setItems([video, audio])

    const videoView = render(
      <ClipContent item={video} clipLeftFrames={90} clipWidthFrames={122} fps={30} />,
    )
    expect(videoView.container.querySelector('[data-caption-cues]')).not.toBeNull()
    videoView.unmount()

    const audioView = render(
      <ClipContent item={audio} clipLeftFrames={90} clipWidthFrames={122} fps={30} />,
    )
    expect(audioView.container.querySelector('[data-caption-cues]')).toBeNull()
  })

  it('still draws the audio captions when the clip has no video half', () => {
    const audio = makeVideoItem({ id: 'audio-1', type: 'audio', trackId: 'track-a1' })
    useItemsStore.getState().setItems([audio])

    const { container } = render(
      <ClipContent item={audio} clipLeftFrames={90} clipWidthFrames={122} fps={30} />,
    )

    expect(container.querySelector('[data-caption-cues]')).not.toBeNull()
  })

  it('draws the strip on a compact clip', () => {
    const item = makeVideoItem()
    const { container } = render(
      <ClipContent
        item={item}
        clipLeftFrames={90}
        clipWidthFrames={122}
        fps={30}
        isCompactWidth={true}
      />,
    )

    expect(container.querySelector('[data-caption-cues]')).not.toBeNull()
  })
})
