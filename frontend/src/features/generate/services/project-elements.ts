import { readJson, writeJsonAtomic } from '@/infrastructure/storage/workspace-fs/fs-primitives'
import { projectDir } from '@/infrastructure/storage/workspace-fs/paths'
import { getProjectsUsingMedia } from '@/infrastructure/storage/workspace-fs/project-media'
import { requireWorkspaceRoot } from '@/infrastructure/storage/workspace-fs/root'
import { useGenerateStore } from '../stores/generate-store'
import type { PromptElement } from './prompt-elements'

interface ProjectElements {
  elements: PromptElement[]
  writes: Promise<void>
  listeners: Set<(elements: PromptElement[]) => void>
  write: (elements: PromptElement[]) => Promise<void>
}

const workspaces = new WeakMap<FileSystemDirectoryHandle, Map<string, Promise<ProjectElements>>>()

async function recoverLegacyElements(projectId: string) {
  const owners = new Map<string, Promise<string[]>>()
  const result: PromptElement[] = []
  for (const element of useGenerateStore.getState().legacyElements) {
    if (element.refs.length === 0) continue
    let candidates: string[] | undefined
    for (const ref of element.refs) {
      if (typeof ref !== 'object' || !ref || !('media' in ref)) {
        candidates = []
        break
      }
      let lookup = owners.get(ref.media)
      if (!lookup) {
        lookup = getProjectsUsingMedia(ref.media)
        owners.set(ref.media, lookup)
      }
      const projects = await lookup
      candidates = candidates ? candidates.filter((id) => projects.includes(id)) : projects
      if (!candidates.includes(projectId)) break
    }
    if (candidates?.length === 1 && candidates[0] === projectId) result.push(element)
  }
  return result
}

export async function loadProjectElements(projectId: string): Promise<ProjectElements> {
  const root = requireWorkspaceRoot()
  let projects = workspaces.get(root)
  if (!projects) {
    projects = new Map()
    workspaces.set(root, projects)
  }
  const existing = projects.get(projectId)
  if (existing) return existing

  const path = [...projectDir(projectId), 'elements.json']
  const write = async (elements: PromptElement[]) => {
    await writeJsonAtomic(root, path, elements)
  }
  const pending = readJson<PromptElement[]>(root, path)
    .then(async (saved) => {
      const elements = saved ?? (await recoverLegacyElements(projectId))
      if (!saved && elements.length) {
        await write(elements)
        useGenerateStore.getState().forgetLegacyElements(elements)
      }
      return {
        elements,
        writes: Promise.resolve(),
        listeners: new Set<(elements: PromptElement[]) => void>(),
        write,
      }
    })
    .catch((error: unknown) => {
      projects.delete(projectId)
      throw error
    })
  projects.set(projectId, pending)
  return pending
}

async function changeElements(
  projectId: string,
  update: (elements: PromptElement[]) => PromptElement[],
) {
  const project = await loadProjectElements(projectId)
  const write = project.writes.then(async () => {
    const elements = update(project.elements)
    await project.write(elements)
    project.elements = elements
    for (const listener of project.listeners) listener(elements)
  })
  project.writes = write.catch(() => {})
  await write
}

export function saveProjectElement(
  projectId: string,
  element: PromptElement,
  previousName?: string,
) {
  return changeElements(projectId, (elements) => [
    ...elements.filter(
      (each) =>
        each.name.toLowerCase() !== element.name.toLowerCase() && each.name !== previousName,
    ),
    element,
  ])
}

export function removeProjectElement(projectId: string, name: string) {
  return changeElements(projectId, (elements) =>
    elements.filter((each) => each.name.toLowerCase() !== name.toLowerCase()),
  )
}

export function replaceProjectElements(projectId: string, elements: PromptElement[]) {
  return changeElements(projectId, () => elements)
}
