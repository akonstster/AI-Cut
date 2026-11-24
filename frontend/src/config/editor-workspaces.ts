/**
 * Editor workspaces (DaVinci-style pages): named layout presets that
 * rearrange existing panels for a task. Switching workspaces never changes
 * project state вЂ” only which panels are visible and which tabs are active.
 *
 * Presets are starting points, not locks: the user can still toggle any
 * panel inside a workspace, and their per-workspace tweaks are persisted
 * by the editor store (`editor:workspaceLayout:<id>` in localStorage).
 */
export type EditorWorkspaceId = 'edit' | 'color' | 'motion' | 'canvas'

export type EditorSidebarTab =
  | 'graphics'
  | 'blocking'
  | 'storyboard'
  | 'generate'
  | 'media'
  | 'text'
  | 'shapes'
  | 'effects'
  | 'transitions'
  | 'lottie'
  | 'transcript'
  | 'ai'
export type EditorClipInspectorTab = 'video' | 'motion' | 'audio' | 'effects'

/** Active tab of the Color page parameter dock (wheels / curves / LUT). */
export type EditorColorParamsTab = 'primary' | 'curves' | 'lut'

/** The slice of editor UI state that a workspace controls. */
export interface EditorWorkspaceLayout {
  colorScopesOpen: boolean
  colorParamsTab: EditorColorParamsTab
  /** Width of the Color page clip filmstrip column, in px. */
  colorFilmstripWidth: number
  /** Minimum thumbnail width in the Color filmstrip grid, in px. */
  colorFilmTileSize: number
  clipInspectorTab: EditorClipInspectorTab
  activeTab: EditorSidebarTab
  propertiesFullColumn: boolean
}

const DEFAULT_COLOR_FILMSTRIP_WIDTH = 134
export const COLOR_FILMSTRIP_WIDTH_MIN = 96
export const COLOR_FILMSTRIP_WIDTH_MAX = 640
const DEFAULT_COLOR_FILM_TILE_SIZE = 118
export const COLOR_FILM_TILE_SIZE_MIN = 80
export const COLOR_FILM_TILE_SIZE_MAX = 320

export function normalizeColorFilmTileSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_COLOR_FILM_TILE_SIZE
  return Math.min(COLOR_FILM_TILE_SIZE_MAX, Math.max(COLOR_FILM_TILE_SIZE_MIN, Math.round(value)))
}

export function normalizeColorFilmstripWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_COLOR_FILMSTRIP_WIDTH
  return Math.min(COLOR_FILMSTRIP_WIDTH_MAX, Math.max(COLOR_FILMSTRIP_WIDTH_MIN, Math.round(value)))
}

const EDITOR_WORKSPACE_PRESETS: Record<EditorWorkspaceId, EditorWorkspaceLayout> = {
  edit: {
    colorScopesOpen: false,
    colorParamsTab: 'primary',
    colorFilmstripWidth: DEFAULT_COLOR_FILMSTRIP_WIDTH,
    colorFilmTileSize: DEFAULT_COLOR_FILM_TILE_SIZE,
    clipInspectorTab: 'video',
    activeTab: 'media',
    propertiesFullColumn: false,
  },
  color: {
    colorScopesOpen: true,
    colorParamsTab: 'primary',
    colorFilmstripWidth: DEFAULT_COLOR_FILMSTRIP_WIDTH,
    colorFilmTileSize: DEFAULT_COLOR_FILM_TILE_SIZE,
    clipInspectorTab: 'effects',
    activeTab: 'effects',
    // The grade panel stacks wheels + curves + the effect list вЂ” give it
    // the full column height by default.
    propertiesFullColumn: true,
  },
  motion: {
    colorScopesOpen: false,
    colorParamsTab: 'primary',
    colorFilmstripWidth: DEFAULT_COLOR_FILMSTRIP_WIDTH,
    colorFilmTileSize: DEFAULT_COLOR_FILM_TILE_SIZE,
    clipInspectorTab: 'video',
    activeTab: 'media',
    propertiesFullColumn: false,
  },
  canvas: {
    colorScopesOpen: false,
    colorParamsTab: 'primary',
    colorFilmstripWidth: DEFAULT_COLOR_FILMSTRIP_WIDTH,
    colorFilmTileSize: DEFAULT_COLOR_FILM_TILE_SIZE,
    clipInspectorTab: 'video',
    activeTab: 'media',
    propertiesFullColumn: false,
  },
}

