import { useCallback, useEffect, useState } from 'react';
import { History, Shield, WandSparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { adminApi, formatCurrency, formatDate, humanizeKey } from '@/lib/apiClient';
import type { HotelDetailResponse, HotelHistoryResponse } from '@/types/admin';

export function HotelHistoryPage() {
  const { hotelId } = useParams();
  const [history, setHistory] = useState<HotelHistoryResponse | null>(null);
  const [detail, setDetail] = useState<HotelDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!hotelId) return;
    setLoading(true);
    setError(null);

    try {
      const [historyResponse, detailResponse] = await Promise.all([
        adminApi.getHistory(hotelId),
        adminApi.getHotel(hotelId),
      ]);
      setHistory(historyResponse);
      setDetail(detailResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (loading) {
    return <div className="panel text-sm text-white/70">Loading history...</div>;
  }

  if (error || !history || !detail) {
    return (
      <div className="panel space-y-4">
        <p className="text-sm text-amber-100">{error || 'History unavailable'}</p>
        <button className="ghost-button" type="button" onClick={() => void loadHistory()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
        <p className="text-xs uppercase tracking-[0.34em] text-white/45">Audit + History</p>
        <h1 className="mt-3 font-display text-4xl text-white">{detail.hotel_name}</h1>
        <p className="mt-2 text-sm text-white/60">
          Full subscription ledger, admin audit trail, and overrides for hotel {detail.hotel_id}.
        </p>
        <div className="mt-5">
          <Link className="ghost-button" to={`/hotels/${detail.hotel_id}`}>
            Back to hotel detail
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Subscription ledger</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Chronological billing record</h2>
            </div>
            <History className="h-5 w-5 text-amber-200" />
          </div>
          <div className="mt-6 space-y-3">
            {history.subscription_ledger.map((entry) => (
              <div key={entry.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium text-white">{entry.entry_type.replace(/_/g, ' ')}</div>
                  <div className="text-sm text-white/55">{formatDate(entry.created_at)}</div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-white/65 md:grid-cols-2">
                  <div>Plan: {entry.plan_code || detail.subscription.plan_code}</div>
                  <div>Billing: {entry.billing_interval || detail.subscription.billing_interval}</div>
                  <div>Amount: {formatCurrency(entry.amount)}</div>
                  <div>Reference: {entry.reference || 'None'}</div>
                  <div>Effective: {formatDate(entry.effective_at)}</div>
                  <div>Due: {formatDate(entry.due_at)}</div>
                </div>
                {entry.notes && <p className="mt-3 text-sm text-white/56">{entry.notes}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Platform audit</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Write trail</h2>
              </div>
              <Shield className="h-5 w-5 text-violet-200" />
            </div>
            <div className="mt-6 space-y-3">
              {history.platform_audit_logs.map((entry) => (
                <div key={entry.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-medium text-white">{entry.action.replace(/_/g, ' ')}</div>
                    <div className="text-sm text-white/55">{formatDate(entry.created_at)}</div>
                  </div>
                  <div className="mt-3 text-sm text-white/65">
                    {entry.admin_email || entry.admin_user_id}
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-2xl bg-black/20 p-3 text-xs text-white/65">
                    {JSON.stringify(entry.result_payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Overrides</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Feature exceptions</h2>
              </div>
              <WandSparkles className="h-5 w-5 text-emerald-200" />
            </div>
            <div className="mt-6 space-y-3">
              {history.overrides.map((override) => (
                <div key={override.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-medium text-white">{humanizeKey(override.feature_key)}</div>
                    <div className="text-sm text-white/55">{override.override_mode}</div>
                  </div>
                  <div className="mt-3 text-sm text-white/65">
                    Starts {formatDate(override.starts_at)} · Ends {formatDate(override.ends_at)}
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-2xl bg-black/20 p-3 text-xs text-white/65">
                    {JSON.stringify(override.value, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
