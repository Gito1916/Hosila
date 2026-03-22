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

// Backend wake-up state (Render free tier sleeps after 15min)
let _backendAwake = false;
let _lastAwakeCheck = 0;
const AWAKE_CACHE_MS = 10 * 60 * 1000; // 10 minutes
let _wakePromise: Promise<boolean> | null = null;

/** Current backend connection status for UI */
export type BackendStatus = 'awake' | 'waking' | 'unreachable';
let _statusListeners: Array<(s: BackendStatus) => void> = [];
let _currentStatus: BackendStatus = 'awake';

function _setStatus(s: BackendStatus) {
    _currentStatus = s;
    _statusListeners.forEach(fn => fn(s));
}

/** Subscribe to backend status changes. Returns unsubscribe function. */
export function onBackendStatusChange(fn: (s: BackendStatus) => void): () => void {
    _statusListeners.push(fn);
    fn(_currentStatus); // call immediately with current
    return () => { _statusListeners = _statusListeners.filter(f => f !== fn); };
}

/**
 * Ensure the backend is awake. Pings /health with exponential backoff.
 * Render free tier cold starts take 20-60 seconds.
 * Returns true if backend is alive, false if unreachable after all attempts.
 */
export async function ensureBackendAwake(): Promise<boolean> {
    // If recently confirmed awake, skip
    if (_backendAwake && Date.now() - _lastAwakeCheck < AWAKE_CACHE_MS) {
        return true;
    }

    // Deduplicate concurrent wake-up calls
    if (_wakePromise) return _wakePromise;

    _wakePromise = (async () => {
        const maxAttempts = 6;
        let delay = 5000; // start at 5s — cold starts need time

        _setStatus('waking');

        for (let i = 0; i < maxAttempts; i++) {
            try {
                const resp = await fetch(`${API_BASE_URL}/health`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(10000), // 10s timeout per attempt
                });
                if (resp.ok) {
                    _backendAwake = true;
                    _lastAwakeCheck = Date.now();
                    _setStatus('awake');
                    return true;
                }
            } catch {
                // Network error or timeout — backend still booting
            }

            if (i < maxAttempts - 1) {
                console.log(`⏳ Backend waking up... retry ${i + 1}/${maxAttempts} in ${delay / 1000}s`);
                await new Promise(r => setTimeout(r, delay));
                delay = Math.min(delay * 2, 40000); // cap at 40s
            }
        }

        _setStatus('unreachable');
        return false;
    })();

    const result = await _wakePromise;
    _wakePromise = null;
    return result;
}

/** Fire-and-forget warmup ping on app load */
export function warmUpBackend(): void {
    ensureBackendAwake().catch(() => { });
}

async function getAuthHeaders(): Promise<Record<string, string>> {
    let accessToken: string | null = null;
    try {
        const stored = localStorage.getItem('hotelflow-auth');
        if (stored) {
            const parsed = JSON.parse(stored);
            accessToken = parsed.state?.accessToken;
        }
    } catch {
        // ignore
    }

    // Fallback to Supabase built-in session (for admin users/cloud accounts)
    if (!accessToken && supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
            accessToken = session.access_token;
        }
    }

    if (!accessToken) {
        throw new Error('Not authenticated');
    }

    return {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };
}

