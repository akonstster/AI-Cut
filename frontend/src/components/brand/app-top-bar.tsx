import type { ComponentProps } from 'react'
import { cn } from '@/shared/ui/cn'

export function AppTopBar({ className, ...props }: ComponentProps<'header'>) {
  return (
    <header
      className={cn(
        'panel-header flex min-h-12 min-w-0 shrink-0 items-center gap-2.5 border-b border-border px-3',
        className,
      )}
      {...props}
    />
  )
}
