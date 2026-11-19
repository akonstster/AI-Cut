import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clapperboard, Film, ImageIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useEditorStore } from '@/shared/state/editor'
import { useMediaLibraryStore, useProjectStore } from '../deps/editor'
import { formatUsd, generateApi, type Job, type ModelForm } from '../services/generate-api'
import { placeMediaAt } from '../services/timeline-actions'
import { applyElements } from '../services/prompt-elements'
import { splitScript } from '../services/prompt-assist'
import {
  aspectOf,
  sentSeconds,
  shotValues,
  retimeShots,
  type Shot,
  type Storyboard,
} from '../services/storyboard'
import { addShotWorkflow } from '../services/project-canvas'
import { playheadSeconds } from '../services/timeline-actions'
import { modelKey, useGenerateStore, type ModelRef } from '../stores/generate-store'
import { MediaThumb } from './field-control'
import { PromptElements } from './prompt-elements'
import { useProjectElements } from '../hooks/use-project-elements'
import { ModelPicker } from './model-picker'

const EMPTY: Storyboard = { script: '', shots: [] }
const ACTIVE = new Set(['queued', 'sending', 'running'])

function useForm(model: ModelRef | undefined): {
  form: ModelForm | undefined
  error: string | null
} {
  const form = useGenerateStore((state) =>
    model ? state.forms[modelKey(model.provider, model.id)] : undefined,
  )
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setError(null)
    if (!model || form) return
    generateApi.form(model.provider, model.id).then(
      (answer) => useGenerateStore.getState().setForm(answer.form),
      (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)),
    )
  }, [model, form])
  return { form, error }
}

function JobState({ job, kind }: { job: Job | undefined; kind: 'frame' | 'clip' }) {
  const { t } = useTranslation()
  if (!job) return null
  if (ACTIVE.has(job.status)) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t(`generate.status.${job.status}`)}
        {job.progress !== null && job.status === 'running' && ` ${Math.round(job.progress * 100)}%`}
      </span>
    )
  }
  if (job.status === 'failed')
    return (
      <span className="break-words text-[11px] text-destructive">
        {t(`generate.storyboard.${kind}Failed`, { reason: job.error ?? '' })}
      </span>
    )
  if (job.status === 'done')
    return (
      <span className="text-[11px] text-muted-foreground">
        {t(`generate.storyboard.${kind}Done`)}
      </span>
    )
  return null
}

/**
 * The storyboard of the open project, as LTX Studio's: a script is split into shots by a language model, each
 * shot gets a frame from the chosen picture model and then a clip from the chosen video model that starts on
 * that frame, and the clips land one after another on the timeline from the playhead. "@element" names in the
 * shots bring their pictures, so a character stays the same from shot to shot.
 */
