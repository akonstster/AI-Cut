import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { useEditorStore } from '@/shared/state/editor'
import { useSettingsStore } from '../deps/settings-contract'
import { useGenerateStore } from '../stores/generate-store'
import { assignCanvasJob } from './project-canvas'
import {
  claimReviewReturn,
  forgetReviewReturn,
  holdGenerationForReview,
  peekReviewReturn,
  returnReviewedResult,
} from './generation-review'

vi.mock('./project-canvas', () => ({ assignCanvasJob: vi.fn(async () => undefined) }))
vi.mock('./project-generation', () => ({
  readProjectGeneration: vi.fn(async () => null),
  writeProjectGeneration: vi.fn(async () => undefined),
  reportGenerationPersistenceError: vi.fn(() => 'storage is off'),
}))

const SHOT_RETURN = {
  to: 'shot' as const,
  projectId: 'p1',
  shotId: 'shot-1',
  kind: 'image' as const,
}

const REQUEST = {
  task: 'image' as const,
  provider: 'fal' as const,
  model: 'model-x',
  values: { prompt: 'a cat on a windowsill', seed: 7 },
  placeOnTimeline: true,
  returnTo: SHOT_RETURN,
}

describe('holdGenerationForReview', () => {
  beforeEach(() => {
    forgetReviewReturn()
    vi.mocked(assignCanvasJob).mockClear()
    useSettingsStore.setState({ generationReviewMode: false })
    useGenerateStore.setState({
      task: 'video',
      modelByTask: {},
      valuesByModel: {},
      placeOnTimeline: false,
      generationProjectId: 'p1',
      generationProjectReady: true,
      storyboards: {
        p1: {
          script: '',
          shots: [{ id: 'shot-1', prompt: 'a street', seconds: 4, imageJob: null, videoJob: null }],
        },
      },
    })
    useEditorStore.setState({ workspace: 'motion', activeTab: 'media' })
  })

  it('lets the caller send when review mode is off', () => {
    expect(holdGenerationForReview(REQUEST)).toBe(false)
    expect(useGenerateStore.getState().valuesByModel).toEqual({})
    expect(useEditorStore.getState().activeTab).toBe('media')
    expect(claimReviewReturn(REQUEST)).toBeNull()
  })

  it('fills the Generate panel and holds the request when review mode is on', () => {
    useSettingsStore.setState({ generationReviewMode: true })

    expect(holdGenerationForReview(REQUEST)).toBe(true)

    const store = useGenerateStore.getState()
    expect(store.task).toBe('image')
    expect(store.modelByTask.image).toEqual({ provider: 'fal', id: 'model-x' })
    expect(store.valuesByModel['fal:model-x']).toEqual(REQUEST.values)
    expect(store.placeOnTimeline).toBe(true)

    const editor = useEditorStore.getState()
    // The rail hosting the Generate panel stays as it is: Edit, Motion and Canvas all show it.
    expect(editor.workspace).toBe('motion')
    expect(editor.activeTab).toBe('generate')
  })

  it('leaves the Color workspace, whose rail is replaced by grading panels', () => {
    useSettingsStore.setState({ generationReviewMode: true })
    useEditorStore.setState({ workspace: 'color', activeTab: 'effects' })

    expect(holdGenerationForReview(REQUEST)).toBe(true)

    const editor = useEditorStore.getState()
    expect(editor.workspace).toBe('edit')
    expect(editor.activeTab).toBe('generate')
  })

  it('remembers the shot that waits for the result and hands it back once', () => {
    useSettingsStore.setState({ generationReviewMode: true })
    holdGenerationForReview(REQUEST)

    // The panel reads the planned second before sending without taking the return.
    expect(peekReviewReturn({ provider: 'fal', model: 'model-x' })).toEqual(SHOT_RETURN)
    expect(peekReviewReturn({ provider: 'fal', model: 'model-x' })).toEqual(SHOT_RETURN)
    expect(claimReviewReturn({ provider: 'fal', model: 'model-x' })).toEqual(SHOT_RETURN)
    // Only one press of Generate carries the return; a second job is an ordinary one.
    expect(claimReviewReturn({ provider: 'fal', model: 'model-x' })).toBeNull()
  })

  it('leaves the result in the history when the reviewed model was changed', () => {
    useSettingsStore.setState({ generationReviewMode: true })
    holdGenerationForReview(REQUEST)

    expect(claimReviewReturn({ provider: 'fal', model: 'other-model' })).toBeNull()
    expect(claimReviewReturn({ provider: 'fal', model: 'model-x' })).toBeNull()
  })

  it('points the waiting shot at the reviewed job', async () => {
    await returnReviewedResult(SHOT_RETURN, 'job-9')

    const shot = useGenerateStore.getState().storyboards.p1?.shots[0]
    expect(shot?.imageJob).toBe('job-9')
    expect(assignCanvasJob).not.toHaveBeenCalled()
  })

  it('points the waiting canvas node at the reviewed job', async () => {
    await returnReviewedResult({ to: 'canvas', projectId: 'p1', nodeId: 'node-3' }, 'job-9')

    expect(assignCanvasJob).toHaveBeenCalledWith('p1', 'node-3', 'job-9')
  })

  it('keeps the sent job when the canvas cannot be written', async () => {
    vi.mocked(assignCanvasJob).mockRejectedValueOnce(new Error('the disk is full'))

    await expect(
      returnReviewedResult({ to: 'canvas', projectId: 'p1', nodeId: 'node-3' }, 'job-9'),
    ).resolves.toBeUndefined()
  })
})
