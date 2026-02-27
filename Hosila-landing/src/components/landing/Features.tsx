import type { FeatureItem } from '../../types/landing';

interface FeaturesProps {
  items: FeatureItem[];
}

export function Features({ items }: FeaturesProps) {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-16 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
          Core Platform
        </p>
        <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">
          Everything your team needs to stay in sync
        </h2>
        <p className="mt-4 text-body">
          From room status to financial reporting, Hosila centralizes daily
          operations so staff can work faster with fewer handoff errors.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.title}
            className="rounded-2xl border border-border bg-surface-card p-6 transition hover:-translate-y-0.5 hover:shadow-premium"
          >
            <div className="mb-4 h-2 w-14 rounded-full bg-gradient-to-r from-brand-500 to-brand-300" />
            <h3 className="text-lg font-bold text-heading">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-body">
              {item.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
