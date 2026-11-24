/**
 * The editor's commands for an agent: what is open, the live timeline and its edits (each an undoable step of
 * the editor), the media library of the open project, the playhead and the sidebar. Registered once at
 * start; a command that needs an open project says so when none is.
 */

import { i18n } from '@/i18n'
import { applyEditOpsLive } from '@/headless/edit'
import type { EditOp } from '@/headless/edit-op-support'
import { setEditCanvas } from '@/headless/edit-op-support'
import { useEditorStore } from '@/shared/state/editor'
import { usePlaybackStore } from '@/shared/state/playback'
import { timelineCaptionCues } from '@/shared/timeline/caption-cues'
import { serializeSrt, serializeVtt, type SubtitleCue } from '@/shared/utils/subtitles'
import { saveToDisk } from '@/infrastructure/desktop'
import type { EditorSidebarTab } from '@/config/editor-workspaces'
import type { ExtendedExportSettings, VideoContainer } from '@/types/export'
import {
  besideGraph,
  buildRenderJob,
  changeProjectCanvas,
  instantiate,
  loadProjectCanvas,
  moveTo,
  readWorkflowFile,
  saveProjectCanvas,
  useGenerateStore,
  WORKFLOW_TEMPLATES,
  type CanvasGraph,
  type Shot,
  mediaLibraryService,
  saveTimeline,
  useRenderQueueStore,
  useItemsStore,
  useMediaLibraryStore,
  useProjectStore,
  useTimelineCommandStore,
  useTransitionsStore,
} from '../deps/editor'
import { bridgeError, failed, numberArg, registerBridgeCommand, takeArgs, textArg } from './bridge'

import {
  agentBlocking,
  importPrevisFrame,
  importPrevisVideo,
  makeMotionClip,
  motionName,
  withPrevisRenderer,
} from '../deps/editor'

import { generateApi, type Provider } from '../../generate/services/generate-api'
import { addShotWorkflow } from '../../generate/services/project-canvas'
import { retimeShots } from '../../generate/services/storyboard'
import { applyElements } from '../../generate/services/prompt-elements'
import {
  loadProjectElements,
  removeProjectElement,
  saveProjectElement,
} from '../../generate/services/project-elements'

const TABS: EditorSidebarTab[] = [
  'generate',
  'storyboard',
  'graphics',
  'blocking',
  'media',
  'text',
  'shapes',
  'effects',
  'transitions',
  'lottie',
  'transcript',
  'ai',
]

function openProject() {
  const project = useProjectStore.getState().currentProject
  if (!project || !window.location.pathname.startsWith('/editor/')) throw bridgeError('no_project')
  return project
}

function openGenerationProject() {
  const project = openProject()
  const state = useGenerateStore.getState()
  if (state.generationProjectId !== project.id || !state.generationProjectReady) {
    throw failed(
      'project_generation',
      new Error(state.generationPersistenceError ?? 'Project generation data is loading'),
    )
  }
  return project
}

function storyboardAnswer(
  projectId: string,
  offset: number,
  limit: number,
  includeScript: boolean,
) {
  const { storyboards, storyboardModels } = useGenerateStore.getState()
  const board = storyboards[projectId] ?? { script: '', shots: [] }
  return {
    storyboard: {
      ...(includeScript ? { script: board.script } : {}),
      shots: board.shots.slice(offset, offset + limit).map((shot) => ({
        id: shot.id,
        label: shot.label,
        prompt: shot.prompt,
        seconds: shot.seconds,
        start_seconds: shot.startSeconds,
        frame_media_id: shot.frameMediaId,
        previs_frame_media_id: shot.previs?.frame,
        previs_video_media_id: shot.previs?.video,
        has_previs_scene: !!shot.previs?.scene,
        image_job: shot.imageJob,
        video_job: shot.videoJob,
      })),
    },
    models: storyboardModels,
    total_shots: board.shots.length,
    next_offset: offset + limit < board.shots.length ? offset + limit : null,
  }
}

