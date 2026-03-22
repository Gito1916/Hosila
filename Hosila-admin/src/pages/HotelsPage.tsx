import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Building2, Search, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';

import { adminApi, formatCurrency, formatDate } from '@/lib/apiClient';
import type { HotelListResponse, PlanCatalogItem } from '@/types/admin';

interface HotelsPageProps {
  plans: PlanCatalogItem[];
}

const statusOptions = ['all', 'trialing', 'active', 'inactive', 'past_due', 'cancelled'];

export function HotelsPage({ plans }: HotelsPageProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [plan, setPlan] = useState('all');
  const [data, setData] = useState<HotelListResponse>({ hotels: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const controller = new AbortController();

    async function loadHotels() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (deferredQuery.trim()) params.set('query', deferredQuery.trim());
        if (status !== 'all') params.set('status', status);
        if (plan !== 'all') params.set('plan_code', plan);
        params.set('limit', '80');

        const response = await adminApi.listHotels(params);
        if (!controller.signal.aborted) {
          setData(response);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Failed to load hotels');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadHotels();
    return () => controller.abort();
  }, [deferredQuery, status, plan]);

  const summary = useMemo(() => {
    return data.hotels.reduce(
      (acc, hotel) => {
        acc[hotel.status] = (acc[hotel.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [data.hotels]);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.34em] text-white/45">Hotel Search</p>
          <h1 className="font-display text-4xl text-white">Manage live subscriptions</h1>
          <p className="max-w-2xl text-sm text-white/60">
            Search by hotel name, ID, code, or organisation. Every write routes through
            internal backend checks and creates both a ledger entry and a platform audit record.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="glass-card min-w-[170px]">
            <p className="eyebrow">Hotels</p>
            <p className="metric">{data.total}</p>
          </div>
          <div className="glass-card min-w-[170px]">
            <p className="eyebrow">Active</p>
            <p className="metric">{summary.active || 0}</p>
          </div>
          <div className="glass-card min-w-[170px]">
            <p className="eyebrow">Trialing</p>
            <p className="metric">{summary.trialing || 0}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr_0.6fr]">
        <label className="field">
          <span className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search hotels
          </span>
          <input
            placeholder="Hotel name, org, hotel ID, code"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Status
          </span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All statuses' : option.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Plan</span>
          <select value={plan} onChange={(event) => setPlan(event.target.value)}>
            <option value="all">All plans</option>
            {plans.map((planOption) => (
              <option key={planOption.code} value={planOption.code}>
                {planOption.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="panel text-sm text-white/70">Loading hotels...</div>
        ) : data.hotels.length === 0 ? (
          <div className="panel text-sm text-white/70">No hotels matched the current filters.</div>
        ) : (
          data.hotels.map((hotel) => (
            <Link key={hotel.hotel_id} className="hotel-card" to={`/hotels/${hotel.hotel_id}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Hotel</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">{hotel.hotel_name}</h2>
                  <p className="mt-2 text-sm text-white/55">
                    {hotel.org_name || 'No organisation'} · {hotel.hotel_code || 'No code'}
                  </p>
                </div>
                <div className={`status-pill status-${hotel.status.replace('_', '-')}`}>
                  {hotel.status.replace('_', ' ')}
                </div>
              </div>

              <div className="mt-6 grid gap-3 text-sm text-white/68">
                <div className="flex items-center justify-between gap-3">
                  <span>Plan</span>
                  <span className="font-medium text-white">{hotel.plan_code || 'starter'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Billing</span>
                  <span className="font-medium text-white">
                    {hotel.billing_interval || 'monthly'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Rate</span>
                  <span className="font-medium text-white">
                    {formatCurrency(hotel.unit_amount ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Next due</span>
                  <span className="font-medium text-white">{formatDate(hotel.next_due_at)}</span>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2 text-sm text-emerald-200">
                <Building2 className="h-4 w-4" />
                Open hotel detail
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
