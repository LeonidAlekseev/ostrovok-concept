import Link from 'next/link'

const links = [
  { href: '/help', label: 'Поддержка' },
  { href: '/legal/terms', label: 'Условия использования' },
  { href: '/legal/privacy', label: 'Конфиденциальность' },
  { href: '/legal/cookies', label: 'Cookie' },
]

// The footer is prerendered: the year is the build year.
const year = new Date().getFullYear()

// The 1px shadow paints the sub-pixel gap that fractional page heights can leave under the footer,
// where the page background would show as a thin line.
export function Footer() {
  return (
    <footer className="rounded-t-[clamp(20px,5vw,32px)] bg-chrome shadow-[0_1px_0_var(--chrome)]">
      <div className="mx-auto flex max-w-(--page-max) flex-col gap-4 px-(--page-x) py-[clamp(20px,4vw,32px)] text-sm text-chrome-muted">
        <nav aria-label="Информация">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link className="font-medium text-foreground no-underline hover:text-primary" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>Демо-проект: бронирования не настоящие, оплата не списывается.</p>
        <p>© {year} Островок!</p>
      </div>
    </footer>
  )
}
