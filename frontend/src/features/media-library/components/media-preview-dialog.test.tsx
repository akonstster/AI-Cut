import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { MediaMetadata } from '@/types/storage'
import { MediaPreviewDialog } from './media-preview-dialog'

vi.mock('../utils/media-resolver', () => ({
  resolveMediaUrl: async () => 'blob:original',
  resolveProxyUrl: () => 'blob:proxy',
}))

describe('MediaPreviewDialog', () => {
  it('opens the original image and handles Escape', async () => {
    const onClose = vi.fn()
    const media = { id: 'photo', mimeType: 'image/png', fileName: 'photo.png' } as MediaMetadata
    render(<MediaPreviewDialog media={media} onClose={onClose} />)
    const image = await screen.findByRole('img', { name: 'photo.png' })
    expect(image.getAttribute('src')).toBe('blob:original')
    fireEvent.keyDown(image, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('offers video playback controls and retries with the available proxy', async () => {
    const media = { id: 'video', mimeType: 'video/mp4', fileName: 'video.mp4' } as MediaMetadata
    render(<MediaPreviewDialog media={media} onClose={vi.fn()} />)
    const video = await screen.findByLabelText('video.mp4', { selector: 'video' })
    expect(video.hasAttribute('controls')).toBe(true)
    expect(video.getAttribute('src')).toBe('blob:original')
    fireEvent.error(video)
    expect((await screen.findByLabelText('video.mp4', { selector: 'video' })).getAttribute('src')).toBe('blob:proxy')
  })
})
