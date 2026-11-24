import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { addTransitionWithTrim } from '../stores/actions/transition-actions'
import { useTransitionTrimStore } from '../stores/transition-trim-store'

export function TransitionTrimDialog() {
  const { t, i18n } = useTranslation()
  const pending = useTransitionTrimStore((s) => s.pending)
  const setPending = useTransitionTrimStore((s) => s.setPending)
  if (!pending) return null

  const { plan, descriptor } = pending
  const formatSeconds = (frames: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: 'unit',
      unit: 'second',
      maximumFractionDigits: 2,
    }).format(frames / plan.fps)

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) setPending(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('timeline.transitionDrop.trimTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('timeline.transitionDrop.trimDescription', {
              duration: formatSeconds(plan.durationInFrames),
              shift: formatSeconds(plan.trimLeft + plan.trimRight),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('timeline.transitionDrop.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!addTransitionWithTrim(plan, descriptor)) {
                toast.error(t('timeline.transitionDrop.trimFailed'))
              }
            }}
          >
            {t('timeline.transitionDrop.trimAndAdd')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