export function StoryboardPanel() {
  const { t, i18n } = useTranslation()
  const project = useProjectStore((state) => state.currentProject)
  const projectId = project?.id ?? null
  const board =
    useGenerateStore((state) => (projectId ? state.storyboards[projectId] : undefined)) ?? EMPTY
  const media = useMediaLibraryStore((state) => state.mediaItems)
  const models = useGenerateStore((state) => state.storyboardModels)
  const { elements, ready: elementsReady, error: elementsError } = useProjectElements(projectId)
  const keys = useGenerateStore((state) => state.keys)
  const jobs = useGenerateStore((state) => state.jobs)
  const { form: imageForm, error: imageFormError } = useForm(models.image)
  const { form: videoForm, error: videoFormError } = useForm(models.video)
  const [picker, setPicker] = useState<{ projectId: string; shotId: string; kind: 'image' | 'video' }>()
  const [mediaQuery, setMediaQuery] = useState('')
  const [mediaLimit, setMediaLimit] = useState(24)
  const selectedShot = picker && picker.projectId === projectId
    ? board.shots.find((shot) => shot.id === picker.shotId)
    : undefined
  const mediaLabel = (kind: 'image' | 'video') => t(kind === 'image' ? 'generate.storyboard.libraryFrame' : 'generate.storyboard.libraryPrevis')
  const selectedMedia = picker?.kind === 'image' ? selectedShot?.frameMediaId : selectedShot?.previs?.video
  const matchingMedia = picker ? media.filter((item) =>
    item.mimeType.startsWith(picker.kind + '/') &&
    item.fileName.toLowerCase().includes(mediaQuery.trim().toLowerCase()),
  ) : []
  const selectMedia = (id?: string) => {
    if (!picker || !selectedShot) return
    const store = useGenerateStore.getState()
    const shot = store.storyboards[picker.projectId]?.shots.find((each) => each.id === picker.shotId)
    if (!shot) return
    store.updateShot(picker.projectId, shot.id, picker.kind === 'image'
      ? { frameMediaId: id }
      : { previs: { ...shot.previs, video: id } })
    setPicker(undefined)
  }
  const [count, setCount] = useState(6)
  const [splitting, setSplitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prices, setPrices] = useState<{
    frames: number | null
    clips: number | null
    error: string | null
  }>({ frames: null, clips: null, error: null })
  const aspect = project?.metadata
    ? aspectOf(project.metadata.width, project.metadata.height)
    : undefined
  const jobOf = (id: string | null) => (id ? jobs.find((job) => job.id === id) : undefined)
  const frameOf = (shot: Shot) =>
    shot.frameMediaId ? { media: shot.frameMediaId } : jobOf(shot.imageJob)?.status === 'done' ? { job: shot.imageJob!, index: 0 } : shot.previs?.frame ? { media: shot.previs.frame } : undefined
  const needsFrame = videoForm?.fields.some((field) => field.role === 'first_frame') ?? false

  const save = (next: Storyboard) =>
    projectId && useGenerateStore.getState().setStoryboard(projectId, next)
  const frameInputs = (shot: Shot) =>
    imageForm
      ? applyElements(imageForm.fields, shotValues(imageForm.fields, { prompt: shot.prompt, aspect }), elements)
      : null
  const clipInputs = (shot: Shot) =>
    videoForm
      ? applyElements(videoForm.fields, shotValues(videoForm.fields, {
            prompt: shot.prompt,
            seconds: shot.seconds,
            firstFrame: frameOf(shot),
            aspect,
          }), elements)
      : null

  const moveShot = (index: number, direction: number) => {
    const shots = [...board.shots]
    const target = index + direction
    if (target < 0 || target >= shots.length) return
    ;[shots[index], shots[target]] = [shots[target]!, shots[index]!]
    save({ ...board, shots: retimeShots(shots, board.shots[0]?.startSeconds ?? 0) })
  }
  const frameValues = (shot: Shot) => frameInputs(shot)?.values ?? null
  const clipValues = (shot: Shot) => clipInputs(shot)?.values ?? null

  const frameDue = (shot: Shot) => !frameOf(shot) && !ACTIVE.has(jobOf(shot.imageJob)?.status ?? '')
  const clipDue = (shot: Shot) =>
    (!needsFrame || !!frameOf(shot)) &&
    !ACTIVE.has(jobOf(shot.videoJob)?.status ?? '') &&
    jobOf(shot.videoJob)?.status !== 'done' && !shot.clipMediaId
  const priceKey = JSON.stringify([
    models,
    elements,
    board.shots.map((shot) => [shot.prompt, shot.seconds, frameDue(shot), clipDue(shot)]),
    imageForm?.id,
    videoForm?.id,
  ])
  useEffect(() => {
    let cancelled = false
    const total = async (
      form: ModelForm | undefined,
      model: ModelRef | undefined,
      values: Array<Record<string, unknown> | null>,
    ) => {
      if (!form || !model || values.length === 0) return null
      const answers = await Promise.all(
        values.map((each) =>
          each ? generateApi.estimate(model.provider, model.id, each, 1) : null,
        ),
      )
      return answers.every((answer) => answer?.estimate)
        ? answers.reduce((sum, answer) => sum + (answer?.estimate?.usd ?? 0), 0)
        : null
    }
    Promise.all([
      total(imageForm, models.image, board.shots.filter(frameDue).map(frameValues)),
      total(videoForm, models.video, board.shots.filter(clipDue).map(clipValues)),
    ]).then(
      ([frames, clips]) => !cancelled && setPrices({ frames, clips, error: null }),
      (failure: unknown) =>
        !cancelled &&
        setPrices({
          frames: null,
          clips: null,
          error: failure instanceof Error ? failure.message : String(failure),
        }),
    )
    return () => {
      cancelled = true
    }
  }, [priceKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!projectId)
    return <p className="p-3 text-xs text-muted-foreground">{t('generate.storyboard.noProject')}</p>

  const split = async () => {
    setSplitting(true)
    setError(null)
    try {
      const shots = await splitScript(board.script, count, i18n.language)
      save({
        ...board,
        shots: shots.map((shot) => ({
          id: crypto.randomUUID(),
          prompt: shot.prompt,
          seconds: shot.seconds,
          imageJob: null,
          videoJob: null,
        })),
      })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSplitting(false)
    }
  }

  const run = async (kind: 'frame' | 'clip', shot: Shot, placeAt: number | null) => {
    const model = kind === 'frame' ? models.image : models.video
    const inputs = kind === 'frame' ? frameInputs(shot) : clipInputs(shot)
    if (!elementsReady) throw new Error(elementsError ?? t('generate.form.loading'))
    if (!model || !inputs) return
    if (inputs.left.length) {
      throw new Error(t(inputs.noReferenceSlot ? 'generate.elements.noReferenceSlot' : 'generate.elements.blocked', { names: inputs.left.map((name) => `@${name}`).join(', ') }))
    }
    const { values } = inputs
    const { jobs: created } = await generateApi.createJobs({
      provider: model.provider,
      model: model.id,
      task: kind === 'frame' ? 'image' : 'video',
      values,
      project_id: projectId,
      repeat: 1,
      place: placeAt !== null,
      place_at: placeAt,
    })
    for (const job of created) useGenerateStore.getState().upsertJob(job)
    const id = created[0]?.id ?? null
    useGenerateStore
      .getState()
      .updateShot(projectId, shot.id, kind === 'frame' ? { imageJob: id } : { videoJob: id })
  }

  const attempt = (work: () => Promise<void>) => {
    setError(null)
    work().catch((failure: unknown) =>
      setError(failure instanceof Error ? failure.message : String(failure)),
    )
  }

  // the clips one after another from the playhead, each as long as the model makes it; a shot whose clip is
  // made or still running keeps its place
  const allClips = async () => {
    if (!videoForm) return
    let at = playheadSeconds()
    for (const shot of board.shots) {
      at = shot.startSeconds ?? at
      if (clipDue(shot)) await run('clip', shot, at)
      at += sentSeconds(videoForm.fields, clipValues(shot) ?? {}, shot.seconds)
    }
  }

  const framesMissing = board.shots.filter(frameDue).length
  const clipsReady = board.shots.filter(clipDue).length

  return (
    // one column that scrolls as a whole with the run buttons stuck to the bottom, as the generation panel
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="storyboard-panel">
      <div className="px-3 pt-2"><PromptElements key={projectId} projectId={projectId} fields={[]} values={{}} /></div>
      <div className="space-y-3 p-3">
        <div className="space-y-1">
          <Label htmlFor="storyboard-script" className="text-[11px] text-muted-foreground">
            {t('generate.storyboard.script')}
          </Label>
          <Textarea
            id="storyboard-script"
            value={board.script}
            onChange={(event) => save({ ...board, script: event.target.value })}
            placeholder={t('generate.storyboard.scriptHint')}
            className="min-h-24 resize-y bg-secondary/30 text-xs"
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {t('generate.storyboard.count')}
              <Input
                type="number"
                min={2}
                max={12}
                value={count}
                onChange={(event) =>
                  setCount(Math.min(12, Math.max(2, Number(event.target.value) || 2)))
                }
                className="h-7 w-12 px-1 text-center text-xs"
              />
            </label>
            <Button
              size="sm"
              className="h-7 flex-1 gap-1 text-xs"
              disabled={splitting || !board.script.trim() || !keys.openrouter}
              onClick={() => void split()}
              title={
                keys.openrouter
                  ? t('generate.storyboard.splitHint')
                  : t('generate.improve.needsKey')
              }
            >
              {splitting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Clapperboard className="h-3 w-3" />
              )}
              {t('generate.storyboard.split')}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              {t('generate.storyboard.frameModel')}
            </p>
            <ModelPicker
              task="image"
              value={models.image}
              keys={keys}
              onChange={(entry) =>
                useGenerateStore.getState().setStoryboardModel('image', {
                  provider: entry.provider,
                  id: entry.id,
                })
              }
            />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              {t('generate.storyboard.clipModel')}
            </p>
            <ModelPicker
              task="video"
              value={models.video}
              keys={keys}
              onChange={(entry) =>
                useGenerateStore.getState().setStoryboardModel('video', {
                  provider: entry.provider,
                  id: entry.id,
                })
              }
            />
          </div>
        </div>

        {[error, imageFormError, videoFormError, prices.error].filter(Boolean).map((message) => (
          <p
            key={message}
            className="break-words rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive"
          >
            {message}
          </p>
        ))}

        {board.shots.length > 0 && (
          <ol className="space-y-2" aria-label={t('generate.storyboard.shots')}>
            {board.shots.map((shot, index) => {
              const frame = frameOf(shot)
              const frameJob = jobOf(shot.imageJob)
              const clipJob = jobOf(shot.videoJob)
              return (
                <li
                  key={shot.id}
                  className="space-y-1.5 rounded-md border border-border bg-secondary/20 p-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium">
                      {t('generate.storyboard.shot', { number: index + 1 })}
                      {shot.startSeconds != null && <span className="ml-2 text-muted-foreground">{shot.startSeconds}s</span>}
                    </span>
                    <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                      {t('generate.storyboard.seconds')}
                      <Input
                        type="number"
                        min={0.1}
                        step="any"
                        value={shot.seconds}
                        onChange={(event) =>
                          useGenerateStore.getState().updateShot(projectId, shot.id, {
                            seconds: Math.max(0.1, Number(event.target.value) || 0.1),
                          })
                        }
                        className="h-6 w-12 px-1 text-center text-[11px]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        save({
                          ...board,
                          shots: retimeShots(board.shots.filter((each) => each.id !== shot.id), board.shots[0]?.startSeconds ?? 0),
                        })
                      }
                      aria-label={t('generate.storyboard.remove', {
                        number: index + 1,
                      })}
                      title={t('generate.storyboard.remove', {
                        number: index + 1,
                      })}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Input className="h-7 flex-1" value={shot.label ?? ''} placeholder={t('generate.storyboard.shotName')}
                      aria-label={t('generate.storyboard.shotName')}
                      onChange={(event) => useGenerateStore.getState().updateShot(projectId, shot.id, { label: event.target.value })} />
                    <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => moveShot(index, -1)} aria-label={t('generate.storyboard.moveUp')}>↑</Button>
                    <Button size="sm" variant="ghost" disabled={index === board.shots.length - 1} onClick={() => moveShot(index, 1)} aria-label={t('generate.storyboard.moveDown')}>↓</Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      useGenerateStore.setState({ blockingShot: { projectId, shotId: shot.id } })
                      useEditorStore.getState().setActiveTab('blocking')
                    }}>3D</Button>
                    <Button size="sm" variant="outline" onClick={() => attempt(async () => {
                      await addShotWorkflow(projectId, shot.id, models.video)
                      useGenerateStore.setState({ workflowFocus: { projectId, shotId: shot.id } })
                      useEditorStore.getState().setWorkspace('canvas')
                    })}>Workflow</Button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {(['image', 'video'] as const).map((kind) => {
                      const id = kind === 'image' ? shot.frameMediaId : shot.previs?.video
                      const label = mediaLabel(kind)
                      const fileName = media.find((item) => item.id === id)?.fileName
                      return <Button key={kind} size="sm" variant="outline" className="h-auto min-h-8 justify-start gap-2 px-2"
                        onClick={() => {
                          setMediaQuery('')
                          setMediaLimit(24)
                          setPicker({ projectId, shotId: shot.id, kind })
                        }}>
                        {id && <span className="h-7 w-10 shrink-0 overflow-hidden rounded bg-muted"><MediaThumb reference={{ media: id }} /></span>}
                        <span className="min-w-0 text-left">
                          <span className="block truncate">{label}</span>
                          {fileName && <span className="block truncate text-xs text-muted-foreground">{fileName}</span>}
                        </span>
                      </Button>
                    })}
                  </div>
                  <div className="flex gap-2">
                    <div className="h-16 w-24 shrink-0 overflow-hidden rounded-sm bg-secondary">
                      {frame && <MediaThumb reference={frame} />}
                    </div>
                    <Textarea
                      value={shot.prompt}
                      aria-label={t('generate.storyboard.shot', {
                        number: index + 1,
                      })}
                      onChange={(event) =>
                        useGenerateStore.getState().updateShot(projectId, shot.id, {
                          prompt: event.target.value,
                        })
                      }
                      className="min-h-16 flex-1 resize-y bg-secondary/30 text-[11px]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button
                      type="button"
                      disabled={!imageForm || ACTIVE.has(frameJob?.status ?? '')}
                      onClick={() => attempt(() => run('frame', shot, null))}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      <ImageIcon className="h-3 w-3" />
                      {frame ? t('generate.storyboard.frameAgain') : t('generate.storyboard.frame')}
                    </button>
                    <JobState job={frameJob} kind="frame" />
                    <button
                      type="button"
                      disabled={
                        !videoForm || (needsFrame && !frame) || ACTIVE.has(clipJob?.status ?? '')
                      }
                      title={
                        needsFrame && !frame ? t('generate.storyboard.clipNeedsFrame') : undefined
                      }
                      onClick={() => attempt(() => run('clip', shot, shot.startSeconds ?? null))}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      <Film className="h-3 w-3" />
                      {t('generate.storyboard.clip')}
                    </button>
                    <JobState job={clipJob} kind="clip" />
                    {shot.clipMediaId && !clipJob && (
                      <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => placeMediaAt(shot.clipMediaId!, shot.startSeconds ?? 0)}>
                        {t('generate.actions.place')}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        <button
          type="button"
          onClick={() =>
            save({
              ...board,
              shots: [
                ...board.shots,
                {
                  id: crypto.randomUUID(),
                  prompt: '',
                  seconds: 5,
                  imageJob: null,
                  videoJob: null,
                },
              ],
            })
          }
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {t('generate.storyboard.add')}
        </button>
      </div>
      {board.shots.length > 0 && (
        <div className="sticky bottom-0 z-10 space-y-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-full justify-between text-xs"
            disabled={!imageForm || framesMissing === 0}
            onClick={() =>
              attempt(async () => {
                for (const shot of board.shots) if (frameDue(shot)) await run('frame', shot, null)
              })
            }
          >
            <span className="inline-flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" />
              {t('generate.storyboard.allFrames', { count: framesMissing })}
            </span>
            {framesMissing > 0 && (
              <span className="tabular-nums">
                {prices.frames !== null
                  ? `≈${formatUsd(prices.frames)}`
                  : t('generate.cost.unknown')}
              </span>
            )}
          </Button>
          <Button
            size="sm"
            className="h-8 w-full justify-between text-xs"
            disabled={!videoForm || clipsReady === 0}
            onClick={() => attempt(allClips)}
            title={t('generate.storyboard.allClipsHint')}
          >
            <span className="inline-flex items-center gap-1.5">
              <Film className="h-3.5 w-3.5" />
              {t('generate.storyboard.allClips', { count: clipsReady })}
            </span>
            {clipsReady > 0 && (
              <span className="tabular-nums">
                {prices.clips !== null ? `≈${formatUsd(prices.clips)}` : t('generate.cost.unknown')}
              </span>
            )}
          </Button>
        </div>
      )}
      <Dialog open={!!selectedShot} onOpenChange={(open) => { if (!open) setPicker(undefined) }}>
        {picker && selectedShot && <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
          <DialogTitle>{mediaLabel(picker.kind)}</DialogTitle>
          <DialogDescription>{t('generate.storyboard.pickMediaHint')}</DialogDescription>
          <Input value={mediaQuery} placeholder={t('generate.elements.search')} aria-label={t('generate.elements.search')}
            onChange={(event) => { setMediaQuery(event.target.value); setMediaLimit(24) }} />
          {matchingMedia.length === 0 && <p className="text-sm text-muted-foreground">{t('generate.storyboard.noMatchingMedia')}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {matchingMedia.slice(0, mediaLimit).map((item) => (
              <button key={item.id} type="button" title={item.fileName}
                aria-pressed={item.id === selectedMedia}
                className={`min-w-0 overflow-hidden rounded border text-left hover:border-primary ${item.id === selectedMedia ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
                onClick={() => selectMedia(item.id)}>
                <span className="block aspect-video bg-muted"><MediaThumb reference={{ media: item.id }} /></span>
                <span className="block truncate px-2 py-1 text-xs">{item.fileName}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedMedia && <Button type="button" variant="outline" onClick={() => selectMedia()}>{t('generate.storyboard.clearMedia')}</Button>}
            {matchingMedia.length > mediaLimit && <Button type="button" variant="outline" onClick={() => setMediaLimit((limit) => limit + 24)}>{t('generate.storyboard.moreMedia')}</Button>}
          </div>
        </DialogContent>}
      </Dialog>
    </div>
  )
}
