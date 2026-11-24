import { describe, expect, it } from 'vite-plus/test'
import {
  COLOR_FILMSTRIP_WIDTH_MAX,
  COLOR_FILMSTRIP_WIDTH_MIN,
  normalizeEditorWorkspaceId,
  normalizeEditorWorkspaceLayout,
} from './editor-workspaces'

describe('normalizeEditorWorkspaceId', () => {
  it('uses Motion as the workspace id and migrates former Animate and Compose ids', () => {
    expect(normalizeEditorWorkspaceId('motion')).toBe('motion')
    expect(normalizeEditorWorkspaceId('animate')).toBe('motion')
    expect(normalizeEditorWorkspaceId('compose')).toBe('motion')
  })
})

describe('normalizeEditorWorkspaceLayout', () => {
  it('defaults the Color parameter tab to Primary and keeps a valid persisted tab', () => {
    expect(normalizeEditorWorkspaceLayout(null, 'color').colorParamsTab).toBe('primary')
    expect(
      normalizeEditorWorkspaceLayout({ colorParamsTab: 'curves' }, 'color').colorParamsTab,
    ).toBe('curves')
    expect(normalizeEditorWorkspaceLayout({ colorParamsTab: 'lut' }, 'color').colorParamsTab).toBe(
      'lut',
    )
  })

  it('falls back to the preset when the persisted tab is unknown', () => {
    expect(
      normalizeEditorWorkspaceLayout({ colorParamsTab: 'nonsense' }, 'color').colorParamsTab,
    ).toBe('primary')
  })

  it('keeps the filmstrip width inside the resizable range', () => {
    expect(normalizeEditorWorkspaceLayout(null, 'color').colorFilmstripWidth).toBe(134)
    expect(
      normalizeEditorWorkspaceLayout({ colorFilmstripWidth: 220 }, 'color').colorFilmstripWidth,
    ).toBe(220)
    expect(
      normalizeEditorWorkspaceLayout({ colorFilmstripWidth: 10 }, 'color').colorFilmstripWidth,
    ).toBe(COLOR_FILMSTRIP_WIDTH_MIN)
    expect(
      normalizeEditorWorkspaceLayout({ colorFilmstripWidth: 9999 }, 'color').colorFilmstripWidth,
    ).toBe(COLOR_FILMSTRIP_WIDTH_MAX)
  })
})
