export interface PlanCatalogItem {
  code: 'starter' | 'pro' | 'enterprise';
  name: string;
  description: string;
  monthly_amount: string;
  yearly_amount: string;
  currency: string;
  yearly_discount_rate: string;
  trial_days: number;
  entitlements: Record<string, unknown>;
}

export interface AdminMeResponse {
  user_id: string;
  email: string | null;
  full_name: string | null;
  plans: PlanCatalogItem[];
}

export interface HotelListItem {
  hotel_id: string;
  hotel_name: string;
  hotel_code: string | null;
  org_id: string | null;
  org_name: string | null;
  plan_code: string | null;
  status: string;
  billing_interval: string | null;
  unit_amount: string | null;
  next_due_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
}

export interface HotelListResponse {
  hotels: HotelListItem[];
  total: number;
}

export interface SubscriptionLedgerEntry {
  id: string;
  entry_type: string;
  plan_code: string | null;
  billing_interval: string | null;
  amount: string | null;
  currency: string;
  reference: string | null;
  period_starts_at: string | null;
  period_ends_at: string | null;
  due_at: string | null;
  effective_at: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface PlatformAuditEntry {
  id: string;
  admin_user_id: string;
  admin_email: string | null;
  hotel_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  request_payload: Record<string, unknown>;
  result_payload: Record<string, unknown>;
  created_at: string;
}

export interface SubscriptionOverrideItem {
  id: string;
  feature_key: string;
  override_mode: string;
  value: unknown;
  reason: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  revoked_at: string | null;
  revoked_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HotelSubscriptionSummary {
  subscription_id: string;
  plan_code: string;
  status: string;
  effective_status: string;
  write_mode: 'full' | 'restricted' | 'blocked';
  billing_interval: string;
  currency: string;
  unit_amount: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  activated_at: string | null;
  current_period_starts_at: string | null;
  current_period_ends_at: string | null;
  next_due_at: string | null;
  last_payment_at: string | null;
  last_payment_amount: string | null;
  feature_entitlements: Record<string, unknown>;
  effective_entitlements: Record<string, unknown>;
  metadata: Record<string, unknown>;
  notes: string | null;
  rooms_used: number;
  rooms_limit: number | null;
  active_bookings: number;
}

export interface HotelDetailResponse {
  hotel_id: string;
  hotel_name: string;
  hotel_code: string | null;
  org_id: string | null;
  org_name: string | null;
  owner_user_id: string | null;
  created_at: string;
  subscription: HotelSubscriptionSummary;
  overrides: SubscriptionOverrideItem[];
  recent_ledger_entries: SubscriptionLedgerEntry[];
  recent_audit_entries: PlatformAuditEntry[];
}

export interface HotelHistoryResponse {
  hotel_id: string;
  subscription_ledger: SubscriptionLedgerEntry[];
  platform_audit_logs: PlatformAuditEntry[];
  overrides: SubscriptionOverrideItem[];
}

export type ActionMode = 'trial' | 'activate' | 'renew' | 'inactive' | 'override';
