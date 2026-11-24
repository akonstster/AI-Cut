import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { useRenderQueueStore, type RenderJob } from '../stores/render-queue-store'
import { RenderQueueList } from './render-queue-panel'

const revealOnDisk = vi.fn(async (_path: string) => {})
const openOnDisk = vi.fn(async (_path: string) => {})

vi.mock('@/infrastructure/desktop', () => ({
  isDesktop: async () => true,
  revealOnDisk: (path: string) => revealOnDisk(path),
  openOnDisk: (path: string) => openOnDisk(path),
}))

vi.mock('@/infrastructure/desktop/media-path', () => ({
  workspaceAbsolutePath: async (relative: string | string[]) =>
    `C:\\ws\\${Array.isArray(relative) ? relative.join('\\') : relative.replaceAll('/', '\\')}`,
}))

function completedJob(patch: Partial<RenderJob> = {}): RenderJob {
  return {
    id: 'job-1',
    name: 'Clip',
    status: 'completed',
    progress: 100,
    inPoint: null,
    outPoint: null,
    durationFrames: 120,
    exportMode: 'video',
    clientSettings: {
      container: 'mp4',
      resolution: { width: 1920, height: 1080 },
    } as RenderJob['clientSettings'],
    snapshot: {
      tracks: [],
      items: [],
      transitions: [],
      keyframes: [],
      fps: 30,
      width: 1920,
      height: 1080,
    },
    fileName: 'Clip.mp4',
    savedPath: 'projects/p1/exports/Clip.mp4',
    fileSize: 1024,
    createdAt: Date.now(),
    ...patch,
  }
}

describe('RenderQueueList', () => {
  beforeEach(() => {
    revealOnDisk.mockClear()
    openOnDisk.mockClear()
    useRenderQueueStore.setState({ jobs: [], isPaused: false, activeJobId: null })
  })

  it('opens a finished file or its folder instead of downloading it', async () => {
    useRenderQueueStore.getState().hydrate([completedJob()], false)

    await act(async () => {
      render(<RenderQueueList />)
    })

    const openFolder = await screen.findByLabelText('Open folder')
    expect(screen.queryByLabelText('Download')).not.toBeInTheDocument()

    await userEvent.click(openFolder)
    await waitFor(() =>
      expect(revealOnDisk).toHaveBeenCalledWith('C:\\ws\\projects\\p1\\exports\\Clip.mp4'),
    )

    await userEvent.click(screen.getByLabelText('Open'))
    await waitFor(() => expect(openOnDisk).toHaveBeenCalledTimes(1))
  })

  it('offers nothing to open while the job has no saved file', async () => {
    useRenderQueueStore
      .getState()
      .hydrate([completedJob({ status: 'queued', savedPath: undefined })], false)

    await act(async () => {
      render(<RenderQueueList />)
    })

    expect(screen.queryByLabelText('Open folder')).not.toBeInTheDocument()
  })
})
