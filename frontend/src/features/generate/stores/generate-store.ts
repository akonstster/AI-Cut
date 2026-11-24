/**
 * State of the generation panel: the chosen task, the model chosen for each
 * task, what was typed into each model's form, the jobs of the open project
 * and which providers have keys. Choices survive a restart in localStorage;
 * jobs and keys are the server's and are read from it.
 */

import type { PromptElement } from '../services/prompt-elements'
import type { PrevisScene } from '../services/previs-scene'
import { retimeShots, type Shot, type Storyboard } from '../services/storyboard'
import { create } from 'zustand'
import type { Job, MediaRef, ModelForm, Provider, Role, Task } from '../services/generate-api'
import {
  readProjectGeneration,
  reportGenerationPersistenceError,
  writeProjectGeneration,
} from '../services/project-generation'
import { getProjectsUsingMedia } from '@/infrastructure/storage/workspace-fs/project-media'

const STORAGE_KEY = 'AI-Cut-generate'

export interface ModelRef {
  provider: Provider
  id: string
}

interface MotionClip {
  projectId: string
  mediaId?: string
  name: string
  html: string
  seconds: number
}

interface Blocking {
  description: string
  scene: PrevisScene | null
}

export interface PendingUse {
  task: Task
  roles: Role[]
  ref: MediaRef
}

interface Persisted {
  legacyElements: PromptElement[]
  blockings: Record<string, Blocking>
  motionClips: MotionClip[]
  task: Task
  modelByTask: Partial<Record<Task, ModelRef>>
  valuesByModel: Record<string, Record<string, unknown>>
  repeat: number
  placeOnTimeline: boolean
  storyboards: Record<string, Storyboard>
  storyboardModels: { image?: ModelRef; video?: ModelRef }
}

export interface ProjectGeneration {
  task: Task
  modelByTask: Persisted['modelByTask']
  valuesByModel: Persisted['valuesByModel']
  repeat: number
  placeOnTimeline: boolean
  storyboard?: Storyboard
  storyboardModels: Persisted['storyboardModels']
  blocking?: Blocking
  motionClips: MotionClip[]
  motionDraft?: { html: string; seconds: number }
  archivedJobs?: Job[]
}

const EMPTY_PROJECT: ProjectGeneration = {
  task: 'image',
  modelByTask: {},
  valuesByModel: {},
  repeat: 1,
  placeOnTimeline: false,
  storyboardModels: {},
  motionClips: [],
}

function load(): Persisted {
  const fallback: Persisted = {
    task: 'image',
    modelByTask: {},
    valuesByModel: {},
    repeat: 1,
    placeOnTimeline: false,
    storyboards: {},
    storyboardModels: {},
    motionClips: [],
    blockings: {},
    legacyElements: [],
  }
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (!text) return fallback
    const { elements, ...state } = JSON.parse(text) as Partial<Persisted> & {
      elements?: PromptElement[]
    }
    return { ...fallback, ...state, legacyElements: state.legacyElements ?? elements ?? [] }
  } catch {
    return fallback
  }
}

function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // a page without storage keeps its choices for this session only
  }
}

export function modelKey(provider: Provider, id: string): string {
  return `${provider}:${id}`
}

interface GenerateState extends Persisted {
  motionDraft?: ProjectGeneration['motionDraft']
  archivedJobs?: Job[]
  generationProjectId: string | null
  generationProjectReady: boolean
  generationPersistenceError: string | null
  activateProject: (id: string | null) => Promise<void>
  jobs: Job[]
  keys: Partial<Record<Provider, boolean>>
  forms: Record<string, ModelForm>
  /** Why the panel could not reach the server, shown above everything else. */
  serverError: string | null
  setServerError: (message: string | null) => void
  setTask: (task: Task) => void
  setModel: (task: Task, model: ModelRef) => void
  setValue: (model: ModelRef, key: string, value: unknown) => void
  replaceValues: (model: ModelRef, values: Record<string, unknown>) => void
  setRepeat: (repeat: number) => void
  setPlaceOnTimeline: (place: boolean) => void
  setStoryboard: (projectId: string, storyboard: Storyboard) => void
  workflowFocus?: { projectId: string; shotId: string }
  blockingShot?: { projectId: string; shotId: string }
  updateShot: (projectId: string, id: string, change: Partial<Shot>) => void
  setStoryboardModel: (kind: 'image' | 'video', model: ModelRef) => void
  keepMotion: (clip: MotionClip) => void
  setMotionDraft: (draft: NonNullable<ProjectGeneration['motionDraft']>) => void
  likeArchivedJob: (id: string, liked: boolean) => void
  pendingUse: PendingUse | null
  useAs: (input: PendingUse | null) => void
  setBlocking: (projectId: string, blocking: Blocking) => void
  forgetLegacyElements: (elements: PromptElement[]) => void
  setJobs: (jobs: Job[]) => void
  upsertJob: (job: Job) => void
  removeJob: (id: string) => void
  setKeys: (keys: Partial<Record<Provider, boolean>>) => void
  setForm: (form: ModelForm) => void
}

