import { useMemo, useState } from 'react';

import { adminApi, formatCurrency } from '@/lib/apiClient';
import type {
  ActionMode,
  HotelDetailResponse,
  PlanCatalogItem,
} from '@/types/admin';

interface ActionModalProps {
  hotel: HotelDetailResponse;
  mode: ActionMode;
  plans: PlanCatalogItem[];
  onClose: () => void;
  onSaved: (detail: HotelDetailResponse) => void;
}

function toInputDate(value: string | null) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 16);
}

function coerceOverrideValue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (!Number.isNaN(Number(trimmed))) return Number(trimmed);

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function buildInitialState(mode: ActionMode, hotel: HotelDetailResponse) {
  const { subscription } = hotel;
  return {
    planCode: subscription.plan_code,
    billingInterval: subscription.billing_interval,
    trialDays: '14',
    amountPaid: subscription.unit_amount || '',
    paymentReference: '',
    notes: '',
    effectiveAt: toInputDate(new Date().toISOString()),
    paidAt: toInputDate(new Date().toISOString()),
    periodStartsAt: toInputDate(subscription.current_period_ends_at ?? new Date().toISOString()),
    featureKey: '',
    overrideMode: 'set',
    overrideValue: '',
    startsAt: toInputDate(new Date().toISOString()),
    endsAt: '',
    mode,
  };
}

