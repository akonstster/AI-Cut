/**
 * The node canvas, as Weave's, Flora's and Freepik Spaces': a second view of the same generation tasks. A text
 * node feeds a model's prompt, a picture, video or sound node (from the library or another node's result)
 * feeds the model's file slots by what they mean, and a generation node runs through the same job queue, so
 * its price, history and results are the panel's own.
 */

import type { Field, Job, MediaKind, MediaRef, Task } from './generate-api'
import type { ModelRef } from '../stores/generate-store'

import type { Shot } from './storyboard'

export function storyboardNode(node: CanvasNode, shot: Shot | undefined, index: number): CanvasNode {
  if (!node.data.shotId) return node
  if (node.type === 'prompt') return { ...node, data: { ...node.data, text: shot?.prompt ?? '' } }
  if (node.type === 'media') {
    const media = node.data.kind === 'video' ? shot?.previs?.video : shot?.frameMediaId ?? shot?.previs?.frame
    const ref = node.data.kind === 'video' && typeof node.data.ref === 'string' ? node.data.ref : media ? { media } : null
    return { ...node, data: { ...node.data, ref, name: shot?.label || (shot ? `#${index + 1}` : '') } }
  }
  if (!shot) return { ...node, data: { ...node.data, model: null, job: null, outputMedia: undefined, outputText: undefined } }
  const job = node.data.task === 'video' || node.data.task === 'video_edit' ? shot.videoJob : shot.imageJob
  return { ...node, data: { ...node.data, job, outputMedia: node.data.task === 'video' || node.data.task === 'video_edit'
    ? shot.clipMediaId ? { id: shot.clipMediaId, kind: 'video' } : node.data.outputMedia
    : node.data.outputMedia } }
}

export interface Position {
  x: number
  y: number
}

export type CanvasNode =
  | { id: string; type: 'prompt'; position: Position; data: { text: string; shotId?: string } }
  | { id: string; type: 'media'; position: Position; data: { shotId?: string; ref: MediaRef | null; kind: MediaKind | null; name: string } }
  | { id: string; type: 'generate'; position: Position; data: { shotId?: string; settings?: Record<string, unknown>; task: Task; model: ModelRef | null; job: string | null; outputMedia?: { id: string; kind: MediaKind }; outputText?: string } }

export type CanvasHandle = 'prompt' | 'media' | `media:${string}`

export function isCanvasHandle(value: unknown): value is CanvasHandle {
  return value === 'prompt' || value === 'media' ||
    (typeof value === 'string' && value.startsWith('media:') && value.length > 6)
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  /** What the target takes from the source: its prompt or its files. */
  targetHandle: CanvasHandle
}

export interface CanvasGraph {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export const EMPTY_GRAPH: CanvasGraph = { nodes: [], edges: [] }

/** What a node gives the nodes after it: text, or a file of a kind. */
function outputOf(node: CanvasNode, jobs: Map<string, Job>): { text: string } | { ref: MediaRef; kind: MediaKind } | null {
  if (node.type === 'prompt') return node.data.text.trim() ? { text: node.data.text } : null
  if (node.type === 'media') return node.data.ref && node.data.kind ? { ref: node.data.ref, kind: node.data.kind } : null
  const job = node.data.job ? jobs.get(node.data.job) : undefined
  if (!job && node.data.outputMedia) return { ref: { media: node.data.outputMedia.id }, kind: node.data.outputMedia.kind }
  if (!job && node.data.outputText) return { text: node.data.outputText }
  if (!job || job.status !== 'done') return null
  const text = job.outputs.find((output) => output.kind === 'text')
  if (text?.text) return { text: text.text }
  const file = job.outputs.find((output) => output.kind === 'image' || output.kind === 'video' || output.kind === 'audio')
  return file ? { ref: { job: job.id, index: file.index }, kind: file.kind as MediaKind } : null
}

/** Whether an edge from `source` into `handle` makes sense: text into a prompt, a file into the file slots. */
export function connects(source: CanvasNode, handle: CanvasHandle): boolean {
  if (source.type === 'prompt') return handle === 'prompt'
  if (source.type === 'media') return handle !== 'prompt'
  return source.data.task === 'text' || source.data.task === 'transcribe' ? handle === 'prompt' : handle !== 'prompt'
}

const SLOT_ORDER = ['first_frame', 'source', 'reference', 'audio', 'last_frame', 'mask']

/**
 * A generation node's values from what is connected to it: the prompts joined in the model's prompt field, each
 * file in the first slot of its kind with room, by what the slots mean. Files without room are named back.
 */
export function nodeValues(graph: CanvasGraph, nodeId: string, fields: Field[], jobs: Map<string, Job>): { values: Record<string, unknown>; waiting: string[]; left: number } {
  const values: Record<string, unknown> = {}
  const waiting: string[] = []
  let left = 0
  const texts: string[] = []
  let explicitVideo = false
  const files: Array<{ ref: MediaRef; kind: MediaKind }> = []
  for (const edge of graph.edges.filter((each) => each.target === nodeId)) {
    const source = graph.nodes.find((node) => node.id === edge.source)
    if (!source) continue
    const output = outputOf(source, jobs)
    if (!output) {
      waiting.push(source.id)
      continue
    }
    if ('text' in output && edge.targetHandle === 'prompt') texts.push(output.text)
    if (edge.targetHandle.startsWith('media:')) {
      const key = edge.targetHandle.slice(6)
      const field = fields.find((candidate) => candidate.key === key)
      if (!('ref' in output) || field?.type !== 'media' || field.media !== output.kind) {
        left += 1
        continue
      }
      const existing = (values[key] as MediaRef[] | undefined) ?? []
      if (existing.length >= field.max) {
        left += 1
        continue
      }
      values[key] = [...existing, output.ref]
      explicitVideo ||= field.key === 'input_video' && field.role === 'reference' && output.kind === 'video'
    } else if ('ref' in output && edge.targetHandle === 'media') {
      files.push(output)
    }
  }
  const prompt = fields.find((field) => field.role === 'prompt')
  if (prompt && texts.length > 0) values[prompt.key] = texts.join('\n\n')
  // OpenRouter gives frame inputs priority over reference-to-video. Route the image
  // to the reference slot when its video reference is connected.
  const referenceMode = (explicitVideo || files.some((file) => file.kind === 'video')) &&
    fields.some((field) => field.key === 'input_video' && field.type === 'media' && field.role === 'reference')
  const slots = fields
    .filter((field): field is Extract<Field, { type: 'media' }> => field.type === 'media')
    .filter((field) => !referenceMode || (field.role !== 'first_frame' && field.role !== 'last_frame'))
    .sort((a, b) => rank(a.role) - rank(b.role))
  for (const file of files) {
    const slot = slots.find((each) => each.media === file.kind && ((values[each.key] as MediaRef[] | undefined)?.length ?? 0) < each.max)
    if (!slot) {
      left += 1
      continue
    }
    values[slot.key] = [...((values[slot.key] as MediaRef[] | undefined) ?? []), file.ref]
  }
  return { values, waiting, left }
}

function rank(role: string | undefined): number {
  const index = SLOT_ORDER.indexOf(role ?? '')
  return index === -1 ? SLOT_ORDER.length : index
}
