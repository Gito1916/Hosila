/**
 * Hosila API Client
 * 
 * Connects the React frontend to the FastAPI financial backend.
 * All financial calculations, reports, and analytics go through this client.
 * The frontend NEVER computes taxes directly.
 */

import { supabase } from './supabase';

// Base URL for the FastAPI backend
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// ── HTTP Client ──────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        throw new Error('Not authenticated');
    }
    return {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
    };
}

async function apiRequest<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const headers = await getAuthHeaders();
    const url = `${API_BASE_URL}${path}`;

    const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `API Error: ${response.status}`);
    }

    return response.json();
}

async function apiDownload(path: string): Promise<Blob> {
    const headers = await getAuthHeaders();
    const url = `${API_BASE_URL}${path}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
    }

    return response.blob();
}

// ── Types ────────────────────────────────────────────────────

export interface TaxComponent {
    rate: number;
    amount: number;
    enabled: boolean;
}

export interface TaxBreakdown {
    base_amount: number;
    service_charge: TaxComponent;
    vat: TaxComponent;
    tdl: TaxComponent;
    total: number;
    breakdown_note: string;
}

export interface TaxSettings {
    id: string;
    hotel_id: string;
    department: string;
    vat_rate: number;
    tdl_rate: number;
    service_charge_rate: number;
    service_charge_enabled: boolean;
    vat_enabled: boolean;
    tdl_enabled: boolean;
    vat_calculation_base: string;
    tdl_calculation_base: string;
}

export interface InvoiceLineItem {
    description: string;
    department: string;
    base_amount: number;
    service_charge: number;
    vat: number;
    tdl: number;
    total: number;
}

export interface Invoice {
    invoice_id: string;
    invoice_number: string;
    booking_id: string;
    guest_name: string;
    guest_phone?: string;
    items: InvoiceLineItem[];
    subtotal: number;
    total_service_charge: number;
    total_vat: number;
    total_tdl: number;
    grand_total: number;
    amount_paid: number;
    balance: number;
    status: string;
    created_at: string;
}

export interface DashboardKPIs {
    total_revenue: number;
    total_expenses: number;
    net_profit: number;
    profit_margin: number;
    accommodation_revenue: number;
    restaurant_revenue: number;
    other_revenue: number;
    total_vat_collected: number;
    total_tdl_collected: number;
    total_service_charge: number;
    active_bookings: number;
    total_guests: number;
}

// ── API Functions ────────────────────────────────────────────

// Tax Engine
export const taxApi = {
    /** Calculate tax breakdown for a given amount and department */
    calculate: (baseAmount: number, department: string) =>
        apiRequest<TaxBreakdown>('/api/v1/tax/calculate', {
            method: 'POST',
            body: JSON.stringify({ base_amount: baseAmount, department }),
        }),

    /** Get all tax settings for the hotel */
    getSettings: () =>
        apiRequest<{ settings: TaxSettings[] }>('/api/v1/tax/settings'),

    /** Update tax settings for a specific department */
    updateSettings: (department: string, data: Partial<TaxSettings>) =>
        apiRequest<TaxSettings>(`/api/v1/tax/settings/${department}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
};

// Billing
export const billingApi = {
    /** Generate invoice at checkout */
    checkout: (bookingId: string, idempotencyKey: string) =>
        apiRequest<Invoice>('/api/v1/billing/checkout', {
            method: 'POST',
            body: JSON.stringify({
                booking_id: bookingId,
                idempotency_key: idempotencyKey,
            }),
        }),
};

// Reports
export const reportsApi = {
    /** Get accommodation report */
    accommodation: (start: string, end: string) =>
        apiRequest(`/api/v1/reports/accommodation?start=${start}&end=${end}`),

    /** Get restaurant report */
    restaurant: (start: string, end: string) =>
        apiRequest(`/api/v1/reports/restaurant?start=${start}&end=${end}`),

    /** Get inventory report */
    inventory: (start: string, end: string) =>
        apiRequest(`/api/v1/reports/inventory?start=${start}&end=${end}`),

    /** Get tax remittance report */
    taxRemittance: (start: string, end: string) =>
        apiRequest(`/api/v1/reports/tax-remittance?start=${start}&end=${end}`),

    /** Mark taxes as remitted */
    markRemitted: (taxType: string, periodStart: string, periodEnd: string, notes?: string) =>
        apiRequest('/api/v1/reports/tax-remittance/mark-remitted', {
            method: 'POST',
            body: JSON.stringify({
                tax_type: taxType,
                period_start: periodStart,
                period_end: periodEnd,
                notes,
            }),
        }),

    /** Download report as Excel or PDF */
    downloadReport: (type: string, start: string, end: string, format: string = 'excel') =>
        apiDownload(`/api/v1/reports/${type}/export?start=${start}&end=${end}&format=${format}`),
};

// Analytics
export const analyticsApi = {
    /** Get dashboard KPIs */
    dashboard: (start: string, end: string) =>
        apiRequest<DashboardKPIs>(`/api/v1/analytics/dashboard?start=${start}&end=${end}`),
};