let activation = 0
const legacy = load()

export async function legacyProjectGeneration(id: string): Promise<ProjectGeneration> {
  const lookups = new Map<string, Promise<string[]>>()
  const entries = await Promise.all(
    Object.entries(legacy.valuesByModel).map(async ([model, values]) => {
      const refs = Object.values(values)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter(
          (value): value is { media: string } =>
            !!value && typeof value === 'object' && typeof value.media === 'string',
        )
      let owners: string[] | undefined
      for (const { media } of refs) {
        let lookup = lookups.get(media)
        if (!lookup) {
          lookup = getProjectsUsingMedia(media)
          lookups.set(media, lookup)
        }
        const projects = await lookup
        owners = owners ? owners.filter((project) => projects.includes(project)) : projects
        if (!owners.includes(id)) break
      }
      return owners?.length === 1 && owners[0] === id ? [[model, values] as const] : []
    }),
  )
  const valuesByModel = Object.fromEntries(entries.flat())
  const hasOwnedDraft = Object.keys(valuesByModel).length > 0
  return {
    ...EMPTY_PROJECT,
    ...(hasOwnedDraft
      ? {
          task: legacy.task,
          repeat: legacy.repeat,
          placeOnTimeline: legacy.placeOnTimeline,
          modelByTask: legacy.modelByTask,
          valuesByModel,
        }
      : {}),
    storyboard: legacy.storyboards[id],
    storyboardModels: legacy.storyboards[id] ? legacy.storyboardModels : {},
    blocking: legacy.blockings[id],
    motionClips: legacy.motionClips.filter((clip) => clip.projectId === id),
  }
}

