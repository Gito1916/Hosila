import type { HeroMetric } from '../../types/landing';

interface HeroProps {
  metrics: HeroMetric[];
}

export function Hero({ metrics }: HeroProps) {
  return (
    <section
      id="home"
      className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,var(--surface-inset),var(--surface-base)_58%)]"
    >
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-200/60 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-brand-100 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-16 md:py-24 lg:grid-cols-2 lg:items-center lg:px-8">
        <div className="float-in">
          <p className="mb-5 inline-flex rounded-full border border-brand-200 bg-brand-50 px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-accent">
            Property Management, Simplified
          </p>
          <h1 className="max-w-xl text-4xl font-extrabold leading-tight md:text-5xl">
            Run hotel operations with less chaos and more control.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-body">
            Hosila gives your team one platform for front desk, bookings,
            restaurant charges, reporting, and tax-ready financial visibility.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#cta"
              className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-premium transition hover:bg-primary-hover"
            >
              Request a Demo
            </a>
            <a
              href="#features"
              className="rounded-xl border border-border-strong bg-surface-card px-6 py-3 text-sm font-bold text-heading transition hover:bg-surface-raised"
            >
              Explore Features
            </a>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl border border-border bg-surface-card p-6 shadow-premium">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
              Live Operations Snapshot
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-border-subtle bg-surface-raised p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-heading">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface-card p-5">
            <p className="text-sm font-semibold text-heading">
              Trusted by growing properties across Africa
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-muted">
              <span className="rounded-lg bg-surface-raised px-2 py-2">Lagos</span>
              <span className="rounded-lg bg-surface-raised px-2 py-2">Abuja</span>
              <span className="rounded-lg bg-surface-raised px-2 py-2">Port Harcourt</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
