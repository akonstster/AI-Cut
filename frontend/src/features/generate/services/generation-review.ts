import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { createLogger } from '@/shared/logging/logger'
import { useEditorStore } from '@/shared/state/editor'
import { useSettingsStore } from '../deps/settings-contract'
import { useGenerateStore, type ModelRef } from '../stores/generate-store'
import type { Provider, Task } from './generate-api'
import { assignCanvasJob } from './project-canvas'

const logger = createLogger('GenerateReview')

/** A generation some part of the editor wants to send on the person's behalf. */
export interface HeldGeneration {
  task: Task
  provider: Provider
  model: string
  values: Record<string, unknown>
  /** The caller would put the result on the timeline; carried into the panel's toggle. */
  placeOnTimeline?: boolean
  /** Where the caller would have put the result, so the reviewed run can go back there. */
  returnTo?: ReviewReturn
}

/**
 * The place a reviewed generation was awaited: a generate node on the project canvas or a shot of
 * the storyboard. Both take the job the same way their own run would have.
 */
export type ReviewReturn =
  | { to: 'canvas'; projectId: string; nodeId: string }
  | {
      to: 'shot'
      projectId: string
      shotId: string
      kind: 'image' | 'video'
      /** The second on the timeline the shot's clip was planned for, when it had one. */
      placeAt?: number | null
    }

interface PendingReview {
  provider: Provider
  model: string
  destination: ReviewReturn
}

let pending: PendingReview | null = null

/**
 * Settings → General → "Review generations before sending".
 *
 * In review mode a generation started by the canvas, the storyboard or another automated flow is
 * not sent: its task, model and values fill the Generate panel, the editor switches to that panel,
 * and the person presses Generate. This keeps a wrong model, a prompt in the wrong field or a
 * reference in the wrong slot from spending money unseen. The result then goes back to the canvas
 * node or the shot that was waiting for it.
 *
 * @returns true when the request was held for review, false when the caller should send it.
 */
export function holdGenerationForReview(request: HeldGeneration): boolean {
  if (!useSettingsStore.getState().generationReviewMode) return false

  const store = useGenerateStore.getState()
  const model: ModelRef = { provider: request.provider, id: request.model }
  store.setTask(request.task)
  store.setModel(request.task, model)
  store.replaceValues(model, request.values)
  if (request.placeOnTimeline !== undefined) {
    store.setPlaceOnTimeline(request.placeOnTimeline)
  }
  pending = request.returnTo
    ? { provider: request.provider, model: request.model, destination: request.returnTo }
    : null

  const editor = useEditorStore.getState()
  // The left tool rail is on screen in Edit, Motion and Canvas, so the Generate panel opens where
  // the person already is. Only the Color workspace replaces the rail with grading panels.
  if (editor.workspace === 'color') editor.setWorkspace('edit')
  editor.setActiveTab('generate')
  const place = request.returnTo?.to
  toast.info(
    i18n.t(
      place === 'canvas'
        ? 'generate.review.heldCanvas'
        : place === 'shot'
          ? 'generate.review.heldStoryboard'
          : 'generate.review.held',
    ),
  )
  return true
}

/**
 * The place the reviewed request was awaited, without taking it: the panel needs the shot's second
 * before it sends. `null` when nothing waits or the model no longer matches.
 */
export function peekReviewReturn(sent: { provider: Provider; model: string }): ReviewReturn | null {
  if (!pending) return null
  return pending.provider === sent.provider && pending.model === sent.model
    ? pending.destination
    : null
}

/**
 * The Generate panel has just sent a job: if it is the reviewed one, hand back the place that was
 * waiting for the result. A different model or task means the reviewed request was changed, so the
 * result is left as an ordinary one in the history.
 */
export function claimReviewReturn(sent: {
  provider: Provider
  model: string
}): ReviewReturn | null {
  const held = pending
  pending = null
  if (!held) return null
  if (held.provider !== sent.provider || held.model !== sent.model) {
    toast.info(i18n.t('generate.review.notReturned'))
    return null
  }
  return held.destination
}

/** A run sent without review already puts its result where it belongs; nothing is left to return. */
export function forgetReviewReturn(): void {
  pending = null
}

/** Hands a job to the canvas node or the shot that was waiting for it in review mode. */
export async function returnReviewedResult(
  destination: ReviewReturn,
  jobId: string,
): Promise<void> {
  if (destination.to === 'shot') {
    useGenerateStore
      .getState()
      .updateShot(
        destination.projectId,
        destination.shotId,
        destination.kind === 'image' ? { imageJob: jobId } : { videoJob: jobId },
      )
    return
  }
  // The job is already sent and its result is in the history; a canvas that cannot be written
  // only costs the automatic return, never the generation.
  try {
    await assignCanvasJob(destination.projectId, destination.nodeId, jobId)
  } catch (error) {
    logger.error(`Could not hand job ${jobId} back to canvas node ${destination.nodeId}`, error)
  }
}
