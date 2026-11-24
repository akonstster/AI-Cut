/**
 * The desktop program around this window: when the page is served by the AI-Cut server, files the
 * editor makes are written to disk by the server (the system "Save as" dialog) instead of the browser's
 * downloads, and can be shown in the file manager.
 */

let desktop: Promise<boolean> | null = null

/** Whether this page runs inside AI-Cut. Asked once per page. */
export function isDesktop(): Promise<boolean> {
  desktop ??= fetch('/api/info', { cache: 'no-store' })
    .then(
      async (response) =>
        response.ok && ((await response.json()) as { app?: string }).app === 'AI-Cut',
    )
    .catch(() => false)
  return desktop
}

export interface SavedFile {
  path: string | null
  cancelled: boolean
  /** The remembered folder was gone, so the file went to the default one instead. */
  fallback: boolean
}

/** Writes the file into a chosen folder (`dir`), where the person chooses (`dialog`), beside another
 * saved file, or into the exports folder. */
export async function saveToDisk(
  blob: Blob,
  name: string,
  options: { dialog?: boolean; beside?: string; dir?: string } = {},
): Promise<SavedFile> {
  const query = new URLSearchParams({ name, dialog: String(options.dialog ?? true) })
  if (options.beside) query.set('beside', options.beside)
  if (options.dir) query.set('dir', options.dir)
  const response = await fetch(`/api/exports?${query}`, { method: 'PUT', body: blob })
  const body = (await response.json()) as {
    path?: string
    cancelled?: boolean
    fallback?: boolean
    error?: string
  }
  if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`)
  return {
    path: body.path ?? null,
    cancelled: body.cancelled === true,
    fallback: body.fallback === true,
  }
}

/** The system folder picker; null when the person closed it. */
export async function pickFolder(start?: string): Promise<string | null> {
  const query = new URLSearchParams()
  if (start) query.set('start', start)
  const response = await fetch(`/api/pick-folder?${query}`, { method: 'POST' })
  const body = (await response.json().catch(() => ({}))) as {
    path?: string
    cancelled?: boolean
    error?: string
  }
  if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`)
  return body.cancelled === true || !body.path ? null : body.path
}

/** The person's Documents folder, the default export destination. */
export async function documentsDirectory(): Promise<string | null> {
  try {
    const response = await fetch('/api/info', { cache: 'no-store' })
    if (!response.ok) return null
    const body = (await response.json()) as { documents?: string | null }
    return body.documents ?? null
  } catch {
    return null
  }
}

/** Shows a saved file in the file manager. */
export async function revealOnDisk(path: string): Promise<void> {
  const response = await fetch('/api/reveal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `${response.status} ${response.statusText}`)
  }
}

/** Opens a saved file in the system's default program. */
export async function openOnDisk(path: string): Promise<void> {
  const response = await fetch('/api/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `${response.status} ${response.statusText}`)
  }
}
