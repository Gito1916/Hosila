/**
 * React Query hooks for the Hosila Financial API.
 *
 * These hooks wrap the apiClient.ts functions and provide caching,
 * background refetching, and error handling via TanStack Query.
 *
 * Usage:
 *   const { data, isLoading } = useTaxSettings();
 *   const { data: kpis } = useDashboardKPIs('2026-01-01', '2026-01-31');
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taxApi, billingApi, reportsApi, analyticsApi, type TaxSettings, type DashboardKPIs } from '@/lib/apiClient';

// ── Tax Engine ───────────────────────────────────────

/** Calculate tax breakdown for a given amount and department */
export function useTaxCalculation(baseAmount: number, department: string) {
    return useQuery({
        queryKey: ['hosila', 'tax', 'calculate', baseAmount, department],
        queryFn: () => taxApi.calculate(baseAmount, department),
        enabled: baseAmount > 0,
        staleTime: 1000 * 60 * 5,
        retry: false,
        throwOnError: false,
    });
}

/** Get all tax settings for the hotel */
export function useTaxSettings() {
    return useQuery({
        queryKey: ['hosila', 'tax', 'settings'],
        queryFn: () => taxApi.getSettings(),
        staleTime: 1000 * 60 * 10, // 10 min cache
        retry: false,              // Don't retry on auth failures
        throwOnError: false,       // Don't crash the app if backend is down
    });
}

/** Update tax settings for a department */
export function useUpdateTaxSettings() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ department, data }: { department: string; data: Partial<TaxSettings> }) =>
            taxApi.updateSettings(department, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['hosila', 'tax'] });
        },
    });
}

// ── Billing ──────────────────────────────────────────

/** Generate invoice at checkout */
export function useCheckout() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ bookingId, idempotencyKey }: { bookingId: string; idempotencyKey: string }) =>
            billingApi.checkout(bookingId, idempotencyKey),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['hosila'] });
        },
    });
}

// ── Reports ──────────────────────────────────────────

/** Accommodation report (RevPAR, ADR, occupancy) */
export function useAccommodationReport(start: string, end: string) {
    return useQuery({
        queryKey: ['hosila', 'reports', 'accommodation', start, end],
        queryFn: () => reportsApi.accommodation(start, end),
        enabled: !!start && !!end,
        staleTime: 1000 * 60 * 5,
        retry: false,
        throwOnError: false,
    });
}

/** Restaurant report (item sales, margins, top sellers) */
export function useRestaurantReport(start: string, end: string) {
    return useQuery({
        queryKey: ['hosila', 'reports', 'restaurant', start, end],
        queryFn: () => reportsApi.restaurant(start, end),
        enabled: !!start && !!end,
        staleTime: 1000 * 60 * 5,
        retry: false,
        throwOnError: false,
    });
}

/** Inventory report (stock movements) */
export function useInventoryReport(start: string, end: string) {
    return useQuery({
        queryKey: ['hosila', 'reports', 'inventory', start, end],
        queryFn: () => reportsApi.inventory(start, end),
        enabled: !!start && !!end,
        staleTime: 1000 * 60 * 5,
        retry: false,
        throwOnError: false,
    });
}

/** Tax remittance report */
export function useTaxRemittanceReport(start: string, end: string) {
    return useQuery({
        queryKey: ['hosila', 'reports', 'tax-remittance', start, end],
        queryFn: () => reportsApi.taxRemittance(start, end),
        enabled: !!start && !!end,
        staleTime: 1000 * 60 * 5,
        retry: false,
        throwOnError: false,
    });
}

/** Mark taxes as remitted */
export function useMarkRemitted() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (params: { taxType: string; periodStart: string; periodEnd: string; notes?: string }) =>
            reportsApi.markRemitted(params.taxType, params.periodStart, params.periodEnd, params.notes),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['hosila', 'reports', 'tax-remittance'] });
        },
    });
}

/** Download report as PDF or Excel */
export function useReportDownload() {
    return useMutation({
        mutationFn: async ({ type, start, end, format }: { type: string; start: string; end: string; format: 'pdf' | 'excel' }) => {
            const blob = await reportsApi.downloadReport(type, start, end, format);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${type}_report_${start}_${end}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        },
    });
}

// ── Analytics ────────────────────────────────────────

/** Dashboard KPIs */
export function useDashboardKPIs(start: string, end: string) {
    return useQuery<DashboardKPIs>({
        queryKey: ['hosila', 'analytics', 'dashboard', start, end],
        queryFn: () => analyticsApi.dashboard(start, end),
        enabled: !!start && !!end,
        staleTime: 1000 * 60 * 2,
        retry: false,
        throwOnError: false,
    });
}
