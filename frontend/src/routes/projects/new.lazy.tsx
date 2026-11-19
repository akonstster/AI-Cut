import { createLazyFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { createLogger } from '@/shared/logging/logger'
import { InlineCreateProjectForm } from '@/features/projects/components/project-form'
import { useCreateProject } from '@/features/projects/hooks/use-project-actions'
import { AppTopBar } from '@/components/brand/app-top-bar'
import { LanguageSwitcher } from '@/shared/ui/language-switcher'
import { FreeCutLogo } from '@/components/brand/freecut-logo'
import type { ProjectFormData } from '@/features/projects/utils/validation'

const logger = createLogger('NewProject')

export const Route = createLazyFileRoute('/projects/new')({
  component: NewProject,
})

function NewProject() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const createProject = useCreateProject()

  const handleSubmit = async (data: ProjectFormData) => {
    setIsSubmitting(true)

    try {
      const result = await createProject(data)

      if (result.success && result.project) {
        // Navigate to editor with new project
        navigate({
          to: '/editor/$projectId',
          params: { projectId: result.project.id },
        })
      } else {
        toast.error(t('projects.toasts.createFailed'), { description: result.error })
        setIsSubmitting(false)
      }
    } catch (error) {
      logger.error('Failed to create project:', error)
      toast.error(t('projects.toasts.createFailed'), { description: t('projects.tryAgain') })
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <AppTopBar className="justify-between sm:px-6">
        <Link to="/projects">
          <FreeCutLogo size="sm" className="transition-opacity hover:opacity-80" />
        </Link>
        <LanguageSwitcher size="sm" align="end" side="bottom" />
      </AppTopBar>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <InlineCreateProjectForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </div>
    </div>
  )
}