export function ActionModal({ hotel, mode, plans, onClose, onSaved }: ActionModalProps) {
  const [form, setForm] = useState(() => buildInitialState(mode, hotel));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.code === form.planCode) ?? plans[0],
    [form.planCode, plans],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      let nextDetail: HotelDetailResponse;

      if (mode === 'trial') {
        nextDetail = await adminApi.startTrial(hotel.hotel_id, {
          plan_code: form.planCode,
          billing_interval: form.billingInterval,
          trial_days: Number(form.trialDays),
          starts_at: form.effectiveAt ? new Date(form.effectiveAt).toISOString() : undefined,
          notes: form.notes || undefined,
        });
      } else if (mode === 'activate') {
        nextDetail = await adminApi.activatePlan(hotel.hotel_id, {
          plan_code: form.planCode,
          billing_interval: form.billingInterval,
          amount_paid: form.amountPaid ? Number(form.amountPaid) : undefined,
          payment_reference: form.paymentReference || undefined,
          effective_at: form.effectiveAt ? new Date(form.effectiveAt).toISOString() : undefined,
          paid_at: form.paidAt ? new Date(form.paidAt).toISOString() : undefined,
          notes: form.notes || undefined,
        });
      } else if (mode === 'renew') {
        nextDetail = await adminApi.renewPlan(hotel.hotel_id, {
          plan_code: form.planCode,
          billing_interval: form.billingInterval,
          amount_paid: form.amountPaid ? Number(form.amountPaid) : undefined,
          payment_reference: form.paymentReference || undefined,
          period_starts_at: form.periodStartsAt
            ? new Date(form.periodStartsAt).toISOString()
            : undefined,
          paid_at: form.paidAt ? new Date(form.paidAt).toISOString() : undefined,
          notes: form.notes || undefined,
        });
      } else if (mode === 'inactive') {
        nextDetail = await adminApi.markInactive(hotel.hotel_id, {
          notes: form.notes || undefined,
          effective_at: form.effectiveAt ? new Date(form.effectiveAt).toISOString() : undefined,
        });
      } else {
        nextDetail = await adminApi.addOverride(hotel.hotel_id, {
          feature_key: form.featureKey,
          override_mode: form.overrideMode,
          value: coerceOverrideValue(form.overrideValue),
          reason: form.notes || undefined,
          starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
          ends_at: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        });
      }

      onSaved(nextDetail);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  const titleMap: Record<ActionMode, string> = {
    trial: 'Start Trial',
    activate: 'Record Payment + Activate Plan',
    renew: 'Record Payment + Renew Plan',
    inactive: 'Mark Hotel Inactive',
    override: 'Add Override',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
      <div className="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-white/50">Internal Admin</p>
            <h2 className="font-display text-3xl text-white">{titleMap[mode]}</h2>
            <p className="mt-2 text-sm text-white/65">{hotel.hotel_name}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="space-y-5 px-6 py-6" onSubmit={handleSubmit}>
          {(mode === 'trial' || mode === 'activate' || mode === 'renew') && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="field">
                <span>Plan</span>
                <select
                  value={form.planCode}
                  onChange={(event) => setForm((current) => ({ ...current, planCode: event.target.value }))}
                >
                  {plans.map((plan) => (
                    <option key={plan.code} value={plan.code}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Billing interval</span>
                <select
                  value={form.billingInterval}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, billingInterval: event.target.value }))
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
            </div>
          )}

          {(mode === 'trial' || mode === 'activate' || mode === 'renew') && selectedPlan && (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Catalog price</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div className="text-2xl font-semibold text-white">
                  {formatCurrency(
                    form.billingInterval === 'yearly'
                      ? selectedPlan.yearly_amount
                      : selectedPlan.monthly_amount,
                    selectedPlan.currency,
                  )}
                </div>
                <div className="text-sm text-white/55">
                  {form.billingInterval === 'yearly' ? '6.25% discount applied' : 'standard rate'}
                </div>
              </div>
            </div>
          )}

          {mode === 'trial' && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="field">
                <span>Trial days</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={form.trialDays}
                  onChange={(event) => setForm((current) => ({ ...current, trialDays: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Trial starts</span>
                <input
                  type="datetime-local"
                  value={form.effectiveAt}
                  onChange={(event) => setForm((current) => ({ ...current, effectiveAt: event.target.value }))}
                />
              </label>
            </div>
          )}

          {(mode === 'activate' || mode === 'renew') && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="field">
                <span>Amount paid</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amountPaid}
                  onChange={(event) => setForm((current) => ({ ...current, amountPaid: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Payment reference</span>
                <input
                  value={form.paymentReference}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, paymentReference: event.target.value }))
                  }
                />
              </label>
              {mode === 'activate' ? (
                <label className="field">
                  <span>Plan starts</span>
                  <input
                    type="datetime-local"
                    value={form.effectiveAt}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, effectiveAt: event.target.value }))
                    }
                  />
                </label>
              ) : (
                <label className="field">
                  <span>Renewal period starts</span>
                  <input
                    type="datetime-local"
                    value={form.periodStartsAt}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, periodStartsAt: event.target.value }))
                    }
                  />
                </label>
              )}
              <label className="field">
                <span>Payment time</span>
                <input
                  type="datetime-local"
                  value={form.paidAt}
                  onChange={(event) => setForm((current) => ({ ...current, paidAt: event.target.value }))}
                />
              </label>
            </div>
          )}

          {mode === 'inactive' && (
            <label className="field">
              <span>Effective time</span>
              <input
                type="datetime-local"
                value={form.effectiveAt}
                onChange={(event) => setForm((current) => ({ ...current, effectiveAt: event.target.value }))}
              />
            </label>
          )}

          {mode === 'override' && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="field">
                <span>Feature key</span>
                <input
                  placeholder="priority_support"
                  value={form.featureKey}
                  onChange={(event) => setForm((current) => ({ ...current, featureKey: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Override mode</span>
                <select
                  value={form.overrideMode}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, overrideMode: event.target.value }))
                  }
                >
                  <option value="set">Set</option>
                  <option value="limit">Limit</option>
                  <option value="enable">Enable</option>
                  <option value="disable">Disable</option>
                </select>
              </label>
              <label className="field md:col-span-2">
                <span>Value</span>
                <input
                  placeholder='Examples: true, 120, "custom", {"tier":"pilot"}'
                  value={form.overrideValue}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, overrideValue: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Starts</span>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Ends</span>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
                />
              </label>
            </div>
          )}

          <label className="field">
            <span>{mode === 'override' ? 'Reason' : 'Notes'}</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>

          {error && <div className="rounded-2xl border border-amber-300/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-100">{error}</div>}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button className="ghost-button" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="brand-button" type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : titleMap[mode]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
