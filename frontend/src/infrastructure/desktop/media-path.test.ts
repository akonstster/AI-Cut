// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

async function loadHelper() {
  vi.resetModules()
  return import('./media-path')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('workspaceAbsolutePath', () => {
  it('joins a workspace-relative path onto the workspace root', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ workspace: 'C:\\workspace' }),
      })),
    )
    const { workspaceAbsolutePath } = await loadHelper()

    await expect(workspaceAbsolutePath('projects/p1/exports/a.mp4')).resolves.toBe(
      'C:\\workspace\\projects\\p1\\exports\\a.mp4',
    )
    await expect(workspaceAbsolutePath(['projects', 'p1', 'exports', 'b.mp4'])).resolves.toBe(
      'C:\\workspace\\projects\\p1\\exports\\b.mp4',
    )
  })

  it('keeps forward slashes for a POSIX workspace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ workspace: '/home/me/AI-Cut' }),
      })),
    )
    const { workspaceAbsolutePath } = await loadHelper()

    await expect(workspaceAbsolutePath('projects/p1/exports/a.mp4')).resolves.toBe(
      '/home/me/AI-Cut/projects/p1/exports/a.mp4',
    )
  })

  it('answers null in a browser, where there is no workspace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })),
    )
    const { workspaceAbsolutePath } = await loadHelper()

    await expect(workspaceAbsolutePath('projects/p1/exports/a.mp4')).resolves.toBeNull()
  })
})