export const useGenerateStore = create<GenerateState>()((set, get) => {
  const saveProject = (id = get().generationProjectId) => {
    const state = get()
    if (!id || id !== state.generationProjectId || !state.generationProjectReady) return
    void writeProjectGeneration(id, {
      task: state.task,
      modelByTask: state.modelByTask,
      valuesByModel: state.valuesByModel,
      repeat: state.repeat,
      placeOnTimeline: state.placeOnTimeline,
      storyboard: state.storyboards[id],
      storyboardModels: state.storyboardModels,
      blocking: state.blockings[id],
      motionClips: state.motionClips,
      motionDraft: state.motionDraft,
      archivedJobs: state.archivedJobs,
    }).catch((error: unknown) => {
      const message = reportGenerationPersistenceError(error)
      if (get().generationProjectId === id) set({ generationPersistenceError: message })
    })
  }
  return {
    ...legacy,
    ...EMPTY_PROJECT,
    storyboards: {},
    blockings: {},
    generationProjectId: null,
    generationProjectReady: false,
    generationPersistenceError: null,
    activateProject: async (id) => {
      if (id === get().generationProjectId && get().generationProjectReady) return
      const version = ++activation
      set({
        ...EMPTY_PROJECT,
        motionDraft: undefined,
        archivedJobs: undefined,
        storyboards: {},
        blockings: {},
        pendingUse: null,
        generationProjectId: id,
        generationProjectReady: false,
        generationPersistenceError: null,
      })
      if (!id) return
      try {
        const saved = await readProjectGeneration(id)
        const snapshot = saved ?? (await legacyProjectGeneration(id))
        if (version !== activation) return
        const { storyboard, blocking, ...fields } = snapshot
        set({
          ...fields,
          storyboards: storyboard ? { [id]: storyboard } : {},
          blockings: blocking ? { [id]: blocking } : {},
          generationProjectReady: true,
        })
        if (!saved) saveProject(id)
      } catch (error) {
        const message = reportGenerationPersistenceError(error)
        if (version === activation) set({ generationPersistenceError: message })
      }
    },
    jobs: [],
    keys: {},
    forms: {},
    serverError: null,
    setServerError: (serverError) => set({ serverError }),
    setTask: (task) => {
      set({ task })
      saveProject()
    },
    setModel: (task, model) => {
      set({ modelByTask: { ...get().modelByTask, [task]: model } })
      saveProject()
    },
    setValue: (model, key, value) => {
      const id = modelKey(model.provider, model.id)
      const current = get().valuesByModel[id] ?? {}
      const next = { ...current }
      if (
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      ) {
        delete next[key]
      } else {
        next[key] = value
      }
      set({ valuesByModel: { ...get().valuesByModel, [id]: next } })
      saveProject()
    },
    replaceValues: (model, values) => {
      set({
        valuesByModel: { ...get().valuesByModel, [modelKey(model.provider, model.id)]: values },
      })
      saveProject()
    },
    setRepeat: (repeat) => {
      set({ repeat: Math.min(8, Math.max(1, Math.round(repeat))) })
      saveProject()
    },
    setStoryboard: (projectId, storyboard) => {
      if (get().generationProjectId !== projectId || !get().generationProjectReady) return
      set({
        storyboards: {
          ...get().storyboards,
          [projectId]: storyboard.shots.some((shot) => shot.startSeconds === undefined)
            ? { ...storyboard, shots: retimeShots(storyboard.shots) }
            : storyboard,
        },
      })
      saveProject(projectId)
    },
    updateShot: (projectId, id, change) => {
      const board = get().storyboards[projectId]
      if (!board) return
      const shots = board.shots.map((shot) => (shot.id === id ? { ...shot, ...change, id } : shot))
      get().setStoryboard(projectId, {
        ...board,
        shots:
          change.seconds === undefined
            ? shots
            : retimeShots(shots, board.shots[0]?.startSeconds ?? 0),
      })
    },
    setStoryboardModel: (kind, model) => {
      set({ storyboardModels: { ...get().storyboardModels, [kind]: model } })
      saveProject()
    },
    keepMotion: (clip) => {
      if (get().generationProjectId !== clip.projectId || !get().generationProjectReady) return
      set({ motionClips: [...get().motionClips, clip] })
      saveProject(clip.projectId)
    },
    setMotionDraft: (motionDraft) => {
      set({ motionDraft })
      saveProject()
    },
    likeArchivedJob: (id, liked) => {
      set({
        archivedJobs: get().archivedJobs?.map((job) => (job.id === id ? { ...job, liked } : job)),
      })
      saveProject()
    },
    forgetLegacyElements: (elements) => {
      set({ legacyElements: get().legacyElements.filter((element) => !elements.includes(element)) })
      legacy.legacyElements = get().legacyElements
      save(legacy)
    },
    pendingUse: null,
    useAs: (pendingUse) => {
      if (pendingUse) {
        set({ pendingUse, task: pendingUse.task })
        saveProject()
      } else {
        set({ pendingUse })
      }
    },
    setBlocking: (projectId, blocking) => {
      if (get().generationProjectId !== projectId || !get().generationProjectReady) return
      set({ blockings: { ...get().blockings, [projectId]: blocking } })
      saveProject(projectId)
    },
    setPlaceOnTimeline: (placeOnTimeline) => {
      set({ placeOnTimeline })
      saveProject()
    },
    setJobs: (jobs) => set({ jobs }),
    upsertJob: (job) => {
      const jobs = get().jobs
      const index = jobs.findIndex((each) => each.id === job.id)
      if (index === -1) {
        set({ jobs: [job, ...jobs] })
      } else if (jobs[index]!.updated <= job.updated) {
        const next = jobs.slice()
        next[index] = job
        set({ jobs: next })
      }
    },
    removeJob: (id) => set({ jobs: get().jobs.filter((job) => job.id !== id) }),
    setKeys: (keys) => set({ keys }),
    setForm: (form) => set({ forms: { ...get().forms, [modelKey(form.provider, form.id)]: form } }),
  }
})
