import { Input } from '@/components/ui/input'
import { changeProjectCanvas, loadProjectCanvas, saveProjectCanvas, type ProjectCanvas } from '../services/project-canvas'
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  FileDown,
  FileUp,
  Film,
  ImageIcon,
  LayoutTemplate,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Type,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  besideGraph,
  instantiate,
  moveTo,
  readWorkflowFile,
  workflowFile,
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from '../services/canvas-templates'
import { saveWorkflow } from '../services/workflow-save'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getMediaDragData, mediaLibraryService, useMediaLibraryStore, useProjectStore } from '../deps/editor'
import { PROVIDER_LABELS, formatUsd, generateApi, TASKS, type Job, type MediaKind, type ModelForm, type Task } from '../services/generate-api'
import { EMPTY_GRAPH, connects, isCanvasHandle, nodeValues, storyboardNode, type CanvasEdge, type CanvasHandle, type CanvasGraph, type CanvasNode } from '../services/canvas-graph'
import { placeMediaAt, placeMediaAtPlayhead } from '../services/timeline-actions'
import { aspectOf, shotValues } from '../services/storyboard'
import { applyElements } from '../services/prompt-elements'
import { useEstimate } from '../hooks/use-estimate'
import { useProjectElements } from '../hooks/use-project-elements'
import { modelKey, useGenerateStore, type ModelRef } from '../stores/generate-store'
import { FieldControl, ModelFieldLabel, MediaThumb, OUTPUT_DRAG_TYPE } from './field-control'
import { ModelPicker } from './model-picker'

const ACTIVE = new Set(['queued', 'sending', 'running'])
const KINDS: MediaKind[] = ['image', 'video', 'audio']

type Change = (id: string, data: Partial<CanvasNode['data']>) => void
interface NodeContext {
  graph: CanvasGraph
  change: Change
  remove: (id: string) => void
  removeEdge: (id: string) => void
  importFile: (id: string, file: File) => Promise<void>
  jobs: Map<string, Job>
}

const CanvasContext = createContext<NodeContext>({ graph: EMPTY_GRAPH, change: () => undefined, remove: () => undefined, removeEdge: () => undefined, importFile: async () => undefined, jobs: new Map() })

function NodeShell({ id, icon: Icon, title, children, inputs = [], output = true }: { id: string; icon: typeof Type; title: string; children: React.ReactNode; inputs?: Array<{ id: CanvasHandle; label: string }>; output?: boolean }) {
  const { t } = useTranslation()
  const context = useContext(CanvasContext)
  const updateInternals = useUpdateNodeInternals()
  const handleKey = inputs.map((input) => input.id).join('|')
  useEffect(() => { updateInternals(id) }, [handleKey, id, updateInternals])
  return (
    <div data-canvas-node-id={id} style={{ minHeight: inputs.length ? 46 + inputs.length * 28 : undefined }} className="relative w-72 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-xl">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <Icon className="size-3.5 text-[var(--color-accent)]" aria-hidden />
        <span className="flex-1 text-xs font-semibold">{title}</span>
        <button type="button" onClick={() => context.remove(id)} className="nodrag rounded p-0.5 text-[var(--color-muted)] hover:text-[var(--color-text)]" aria-label={t('generate.canvas.remove')} title={t('generate.canvas.remove')}>
          <X className="size-3.5" />
        </button>
      </div>
      <div className="space-y-2 p-3">{children}</div>
      {inputs.map(({ id: handle, label }, index) => (
        <Handle key={handle} id={handle} type="target" position={Position.Left} style={{ top: 48 + index * 28 }} className="!size-3 !border-2 !border-[var(--color-surface)] !bg-[var(--color-accent)]" title={label} />
      ))}
      {inputs.map(({ id: handle, label }, index) => (
        <span key={`label-${handle}`} className="pointer-events-none absolute -left-1 -translate-x-full text-[10px] text-[var(--color-muted)]" style={{ top: 41 + index * 28 }}>
          {label}
        </span>
      ))}
      {output && <Handle type="source" position={Position.Right} className="!size-3 !border-2 !border-[var(--color-surface)] !bg-[var(--color-accent-2)]" />}
    </div>
  )
}

const PromptNode = memo(function PromptNode({ id, data }: NodeProps<Node<{ text: string; shotId?: string }>>) {
  const { t } = useTranslation()
  const context = useContext(CanvasContext)
  return (
    <NodeShell id={id} icon={Type} title={t('generate.canvas.prompt')}>
      <Textarea readOnly={!!data.shotId} value={data.text} onChange={(event) => context.change(id, { text: event.target.value })} placeholder={t('generate.canvas.promptHint')} className="nodrag nowheel min-h-24 resize-y bg-secondary/30 text-xs" aria-label={t('generate.canvas.prompt')} />
    </NodeShell>
  )
})

