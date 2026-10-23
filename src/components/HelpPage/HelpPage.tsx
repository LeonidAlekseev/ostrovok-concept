'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Input } from '@/components/ui/input'
import { faq, faqCategories } from '@/data/faq'
import { filterFaq } from '@/lib/faq'
import { SupportForm } from './SupportForm'

/** The id of the question named by the URL hash, if there is one. */
const hashId = () => {
  const id = decodeURIComponent(window.location.hash.slice(1))
  return faq.some((item) => item.id === id) ? id : null
}

/** `/help`: searchable questions by category in an accordion, and the contact form. */
export function HelpPage() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string[]>([])
  const found = filterFaq(query)

  // `/help#<id>` opens that question and scrolls to it; the search is cleared so it is not hidden.
  useEffect(() => {
    function openFromHash() {
      const id = hashId()
      if (!id) return
      setQuery('')
      setOpen((current) => (current.includes(id) ? current : [...current, id]))
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-(--page-x) py-[clamp(20px,5vw,40px)]">
      <header className="flex flex-col gap-4">
        <h1 className="text-title leading-tight font-bold tracking-[-0.02em]">Поддержка</h1>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Поиск по вопросам"
            placeholder="Найти вопрос, например «отмена»"
            className="h-12 pl-10"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </header>

      {found.length === 0 ? (
        <p role="status" className="rounded-lg bg-muted p-4">
          Ничего не нашлось.{' '}
          <a className="font-medium underline" href="#contact">
            Напишите нам
          </a>
          , и мы ответим.
        </p>
      ) : (
        faqCategories.map((category) => {
          const items = found.filter((item) => item.category === category.id)
          if (items.length === 0) return null
          return (
            <section key={category.id} aria-labelledby={`category-${category.id}`} className="flex flex-col gap-2">
              <h2 id={`category-${category.id}`} className="text-xl font-bold">
                {category.title}
              </h2>
              <Accordion
                multiple
                value={open.filter((id) => items.some((item) => item.id === id))}
                onValueChange={(value: string[]) =>
                  setOpen((current) => [...current.filter((id) => !items.some((item) => item.id === id)), ...value])
                }
              >
                {items.map((item) => (
                  <AccordionItem key={item.id} value={item.id} id={item.id} className="scroll-mt-20">
                    <AccordionTrigger className="text-base">{item.question}</AccordionTrigger>
                    <AccordionContent className="text-base text-muted-foreground">{item.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          )
        })
      )}

      <section id="contact" aria-labelledby="contact-title" className="flex scroll-mt-20 flex-col gap-4">
        <h2 id="contact-title" className="text-xl font-bold">
          Не нашли ответ?
        </h2>
        <SupportForm />
      </section>
    </main>
  )
}
