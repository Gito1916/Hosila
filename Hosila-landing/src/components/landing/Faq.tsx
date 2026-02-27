import type { FaqItem } from '../../types/landing';

interface FaqProps {
  faqs: FaqItem[];
}

export function Faq({ faqs }: FaqProps) {
  return (
    <section id="faq" className="mx-auto max-w-4xl px-5 py-16 lg:py-20">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
          FAQ
        </p>
        <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">
          Answers before you book a walkthrough
        </h2>
      </div>

      <div className="mt-10 space-y-3">
        {faqs.map((faq) => (
          <details
            key={faq.question}
            className="rounded-xl border border-border bg-surface-card p-5"
          >
            <summary className="cursor-pointer list-none pr-8 text-sm font-bold text-heading">
              {faq.question}
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-body">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