const MediaNode = memo(function MediaNode({ id, data }: NodeProps<Node<Extract<CanvasNode, { type: 'media' }>['data']>>) {
  const { t } = useTranslation()
  const context = useContext(CanvasContext)
  return (
    <NodeShell id={id} icon={ImageIcon} title={data.name || t('generate.canvas.media')}>
      <label className="nodrag block cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        {t('generate.canvas.chooseFile')}
        <input type="file" className="sr-only" accept={data.shotId && data.kind ? `${data.kind}/*` : 'image/*,video/*,audio/*'}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void context.importFile(id, file)
          }} />
      </label>
      {data.kind === 'video' && <Input key={typeof data.ref === 'string' ? data.ref : ''}
        type="url" className="nodrag h-7 text-xs" placeholder={t('generate.canvas.videoUrl')}
        aria-label={t('generate.canvas.videoUrl')} defaultValue={typeof data.ref === 'string' ? data.ref : ''}
        onBlur={(event) => {
          const url = event.currentTarget.value.trim()
          if (url.startsWith('https://') && event.currentTarget.checkValidity()) context.change(id, { ref: url })
          else if (!url && typeof data.ref === 'string') context.change(id, { ref: null })
          else if (url) event.currentTarget.value = typeof data.ref === 'string' ? data.ref : ''
        }} />}
      {data.ref && typeof data.ref !== 'string' ? (
        <div className="aspect-video overflow-hidden rounded bg-secondary">
          <MediaThumb reference={data.ref} />
        </div>
      ) : !data.ref ? (
        <p className="text-[11px] text-[var(--color-muted)]">{t('generate.canvas.mediaHint')}</p>
      ) : null}
    </NodeShell>
  )
})

function openRouterVideoIssue(form: ModelForm | undefined, values: Record<string, unknown>) {
  if (form?.provider !== 'openrouter' || !form.fields.some((field) => field.key === 'input_video' || field.key === 'frame_first')) return
  const video = Array.isArray(values.input_video) ? values.input_video : values.input_video ? [values.input_video] : []
  if (video.some((input) => typeof input !== 'string' || !input.startsWith('https://'))) return 'generate.canvas.videoNeedsUrl'
  if ((video.length || values.input_references) && (values.frame_first || values.frame_last)) return 'generate.canvas.frameReferenceConflict'
}

