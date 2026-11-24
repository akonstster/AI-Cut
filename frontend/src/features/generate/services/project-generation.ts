import { readJson, writeJsonAtomic } from '@/infrastructure/storage/workspace-fs/fs-primitives'
import { projectDir } from '@/infrastructure/storage/workspace-fs/paths'
import { requireWorkspaceRoot } from '@/infrastructure/storage/workspace-fs/root'
import { createLogger } from '@/shared/logging/logger'
import type { ProjectGeneration } from '../stores/generate-store'

const log = createLogger('ProjectGeneration')
const queues = new WeakMap<FileSystemDirectoryHandle, Map<string, Promise<void>>>()
const path = (id: string) => [...projectDir(id), 'generation.json']

export async function readProjectGeneration(id: string): Promise<ProjectGeneration | null> {
  const root = requireWorkspaceRoot()
  await queues.get(root)?.get(id)
  return readJson<ProjectGeneration>(root, path(id))
}

export async function writeProjectGeneration(id: string, state: ProjectGeneration): Promise<void> {
  const root = requireWorkspaceRoot()
  let pending = queues.get(root)
  if (!pending) {
    pending = new Map()
    queues.set(root, pending)
  }
  const next = (pending.get(id) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      await writeJsonAtomic(root, path(id), state)
    })
  pending.set(id, next)
  try {
    await next
  } finally {
    if (pending.get(id) === next) pending.delete(id)
  }
}

export function reportGenerationPersistenceError(error: unknown): string {
  log.error('Could not persist project generation data', error)
  return error instanceof Error ? error.message : String(error)
}
