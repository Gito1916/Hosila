import type { TestimonialItem } from '../../types/landing';

interface TestimonialsProps {
  testimonials: TestimonialItem[];
}

export function Testimonials({ testimonials }: TestimonialsProps) {
  return (
    <section id="testimonials" className="bg-surface-inset/50 py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
            Customer Stories
          </p>
          <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">
            Teams using Hosila move faster every shift
          </h2>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {testimonials.map((item) => (
            <figure
              key={item.name}
              className="rounded-2xl border border-border bg-surface-card p-6"
            >
              <blockquote className="text-sm leading-relaxed text-body">
                "{item.quote}"
              </blockquote>
              <figcaption className="mt-5 border-t border-border-subtle pt-4">
                <p className="text-sm font-bold text-heading">{item.name}</p>
                <p className="text-xs text-muted">{item.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
