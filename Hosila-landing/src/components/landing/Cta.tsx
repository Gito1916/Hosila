export function Cta() {
  return (
    <section id="cta" className="px-5 pb-16 lg:px-8 lg:pb-20">
      <div className="mx-auto max-w-6xl rounded-3xl border border-primary/30 bg-[linear-gradient(125deg,var(--primary),var(--primary-active))] p-8 text-white md:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">
          Ready to Launch
        </p>
        <h2 className="mt-3 max-w-2xl text-3xl font-extrabold leading-tight md:text-4xl">
          Give your team one place to manage guests, rooms, revenue, and reports.
        </h2>
        <p className="mt-4 max-w-2xl text-sm text-white/85 md:text-base">
          Start with a guided demo and see how Hosila fits your operations before
          rollout.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="mailto:hello@hosila.app?subject=Hosila%20Landing%20Demo"
            className="rounded-lg bg-white px-5 py-3 text-sm font-bold text-accent transition hover:bg-surface-inset"
          >
            Schedule Demo
          </a>
          <a
            href="#features"
            className="rounded-lg border border-white/55 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            Review Features
          </a>
        </div>
      </div>
    </section>
  );
}
