/** What the agent bridge reaches of the editor: its stores, the media library and the open project. */

export { useItemsStore } from '@/features/timeline/stores/items-store'
export { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
export { useTimelineCommandStore } from '@/features/timeline/stores/timeline-command-store'
export { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
export { mediaLibraryService } from '@/features/media-library/services/media-library-service'
export { useProjectStore } from '@/features/projects/stores/project-store'
export { saveTimeline } from '@/features/timeline/stores/timeline-persistence'
export { buildRenderJob } from '@/features/export/utils/build-render-job'
export { useRenderQueueStore } from '@/features/export/stores/render-queue-store'

export { makeMotionClip, motionName } from '@/features/generate/services/motion-clip'
export {
  agentBlocking,
  importPrevisFrame,
  importPrevisVideo,
  withPrevisRenderer,
} from '@/features/generate/services/previs-shot'
export { useGenerateStore } from '@/features/generate/stores/generate-store'
export type { Shot } from '@/features/generate/services/storyboard'
export {
  loadProjectCanvas,
  saveProjectCanvas,
  changeProjectCanvas,
} from '@/features/generate/services/project-canvas'
export {
  WORKFLOW_TEMPLATES,
  instantiate,
  besideGraph,
  moveTo,
  readWorkflowFile,
} from '@/features/generate/services/canvas-templates'
export type { CanvasGraph } from '@/features/generate/services/canvas-graph'
