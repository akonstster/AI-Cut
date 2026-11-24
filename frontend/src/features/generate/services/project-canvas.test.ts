import { describe, expect, it, vi } from 'vite-plus/test'
import { writeJsonAtomic } from '@/infrastructure/storage/workspace-fs/fs-primitives'
import { assignCanvasJob, loadProjectCanvas } from './project-canvas'

const root = vi.hoisted(() => ({ name: 'root' }) as unknown as FileSystemDirectoryHandle)

vi.mock('@/infrastructure/storage/workspace-fs/root', () => ({
  requireWorkspaceRoot: () => root,
}))
vi.mock('@/infrastructure/storage/workspace-fs/paths', () => ({
  projectDir: (id: string) => ['projects', id],
}))
vi.mock('@/infrastructure/storage/workspace-fs/fs-primitives', () => ({
  readJson: vi.fn(async () => ({
    nodes: [
      {
        id: 'gen-1',
        type: 'generate',
        position: { x: 0, y: 0 },
        data: { task: 'image', model: null, job: null },
      },
      {
        id: 'media-1',
        type: 'media',
        position: { x: 0, y: 320 },
        data: { ref: null, kind: 'image', name: '' },
      },
    ],
    edges: [],
  })),
  writeJsonAtomic: vi.fn(async () => undefined),
}))

describe('assignCanvasJob', () => {
  it('points the generate node at the job and saves the canvas', async () => {
    await assignCanvasJob('p1', 'gen-1', 'job-7')

    const canvas = await loadProjectCanvas('p1')
    const node = canvas.graph.nodes.find((each) => each.id === 'gen-1')
    expect(node?.type === 'generate' && node.data.job).toBe('job-7')
    expect(vi.mocked(writeJsonAtomic)).toHaveBeenCalledWith(
      root,
      ['projects', 'p1', 'node-canvas.json'],
      expect.objectContaining({ nodes: expect.any(Array) }),
    )
  })

  it('leaves other nodes and their canvas alone', async () => {
    await assignCanvasJob('p2', 'media-1', 'job-7')

    const canvas = await loadProjectCanvas('p2')
    expect(canvas.graph.nodes.find((each) => each.id === 'media-1')?.data).not.toHaveProperty('job')
    expect(vi.mocked(writeJsonAtomic)).not.toHaveBeenCalledWith(
      root,
      ['projects', 'p2', 'node-canvas.json'],
      expect.anything(),
    )
  })
})
