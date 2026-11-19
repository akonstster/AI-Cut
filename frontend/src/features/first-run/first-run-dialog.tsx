import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FreeCutLogo } from '@/components/brand/freecut-logo'
import { isDesktop } from '@/infrastructure/desktop'

/** Kept on this computer, so the welcome shows once per profile. */
const FIRST_RUN_SEEN_KEY = 'aicut.first-run-seen'

/**
 * Shown once, on the first start of the program: what AI-Cut is, where the provider keys go and how an
 * agent connects. There is no statistics switch: AI-Cut counts nothing and sends nothing.
 */
export function FirstRunDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void isDesktop().then((desktop) => {
      if (desktop && localStorage.getItem(FIRST_RUN_SEEN_KEY) !== '1') setOpen(true)
    })
  }, [])

  const close = () => {
    localStorage.setItem(FIRST_RUN_SEEN_KEY, '1')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-lg" data-testid="first-run">
        <DialogHeader>
          <FreeCutLogo size="md" className="mb-2" />
          <DialogTitle>{t('firstRun.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>{t('firstRun.what')}</p>
          <p>{t('firstRun.keys')}</p>
          <p>{t('firstRun.agent')}</p>
        </div>
        <Button className="w-full" onClick={close}>
          {t('firstRun.start')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