async function apiRequest<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const headers = await getAuthHeaders();
    const url = `${API_BASE_URL}${path}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers: { ...headers, ...options.headers },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(error.detail || `API Error: ${response.status}`);
        }

        // Backend responded successfully — mark as awake
        _backendAwake = true;
        _lastAwakeCheck = Date.now();
        _setStatus('awake');

        return response.json();
    } catch (err) {
        // Network failure (ERR_CONNECTION_REFUSED, timeout, etc.)
        // This likely means the backend is sleeping — wake it and retry once
        if (err instanceof TypeError && err.message.includes('fetch')) {
            _backendAwake = false;
            const awoke = await ensureBackendAwake();
            if (awoke) {
                // Retry the original request once
                const retryHeaders = await getAuthHeaders();
                const retryResponse = await fetch(url, {
                    ...options,
                    headers: { ...retryHeaders, ...options.headers },
                });
                if (!retryResponse.ok) {
                    const error = await retryResponse.json().catch(() => ({ detail: 'Unknown error' }));
                    throw new Error(error.detail || `API Error: ${retryResponse.status}`);
                }
                return retryResponse.json();
            }
            throw new Error('Backend is starting up. Please try again in a moment.');
        }
        throw err;
    }
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

    /** Download report as Excel or PDF (legacy) */
    downloadReport: (type: string, start: string, end: string, format: string = 'excel') =>
        apiDownload(`/api/v1/reports/${type}/export?start=${start}&end=${end}&format=${format}`),

    /** Download V2 period-aware report (accommodation/restaurant only) */
    downloadReportV2: (type: 'accommodation' | 'restaurant', start: string, end: string, mode: string = 'auto') =>
        apiDownload(`/api/v1/reports/${type}/export-v2?start=${start}&end=${end}&mode=${mode}`),
};

// Analytics
export const analyticsApi = {
    /** Get dashboard KPIs */
    dashboard: (start: string, end: string) =>
        apiRequest<DashboardKPIs>(`/api/v1/analytics/dashboard?start=${start}&end=${end}`),
};

// ── Email Types ──────────────────────────────────────────────

export interface EmailSettings {
    sending_mode: 'shared' | 'custom';
    custom_domain: string | null;
    custom_sender_email: string | null;
    domain_verified: boolean;
    spf_verified: boolean;
    dkim_verified: boolean;
    dmarc_verified: boolean;
    primary_color: string;
    promo_enabled: boolean;
    promo_title: string | null;
    promo_body: string | null;
    custom_footer: string | null;
    send_reservation_email: boolean;
    send_checkin_email: boolean;
    send_checkout_email: boolean;
}

export interface EmailLog {
    id: string;
    hotel_id: string;
    guest_id: string | null;
    guest_name: string | null;
    booking_id: string | null;
    reservation_id: string | null;
    email_type: 'reservation_confirmation' | 'checkin_welcome' | 'checkout_receipt';
    recipient_email: string;
    subject: string;
    status: 'sent' | 'failed' | 'skipped' | 'pending';
    error_message: string | null;
    sent_at: string;
}

export interface EmailLogsResponse {
    logs: EmailLog[];
    total: number;
    page: number;
    limit: number;
    pages: number;
}

// Email
export const emailApi = {
    /** Get hotel email settings */
    getSettings: () =>
        apiRequest<EmailSettings>('/api/v1/email/settings'),

    /** Update hotel email settings */
    updateSettings: (data: Partial<EmailSettings>) =>
        apiRequest<EmailSettings>('/api/v1/email/settings', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    /** Get paginated email logs */
    getLogs: (page: number = 1, limit: number = 20) =>
        apiRequest<EmailLogsResponse>(`/api/v1/email/logs?page=${page}&limit=${limit}`),

    /** Manually trigger reservation email */
    sendReservationEmail: (reservationId: string) =>
        apiRequest<{ message: string; status: string }>(`/api/v1/email/send/reservation/${reservationId}`, {
            method: 'POST',
        }),

    /** Manually trigger check-in email */
    sendCheckinEmail: (bookingId: string) =>
        apiRequest<{ message: string; status: string }>(`/api/v1/email/send/checkin/${bookingId}`, {
            method: 'POST',
        }),

    /** Manually trigger check-out email */
    sendCheckoutEmail: (bookingId: string) =>
        apiRequest<{ message: string; status: string }>(`/api/v1/email/send/checkout/${bookingId}`, {
            method: 'POST',
        }),

    /** Trigger onboarding welcome email */
    sendWelcomeEmail: () =>
        apiRequest<{ message: string; status: string }>('/api/v1/email/send/welcome', {
            method: 'POST',
        }),
};

// ── Subscription Types ───────────────────────────────────────

export interface SubscriptionContext {
    hotel_id: string;
    plan_code: string;
    effective_status: string;
    write_mode: 'full' | 'restricted' | 'blocked';
    billing_interval: string;
    currency: string;
    unit_amount: number;
    trial_starts_at: string | null;
    trial_ends_at: string | null;
    activated_at: string | null;
    current_period_starts_at: string | null;
    current_period_ends_at: string | null;
    next_due_at: string | null;
    feature_entitlements: Record<string, boolean | number | null>;
    rooms_used: number;
    rooms_limit: number | null;
    active_bookings: number;
}

// Subscription
export const subscriptionApi = {
    /** Get current hotel's subscription state */
    getCurrent: () =>
        apiRequest<SubscriptionContext>('/api/v1/subscriptions/current'),
};

