import { useTranslation } from 'react-i18next'
import { ColorScopesPanel } from './color-scopes-panel'

interface ColorScopesMonitorProps {
  onClose: () => void
}

export function ColorScopesMonitor({ onClose }: ColorScopesMonitorProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 p-1">
      <ColorScopesPanel
        open
        embedded
        embeddedLayout="stack"
        title={t('preview.scopes.title')}
        onClose={onClose}
      />
    </div>
  )
}
