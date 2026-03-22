"""
Pydantic schemas for internal admin subscription management.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class PlanCatalogItem(BaseModel):
    code: str
    name: str
    description: str
    monthly_amount: Decimal
    yearly_amount: Decimal
    currency: str
    yearly_discount_rate: Decimal
    trial_days: int
    entitlements: dict[str, Any]


class AdminMeResponse(BaseModel):
    user_id: str
    email: str | None = None
    full_name: str | None = None
    plans: list[PlanCatalogItem]


class HotelListItem(BaseModel):
    hotel_id: str
    hotel_name: str
    hotel_code: str | None = None
    org_id: str | None = None
    org_name: str | None = None
    plan_code: str | None = None
    status: str
    billing_interval: str | None = None
    unit_amount: Decimal | None = None
    next_due_at: datetime | None = None
    trial_ends_at: datetime | None = None
    created_at: datetime


class HotelListResponse(BaseModel):
    hotels: list[HotelListItem]
    total: int


class SubscriptionLedgerEntry(BaseModel):
    id: str
    entry_type: str
    plan_code: str | None = None
    billing_interval: str | None = None
    amount: Decimal | None = None
    currency: str
    reference: str | None = None
    period_starts_at: datetime | None = None
    period_ends_at: datetime | None = None
    due_at: datetime | None = None
    effective_at: datetime
    notes: str | None = None
    metadata: dict[str, Any]
    created_by: str | None = None
    created_at: datetime


class PlatformAuditEntry(BaseModel):
    id: str
    admin_user_id: str
    admin_email: str | None = None
    hotel_id: str | None = None
    action: str
    entity_type: str
    entity_id: str
    request_payload: dict[str, Any]
    result_payload: dict[str, Any]
    created_at: datetime


class SubscriptionOverrideItem(BaseModel):
    id: str
    feature_key: str
    override_mode: str
    value: Any
    reason: str | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    is_active: bool
    revoked_at: datetime | None = None
    revoked_by: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class HotelSubscriptionSummary(BaseModel):
    subscription_id: str
    plan_code: str
    status: str
    effective_status: str = "inactive"
    write_mode: str = "restricted"
    billing_interval: str
    currency: str
    unit_amount: Decimal
    trial_starts_at: datetime | None = None
    trial_ends_at: datetime | None = None
    activated_at: datetime | None = None
    current_period_starts_at: datetime | None = None
    current_period_ends_at: datetime | None = None
    next_due_at: datetime | None = None
    last_payment_at: datetime | None = None
    last_payment_amount: Decimal | None = None
    feature_entitlements: dict[str, Any]
    effective_entitlements: dict[str, Any]
    metadata: dict[str, Any]
    notes: str | None = None
    rooms_used: int = 0
    rooms_limit: int | None = None
    active_bookings: int = 0


class HotelDetailResponse(BaseModel):
    hotel_id: str
    hotel_name: str
    hotel_code: str | None = None
    org_id: str | None = None
    org_name: str | None = None
    owner_user_id: str | None = None
    created_at: datetime
    subscription: HotelSubscriptionSummary
    overrides: list[SubscriptionOverrideItem]
    recent_ledger_entries: list[SubscriptionLedgerEntry]
    recent_audit_entries: list[PlatformAuditEntry]


class HotelHistoryResponse(BaseModel):
    hotel_id: str
    subscription_ledger: list[SubscriptionLedgerEntry]
    platform_audit_logs: list[PlatformAuditEntry]
    overrides: list[SubscriptionOverrideItem]


class StartTrialRequest(BaseModel):
    plan_code: str = Field(..., description="Plan to place the hotel on trial")
    billing_interval: str = Field("monthly", description="Billing interval after trial")
    trial_days: int = Field(14, ge=1, le=60)
    starts_at: datetime | None = None
    notes: str | None = None


class ActivatePlanRequest(BaseModel):
    plan_code: str
    billing_interval: str = Field("monthly")
    amount_paid: Decimal | None = Field(None, ge=0)
    paid_at: datetime | None = None
    effective_at: datetime | None = None
    payment_reference: str | None = None
    notes: str | None = None


class RenewPlanRequest(BaseModel):
    plan_code: str | None = None
    billing_interval: str | None = None
    amount_paid: Decimal | None = Field(None, ge=0)
    paid_at: datetime | None = None
    period_starts_at: datetime | None = None
    payment_reference: str | None = None
    notes: str | None = None


class MarkInactiveRequest(BaseModel):
    notes: str | None = None
    effective_at: datetime | None = None


class AddOverrideRequest(BaseModel):
    feature_key: str = Field(..., min_length=1, max_length=100)
    override_mode: str
    value: Any = None
    reason: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