/**
 * Timeline split (percent of vertical space) a workspace starts with.
 * `null` means "use the density preset default" вЂ” grading navigates clips
 * rather than editing them, so the color workspace shrinks the timeline.
 */
export const EDITOR_WORKSPACE_TIMELINE_SIZE: Record<EditorWorkspaceId, number | null> = {
  edit: null,
  color: 18,
  // Motion reuses the standard split and swaps only the timeline surface.
  motion: null,
  canvas: null,
}

const DEFAULT_EDITOR_WORKSPACE: EditorWorkspaceId = 'edit'

export function normalizeEditorWorkspaceId(value: unknown): EditorWorkspaceId {
  if (value === 'color') return 'color'
  if (value === 'canvas') return 'canvas'
  // Animate and Compose were separate historical surfaces. Both now migrate
  // into the single Motion workspace so persisted sessions cannot reopen the
  // disconnected legacy editor.
  if (value === 'animate' || value === 'motion' || value === 'compose') return 'motion'
  return DEFAULT_EDITOR_WORKSPACE
}

const SIDEBAR_TABS: readonly EditorSidebarTab[] = [
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
const CLIP_INSPECTOR_TABS: readonly EditorClipInspectorTab[] = [
  'video',
  'motion',
  'audio',
  'effects',
]
const COLOR_PARAMS_TABS: readonly EditorColorParamsTab[] = ['primary', 'curves', 'lut']

function isSidebarTab(value: unknown): value is EditorSidebarTab {
  return SIDEBAR_TABS.includes(value as EditorSidebarTab)
}

function isColorParamsTab(value: unknown): value is EditorColorParamsTab {
  return COLOR_PARAMS_TABS.includes(value as EditorColorParamsTab)
}

function isClipInspectorTab(value: unknown): value is EditorClipInspectorTab {
  return CLIP_INSPECTOR_TABS.includes(value as EditorClipInspectorTab)
}

/** Validate a persisted workspace layout, falling back per-field to the preset. */
export function normalizeEditorWorkspaceLayout(
  value: unknown,
  workspace: EditorWorkspaceId,
): EditorWorkspaceLayout {
  const preset = EDITOR_WORKSPACE_PRESETS[workspace]
  if (!value || typeof value !== 'object') return preset
  const candidate = value as Partial<Record<keyof EditorWorkspaceLayout, unknown>>

  return {
    colorScopesOpen:
      typeof candidate.colorScopesOpen === 'boolean'
        ? candidate.colorScopesOpen
        : preset.colorScopesOpen,
    colorParamsTab: isColorParamsTab(candidate.colorParamsTab)
      ? candidate.colorParamsTab
      : preset.colorParamsTab,
    colorFilmstripWidth: normalizeColorFilmstripWidth(candidate.colorFilmstripWidth),
    colorFilmTileSize: normalizeColorFilmTileSize(candidate.colorFilmTileSize),
    clipInspectorTab: isClipInspectorTab(candidate.clipInspectorTab)
      ? candidate.clipInspectorTab
      : preset.clipInspectorTab,
    activeTab: isSidebarTab(candidate.activeTab) ? candidate.activeTab : preset.activeTab,
    propertiesFullColumn:
      typeof candidate.propertiesFullColumn === 'boolean'
        ? candidate.propertiesFullColumn
        : preset.propertiesFullColumn,
  }
}
