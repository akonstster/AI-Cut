import { useGenerateStore, legacyProjectGeneration, type ProjectGeneration } from '../stores/generate-store'
import { generateApi, type Job, type MediaKind, type MediaRef } from './generate-api'
import { loadProjectCanvas, changeProjectCanvas, saveProjectCanvas } from './project-canvas'
import { loadProjectElements, replaceProjectElements } from './project-elements'
import { readProjectGeneration, writeProjectGeneration } from './project-generation'
import type { CanvasGraph } from './canvas-graph'
import type { PromptElement } from './prompt-elements'

export interface ProjectGenerationTransfer {
  generation: ProjectGeneration
  canvas: CanvasGraph
  elements: PromptElement[]
}

export async function collectProjectGeneration(id: string): Promise<ProjectGenerationTransfer> {
  const [saved, canvas, elements, remoteJobs] = await Promise.all([
    readProjectGeneration(id),
    Promise.resolve().then(() => loadProjectCanvas(id)),
    loadProjectElements(id),
    generateApi.jobs(id, 1000).then(({ jobs }) => jobs).catch(() =>
      useGenerateStore.getState().jobs.filter((job) => job.project_id === id)),
  ])
  await canvas.writes
  const generation = saved ?? await legacyProjectGeneration(id)
  const jobs = new Map((generation.archivedJobs ?? []).map((job) => [job.id, job]))
  for (const job of remoteJobs) jobs.set(job.id, job)
  return { generation: { ...generation, archivedJobs: [...jobs.values()] }, canvas: canvas.graph, elements: elements.elements }
}

export async function restoreProjectGeneration(
  id: string,
  transfer: ProjectGenerationTransfer,
  mediaIds: ReadonlyMap<string, string>,
): Promise<void> {
  const media = (old: string | undefined) => old ? mediaIds.get(old) : undefined
  const jobs = new Map((transfer.generation.archivedJobs ?? []).map((job) => [job.id, job]))
  const outputs = (job: Job | undefined) => job?.outputs.filter((output) =>
    output.kind === 'image' || output.kind === 'video' || output.kind === 'audio') ?? []
  const outputMedia = (job: Job | undefined, index: number) => {
    const position = outputs(job).findIndex((output) => output.index === index)
    return position < 0 ? undefined : media(job?.imported[position])
  }
  const firstMedia = (jobId: string | null, kind: MediaKind) => {
    const job = jobId ? jobs.get(jobId) : undefined
    const output = outputs(job).find((item) => item.kind === kind)
    return output ? outputMedia(job, output.index) : undefined
  }
  const ref = (value: MediaRef | null): MediaRef | null => {
    if (!value) return null
    if (typeof value === 'string') return /^https?:\/\//i.test(value) ? value : null
    if ('file' in value) return null
    const mapped = 'media' in value ? media(value.media) : outputMedia(jobs.get(value.job), value.index)
    return mapped ? { media: mapped } : null
  }
  function values(record: Record<string, unknown>): Record<string, unknown> {
    const remap = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(remap).filter((entry) => entry !== undefined)
      if (value && typeof value === 'object') {
        if ('media' in value || 'job' in value || 'file' in value) return ref(value as MediaRef) ?? undefined
        return values(value as Record<string, unknown>)
      }
      return value
    }
    return Object.fromEntries(Object.entries(record).flatMap(([key, value]) => {
      const restored = remap(value)
      return restored === undefined ? [] : [[key, restored]]
    }))
  }

  const source = transfer.generation
  const storyboard = source.storyboard && {
    ...source.storyboard,
    shots: source.storyboard.shots.map((shot) => ({
      ...shot,
      frameMediaId: media(shot.frameMediaId) ?? firstMedia(shot.imageJob, 'image'),
      clipMediaId: media(shot.clipMediaId) ?? firstMedia(shot.videoJob, 'video'),
      previs: shot.previs && { ...shot.previs, frame: media(shot.previs.frame), video: media(shot.previs.video) },
      imageJob: null,
      videoJob: null,
    })),
  }
  const archivedJobs = [...jobs.values()].map((job) => ({
    ...job, project_id: id, values: values(job.values),
    imported: job.imported.map(media).filter((entry): entry is string => !!entry),
    outputs: job.outputs.map((output) => ({ ...output, file: '' })),
  }))
  await writeProjectGeneration(id, {
    ...source, storyboard, archivedJobs,
    valuesByModel: Object.fromEntries(Object.entries(source.valuesByModel).map(([key, value]) => [key, values(value)])),
    motionClips: source.motionClips.map((clip) => ({ ...clip, projectId: id, mediaId: media(clip.mediaId) })),
  })
  await replaceProjectElements(id, transfer.elements.flatMap((element) => {
    const refs = element.refs.map(ref).filter((entry): entry is MediaRef => !!entry)
    return refs.length ? [{ ...element, refs }] : []
  }))
  const canvas = await loadProjectCanvas(id)
  const graph: CanvasGraph = {
    ...transfer.canvas,
    nodes: transfer.canvas.nodes.map((node) => {
      if (node.type === 'media') return { ...node, data: { ...node.data, ref: ref(node.data.ref) } }
      if (node.type === 'prompt') return node
      const job = node.data.job ? jobs.get(node.data.job) : undefined
      const output = outputs(job)[0]
      const mediaId = node.data.outputMedia ? media(node.data.outputMedia.id) : output && outputMedia(job, output.index)
      const kind = node.data.outputMedia?.kind ?? output?.kind
      return { ...node, data: {
        ...node.data, job: null,
        settings: node.data.settings && values(node.data.settings),
        outputMedia: mediaId && kind ? { id: mediaId, kind: kind as MediaKind } : undefined,
        outputText: node.data.outputText ?? job?.outputs.find((item) => item.kind === 'text')?.text,
      } }
    }),
  }
  changeProjectCanvas(canvas, graph)
  await saveProjectCanvas(id, canvas)
}
