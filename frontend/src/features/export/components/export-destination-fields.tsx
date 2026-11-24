/**
 * Where the export goes: the folder and the file name, chosen before rendering so the finished
 * file lands there without a second "Save as" step.
 */

import { useTranslation } from 'react-i18next'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ExportDestinationFieldsProps {
  /** Chosen folder; empty means the default one. */
  dir: string
  /** The default folder, shown until a folder is chosen. */
  defaultDir: string | null
  fileName: string
  onChooseDir: () => void
  onFileNameChange: (value: string) => void
}

export function ExportDestinationFields({
  dir,
  defaultDir,
  fileName,
  onChooseDir,
  onFileNameChange,
}: ExportDestinationFieldsProps) {
  const { t } = useTranslation()
  const shownDir = dir || defaultDir

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium">{t('export.destination.folder')}</Label>
        <Button variant="outline" size="sm" onClick={onChooseDir}>
          <FolderOpen className="mr-2 h-3.5 w-3.5" />
          {t('export.destination.choose')}
        </Button>
      </div>
      <p className="truncate text-xs text-muted-foreground" title={shownDir ?? undefined}>
        {shownDir ?? t('export.destination.defaultFolder')}
      </p>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="export-file-name" className="text-sm font-medium">
          {t('export.destination.fileName')}
        </Label>
        <Input
          id="export-file-name"
          value={fileName}
          onChange={(event) => onFileNameChange(event.target.value)}
          className="h-8 w-[220px]"
        />
      </div>
    </div>
  )
}
