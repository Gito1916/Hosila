import type { StepItem } from '../../types/landing';

interface HowItWorksProps {
  steps: StepItem[];
}

export function HowItWorks({ steps }: HowItWorksProps) {
  return (
    <section id="workflow" className="bg-surface-inset/70 py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
            Workflow
          </p>
          <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">
            Go live in three straightforward steps
          </h2>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className="rounded-2xl border border-border bg-surface-card p-6"
            >
              <p className="text-sm font-bold text-accent">0{index + 1}</p>
              <h3 className="mt-4 text-xl font-bold text-heading">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-body">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