const GenerateNode = memo(function GenerateNode({ id, data }: NodeProps<Node<Extract<CanvasNode, { type: 'generate' }>['data']>>) {
  const { t } = useTranslation()
  const context = useContext(CanvasContext)
  const projectId = useProjectStore((state) => state.currentProject?.id ?? null)
  const metadata = useProjectStore((state) => state.currentProject?.metadata)
  const shot = useGenerateStore((state) => projectId && data.shotId
    ? state.storyboards[projectId]?.shots.find((each) => each.id === data.shotId)
    : undefined)
  const keys = useGenerateStore((state) => state.keys)
  const form = useGenerateStore((state) => (data.model ? state.forms[modelKey(data.model.provider, data.model.id)] : undefined)) as ModelForm | undefined
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  useEffect(() => {
    if (!data.model || form) return
    generateApi.form(data.model.provider, data.model.id).then(
      (answer) => useGenerateStore.getState().setForm(answer.form),
      (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)),
    )
  }, [data.model, form])
  const inputs = form ? nodeValues(context.graph, id, form.fields, context.jobs) : { values: {}, waiting: [], left: 0 }
  const { elements, ready: elementsReady, error: elementsError } = useProjectElements(projectId)
  const planned = shot && form ? shotValues(form.fields, {
    prompt: shot.prompt,
    seconds: shot.seconds,
    aspect: metadata ? aspectOf(metadata.width, metadata.height) : undefined,
  }) : {}
  const settings = Object.fromEntries((form?.fields ?? []).flatMap((field) =>
    data.settings?.[field.key] === undefined ? [] : [[field.key, data.settings[field.key]]],
  ))
  const { values, left: excludedElements, noReferenceSlot } = applyElements(
    form?.fields ?? [], { ...settings, ...planned, ...inputs.values }, elements,
  )
  const videoIssue = openRouterVideoIssue(form, values)
  const referencesBlocked = inputs.left > 0 || excludedElements.length > 0 || !!videoIssue
  const { estimate } = useEstimate(form ? data.model?.provider : undefined, data.model?.id, values, 1)
  const missing = (form?.fields ?? []).filter((field) => field.required && field.default === undefined && (values[field.key] == null || values[field.key] === '' || (Array.isArray(values[field.key]) && (values[field.key] as unknown[]).length === 0)))
  const job = data.job ? context.jobs.get(data.job) : undefined
  const busy = running || ACTIVE.has(job?.status ?? '')
  const provider = data.model?.provider
  const setupIssue = !projectId ? t('generate.canvas.runNeedsProject')
    : !elementsReady ? elementsError ?? t('generate.form.loading')
    : !provider ? t('generate.model.choose')
    : !keys[provider] ? t('generate.canvas.runNeedsKey', { provider: PROVIDER_LABELS[provider] })
    : !form ? t(error ? 'generate.canvas.runNeedsForm' : 'generate.form.loading')
    : undefined
  const runBlocked = !!setupIssue || busy || missing.length > 0 || inputs.waiting.length > 0 || referencesBlocked
  const output = job?.status === 'done' ? job.outputs.find((each) => each.kind !== 'text') ?? job.outputs[0] : undefined
  const ports: Array<{ id: CanvasHandle; label: string }> = []
  if (!form || form.fields.some((field) => field.role === 'prompt')) {
    ports.push({ id: 'prompt', label: t('generate.canvas.input.prompt') })
  }
  for (const field of form?.fields ?? []) {
    if (field.type === 'media') ports.push({ id: `media:${field.key}`, label: field.label })
  }
  for (const edge of context.graph.edges) {
    if (edge.target !== id || ports.some((port) => port.id === edge.targetHandle)) continue
    const label = edge.targetHandle === 'media' || edge.targetHandle === 'prompt'
      ? t(`generate.canvas.input.${edge.targetHandle}`)
      : edge.targetHandle.slice(6)
    ports.push({ id: edge.targetHandle, label })
  }
  if (!form && !ports.some((port) => port.id === 'media')) ports.push({ id: 'media', label: t('generate.canvas.input.media') })
  const run = async () => {
    if (!data.model || !projectId || runBlocked) return
    setRunning(true)
    setError(null)
    try {
      const { jobs } = await generateApi.createJobs({ provider: data.model.provider, model: data.model.id, task: data.task, values, project_id: projectId, repeat: 1, place: false, place_at: null })
      for (const each of jobs) useGenerateStore.getState().upsertJob(each)
      const job = jobs[0]?.id ?? null
      if (data.shotId) {
        const video = data.task === 'video' || data.task === 'video_edit'
        useGenerateStore.getState().updateShot(projectId, data.shotId, video ? { videoJob: job } : { imageJob: job })
      } else {
        context.change(id, { job, outputMedia: undefined, outputText: undefined })
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setRunning(false)
    }
  }
  const renderField = (field: ModelForm['fields'][number]) => {
  const connected = Object.hasOwn(inputs.values, field.key) || context.graph.edges.some((edge) =>
    edge.target === id && (edge.targetHandle === `media:${field.key}` || (edge.targetHandle === 'prompt' && field.role === 'prompt')),
  )
  const storyboard = Object.hasOwn(planned, field.key)
  if (connected || storyboard) {
    return <div key={field.key} className="rounded bg-secondary/30 px-2 py-1.5 text-[11px]">
      <ModelFieldLabel field={field} />
      <span className="ml-2 text-muted-foreground">{t(connected ? 'generate.canvas.fromConnection' : 'generate.canvas.fromStoryboard')}</span>
    </div>
  }
  return <FieldControl key={field.key} field={field} value={settings[field.key]}
    onChange={(value) => {
      const next = { ...settings }
      if (value === undefined) delete next[field.key]
      else next[field.key] = value
      context.change(id, { settings: next })
    }} />
  }
  const optionalFields = form?.fields.filter((field) => !field.required) ?? []
  return (
    <NodeShell id={id} icon={Sparkles} title={shot?.label ? `${shot.label} · ${t(`generate.tasks.${data.task}`)}` : t(`generate.tasks.${data.task}`)} inputs={ports}>
      <select
        value={data.task}
        onChange={(event) => context.change(id, { task: event.target.value as Task, model: null, job: null, settings: undefined })}
        className="nodrag h-7 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-xs"
        aria-label={t('generate.canvas.task')}
      >
        {TASKS.map((task) => (
          <option key={task} value={task}>
            {t(`generate.tasks.${task}`)}
          </option>
        ))}
      </select>
      <div className="nodrag">
        <ModelPicker task={data.task} value={data.model ?? undefined} keys={keys} checkInputs={(candidate) => {
          const candidateInputs = nodeValues(context.graph, id, candidate.fields, context.jobs)
          const candidateValues = applyElements(candidate.fields, candidateInputs.values, elements)
          if (candidateInputs.left || candidateValues.left.length || openRouterVideoIssue(candidate, candidateValues.values)) return false
          if (candidateInputs.waiting.length) return undefined
          if (!Object.keys(candidateInputs.values).length) return undefined
          return true
        }} onChange={(entry) => {
          if (entry.id === data.model?.id && entry.provider === data.model.provider) return
          context.change(id, { model: { provider: entry.provider, id: entry.id } as ModelRef, job: null, settings: undefined })
        }} />
      </div>
      {form && form.fields.length > 0 && <details className="nodrag rounded border border-border p-2 text-xs">
        <summary className="cursor-pointer">{t('generate.canvas.modelSettings')}</summary>
        <div className="nowheel mt-2 max-h-72 space-y-2 overflow-y-auto">
          {form.fields.filter((field) => field.required).map(renderField)}
          {optionalFields.length > 0 && <details className="rounded border border-border p-2">
            <summary className="cursor-pointer">{t('generate.form.more', { count: optionalFields.length })}</summary>
            <div className="mt-2 space-y-2">{optionalFields.map(renderField)}</div>
          </details>}
        </div>
      </details>}
      {inputs.waiting.length > 0 && <p className="text-[11px] text-[var(--color-muted)]">{t('generate.canvas.waiting', { count: inputs.waiting.length })}</p>}
      {inputs.left > 0 && <p className="text-[11px] text-[var(--color-warn)]">{t('generate.canvas.noRoom', { count: inputs.left })}</p>}
      {videoIssue && <p role="alert" className="text-[11px] text-[var(--color-warn)]">{t(videoIssue)}</p>}
      {excludedElements.length > 0 && (
        <p role="alert" className="break-words text-[11px] text-[var(--color-warn)]">
          {t(noReferenceSlot ? 'generate.elements.noReferenceSlot' : 'generate.elements.blocked', { names: excludedElements.map((name) => `@${name}`).join(', ') })}
        </p>
      )}
      {missing.length > 0 && <p className="text-[11px] text-[var(--color-muted)]">{t('generate.form.missing', { fields: missing.map((field) => field.label).join(', ') })}</p>}
      {output && (
        <div className="space-y-1">
          {output.kind === 'text' ? (
            <p className="nowheel max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-secondary/40 p-2 text-[11px]">{output.text}</p>
          ) : (
            <div
              className="aspect-video overflow-hidden rounded bg-secondary"
              draggable
              onDragStart={(event) => event.dataTransfer.setData(OUTPUT_DRAG_TYPE, JSON.stringify({ job: job!.id, index: output.index, mime: output.mime }))}
            >
              <MediaThumb reference={{ job: job!.id, index: output.index }} />
            </div>
          )}
          {job!.imported.length > 0 && (
            <button type="button" onClick={() => job!.imported.forEach((mediaId) => {
              if (shot?.startSeconds === undefined) placeMediaAtPlayhead(mediaId)
              else placeMediaAt(mediaId, shot.startSeconds)
            })} className="nodrag inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]">
              <Film className="size-3" />
              {t('generate.actions.place')}
            </button>
          )}
        </div>
      )}
      {!job && data.outputMedia && (
        <div className="space-y-1">
          <div className="aspect-video overflow-hidden rounded bg-secondary">
            <MediaThumb reference={{ media: data.outputMedia.id }} />
          </div>
          <button type="button" className="nodrag text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => placeMediaAtPlayhead(data.outputMedia!.id)}>{t('generate.actions.place')}</button>
        </div>
      )}
      {!job && data.outputText && <p className="break-words text-[11px]">{data.outputText}</p>}
      {job?.status === 'failed' && <p className="break-words text-[11px] text-destructive">{job.error}</p>}
      {error && <p className="break-words text-[11px] text-destructive">{error}</p>}
      {setupIssue && <p role="status" className="break-words text-[11px] text-[var(--color-warn)]">{setupIssue}</p>}
      <Button size="sm" className="bg-brand nodrag h-8 w-full justify-between gap-2 text-xs" disabled={runBlocked} onClick={() => void run()}>
        <span className="inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {busy ? t(`generate.status.${job?.status ?? 'sending'}`) : output ? t('generate.canvas.runAgain') : t('generate.canvas.run')}
        </span>
        <span className="tabular-nums">{estimate?.estimate ? `${estimate.estimate.exact ? '' : '≈'}${formatUsd(estimate.estimate.usd)}` : t('generate.cost.unknown')}</span>
      </Button>
    </NodeShell>
  )
})

