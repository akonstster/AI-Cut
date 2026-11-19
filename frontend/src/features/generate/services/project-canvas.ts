import { readJson, writeJsonAtomic } from '@/infrastructure/storage/workspace-fs/fs-primitives'
import { projectDir } from '@/infrastructure/storage/workspace-fs/paths'
import { requireWorkspaceRoot } from '@/infrastructure/storage/workspace-fs/root'
import { EMPTY_GRAPH, type CanvasGraph } from './canvas-graph'

interface ProjectCanvas {
  graph: CanvasGraph
  root: FileSystemDirectoryHandle
  listeners: Set<() => void>
  writes: Promise<void>
}

const canvases = new WeakMap<FileSystemDirectoryHandle, Map<string, Promise<ProjectCanvas>>>()

export function loadProjectCanvas(projectId: string): Promise<ProjectCanvas> {
  const root = requireWorkspaceRoot()
  let projects = canvases.get(root)
  if (!projects) {
    projects = new Map()
    canvases.set(root, projects)
  }
  const existing = projects.get(projectId)
  if (existing) return existing
  const pending = readJson<CanvasGraph>(root, [...projectDir(projectId), 'node-canvas.json'])
    .then((graph) => ({ graph: graph ?? EMPTY_GRAPH, root, listeners: new Set<() => void>(), writes: Promise.resolve() }))
    .catch((error: unknown) => {
      projects.delete(projectId)
      throw error
    })
  projects.set(projectId, pending)
  return pending
}

export function changeProjectCanvas(canvas: ProjectCanvas, graph: CanvasGraph): void {
  canvas.graph = graph
  for (const listener of canvas.listeners) listener()
}

export function saveProjectCanvas(projectId: string, canvas: ProjectCanvas): Promise<void> {
  const graph = canvas.graph
  const written = canvas.writes.then(async () => {
    await writeJsonAtomic(canvas.root, [...projectDir(projectId), 'node-canvas.json'], graph)
  })
  canvas.writes = written.catch(() => {})
  return written
}

export async function addShotWorkflow(projectId: string, shotId: string, videoModel?: import('../stores/generate-store').ModelRef) {
  const canvas = await loadProjectCanvas(projectId)
  if (canvas.graph.nodes.some((node) => node.data.shotId === shotId)) return
  const previous = canvas.graph
  const x = previous.nodes.length ? Math.max(...previous.nodes.map((node) => node.position.x)) + 420 : 0
  const prompt = crypto.randomUUID()
  const frame = crypto.randomUUID()
  const clip = crypto.randomUUID()
  const graph: CanvasGraph = {
    nodes: [
      ...previous.nodes,
      { id: prompt, type: 'prompt', position: { x, y: 0 }, data: { text: '', shotId } },
      { id: frame, type: 'media', position: { x, y: 320 }, data: { ref: null, kind: 'image', name: '', shotId } },
      { id: crypto.randomUUID(), type: 'media', position: { x, y: 590 }, data: { ref: null, kind: 'video', name: '', shotId } },
      { id: clip, type: 'generate', position: { x: x + 320, y: 0 }, data: { task: 'video', model: videoModel ?? null, job: null, shotId } },
    ],
    edges: [
      ...previous.edges,
      { id: crypto.randomUUID(), source: prompt, target: clip, targetHandle: 'prompt' },
      { id: crypto.randomUUID(), source: frame, target: clip, targetHandle: 'media' },
    ],
  }
  changeProjectCanvas(canvas, graph)
  try {
    await saveProjectCanvas(projectId, canvas)
  } catch (error) {
    if (canvas.graph === graph) changeProjectCanvas(canvas, previous)
    throw error
  }
}

export type { ProjectCanvas }
