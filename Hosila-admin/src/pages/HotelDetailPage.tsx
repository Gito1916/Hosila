import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Layers3, ReceiptText, ScrollText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { ActionModal } from '@/components/ActionModal';
import { adminApi, formatCurrency, formatDate, humanizeKey } from '@/lib/apiClient';
import type { ActionMode, HotelDetailResponse, PlanCatalogItem } from '@/types/admin';

interface HotelDetailPageProps {
  plans: PlanCatalogItem[];
}

export function HotelDetailPage({ plans }: HotelDetailPageProps) {
  const { hotelId } = useParams();
  const [detail, setDetail] = useState<HotelDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ActionMode | null>(null);

  const loadHotel = useCallback(async () => {
    if (!hotelId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await adminApi.getHotel(hotelId);
      setDetail(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load hotel');
    } finally {
      setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => {
    void loadHotel();
  }, [loadHotel]);

  if (loading) {
    return <div className="panel text-sm text-white/70">Loading hotel detail...</div>;
  }

  if (error || !detail) {
    return (
      <div className="panel space-y-4">
        <p className="text-sm text-amber-100">{error || 'Hotel not found'}</p>
        <button className="ghost-button" type="button" onClick={() => void loadHotel()}>
          Retry
        </button>
      </div>
    );
  }

  const { subscription } = detail;
  const actionButtons: Array<{ mode: ActionMode; label: string }> = [
    { mode: 'trial', label: 'Start Trial' },
    { mode: 'activate', label: 'Activate Plan' },
    { mode: 'renew', label: 'Renew' },
    { mode: 'inactive', label: 'Mark Inactive' },
    { mode: 'override', label: 'Add Override' },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/7 via-white/5 to-emerald-500/10 p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.34em] text-white/45">Hotel Detail</p>
            <div>
              <h1 className="font-display text-4xl text-white">{detail.hotel_name}</h1>
              <p className="mt-3 text-sm text-white/62">
                Hotel ID: {detail.hotel_id}
                <span className="mx-2 text-white/25">/</span>
                Org: {detail.org_name || 'No organisation'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className={`status-pill status-${subscription.status.replace('_', '-')}`}>
                {subscription.status.replace('_', ' ')}
              </div>
              <div className="soft-pill">{subscription.plan_code}</div>
              <div className="soft-pill">{subscription.billing_interval}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 lg:max-w-xl lg:justify-end">
            {actionButtons.map((button) => (
              <button
                key={button.mode}
                className={button.mode === 'inactive' ? 'ghost-button' : 'brand-button'}
                type="button"
                onClick={() => setModalMode(button.mode)}
              >
                {button.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="glass-card">
          <p className="eyebrow">Current plan</p>
          <p className="metric mt-3">{subscription.plan_code}</p>
          <p className="mt-2 text-sm text-white/58">{formatCurrency(subscription.unit_amount)}</p>
        </div>
        <div className="glass-card">
          <p className="eyebrow">Trial dates</p>
          <p className="metric mt-3 text-lg">{formatDate(subscription.trial_starts_at)}</p>
          <p className="mt-2 text-sm text-white/58">Ends {formatDate(subscription.trial_ends_at)}</p>
        </div>
        <div className="glass-card">
          <p className="eyebrow">Next due date</p>
          <p className="metric mt-3 text-lg">{formatDate(subscription.next_due_at)}</p>
          <p className="mt-2 text-sm text-white/58">Period ends {formatDate(subscription.current_period_ends_at)}</p>
        </div>
        <div className="glass-card">
          <p className="eyebrow">Last payment</p>
          <p className="metric mt-3 text-lg">{formatCurrency(subscription.last_payment_amount)}</p>
          <p className="mt-2 text-sm text-white/58">{formatDate(subscription.last_payment_at)}</p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/5 via-white/3 to-violet-500/8 p-6">
        <p className="eyebrow">Enforcement State</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Real-time enforcement</h2>
        <p className="mt-1 text-sm text-white/55">
          Computed by SQL helpers — this is what the tenant app and RLS policies see right now.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">Effective status</p>
            <p className={`mt-2 text-lg font-semibold ${subscription.effective_status === 'active' || subscription.effective_status === 'trialing'
                ? 'text-emerald-300'
                : subscription.effective_status === 'past_due'
                  ? 'text-amber-300'
                  : 'text-red-300'
              }`}>
              {subscription.effective_status.replace('_', ' ')}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">Write mode</p>
            <p className={`mt-2 text-lg font-semibold ${subscription.write_mode === 'full'
                ? 'text-emerald-300'
                : subscription.write_mode === 'restricted'
                  ? 'text-amber-300'
                  : 'text-red-300'
              }`}>
              {subscription.write_mode}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">Room inventory</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {subscription.rooms_used}{subscription.rooms_limit !== null ? ` / ${subscription.rooms_limit}` : ' / ∞'}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">Active bookings</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {subscription.active_bookings}
              {subscription.write_mode === 'restricted' && ' / 5'}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">DB status</p>
            <p className="mt-2 text-lg font-semibold text-white/70">
              {subscription.status.replace('_', ' ')}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Feature Entitlements</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Effective access layer</h2>
            </div>
            <Layers3 className="h-5 w-5 text-emerald-200" />
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {Object.entries(subscription.effective_entitlements).map(([key, value]) => (
              <div key={key} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-white/48">{humanizeKey(key)}</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {typeof value === 'boolean'
                    ? value
                      ? 'Enabled'
                      : 'Disabled'
                    : value === null
                      ? 'Unlimited'
                      : String(value)}
                </p>
              </div>
            ))}
          </div>

          {detail.overrides.length > 0 && (
            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="eyebrow">Active overrides</p>
              <div className="mt-4 space-y-3">
                {detail.overrides.map((override) => (
                  <div key={override.id} className="flex flex-col gap-1 rounded-2xl border border-white/8 px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-white">{humanizeKey(override.feature_key)}</p>
                      <p className="text-sm text-white/55">
                        {override.override_mode} · {override.reason || 'No reason'}
                      </p>
                    </div>
                    <div className="text-sm text-white/68">{formatDate(override.ends_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Subscription Ledger</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Recent entries</h2>
              </div>
              <ReceiptText className="h-5 w-5 text-amber-200" />
            </div>

            <div className="mt-5 space-y-3">
              {detail.recent_ledger_entries.slice(0, 6).map((entry) => (
                <div key={entry.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-white">{entry.entry_type.replace(/_/g, ' ')}</div>
                    <div className="text-sm text-white/55">{formatDate(entry.created_at)}</div>
                  </div>
                  <div className="mt-2 text-sm text-white/65">
                    {formatCurrency(entry.amount)} · {entry.plan_code || subscription.plan_code} ·{' '}
                    {entry.billing_interval || subscription.billing_interval}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Platform Audit</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Recent writes</h2>
              </div>
              <ScrollText className="h-5 w-5 text-violet-200" />
            </div>

            <div className="mt-5 space-y-3">
              {detail.recent_audit_entries.slice(0, 6).map((entry) => (
                <div key={entry.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-white">{entry.action.replace(/_/g, ' ')}</div>
                    <div className="text-sm text-white/55">{formatDate(entry.created_at)}</div>
                  </div>
                  <div className="mt-2 text-sm text-white/65">{entry.admin_email || entry.admin_user_id}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">Full history</p>
          <p className="text-sm text-white/60">
            Open the dedicated audit and subscription history view for this hotel.
          </p>
        </div>
        <Link className="brand-button" to={`/hotels/${detail.hotel_id}/history`}>
          Open history
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {modalMode && (
        <ActionModal
          hotel={detail}
          mode={modalMode}
          plans={plans}
          onClose={() => setModalMode(null)}
          onSaved={(nextDetail) => {
            setDetail(nextDetail);
            setModalMode(null);
          }}
        />
      )}
    </div>
  );
}
