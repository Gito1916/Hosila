import type { PricingItem } from '../../types/landing';

interface PricingProps {
  plans: PricingItem[];
}

export function Pricing({ plans }: PricingProps) {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-16 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
          Pricing
        </p>
        <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">
          Plans for independent hotels and growing groups
        </h2>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.tier}
            className={`rounded-2xl border p-6 ${
              plan.highlighted
                ? 'border-primary bg-surface-card shadow-glow'
                : 'border-border bg-surface-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-heading">{plan.tier}</h3>
              {plan.highlighted && (
                <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-accent">
                  Popular
                </span>
              )}
            </div>
            <p className="mt-4 text-3xl font-extrabold text-heading">{plan.price}</p>
            <p className="mt-2 text-sm text-muted">{plan.summary}</p>
            <ul className="mt-6 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-body">
                  <span className="mt-1 inline-block h-2 w-2 rounded-full bg-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <a
              href="#cta"
              className={`mt-8 inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-bold ${
                plan.highlighted
                  ? 'bg-primary text-white hover:bg-primary-hover'
                  : 'border border-border text-heading hover:bg-surface-raised'
              }`}
            >
              Choose {plan.tier}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
