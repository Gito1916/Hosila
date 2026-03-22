import { Navigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { AdminMeResponse } from '@/types/admin';

interface LoginPageProps {
  sessionReady: boolean;
  isAuthenticated: boolean;
  me: AdminMeResponse | null;
  accessError: string | null;
}

export function LoginPage({
  sessionReady,
  isAuthenticated,
  me,
  accessError,
}: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sessionReady && isAuthenticated && me) {
    return <Navigate to="/hotels" replace />;
  }

  if (sessionReady && isAuthenticated && accessError) {
    return (
      <main className="min-h-screen bg-shell px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <section className="panel space-y-5">
            <p className="text-xs uppercase tracking-[0.34em] text-white/45">Access denied</p>
            <h1 className="font-display text-4xl text-white">This user is not in `platform_admins`.</h1>
            <p className="text-sm text-white/62">{accessError}</p>
            <div className="flex flex-wrap gap-3">
              <button
                className="ghost-button"
                type="button"
                onClick={() => void supabase.auth.signOut()}
              >
                Sign out
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
    }
    setSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-16">
        <div className="grid w-full gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Platform-only control plane
            </div>
            <div className="max-w-2xl space-y-5">
              <p className="text-xs uppercase tracking-[0.42em] text-white/45">Hosila Admin</p>
              <h1 className="font-display text-5xl leading-tight text-white md:text-6xl">
                Keep hotel billing under platform control.
              </h1>
              <p className="max-w-xl text-lg text-white/65">
                This app is isolated from the hotel product. It authenticates with
                normal Supabase user sessions, then routes privileged plan changes
                through internal backend endpoints with server-side checks.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="glass-card">
                <p className="eyebrow">Plans</p>
                <p className="metric">Starter / Pro / Enterprise</p>
              </div>
              <div className="glass-card">
                <p className="eyebrow">Yearly</p>
                <p className="metric">6.25% discount</p>
              </div>
              <div className="glass-card">
                <p className="eyebrow">Security</p>
                <p className="metric">No service-role key in the browser</p>
              </div>
            </div>
          </section>

          <section className="panel self-center">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.32em] text-white/45">Sign In</p>
              <h2 className="mt-3 font-display text-3xl text-white">Platform Admin Access</h2>
              <p className="mt-2 text-sm text-white/60">
                Use a Supabase-authenticated platform admin account.
              </p>
            </div>

            {(error || accessError) && (
              <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-100">
                {error || accessError}
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <button className="brand-button w-full justify-center" type="submit" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
