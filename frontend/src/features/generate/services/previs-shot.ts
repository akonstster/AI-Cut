/** A 3D blocking's frame and camera video into the open project's library, to start a generation from. */

import { mediaLibraryService, useMediaLibraryStore, useProjectStore } from '../deps/editor'
import { blockShot } from './prompt-assist'
import { createPrevisRenderer, type PrevisRenderer } from './previs-render'
import { normalizePrevisScene, type PrevisScene } from './previs-scene'
import { aspectOf } from './storyboard'
import { useGenerateStore } from '../stores/generate-store'

const LONG_SIDE = { frame: 1920, video: 1280 }
const VIDEO_FPS = 24
const PATH_COLOR = '#fbbf24'

function fileName(name: string, extension: string): string {
  const base =
    name
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .trim()
      .slice(0, 80) || 'Previs'
  return `${base}.${extension}`
}

function openProject() {
  const project = useProjectStore.getState().currentProject
  if (!project) throw new Error('no project is open')
  return project
}

/** The project's frame scaled so its long side is `long`. */
function sizeOf(width: number, height: number, long: number): { width: number; height: number } {
  const scale = long / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function projectAspect(): number {
  const { width, height } = openProject().metadata
  return width / height
}

/** Draws the scene with a renderer of its own, out of sight, for an agent's call made with no panel open. */
export async function withPrevisRenderer<T>(
  scene: PrevisScene,
  work: (renderer: PrevisRenderer) => Promise<T>,
): Promise<T> {
  const mount = document.createElement('div')
  mount.setAttribute('aria-hidden', 'true')
  mount.style.cssText =
    'position:fixed;left:-10000px;top:0;width:320px;height:320px;pointer-events:none'
  document.body.appendChild(mount)
  let renderer: PrevisRenderer | undefined
  try {
    renderer = createPrevisRenderer(mount, scene, projectAspect(), PATH_COLOR)
    return await work(renderer)
  } finally {
    renderer?.dispose()
    mount.remove()
  }
}

/** The shot's camera at `time` as a picture of the project's frame; answers its media id. */
export async function importPrevisFrame(
  renderer: PrevisRenderer,
  time: number,
  name: string,
): Promise<string> {
  const project = openProject()
  const size = sizeOf(project.metadata.width, project.metadata.height, LONG_SIDE.frame)
  const blob = await renderer.frame(time, size.width, size.height)
  const file = new File([blob], fileName(name, 'png'), {
    type: 'image/png',
    lastModified: Date.now(),
  })
  const media = await mediaLibraryService.importGeneratedImage(file, project.id, {
    ...size,
    tags: ['generated', 'previs'],
    codec: 'png',
  })
  const library = useMediaLibraryStore.getState()
  if (library.currentProjectId === project.id && !library.mediaById[media.id])
    library.prependMediaItem(media)
  return media.id
}

/** The whole shot through its camera as a video; answers its media id. */
export async function importPrevisVideo(
  renderer: PrevisRenderer,
  name: string,
  progress?: (share: number) => void,
): Promise<string> {
  const project = openProject()
  const size = sizeOf(project.metadata.width, project.metadata.height, LONG_SIDE.video)
  const blob = await renderer.video(size.width, size.height, VIDEO_FPS, progress)
  const file = new File([blob], fileName(name, 'mp4'), {
    type: 'video/mp4',
    lastModified: Date.now(),
  })
  const media = await mediaLibraryService.importGeneratedVideo(file, project.id, {
    tags: ['generated', 'previs'],
  })
  const library = useMediaLibraryStore.getState()
  if (library.currentProjectId === project.id && !library.mediaById[media.id])
    library.prependMediaItem(media)
  return media.id
}

/**
 * An agent's blocking: the scene it wrote, or one the prompt model builds from its words (changing the project's
 * current blocking unless asked for a fresh one), kept as the project's blocking so the person sees it in the tab.
 */
export async function agentBlocking(input: {
  scene?: unknown
  shotId?: string
  description?: string
  /** Builds a new scene from the words instead of changing the current one. */
  fresh?: boolean
  accept?: (scene: PrevisScene) => void
}): Promise<PrevisScene> {
  const project = openProject()
  const store = useGenerateStore.getState()
  const current = input.shotId
    ? store.storyboards[project.id]?.shots.find((shot) => shot.id === input.shotId)?.previs
    : store.blockings[project.id]
  const scene =
    input.scene !== undefined
      ? normalizePrevisScene(input.scene)
      : await blockShot(
          input.description ?? '',
          aspectOf(project.metadata.width, project.metadata.height),
          input.fresh ? null : (current?.scene ?? null),
        )
  input.accept?.(scene)
  if (useProjectStore.getState().currentProject?.id !== project.id)
    throw new Error('The active project changed while preparing the shot')
  if (!input.shotId)
    useGenerateStore.getState().setBlocking(project.id, {
      description: input.description ?? current?.description ?? '',
      scene,
    })
  return scene
}

export { PATH_COLOR as PREVIS_PATH_COLOR }
