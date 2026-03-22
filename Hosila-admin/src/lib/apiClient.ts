import { supabase } from '@/lib/supabase';
import type {
  AdminMeResponse,
  HotelDetailResponse,
  HotelHistoryResponse,
  HotelListResponse,
} from '@/types/admin';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(payload.detail || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const adminApi = {
  me: () => request<AdminMeResponse>('/internal-admin/me'),
  listHotels: (params: URLSearchParams) =>
    request<HotelListResponse>(`/internal-admin/hotels?${params.toString()}`),
  getHotel: (hotelId: string) => request<HotelDetailResponse>(`/internal-admin/hotels/${hotelId}`),
  getHistory: (hotelId: string) =>
    request<HotelHistoryResponse>(`/internal-admin/hotels/${hotelId}/history`),
  startTrial: (hotelId: string, payload: Record<string, unknown>) =>
    request<HotelDetailResponse>(`/internal-admin/hotels/${hotelId}/start-trial`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  activatePlan: (hotelId: string, payload: Record<string, unknown>) =>
    request<HotelDetailResponse>(`/internal-admin/hotels/${hotelId}/activate-plan`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  renewPlan: (hotelId: string, payload: Record<string, unknown>) =>
    request<HotelDetailResponse>(`/internal-admin/hotels/${hotelId}/renew`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  markInactive: (hotelId: string, payload: Record<string, unknown>) =>
    request<HotelDetailResponse>(`/internal-admin/hotels/${hotelId}/mark-inactive`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  addOverride: (hotelId: string, payload: Record<string, unknown>) =>
    request<HotelDetailResponse>(`/internal-admin/hotels/${hotelId}/overrides`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export function formatCurrency(amount: string | number | null, currency = 'NGN') {
  if (amount === null) return 'None';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function formatDate(value: string | null) {
  if (!value) return 'None';
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function humanizeKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
