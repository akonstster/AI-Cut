import { createLazyFileRoute, Link } from '@tanstack/react-router'
import { DocsArticle, DocsShell } from '@/features/docs/docs-shell'
import { getDocPage } from '@/features/docs/docs-content'
import { useDocsLanguage } from '@/features/docs/docs-language'
import { Button } from '@/components/ui/button'

export const Route = createLazyFileRoute('/docs/$slug')({
  component: DocsSlugPage,
})

function DocsSlugPage() {
  const { slug } = Route.useParams()
  const page = getDocPage(slug)

  if (!page) {
    return (
      <DocsShell>
        <MissingDoc />
      </DocsShell>
    )
  }

  return (
    <DocsShell currentSlug={page.slug}>
      <DocsArticle page={page} />
    </DocsShell>
  )
}

function MissingDoc() {
  const ru = useDocsLanguage() === 'ru'
  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="text-2xl font-semibold">{ru ? 'Страница не найдена' : 'Page not found'}</h1>
      <p className="mt-3 text-muted-foreground">
        {ru ? 'Выберите раздел в меню справки AI-Cut.' : 'Choose a section in the AI-Cut guide.'}
      </p>
      <Button asChild className="mt-6">
        <Link to="/docs">{ru ? 'К справке' : 'Back to docs'}</Link>
      </Button>
    </div>
  )
}
