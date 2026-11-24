// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { useGenerateStore } from '../stores/generate-store'
import { loadProjectElements, removeProjectElement, saveProjectElement } from './project-elements'
import { readProjectGeneration } from './project-generation'
import { collectProjectGeneration, restoreProjectGeneration } from './project-generation-transfer'
import { loadProjectCanvas } from './project-canvas'

const fs = vi.hoisted(() => ({
  root: {},
  files: new Map<string, unknown>(),
  owners: new Map<string, string[]>(),
  write: vi.fn(),
}))

vi.mock('@/infrastructure/storage/workspace-fs/root', () => ({
  requireWorkspaceRoot: () => fs.root,
}))
vi.mock('@/infrastructure/storage/workspace-fs/fs-primitives', () => ({
  readJson: async (_root: unknown, path: string[]) => fs.files.get(path.join('/')) ?? null,
  writeJsonAtomic: fs.write,
}))
vi.mock('@/infrastructure/storage/workspace-fs/project-media', () => ({
  getProjectsUsingMedia: async (id: string) => fs.owners.get(id) ?? [],
}))
vi.mock('./generate-api', () => ({ generateApi: { jobs: async () => ({ jobs: [] }) } }))

const cup = { name: 'cup', refs: [{ media: 'cup-image' }] }
const otherCup = { name: 'cup', refs: [{ media: 'other-image' }] }

beforeEach(() => {
  fs.root = {}
  fs.files.clear()
  fs.owners.clear()
  fs.write.mockReset()
  fs.write.mockImplementation(async (_root, path: string[], value) => {
    fs.files.set(path.join('/'), value)
  })
  useGenerateStore.setState({ legacyElements: [] })
})

it('keeps generation drafts isolated and remaps copied storyboard, canvas and elements', async () => {
  const store = useGenerateStore.getState()
  const model = { provider: 'openrouter', id: 'test' } as const
  await store.activateProject('one')
  store.setValue(model, 'prompt', 'Only this project')
  store.setValue(model, 'references', [{ media: 'old' }])
  store.setStoryboard('one', {
    script: 'A script',
    shots: [
      {
        id: 'shot',
        prompt: 'A scene',
        seconds: 2,
        imageJob: null,
        videoJob: null,
        frameMediaId: 'old',
      },
    ],
  })
  store.setMotionDraft({ html: '<p>Title</p>', seconds: 3 })
  await saveProjectElement('one', { name: 'actor', refs: [{ media: 'old' }] })
  const canvas = await loadProjectCanvas('one')
  canvas.graph = {
    nodes: [
      {
        type: 'media',
        id: 'ref',
        position: { x: 0, y: 0 },
        data: { name: 'Actor', kind: 'image', ref: { media: 'old' } },
      },
    ],
    edges: [],
  }

  await store.activateProject('two')
  expect(useGenerateStore.getState().valuesByModel).toEqual({})
  expect(useGenerateStore.getState().storyboards).toEqual({})
  await restoreProjectGeneration(
    'three',
    await collectProjectGeneration('one'),
    new Map([['old', 'new']]),
  )

  expect((await readProjectGeneration('three'))?.storyboard?.shots[0]?.frameMediaId).toBe('new')
  expect((await readProjectGeneration('three'))?.motionDraft?.html).toBe('<p>Title</p>')
  expect((await loadProjectElements('three')).elements[0]?.refs).toEqual([{ media: 'new' }])
  expect((await loadProjectCanvas('three')).graph.nodes[0]?.data).toMatchObject({
    ref: { media: 'new' },
  })
  await store.activateProject('three')
  expect(useGenerateStore.getState().valuesByModel['openrouter:test']).toEqual({
    prompt: 'Only this project',
    references: [{ media: 'new' }],
  })
  await store.activateProject(null)
})

describe('project elements', () => {
  it('saves identical names separately and deletes only from the selected project', async () => {
    await Promise.all([saveProjectElement('one', cup), saveProjectElement('two', otherCup)])
    expect((await loadProjectElements('one')).elements).toEqual([cup])
    expect((await loadProjectElements('two')).elements).toEqual([otherCup])

    await removeProjectElement('one', 'CUP')
    fs.root = {}
    expect((await loadProjectElements('one')).elements).toEqual([])
    expect((await loadProjectElements('two')).elements).toEqual([otherCup])
  })

  it('recovers old references only when all pictures identify one project', async () => {
    fs.owners.set('cup-image', ['one'])
    fs.owners.set('other-image', ['one', 'two'])
    useGenerateStore.setState({ legacyElements: [cup, otherCup] })

    expect((await loadProjectElements('two')).elements).toEqual([])
    expect((await loadProjectElements('one')).elements).toEqual([cup])
    expect(useGenerateStore.getState().legacyElements).toEqual([otherCup])
  })

  it('preserves saved elements on write failure and allows the next edit', async () => {
    await saveProjectElement('one', cup)
    fs.write.mockRejectedValueOnce(new Error('disk error'))
    await expect(removeProjectElement('one', 'cup')).rejects.toThrow('disk error')
    expect((await loadProjectElements('one')).elements).toEqual([cup])
    await removeProjectElement('one', 'cup')
    expect((await loadProjectElements('one')).elements).toEqual([])
  })
})
