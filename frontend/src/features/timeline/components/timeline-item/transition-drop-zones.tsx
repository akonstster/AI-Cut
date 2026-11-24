import { memo } from 'react'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'

interface TransitionDropZonesProps {
  itemType: TimelineItemType['type']
  trackLocked: boolean
  isCompactShell: boolean
  isTransitionDragActive: boolean
  hitWidth: number
  onCutDragOver: (edge: 'left' | 'right') => (e: React.DragEvent<HTMLDivElement>) => void
  onCutDragLeave: () => void
  onCutDrop: (edge: 'left' | 'right') => (e: React.DragEvent<HTMLDivElement>) => void
}

/** Cut-drop zones at both clip edges while a transition is being dragged. */
export const TransitionDropZones = memo(function TransitionDropZones({
  itemType,
  trackLocked,
  isCompactShell,
  isTransitionDragActive,
  hitWidth,
  onCutDragOver,
  onCutDragLeave,
  onCutDrop,
}: TransitionDropZonesProps) {
  if (
    isCompactShell ||
    !isTransitionDragActive ||
    trackLocked ||
    (itemType !== 'video' && itemType !== 'image' && itemType !== 'composition')
  ) {
    return null
  }

  const edgeWidth = `min(${hitWidth / 2}px, 50%)`

  return (
    <>
      <div
        className="absolute inset-y-0 left-0 z-40"
        style={{ width: edgeWidth }}
        onDragOver={onCutDragOver('left')}
        onDragLeave={onCutDragLeave}
        onDrop={onCutDrop('left')}
      />
      <div
        className="absolute inset-y-0 right-0 z-40"
        style={{ width: edgeWidth }}
        onDragOver={onCutDragOver('right')}
        onDragLeave={onCutDragLeave}
        onDrop={onCutDrop('right')}
      />
    </>
  )
})