function readStoryboardShot(value: unknown, index: number, current: Shot[]): Shot {
  const command = 'storyboard_set'
  const field = `shots[${index}]`
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw bridgeError('bad_value', { command, field, expected: 'a shot object' })
  }
  const shot = value as Record<string, unknown>
  const id = textArg(command, shot, 'id')
  const previous = id ? current.find((each) => each.id === id) : undefined
  if (id && !previous)
    throw bridgeError('bad_value', {
      command,
      field: `${field}.id`,
      expected: 'an existing shot ID',
    })
  const prompt = textArg(command, shot, 'prompt')?.trim()
  if (!prompt) throw bridgeError('missing', { command, field: `${field}.prompt` })
  const seconds = numberArg(command, shot, 'seconds') ?? 5
  const startSeconds = numberArg(command, shot, 'start_seconds')
  if (seconds <= 0 || (startSeconds !== undefined && startSeconds < 0)) {
    throw bridgeError('bad_value', {
      command,
      field,
      expected: 'positive duration and non-negative start time',
    })
  }
  return {
    ...previous,
    id: previous?.id ?? crypto.randomUUID(),
    previs:
      shot.previs_video_media_id === undefined
        ? previous?.previs
        : {
            ...previous?.previs,
            video: textArg(command, shot, 'previs_video_media_id'),
          },
    frameMediaId:
      shot.frame_media_id === undefined
        ? previous?.frameMediaId
        : textArg(command, shot, 'frame_media_id'),
    label: textArg(command, shot, 'label')?.trim() || undefined,
    prompt,
    seconds,
    startSeconds,
    imageJob:
      shot.image_job === undefined
        ? (previous?.imageJob ?? null)
        : (textArg(command, shot, 'image_job') ?? null),
    videoJob:
      shot.video_job === undefined
        ? (previous?.videoJob ?? null)
        : (textArg(command, shot, 'video_job') ?? null),
  }
}

function appendCanvas(current: CanvasGraph, fragment: CanvasGraph): CanvasGraph {
  return {
    nodes: [...current.nodes, ...fragment.nodes],
    edges: [...current.edges, ...fragment.edges],
  }
}

function parseCanvasGraph(value: unknown): CanvasGraph {
  try {
    const { graph } = readWorkflowFile(
      JSON.stringify({ kind: 'videosos-workflow', version: 1, graph: value }),
      () => crypto.randomUUID(),
    )
    const input = value as CanvasGraph
    graph.nodes.forEach((node, index) => {
      const raw = input.nodes[index]
      if (!raw?.data) return
      if (
        typeof raw.data.shotId === 'string' &&
        useGenerateStore
          .getState()
          .storyboards[openProject().id]?.shots.some((shot) => shot.id === raw.data.shotId)
      )
        node.data.shotId = raw.data.shotId
      if (node.type === 'generate' && raw.type === 'generate' && typeof raw.data.job === 'string') {
        node.data.job = raw.data.job
      }
      if (node.type !== 'media' || raw.type !== 'media') return
      const { ref, name } = raw.data
      if (typeof ref === 'string' && ref.startsWith('https://')) node.data.ref = ref
      if (ref && typeof ref === 'object') {
        if ('media' in ref && typeof ref.media === 'string') node.data.ref = { media: ref.media }
        if (
          'job' in ref &&
          typeof ref.job === 'string' &&
          Number.isInteger(ref.index) &&
          ref.index >= 0
        ) {
          node.data.ref = { job: ref.job, index: ref.index }
        }
      }
      if (typeof name === 'string') node.data.name = name
    })
    return graph
  } catch (error) {
    throw failed('canvas_set', error)
  }
}

async function updateCanvas(change: (current: CanvasGraph) => CanvasGraph) {
  const { id } = openProject()
  const canvas = await loadProjectCanvas(id)
  if (openProject().id !== id) throw bridgeError('no_project')
  const previous = canvas.graph
  const graph = change(previous)
  changeProjectCanvas(canvas, graph)
  try {
    await saveProjectCanvas(id, canvas)
  } catch (error) {
    if (canvas.graph === graph) changeProjectCanvas(canvas, previous)
    throw error
  }
  return { graph }
}