function RemovableEdge({
  id, selected, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style,
}: EdgeProps) {
  const { t } = useTranslation()
  const { removeEdge } = useContext(CanvasContext)
  const [path, x, y] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={24} style={{
        ...style,
        stroke: selected ? 'var(--color-text)' : 'var(--color-accent)',
        strokeWidth: selected ? 3 : 2,
      }} />
      {selected && <EdgeLabelRenderer>
        <button type="button"
          className="nodrag nopan pointer-events-auto absolute grid h-7 w-7 place-items-center rounded-full border border-border bg-background text-foreground shadow hover:bg-destructive hover:text-white"
          style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
          aria-label={t('generate.canvas.removeEdge')} title={t('generate.canvas.removeEdge')}
          onClick={(event) => { event.stopPropagation(); removeEdge(id) }}>
          <X className="h-4 w-4" />
        </button>
      </EdgeLabelRenderer>}
    </>
  )
}

const EDGE_TYPES = { removable: RemovableEdge }

const NODE_TYPES = { prompt: PromptNode, media: MediaNode, generate: GenerateNode }

function Canvas({ projectId, canvas }: { projectId: string; canvas: ProjectCanvas }) {
  const { t } = useTranslation()
  const jobList = useGenerateStore((state) => state.jobs)
  const mediaById = useMediaLibraryStore((state) => state.mediaById)
  const subscribe = useCallback((listener: () => void) => {
    canvas.listeners.add(listener)
    return () => { canvas.listeners.delete(listener) }
  }, [canvas])
  const storedGraph = useSyncExternalStore(subscribe, () => canvas.graph)
  const shots = useGenerateStore((state) => state.storyboards[projectId]?.shots)
  const graph = useMemo(() => {
    const byId = new Map(shots?.map((shot, index) => [shot.id, { shot, index }]))
    return { ...storedGraph, nodes: storedGraph.nodes.map((node) => {
      const entry = node.data.shotId ? byId.get(node.data.shotId) : undefined
      return storyboardNode(node, entry?.shot, entry?.index ?? 0)
    }) }
  }, [storedGraph, shots])
  const flow = useReactFlow()
  const [viewportReady, setViewportReady] = useState(false)
  const focus = useGenerateStore((state) => state.workflowFocus?.projectId === projectId ? state.workflowFocus : undefined)
  const fitWholeCanvasOnOpen = useRef(!focus)
  const saving = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const jobs = useMemo(() => new Map(jobList.map((job) => [job.id, job])), [jobList])

  const persist = useCallback(() => {
    void saveProjectCanvas(projectId, canvas)
      .then(() => setSaveError(null), (failure: unknown) => setSaveError(String(failure)))
  }, [projectId, canvas])

  useEffect(() => () => {
    if (saving.current === null) return
    clearTimeout(saving.current)
    saving.current = null
    persist()
  }, [persist])

  const update = useCallback(
    (change: (current: CanvasGraph) => CanvasGraph) => {
      changeProjectCanvas(canvas, change(canvas.graph))
      if (saving.current !== null) clearTimeout(saving.current)
      saving.current = setTimeout(() => {
        saving.current = null
        persist()
      }, 400)
    },
    [canvas, persist],
  )
  const [dropError, setDropError] = useState<string | null>(null)
  const placeDroppedMedia = useCallback((targetId: string | undefined, data: Extract<CanvasNode, { type: 'media' }>['data'], position: { x: number; y: number }) => {
    const target = canvas.graph.nodes.find((node) => node.id === targetId)
    if (targetId && target?.type !== 'media') return
    if (target?.type === 'media' && target.data.shotId) {
      const store = useGenerateStore.getState()
      const shot = store.storyboards[projectId]?.shots.find((each) => each.id === target.data.shotId)
      const ref = data.ref
      const mediaId = ref && typeof ref === 'object' && 'media' in ref ? ref.media : undefined
      if (!shot || !mediaId || data.kind !== target.data.kind || data.kind === 'audio') {
        setDropError(t('generate.canvas.linkedDrop'))
        return
      }
      if (data.kind === 'image') store.updateShot(projectId, shot.id, { frameMediaId: mediaId })
      else {
        store.updateShot(projectId, shot.id, { previs: { ...shot.previs, video: mediaId } })
        if (typeof target.data.ref === 'string') {
          update((graph) => ({ ...graph, nodes: graph.nodes.map((node) =>
            node.id === targetId && node.type === 'media' ? { ...node, data: { ...node.data, ref: null } } : node,
          ) }))
        }
      }
      return
    }
    update((graph) => ({
      ...graph,
      nodes: target?.type === 'media'
        ? graph.nodes.map((node) => node.id === target.id ? { ...target, data } : node)
        : [...graph.nodes, { id: crypto.randomUUID(), type: 'media', position, data }],
    }))
  }, [canvas, projectId, t, update])

  const importFile = useCallback(async (targetId: string | undefined, file: File, position = { x: 0, y: 0 }) => {
    setDropError(null)
    const kind = KINDS.find((each) => file.type.startsWith(each + '/'))
    if (!kind) {
      setDropError(t('generate.canvas.unsupportedDrop'))
      return
    }
    const target = canvas.graph.nodes.find((node) => node.id === targetId)
    if (target?.type === 'media' && target.data.shotId && target.data.kind !== kind) {
      setDropError(t('generate.canvas.linkedDrop'))
      return
    }
    try {
      const media = await mediaLibraryService.importDroppedFile(file, projectId)
      if (useProjectStore.getState().currentProject?.id !== projectId) return
      await useMediaLibraryStore.getState().loadMediaItems()
      if (useProjectStore.getState().currentProject?.id !== projectId) return
      placeDroppedMedia(targetId, { ref: { media: media.id }, kind, name: media.fileName }, position)
    } catch (error) {
      setDropError(String(error))
    }
  }, [canvas, placeDroppedMedia, projectId, t])

  const context = useMemo<NodeContext>(
    () => ({
      graph,
      jobs,
      importFile,
      change: (id, data) => update((current) => ({ ...current, nodes: current.nodes.map((node) => (node.id === id ? ({ ...node, data: { ...node.data, ...data } } as CanvasNode) : node)) })),
      removeEdge: (id) => update((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== id) })),
      remove: (id) => update((current) => ({ nodes: current.nodes.filter((node) => node.id !== id), edges: current.edges.filter((edge) => edge.source !== id && edge.target !== id) })),
    }),
    [graph, importFile, jobs, update],
  )

  const canvasElement = useRef<HTMLDivElement>(null)
  // Keep measured sizes alongside the graph, including for cards with expanded settings.
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({})
  const [frontNode, setFrontNode] = useState<string>()
  const nextPosition = (type: CanvasNode['type']) => {
    const rect = canvasElement.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const width = 288
    const height = type === 'generate' ? 260 : type === 'prompt' ? 168 : 120
    const gap = 20
    const center = flow.screenToFlowPosition({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }, { snapToGrid: false })
    const fallback = { x: center.x - width / 2, y: center.y - height / 2 }
    const start = flow.screenToFlowPosition({ x: rect.left + 16, y: rect.top + 56 }, { snapToGrid: false })
    const end = flow.screenToFlowPosition({ x: rect.right - 16, y: rect.bottom - 16 }, { snapToGrid: false })
    const right = end.x - width
    const bottom = end.y - height
    if (right < start.x || bottom < start.y) return fallback

    const obstacles = canvas.graph.nodes.map((node) => ({
      x: node.position.x,
      y: node.position.y,
      right: node.position.x + (measured[node.id]?.width ?? 288),
      bottom: node.position.y + (measured[node.id]?.height ?? 260),
    })).filter((node) => node.right + gap > start.x && node.x - gap < end.x &&
      node.bottom + gap > start.y && node.y - gap < end.y)
    const xs = [start.x, right, Math.max(start.x, Math.min(right, fallback.x))]
    const ys = [start.y, bottom, Math.max(start.y, Math.min(bottom, fallback.y))]
    for (const node of obstacles) {
      xs.push(node.x - gap - width, node.right + gap)
      ys.push(node.y - gap - height, node.bottom + gap)
    }
    let best = fallback
    let distance = Infinity
    for (const x of new Set(xs)) {
      if (x < start.x || x > right) continue
      for (const y of new Set(ys)) {
        if (y < start.y || y > bottom) continue
        const score = (x - fallback.x) ** 2 + (y - fallback.y) ** 2
        if (score >= distance || obstacles.some((node) =>
          x < node.right + gap && x + width + gap > node.x && y < node.bottom + gap && y + height + gap > node.y,
        )) continue
        best = { x, y }
        distance = score
      }
    }
    return best
  }
  const add = (type: CanvasNode['type'], position = nextPosition(type), extra?: Partial<CanvasNode['data']>) => {
    const id = crypto.randomUUID()
    const data =
      type === 'prompt' ? { text: '' } : type === 'media' ? { ref: null, kind: null, name: '' } : { task: 'image' as Task, model: null, job: null }
    setFrontNode(id)
    update((current) => ({ ...current, nodes: [...current.nodes, { id, type, position, data: { ...data, ...extra } } as CanvasNode] }))
  }

  useEffect(() => {
    if (!focus || !viewportReady) return
    const targets = storedGraph.nodes.filter((node) => node.data.shotId === focus.shotId)
    if (!targets.length || targets.some((node) => !measured[node.id])) return
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ nodes: targets.map(({ id }) => ({ id })), padding: 0.2, maxZoom: 1 }).then((fitted) => {
        if (fitted && useGenerateStore.getState().workflowFocus === focus) {
          useGenerateStore.setState({ workflowFocus: undefined })
        }
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [flow, focus, measured, storedGraph.nodes, viewportReady])

  const nodes: Node[] = graph.nodes.map((node) => ({ id: node.id, type: node.type, position: node.position, data: node.data, measured: measured[node.id], zIndex: node.id === frontNode ? 1 : undefined }))
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set())
  const edges: Edge[] = graph.edges.map((edge) => ({
    ...edge,
    animated: graph.nodes.find((node) => node.id === edge.source)?.type === 'generate',
    type: 'removable',
    selected: selectedEdges.has(edge.id),
  }))

  const onNodesChange = (changes: NodeChange[]) => {
    const sizes = changes.flatMap((change) => (change.type === 'dimensions' && change.dimensions ? [[change.id, change.dimensions] as const] : []))
    if (sizes.length > 0) setMeasured((current) => ({ ...current, ...Object.fromEntries(sizes) }))
    if (changes.every((change) => change.type === 'dimensions' || change.type === 'select')) return
    const next = applyNodeChanges(changes, nodes)
    update((current) => {
      const removed = new Set(current.nodes.filter((node) => !next.some((each) => each.id === node.id)).map((node) => node.id))
      return {
        nodes: current.nodes.filter((node) => !removed.has(node.id)).map((node) => ({ ...node, position: next.find((each) => each.id === node.id)?.position ?? node.position })),
        edges: current.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)),
      }
    })
  }
  const onEdgesChange = (changes: EdgeChange[]) => {
    const next = applyEdgeChanges(changes, edges)
    setSelectedEdges(new Set(next.filter((edge) => edge.selected).map((edge) => edge.id)))
    if (!changes.some((change) => change.type === 'remove')) return
    const kept = new Set(next.map((edge) => edge.id))
    update((current) => ({ ...current, edges: current.edges.filter((edge) => kept.has(edge.id)) }))
  }
  const valid = (connection: Connection | Edge) => {
    const source = graph.nodes.find((node) => node.id === connection.source)
    const target = graph.nodes.find((node) => node.id === connection.target)
    const handle = connection.targetHandle
    if (!source || target?.type !== 'generate' || !isCanvasHandle(handle) ||
        connection.source === connection.target || !connects(source, handle)) return false
    const model = target.data.model
    const form = model && useGenerateStore.getState().forms[modelKey(model.provider, model.id)]
    if (!form) return handle === 'prompt' || handle === 'media'
    if (handle === 'prompt') return form.fields.some((field) => field.role === 'prompt')
    if (handle === 'media') return false
    const slot = form.fields.find((field) => field.key === handle.slice(6))
    if (slot?.type !== 'media' || (source.type === 'media' && source.data.kind !== slot.media)) return false
    return graph.edges.filter((edge) => edge.target === target.id && edge.targetHandle === handle).length < slot.max
  }
  const onConnect = (connection: Connection) => {
    if (!isCanvasHandle(connection.targetHandle) || !valid(connection)) return
    const edge: CanvasEdge = { id: crypto.randomUUID(), source: connection.source, target: connection.target, targetHandle: connection.targetHandle }
    update((current) => ({ ...current, edges: [...current.edges, edge] }))
  }
  const newId = () => crypto.randomUUID()
  /** Puts a piece of graph to the right of what is on the canvas and brings it into view. */
  const insert = (piece: CanvasGraph) => {
    update((current) => ({
      nodes: [...current.nodes, ...piece.nodes],
      edges: [...current.edges, ...piece.edges],
    }))
    const ids = new Set(piece.nodes.map((node) => node.id))
    setTimeout(
      () => void flow.fitView({ nodes: [...ids].map((id) => ({ id })), maxZoom: 1, duration: 300 }),
      50,
    )
  }
  const placeTemplate = (template: WorkflowTemplate) => {
    const { modelByTask } = useGenerateStore.getState()
    const models = (task: Task) =>
      [modelByTask[task]].filter(
        (model): model is ModelRef => !!model,
      )
    insert(
      instantiate(
        template,
        besideGraph(canvas.graph),
        models,
        (id, key) => t(`generate.canvas.workflow.template.${id}.prompts.${key}`),
        newId,
      ),
    )
  }
  const fileInput = useRef<HTMLInputElement | null>(null)
  const openWorkflow = async (file: File) => {
    try {
      const { graph: piece } = readWorkflowFile(await file.text(), newId)
      insert(moveTo(piece, besideGraph(canvas.graph)))
    } catch (failure) {
      toast.error(
        t('generate.canvas.workflow.failed', {
          reason: failure instanceof Error ? failure.message : String(failure),
        }),
      )
    }
  }
  const projectName = useProjectStore((state) => state.currentProject?.name ?? '')


  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDropError(null)
    const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const nodeId = event.target instanceof Element
      ? (event.target.closest('[data-canvas-node-id]') as HTMLElement | null)?.dataset.canvasNodeId
      : undefined
    const targetId = graph.nodes.some((node) => node.id === nodeId && node.type === 'media') ? nodeId : undefined
    try {
      const output = event.dataTransfer.getData(OUTPUT_DRAG_TYPE)
      if (output) {
        const parsed = JSON.parse(output) as { job: string; index: number; mime: string }
        const job = jobs.get(parsed.job)
        const result = job?.outputs.find((item) => item.index === parsed.index)
        const kind = KINDS.find((each) => result?.kind === each)
        if (!kind) return
        const imported = job?.imported.find((mediaId) => mediaById[mediaId]?.mimeType.startsWith(kind + '/'))
        const ref = imported && job?.outputs.filter((item) => item.kind === kind).length === 1
          ? { media: imported }
          : { job: parsed.job, index: parsed.index }
        placeDroppedMedia(targetId, { ref, kind, name: job?.model_name ?? '' }, position)
        return
      }
      const raw = event.dataTransfer.getData('application/json')
      const data = raw ? (JSON.parse(raw) as ReturnType<typeof getMediaDragData>) : getMediaDragData()
      const mediaId = data?.type === 'media-item' ? data.mediaId : data?.type === 'media-items' && data.items?.length === 1 ? data.items[0]?.mediaId : undefined
      // Some internal drags also carry a File. The project media ID takes priority.
      if (data?.type === 'media-item' || data?.type === 'media-items') {
        const item = mediaId ? useMediaLibraryStore.getState().mediaById[mediaId] : undefined
        const kind = KINDS.find((each) => item?.mimeType.startsWith(each + '/'))
        if (kind && item) placeDroppedMedia(targetId, { ref: { media: item.id }, kind, name: item.fileName }, position)
        return
      }
      const file = event.dataTransfer.files[0]
      if (file) void importFile(targetId, file, position)
    } catch {
      setDropError(t('generate.canvas.unsupportedDrop'))
    }
  }

  return (
    <CanvasContext.Provider value={context}>
    <div ref={canvasElement} className="relative h-full w-full" onDragOver={(event) => event.preventDefault()} onDrop={onDrop} data-testid="node-canvas">
      {(dropError || saveError) && <p role="alert" className="absolute bottom-2 left-2 z-10 rounded bg-background p-2 text-xs text-destructive">{dropError || saveError}</p>}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        deleteKeyCode={['Backspace', 'Delete']}
        onConnect={onConnect}
        isValidConnection={valid}
        colorMode="dark"
        onInit={() => setViewportReady(true)}
        fitView={fitWholeCanvasOnOpen.current}
        fitViewOptions={{ maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ style: { stroke: 'var(--color-accent)', strokeWidth: 2 } }}
      >
        <Background gap={24} size={1} color="var(--color-border)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable maskColor="rgb(10 10 11 / 0.7)" nodeColor="var(--color-overlay)" />
      </ReactFlow>
      <div className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-1.5 shadow-lg">
        {(['prompt', 'media', 'generate'] as const).map((type) => (
          <Button key={type} size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => add(type)}>
            <Plus className="size-3" />
            {t(`generate.canvas.${type}`)}
          </Button>
        ))}
          <span className="mx-0.5 h-5 w-px bg-[var(--color-border)]" aria-hidden />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
                <LayoutTemplate className="size-3" />
                {t('generate.canvas.workflow.templates')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {WORKFLOW_TEMPLATES.map((template) => (
                <DropdownMenuItem
                  key={template.id}
                  onSelect={() => placeTemplate(template)}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="text-xs font-medium">
                    {t(`generate.canvas.workflow.template.${template.id}.name`)}
                  </span>
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {t(`generate.canvas.workflow.template.${template.id}.about`)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            disabled={graph.nodes.length === 0}
            onClick={() => void saveWorkflow(workflowFile(graph, projectName), projectName)}
          >
            <FileDown className="size-3" />
            {t('generate.canvas.workflow.save')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => fileInput.current?.click()}
          >
            <FileUp className="size-3" />
            {t('generate.canvas.workflow.open')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label={t('generate.canvas.workflow.open')}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void openWorkflow(file)
            }}
          />
      </div>
      {graph.nodes.length === 0 && (
        <p className="pointer-events-none absolute left-1/2 top-1/2 z-10 max-w-md -translate-x-1/2 -translate-y-1/2 text-center text-sm text-[var(--color-muted)]">{t('generate.canvas.empty')}</p>
      )}
    </div>
    </CanvasContext.Provider>
  )
}

/**
 * The node canvas workspace, as Weave's and Flora's: text, files and model runs as nodes joined by what they
 * pass on, kept with the project on the server; runs go through the same queue, history and prices as the
 * generation panel.
 */
export function NodeCanvas() {
  const { t } = useTranslation()
  const projectId = useProjectStore((state) => state.currentProject?.id ?? null)
  const [loaded, setLoaded] = useState<{ id: string; canvas?: ProjectCanvas; error?: string } | null>(null)
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    Promise.resolve().then(() => loadProjectCanvas(projectId))
      .then((canvas) => {
        if (!cancelled) setLoaded({ id: projectId, canvas })
      }, (failure: unknown) => {
        if (!cancelled) setLoaded({ id: projectId, error: String(failure) })
      })
    return () => { cancelled = true }
  }, [projectId])
  if (!projectId) return <p className="p-6 text-sm text-[var(--color-muted)]">{t('generate.storyboard.noProject')}</p>
  if (loaded?.id !== projectId) return <Loader2 className="m-6 h-5 w-5 animate-spin" />
  if (!loaded.canvas) return <p role="alert" className="p-6 text-sm text-destructive">{loaded.error}</p>
  return (
    <ReactFlowProvider key={projectId}>
      <Canvas projectId={projectId} canvas={loaded.canvas} />
    </ReactFlowProvider>
  )
}
