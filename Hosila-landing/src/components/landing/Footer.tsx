import type { NavItem } from '../../types/landing';

interface FooterProps {
  links: NavItem[];
}

export function Footer({ links }: FooterProps) {
  return (
    <footer className="border-t border-border bg-surface-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <p className="font-display text-xl font-bold text-heading">Hosila</p>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Hospitality operations software for modern hotels and guest-focused
            teams.
          </p>
        </div>

        <nav className="flex flex-wrap gap-4 text-sm font-semibold">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-muted hover:text-heading">
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