function fpsOf(project: { metadata?: { fps?: number } }): number {
  return project.metadata?.fps || 30
}

const round = (value: number) => Math.round(value * 100) / 100

/** Every caption and subtitle the timeline shows, in its seconds and in time order, as the video export reads them. */
function subtitleCues(fps: number): SubtitleCue[] {
  const { items, tracks } = useItemsStore.getState()
  const hidden = new Set(tracks.filter((track) => track.visible === false).map((track) => track.id))
  const cues: SubtitleCue[] = []
  for (const item of items) {
    if (hidden.has(item.trackId)) continue
    if (item.type === 'subtitle') {
      const start = item.from / fps
      const end = (item.from + item.durationInFrames) / fps
      for (const cue of item.cues) {
        const endSeconds = Math.min(end, start + cue.endSeconds)
        const startSeconds = Math.max(0, start + cue.startSeconds)
        if (endSeconds > startSeconds && cue.text.trim()) {
          cues.push({ id: cue.id, startSeconds, endSeconds, text: cue.text.trim() })
        }
      }
      continue
    }
    for (const cue of timelineCaptionCues(item, fps)) {
      cues.push({
        id: `${item.id}-${cue.from}`,
        startSeconds: cue.from / fps,
        endSeconds: cue.to / fps,
        text: cue.text,
      })
    }
  }
  return cues.sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds)
}

/** An agent's edit is saved at once: the person may close the window right after it. */
async function save(projectId: string): Promise<void> {
  try {
    await saveTimeline(projectId)
  } catch (problem) {
    throw failed('save', problem)
  }
}

function timeline() {
  const project = openProject()
  const fps = fpsOf(project)
  const { items, tracks } = useItemsStore.getState()
  const media = useMediaLibraryStore.getState().mediaById
  return {
    project: { id: project.id, name: project.name, ...project.metadata },
    tracks: tracks.map((track) => ({
      id: track.id,
      name: track.name,
      kind: track.kind,
      order: track.order,
      muted: track.muted,
      visible: track.visible,
      locked: track.locked,
    })),
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      trackId: item.trackId,
      from: item.from,
      durationInFrames: item.durationInFrames,
      start_s: round(item.from / fps),
      length_s: round(item.durationInFrames / fps),
      mediaId: 'mediaId' in item ? item.mediaId : undefined,
      media: 'mediaId' in item && item.mediaId ? media[item.mediaId]?.fileName : undefined,
      text: 'text' in item ? item.text : undefined,
      label: item.label,
    })),
    transitions: useTransitionsStore.getState().transitions,
  }
}

/** Opens a project in the editor, or the projects list for `null`; the app owns the router. */
export type ShowProject = (projectId: string | null) => Promise<void>

