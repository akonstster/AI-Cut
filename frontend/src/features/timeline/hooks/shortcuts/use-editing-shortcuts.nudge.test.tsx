import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { useSelectionStore } from '@/shared/state/selection'
import { usePlaybackStore } from '@/shared/state/playback'
import { useEditorStore } from '@/shared/state/editor'
import { useItemsStore } from '../../stores/items-store'
import { makeTimelineTrack, makeTimelineVideoItem, setTimelineState } from '../../test-helpers'
import { useEditingShortcuts } from './use-editing-shortcuts'

const TRACK = makeTimelineTrack({ id: 'track-1', name: 'V1', order: 0 })

function ShortcutHarness() {
  useEditingShortcuts({})
  return null
}

describe('useEditingShortcuts nudge hotkeys', () => {
  beforeEach(() => {
    useItemsStore.setState({ items: [], tracks: [] })
    useSelectionStore.setState({ selectedItemIds: [], selectionType: null })
    useEditorStore.setState({
      keyframeEditorShortcutScopeActive: false,
      transcriptEditorShortcutScopeActive: false,
    })
    usePlaybackStore.setState({ currentFrame: 0, previewFrame: null, previewItemId: null })
    setTimelineState({
      tracks: [TRACK],
      items: [makeTimelineVideoItem({ id: 'clip-1', trackId: 'track-1' })],
    })
  })

  it('nudges the selection with the real Shift+Arrow binding, again and again', async () => {
    // The editor mounts before anything is selected, so the handler must see the fresh
    // selection after the store update rather than the empty one captured at mount.
    render(<ShortcutHarness />)

    act(() => {
      useSelectionStore.setState({ selectedItemIds: ['clip-1'], selectionType: 'item' })
    })

    fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true })

    expect(useItemsStore.getState().items[0]?.transform).toMatchObject({ x: 1, y: 0 })

    fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true })

    expect(useItemsStore.getState().items[0]?.transform).toMatchObject({ x: 2, y: 0 })
  })
})
