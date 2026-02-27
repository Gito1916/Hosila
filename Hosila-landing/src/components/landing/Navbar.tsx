import { useState } from 'react';
import type { NavItem } from '../../types/landing';

interface NavbarProps {
  links: NavItem[];
}

export function Navbar({ links }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-surface-base/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 lg:px-8">
        <a href="#home" className="flex items-center gap-2 text-heading">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            H
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            Hosila
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-muted transition hover:text-heading"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href="#pricing"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-heading transition hover:bg-surface-raised"
          >
            Pricing
          </a>
          <a
            href="#cta"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
          >
            Book Demo
          </a>
        </div>

        <button
          type="button"
          aria-label="Toggle navigation"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-heading md:hidden"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <span className="text-xl leading-none">{isOpen ? '×' : '☰'}</span>
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-border bg-surface-card md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-5 py-4">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-heading hover:bg-surface-raised"
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#cta"
              className="mt-3 rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-white"
              onClick={() => setIsOpen(false)}
            >
              Book Demo
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
