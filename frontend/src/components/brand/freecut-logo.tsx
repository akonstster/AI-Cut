import { cn } from '@/shared/ui/cn'

interface FreeCutLogoProps {
  variant?: 'full' | 'icon'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeConfig = {
  sm: {
    icon: 'w-5 h-5',
    text: 'text-base',
    gap: 'gap-1.5',
  },
  md: {
    icon: 'w-7 h-7',
    text: 'text-xl',
    gap: 'gap-2',
  },
  lg: {
    icon: 'w-10 h-10',
    text: 'text-3xl',
    gap: 'gap-3',
  },
}

function AICutIcon({ className }: { className?: string }) {
  return <img src="/aicut-icon.svg" alt="" className={cn('rounded-[22%]', className)} />
}

export function AICutLogo({ variant = 'full', size = 'md', className }: FreeCutLogoProps) {
  const config = sizeConfig[size]

  if (variant === 'icon') {
    return <AICutIcon className={cn(config.icon, className)} />
  }

  return (
    <div className={cn('flex items-center', config.gap, className)}>
      <AICutIcon className={config.icon} />
      <span className={cn(config.text, 'font-semibold tracking-tight text-foreground')}>
        AI-Cut
      </span>
    </div>
  )
}

/** The upstream name of the component; kept so older imports keep working. */
export const FreeCutLogo = AICutLogo
