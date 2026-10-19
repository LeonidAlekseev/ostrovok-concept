import type { LegalDocument } from '@/data/legal'

/** A legal document: title, update date, the demo note, a table of contents and the sections. */
export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-(--page-x) py-[clamp(20px,5vw,40px)]">
      <header className="flex flex-col gap-2">
        <h1 className="text-title leading-tight font-bold tracking-[-0.02em]">{document.title}</h1>
        <p className="text-sm text-muted-foreground">Обновлено: {document.updated}</p>
        <p className="rounded-lg bg-muted p-3 text-sm font-medium">
          Демонстрационный шаблон, не является юридическим документом
        </p>
      </header>

      <nav aria-label="Содержание">
        <ol className="flex list-decimal flex-col gap-1 pl-5">
          {document.sections.map((section) => (
            <li key={section.id}>
              <a className="text-primary hover:underline" href={`#${section.id}`}>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {document.sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-title`}
          className="flex scroll-mt-20 flex-col gap-3"
        >
          <h2 id={`${section.id}-title`} className="text-xl font-bold">
            {section.title}
          </h2>
          {section.paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
          {section.items && (
            <ul className="flex list-disc flex-col gap-2 pl-5">
              {section.items.map((item) => (
                <li key={item.term}>
                  <code className="rounded bg-muted px-1 py-0.5 text-sm">{item.term}</code> — {item.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  )
}
