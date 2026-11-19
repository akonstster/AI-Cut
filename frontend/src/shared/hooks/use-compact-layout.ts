/**
 * True on screens narrower than Tailwind's `lg`: tablets held upright and phones. The editor keeps the compact
 * layout there: toolbar buttons beyond the essential ones are hidden and the toolbar scrolls sideways.
 */
import { useSyncExternalStore } from 'react'

const COMPACT_QUERY = '(max-width: 1023.98px)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(COMPACT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useCompactLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  )
}