export function registerEditorCommands(showProject: ShowProject): void {
  registerBridgeCommand('elements_list', async (args) => {
    takeArgs('elements_list', args, [])
    const { elements } = await loadProjectElements(openProject().id)
    return { elements }
  })

  registerBridgeCommand('element_save', async (args) => {
    takeArgs('element_save', args, ['name', 'media_ids'])
    const name = textArg('element_save', args, 'name')?.trim() ?? ''
    if (!/^[\p{L}\p{N}_-]+$/u.test(name)) {
      throw bridgeError('bad_value', {
        command: 'element_save',
        field: 'name',
        expected: 'letters, digits, underscores or hyphens',
      })
    }
    const project = openProject()
    const library = useMediaLibraryStore.getState()
    const images = new Set(
      (library.currentProjectId === project.id ? library.mediaItems : [])
        .filter((item) => item.mimeType.startsWith('image/'))
        .map((item) => item.id),
    )
    const ids: unknown = args.media_ids
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      !ids.every((id) => typeof id === 'string' && images.has(id))
    ) {
      throw bridgeError('bad_value', {
        command: 'element_save',
        field: 'media_ids',
        expected: 'one or more image IDs from the open project',
      })
    }
    const element = { name, refs: [...new Set<string>(ids)].map((media) => ({ media })) }
    await saveProjectElement(project.id, element)
    return { element }
  })

  registerBridgeCommand('element_delete', async (args) => {
    takeArgs('element_delete', args, ['name'])
    const name = textArg('element_delete', args, 'name')?.trim()
    if (!name) throw bridgeError('missing', { command: 'element_delete', field: 'name' })
    await removeProjectElement(openProject().id, name)
    return { name }
  })

  registerBridgeCommand('elements_resolve', async (args) => {
    takeArgs('elements_resolve', args, ['provider', 'model', 'project_id', 'values'])
    const provider = textArg('elements_resolve', args, 'provider') as Provider
    const model = textArg('elements_resolve', args, 'model')!
    const project = openProject()
    if (typeof args.project_id === 'string' && args.project_id !== project.id) {
      throw failed('elements_resolve', new Error('Open the target project to resolve its elements'))
    }
    const [{ form }, { elements }] = await Promise.all([
      generateApi.form(provider, model),
      loadProjectElements(project.id),
    ])
    if (openProject().id !== project.id) throw bridgeError('no_project')
    const result = applyElements(form.fields, args.values as Record<string, unknown>, elements)
    if (result.left.length)
      throw failed(
        'elements_resolve',
        new Error(
          `Model cannot fit references for ${result.left.map((name) => '@' + name).join(', ')}`,
        ),
      )
    return { values: result.values }
  })

  registerBridgeCommand('storyboard_get', (args) => {
    const command = 'storyboard_get'
    takeArgs(command, args, ['offset', 'limit', 'include_script'])
    const offset = numberArg(command, args, 'offset') ?? 0
    const limit = numberArg(command, args, 'limit') ?? 20
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw bridgeError('bad_value', {
        command,
        field: 'offset',
        expected: 'a nonnegative integer',
      })
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw bridgeError('bad_value', {
        command,
        field: 'limit',
        expected: 'an integer from 1 to 100',
      })
    }
    if (args.include_script !== undefined && typeof args.include_script !== 'boolean') {
      throw bridgeError('bad_value', { command, field: 'include_script', expected: 'a boolean' })
    }
    const { id } = openGenerationProject()
    return storyboardAnswer(id, offset, limit, args.include_script ?? offset === 0)
  })

  registerBridgeCommand('storyboard_set', (args) => {
    takeArgs('storyboard_set', args, ['script', 'shots'])
    const { id } = openGenerationProject()
    const store = useGenerateStore.getState()
    const current = store.storyboards[id] ?? { script: '', shots: [] }
    const script = textArg('storyboard_set', args, 'script') ?? current.script
    let shots = current.shots
    if (args.shots !== undefined) {
      if (!Array.isArray(args.shots)) {
        throw bridgeError('bad_value', {
          command: 'storyboard_set',
          field: 'shots',
          expected: 'a list of shots',
        })
      }
      shots = args.shots.map((shot, index) => readStoryboardShot(shot, index, current.shots))
      if (new Set(shots.map((shot) => shot.id)).size !== shots.length) {
        throw bridgeError('bad_value', {
          command: 'storyboard_set',
          field: 'shots',
          expected: 'unique shot IDs',
        })
      }
      if (
        shots.some((shot) => current.shots.some((old) => old.id === shot.id)) ||
        shots.some((shot) => shot.startSeconds === undefined)
      ) {
        shots = retimeShots(shots, current.shots[0]?.startSeconds ?? shots[0]?.startSeconds ?? 0)
      }
    }
    store.setStoryboard(id, { script, shots })
    return { saved: true, total_shots: shots.length }
  })

  registerBridgeCommand('storyboard_workflow', async (args) => {
    const command = 'storyboard_workflow'
    takeArgs(command, args, ['shot_id'])
    const { id } = openGenerationProject()
    const shotId = textArg(command, args, 'shot_id')
    const store = useGenerateStore.getState()
    if (!shotId || !store.storyboards[id]?.shots.some((shot) => shot.id === shotId)) {
      throw bridgeError('bad_value', { command, field: 'shot_id', expected: 'an existing shot ID' })
    }
    await addShotWorkflow(id, shotId, store.storyboardModels.video)
    return { shot_id: shotId, linked: true }
  })

  registerBridgeCommand('canvas_get', async (args) => {
    takeArgs('canvas_get', args, [])
    const { id } = openProject()
    const canvas = await loadProjectCanvas(id)
    return {
      graph: canvas.graph,
      templates: WORKFLOW_TEMPLATES.map(({ id }) => ({
        id,
        name: i18n.t(`generate.canvas.workflow.template.${id}.name`),
      })),
    }
  })

  registerBridgeCommand('canvas_set', async (args) => {
    takeArgs('canvas_set', args, ['graph', 'add'])
    if (args.add !== undefined && typeof args.add !== 'boolean') {
      throw bridgeError('bad_value', { command: 'canvas_set', field: 'add', expected: 'a boolean' })
    }
    const piece = parseCanvasGraph(args.graph)
    return updateCanvas((current) =>
      args.add ? appendCanvas(current, moveTo(piece, besideGraph(current))) : piece,
    )
  })

  registerBridgeCommand('canvas_template', async (args) => {
    takeArgs('canvas_template', args, ['template'])
    const id = textArg('canvas_template', args, 'template')
    const template = WORKFLOW_TEMPLATES.find((entry) => entry.id === id)
    if (!template)
      throw bridgeError('bad_value', {
        command: 'canvas_template',
        field: 'template',
        expected: WORKFLOW_TEMPLATES.map((entry) => entry.id).join(', '),
      })
    const { modelByTask } = useGenerateStore.getState()
    return updateCanvas((current) =>
      appendCanvas(
        current,
        instantiate(
          template,
          besideGraph(current),
          (task) => {
            const model = modelByTask[task]
            return model ? [model] : []
          },
          (templateId, key) =>
            i18n.t(`generate.canvas.workflow.template.${templateId}.prompts.${key}`),
          () => crypto.randomUUID(),
        ),
      ),
    )
  })

  registerBridgeCommand('editor_state', async (args) => {
    takeArgs('editor_state', args, [])
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
    const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null
    const project = useProjectStore.getState().currentProject
    const playback = usePlaybackStore.getState()
    const open = !!project && window.location.pathname.startsWith('/editor/')
    return {
      screen: window.location.pathname,
      project: open ? { id: project.id, name: project.name, ...project.metadata } : null,
      playhead: open
        ? { frame: playback.currentFrame, seconds: round(playback.currentFrame / fpsOf(project)) }
        : null,
      playing: playback.isPlaying,
      sidebar_tab: useEditorStore.getState().activeTab,
      clips: open ? useItemsStore.getState().items.length : null,
      media: open ? useMediaLibraryStore.getState().mediaItems.length : null,
      engine: {
        cross_origin_isolated: window.crossOriginIsolated,
        webgpu: adapter !== null,
        webcodecs: typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined',
        user_agent: navigator.userAgent,
      },
    }
  })

  registerBridgeCommand('timeline_get', (args) => {
    takeArgs('timeline_get', args, [])
    return timeline()
  })

  registerBridgeCommand('timeline_edit', async (args) => {
    takeArgs('timeline_edit', args, ['ops'])
    if (!Array.isArray(args.ops) || args.ops.length === 0)
      throw bridgeError('missing', { command: 'timeline_edit', field: 'ops' })
    const project = openProject()
    setEditCanvas({
      width: project.metadata?.width ?? 1920,
      height: project.metadata?.height ?? 1080,
      fps: fpsOf(project),
    })
    let outcome
    try {
      outcome = applyEditOpsLive(args.ops as EditOp[])
    } catch (problem) {
      throw failed('timeline_edit', problem)
    }
    const applied = outcome.results.filter((result) => result.ok)
    if (applied.length > 0) await save(project.id)
    if (outcome.error) {
      throw failed(
        'timeline_edit',
        `${outcome.error}. The ${applied.length} op(s) before it were applied and saved: ${JSON.stringify(applied)}`,
      )
    }
    return { applied: applied.length, results: outcome.results, timeline: timeline() }
  })

  registerBridgeCommand('timeline_undo', async (args) => {
    takeArgs('timeline_undo', args, [])
    const project = openProject()
    const commands = useTimelineCommandStore.getState()
    if (!commands.canUndo) throw bridgeError('nothing_to_undo')
    commands.undo()
    await save(project.id)
    return { text: 'Undone.' }
  })

  registerBridgeCommand('timeline_redo', async (args) => {
    takeArgs('timeline_redo', args, [])
    const project = openProject()
    const commands = useTimelineCommandStore.getState()
    if (!commands.canRedo) throw bridgeError('nothing_to_redo')
    commands.redo()
    await save(project.id)
    return { text: 'Redone.' }
  })

  registerBridgeCommand('media_list', (args) => {
    takeArgs('media_list', args, [])
    openProject()
    return {
      media: useMediaLibraryStore.getState().mediaItems.map((item) => ({
        id: item.id,
        file_name: item.fileName,
        mime: item.mimeType,
        duration_s: round(item.duration),
        width: item.width,
        height: item.height,
        size: item.fileSize,
        tags: item.tags,
      })),
    }
  })

  registerBridgeCommand('media_import', async (args) => {
    takeArgs('media_import', args, ['url'])
    const url = textArg('media_import', args, 'url')
    if (!url) throw bridgeError('missing', { command: 'media_import', field: 'url' })
    const project = openProject()
    try {
      const media = await mediaLibraryService.importMediaFromUrl(url, project.id)
      await useMediaLibraryStore.getState().loadMediaItems()
      return {
        media_id: media.id,
        file_name: media.fileName,
        mime: media.mimeType,
        duration_s: round(media.duration),
      }
    } catch (problem) {
      throw failed('media_import', problem)
    }
  })

  registerBridgeCommand('playhead_seek', (args) => {
    takeArgs('playhead_seek', args, ['seconds', 'frame'])
    const project = openProject()
    const frame =
      numberArg('playhead_seek', args, 'frame') ??
      Math.round((numberArg('playhead_seek', args, 'seconds') ?? 0) * fpsOf(project))
    usePlaybackStore.getState().setCurrentFrame(Math.max(0, Math.round(frame)))
    return { frame: usePlaybackStore.getState().currentFrame }
  })

  registerBridgeCommand('playback', (args) => {
    takeArgs('playback', args, ['action'])
    openProject()
    const action = textArg('playback', args, 'action')
    if (action === 'play') usePlaybackStore.getState().play()
    else if (action === 'pause') usePlaybackStore.getState().pause()
    else
      throw bridgeError('bad_value', {
        command: 'playback',
        field: 'action',
        expected: 'play or pause',
      })
    return { playing: usePlaybackStore.getState().isPlaying }
  })

  registerBridgeCommand('editor_tab', (args) => {
    takeArgs('editor_tab', args, ['tab'])
    const tab = textArg('editor_tab', args, 'tab') as EditorSidebarTab | undefined
    if (!tab || !TABS.includes(tab))
      throw bridgeError('bad_value', {
        command: 'editor_tab',
        field: 'tab',
        expected: TABS.join(', '),
      })
    openProject()
    useEditorStore.getState().setActiveTab(tab)
    return { tab }
  })

  registerBridgeCommand('export_video', async (args) => {
    takeArgs('export_video', args, [
      'format',
      'quality',
      'width',
      'height',
      'file_name',
      'loudness_lufs',
    ])
    const project = openProject()
    const format = (textArg('export_video', args, 'format') ?? 'mp4') as VideoContainer
    if (!['mp4', 'webm', 'mov', 'mkv'].includes(format)) {
      throw bridgeError('bad_value', {
        command: 'export_video',
        field: 'format',
        expected: 'mp4, webm, mov or mkv',
      })
    }
    const quality = (textArg('export_video', args, 'quality') ??
      'high') as ExtendedExportSettings['quality']
    if (!['low', 'medium', 'high', 'ultra'].includes(quality)) {
      throw bridgeError('bad_value', {
        command: 'export_video',
        field: 'quality',
        expected: 'low, medium, high or ultra',
      })
    }
    const loudnessLufs = numberArg('export_video', args, 'loudness_lufs')
    if (loudnessLufs !== undefined && !(loudnessLufs >= -40 && loudnessLufs <= -5)) {
      throw bridgeError('bad_value', {
        command: 'export_video',
        field: 'loudness_lufs',
        expected: 'LUFS from -40 to -5',
      })
    }
    if (useItemsStore.getState().items.length === 0)
      throw failed('export_video', 'the timeline is empty')
    await save(project.id)
    const settings: ExtendedExportSettings = {
      mode: 'video',
      codec: format === 'webm' ? 'vp9' : 'h264',
      quality,
      resolution: {
        width: numberArg('export_video', args, 'width') ?? project.metadata?.width ?? 1920,
        height: numberArg('export_video', args, 'height') ?? project.metadata?.height ?? 1080,
      },
      videoContainer: format,
      renderWholeProject: true,
      subtitleMode: 'burn',
      loudnessLufs,
    }
    const fileName = textArg('export_video', args, 'file_name')
      ?.replace(/[<>:"/\\|?*]+/g, '_')
      .trim()
    let job
    try {
      job = await buildRenderJob({ settings, name: fileName || project.name })
    } catch (problem) {
      throw failed('export_video', problem)
    }
    if (fileName) job = { ...job, fileName: `${fileName}.${job.clientSettings.container}` }
    useRenderQueueStore.getState().enqueueJobs([job])
    const deadline = Date.now() + 3_500_000
    for (;;) {
      if (Date.now() > deadline)
        throw failed('export_video', 'the render did not finish within an hour')
      await new Promise((resolve) => setTimeout(resolve, 500))
      const current = useRenderQueueStore.getState().jobs.find((each) => each.id === job.id)
      if (!current) throw failed('export_video', 'the render job left the queue')
      if (current.status === 'completed')
        return { saved: current.savedPath, size: current.fileSize }
      if (current.status === 'failed')
        throw failed('export_video', current.error ?? 'the render failed')
      if (current.status === 'cancelled') throw failed('export_video', 'the render was cancelled')
    }
  })

  registerBridgeCommand('previs_render', async (args) => {
    takeArgs('previs_render', args, [
      'scene',
      'description',
      'fresh',
      'output',
      'time_seconds',
      'name',
      'shot_id',
    ])
    const { id: projectId } = openGenerationProject()
    const store = useGenerateStore.getState()
    const shotId = textArg('previs_render', args, 'shot_id')
    const shot = store.storyboards[projectId]?.shots.find((each) => each.id === shotId)
    if (shotId && !shot)
      throw bridgeError('bad_value', {
        command: 'previs_render',
        field: 'shot_id',
        expected: 'an existing shot ID',
      })
    const description = textArg('previs_render', args, 'description')
    const given = args.scene ?? (description === undefined ? shot?.previs?.scene : undefined)
    if (given === undefined && !description?.trim())
      throw bridgeError('missing', { command: 'previs_render', field: 'scene or description' })
    if (given !== undefined && description !== undefined)
      throw bridgeError('bad_value', {
        command: 'previs_render',
        field: 'scene',
        expected: 'either scene or description, not both',
      })
    const output = textArg('previs_render', args, 'output') ?? 'frame'
    if (output !== 'frame' && output !== 'video' && output !== 'scene')
      throw bridgeError('bad_value', {
        command: 'previs_render',
        field: 'output',
        expected: 'frame, video or scene',
      })
    const time = numberArg('previs_render', args, 'time_seconds') ?? 0
    try {
      const scene = await agentBlocking({
        scene: given,
        shotId,
        description,
        fresh: args.fresh === true,
        accept: (scene) => {
          if (time < 0 || time > scene.seconds)
            throw new Error(`time_seconds must be from 0 to ${scene.seconds}`)
        },
      })
      if (shotId)
        store.updateShot(projectId, shotId, {
          previs: {
            ...(given === shot?.previs?.scene ? shot?.previs : {}),
            scene,
            description: description ?? shot?.previs?.description,
          },
        })
      useGenerateStore.setState({ blockingShot: shotId ? { projectId, shotId } : undefined })
      useEditorStore.getState().setActiveTab('blocking')
      if (output === 'scene') return { scene }
      const name =
        textArg('previs_render', args, 'name') ??
        `${scene.title} (${output === 'frame' ? 'blocking frame' : 'blocking'})`
      const mediaId = await withPrevisRenderer(scene, (renderer) =>
        output === 'frame'
          ? importPrevisFrame(renderer, time, name)
          : importPrevisVideo(renderer, name),
      )
      const current = useGenerateStore
        .getState()
        .storyboards[projectId]?.shots.find((each) => each.id === shotId)
      if (shotId && current?.previs?.scene === scene)
        store.updateShot(projectId, shotId, { previs: { ...current.previs, [output]: mediaId } })
      return { media_id: mediaId, name, scene }
    } catch (problem) {
      throw failed('previs_render', problem)
    }
  })

  registerBridgeCommand('motion_render', async (args) => {
    takeArgs('motion_render', args, ['html', 'seconds', 'name'])
    const project = openGenerationProject()
    const html = textArg('motion_render', args, 'html')
    if (!html) throw bridgeError('missing', { command: 'motion_render', field: 'html' })
    const seconds = numberArg('motion_render', args, 'seconds') ?? 4
    if (seconds < 0.5 || seconds > 30)
      throw bridgeError('bad_value', {
        command: 'motion_render',
        field: 'seconds',
        expected: 'from 0.5 to 30',
      })
    const name = textArg('motion_render', args, 'name') ?? motionName(html, 'HTML graphics')
    let mediaId
    try {
      mediaId = await makeMotionClip(html, seconds, name)
    } catch (problem) {
      throw failed('motion_render', problem)
    }
    await save(project.id)
    return { media_id: mediaId, name, timeline: timeline() }
  })

  registerBridgeCommand('subtitles_export', async (args) => {
    takeArgs('subtitles_export', args, ['format', 'file_name'])
    const project = openProject()
    const format = textArg('subtitles_export', args, 'format') ?? 'srt'
    if (!['srt', 'vtt', 'txt', 'json'].includes(format)) {
      throw bridgeError('bad_value', {
        command: 'subtitles_export',
        field: 'format',
        expected: 'srt, vtt, txt or json',
      })
    }
    const cues = subtitleCues(fpsOf(project))
    if (cues.length === 0)
      throw failed('subtitles_export', 'the timeline shows no captions or subtitles')
    const content =
      format === 'srt'
        ? serializeSrt(cues)
        : format === 'vtt'
          ? serializeVtt(cues)
          : format === 'txt'
            ? `${cues.map((cue) => cue.text).join('\n')}\n`
            : `${JSON.stringify(
                {
                  cues: cues.map((cue) => ({
                    start_s: Math.round(cue.startSeconds * 1000) / 1000,
                    end_s: Math.round(cue.endSeconds * 1000) / 1000,
                    text: cue.text,
                  })),
                },
                null,
                2,
              )}\n`
    const fileName = textArg('subtitles_export', args, 'file_name')
      ?.replace(/[<>:"/\\|?*]+/g, '_')
      .trim()
    try {
      const saved = await saveToDisk(
        new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' }),
        `${fileName || project.name}.${format}`,
        { dialog: false },
      )
      if (!saved.path) throw new Error('the file was not saved')
      return { path: saved.path, cues: cues.length }
    } catch (problem) {
      throw failed('subtitles_export', problem)
    }
  })

  registerBridgeCommand('project_open', async (args) => {
    takeArgs('project_open', args, ['project_id'])
    const id = textArg('project_open', args, 'project_id')
    try {
      await showProject(id || null)
    } catch (problem) {
      throw failed('project_open', problem)
    }
    for (
      let wait = 0;
      wait < 40 && id && useProjectStore.getState().currentProject?.id !== id;
      wait += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (id && useProjectStore.getState().currentProject?.id !== id)
      throw failed('project_open', `the editor did not open ${id}`)
    return { screen: window.location.pathname }
  })
}
