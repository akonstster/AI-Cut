/**
 * Absolute paths of media files inside the AI-Cut workspace.
 *
 * The desktop server keeps every media source at `<workspace>/media/<id>/<sanitized name>` and reports the
 * workspace root in `GET /api/info`. The media library and the timeline both use this helper for
 * "Copy full path", so neither has to reach into the other's feature.
 */

import { mediaSourceByFileName } from '@/infrastructure/storage/workspace-fs/paths'

let root: Promise<string | null> | null = null

/** The workspace root on disk, or null in a browser (there is no server to ask). Asked once per page. */
export function workspaceRoot(): Promise<string | null> {
  root ??= fetch('/api/info', { cache: 'no-store' })
    .then(async (response) =>
      response.ok ? ((await response.json()) as { workspace?: string }) : null,
    )
    .then((info) => info?.workspace ?? null)
    .catch(() => null)
  return root
}

/**
 * The absolute path of a media source file, or null when the page has no workspace (a browser build)
 * or the media lives somewhere the workspace does not describe.
 */
export async function mediaAbsolutePath(
  mediaId: string,
  fileName: string,
): Promise<string | null> {
  const workspace = await workspaceRoot()
  if (!workspace) return null
  const separator = workspace.includes('\\') ? '\\' : '/'
  return [workspace, ...mediaSourceByFileName(mediaId, fileName)].join(separator)
}
