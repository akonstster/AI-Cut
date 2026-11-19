import { useEffect, useState } from 'react'
import { loadProjectElements } from '../services/project-elements'
import type { PromptElement } from '../services/prompt-elements'

const EMPTY: PromptElement[] = []

export function useProjectElements(projectId: string | null) {
  const [loaded, setLoaded] = useState<{ projectId: string; elements?: PromptElement[]; error?: string }>()

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    const listener = (elements: PromptElement[]) => setLoaded({ projectId, elements })
    void loadProjectElements(projectId).then((project) => {
      if (cancelled) return
      project.listeners.add(listener)
      unsubscribe = () => { project.listeners.delete(listener) }
      listener(project.elements)
    }, (error: unknown) => {
      if (!cancelled) setLoaded({ projectId, error: String(error) })
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [projectId])

  const current = loaded?.projectId === projectId ? loaded : undefined
  return { elements: current?.elements ?? EMPTY, ready: !!current?.elements, error: current?.error }
}
