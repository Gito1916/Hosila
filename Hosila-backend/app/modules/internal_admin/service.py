"""
Service layer for internal admin subscription management.
"""

from __future__ import annotations

import calendar
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.internal_admin.catalog import (
    DEFAULT_TRIAL_DAYS,
    get_plan_catalog,
    get_plan_entitlements,
    get_plan_price,
    normalize_billing_interval,
    normalize_plan_code,
)
from app.modules.internal_admin.schemas import (
    AdminMeResponse,
    HotelDetailResponse,
    HotelHistoryResponse,
    HotelListItem,
    HotelListResponse,
    HotelSubscriptionSummary,
    PlatformAuditEntry,
    PlanCatalogItem,
    SubscriptionLedgerEntry,
    SubscriptionOverrideItem,
)
from app.shared.exceptions import ForbiddenError, NotFoundError, ValidationError


@dataclass
class PlatformAdminContext:
    user_id: str
    email: str | None = None
    full_name: str | None = None


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def safe_plan_code(plan_code: str) -> str:
    try:
        return normalize_plan_code(plan_code)
    except ValueError as exc:
        raise ValidationError(str(exc)) from exc


def safe_billing_interval(billing_interval: str) -> str:
    try:
        return normalize_billing_interval(billing_interval)
    except ValueError as exc:
        raise ValidationError(str(exc)) from exc


def add_billing_period(start: datetime, billing_interval: str) -> datetime:
    interval = safe_billing_interval(billing_interval)
    if interval == "yearly":
        try:
            return start.replace(year=start.year + 1)
        except ValueError:
            return start.replace(month=2, day=28, year=start.year + 1)

    month = start.month + 1
    year = start.year
    if month > 12:
        month = 1
        year += 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return start.replace(year=year, month=month, day=day)


def json_dumps(value: Any) -> str:
    return json.dumps(value, default=str)


def normalize_override_value(override_mode: str, value: Any) -> Any:
    mode = override_mode.strip().lower()
    if mode == "enable":
        return True
    if mode == "disable":
        return False
    return value


def apply_overrides(
    base_entitlements: dict[str, Any],
    overrides: list[dict[str, Any]],
) -> dict[str, Any]:
    effective = dict(base_entitlements)
    for item in overrides:
        mode = item["override_mode"]
        key = item["feature_key"]
        value = item["value"]
        if mode == "enable":
            effective[key] = True
        elif mode == "disable":
            effective[key] = False
        else:
            effective[key] = value
    return effective


async def get_platform_admin_context(
    db: AsyncSession,
    user_id: str,
    email: str | None,
) -> PlatformAdminContext:
    result = await db.execute(
        text(
            """
            SELECT user_id, email, full_name
            FROM platform_admins
            WHERE user_id = :user_id AND is_active = TRUE
            """
        ),
        {"user_id": user_id},
    )
    row = result.mappings().first()
    if not row:
        raise ForbiddenError("This account is not allowed to access internal admin routes")

    return PlatformAdminContext(
        user_id=str(row["user_id"]),
        email=row["email"] or email,
        full_name=row["full_name"],
    )


async def get_admin_me(admin: PlatformAdminContext) -> AdminMeResponse:
    return AdminMeResponse(
        user_id=admin.user_id,
        email=admin.email,
        full_name=admin.full_name,
        plans=[PlanCatalogItem(**item) for item in get_plan_catalog()],
    )


async def list_hotels(
    db: AsyncSession,
    *,
    query: str | None,
    status: str | None,
    plan_code: str | None,
    limit: int = 50,
    offset: int = 0,
) -> HotelListResponse:
    search = query.strip() if query else None
    normalized_status = status.strip().lower() if status else None
    normalized_plan = safe_plan_code(plan_code) if plan_code else None
    like_query = f"%{search}%" if search else None

    total_result = await db.execute(
        text(
            """
            SELECT COUNT(*) AS total
            FROM hotels h
            LEFT JOIN organisations o ON o.id = h.org_id
            LEFT JOIN hotel_subscriptions hs ON hs.hotel_id = h.id
            WHERE (
                CAST(:like_query AS text) IS NULL
                OR h.name ILIKE :like_query
                OR CAST(h.id AS text) ILIKE :like_query
                OR COALESCE(h.hotel_code, '') ILIKE :like_query
                OR COALESCE(o.name, '') ILIKE :like_query
            )
              AND (
                CAST(:status AS text) IS NULL
                OR COALESCE(hs.status, 'inactive') = :status
            )
              AND (
                CAST(:plan_code AS text) IS NULL
                OR COALESCE(hs.plan_code, 'starter') = :plan_code
            )
            """
        ),
        {
            "like_query": like_query,
            "status": normalized_status,
            "plan_code": normalized_plan,
        },
    )
    total = int(total_result.scalar() or 0)

    result = await db.execute(
        text(
            """
            SELECT
                CAST(h.id AS text) AS hotel_id,
                h.name AS hotel_name,
                h.hotel_code,
                CAST(o.id AS text) AS org_id,
                o.name AS org_name,
                hs.plan_code,
                COALESCE(hs.status, 'inactive') AS status,
                hs.billing_interval,
                hs.unit_amount,
                hs.next_due_at,
                hs.trial_ends_at,
                h.created_at
            FROM hotels h
            LEFT JOIN organisations o ON o.id = h.org_id
            LEFT JOIN hotel_subscriptions hs ON hs.hotel_id = h.id
            WHERE (
                CAST(:like_query AS text) IS NULL
                OR h.name ILIKE :like_query
                OR CAST(h.id AS text) ILIKE :like_query
                OR COALESCE(h.hotel_code, '') ILIKE :like_query
                OR COALESCE(o.name, '') ILIKE :like_query
            )
              AND (
                CAST(:status AS text) IS NULL
                OR COALESCE(hs.status, 'inactive') = :status
            )
              AND (
                CAST(:plan_code AS text) IS NULL
                OR COALESCE(hs.plan_code, 'starter') = :plan_code
            )
            ORDER BY COALESCE(hs.updated_at, h.created_at) DESC, h.name ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        {
            "like_query": like_query,
            "status": normalized_status,
            "plan_code": normalized_plan,
            "limit": limit,
            "offset": offset,
        },
    )
    hotels = [HotelListItem(**row) for row in result.mappings().all()]
    return HotelListResponse(hotels=hotels, total=total)


async def fetch_hotel_row(db: AsyncSession, hotel_id: str) -> dict[str, Any]:
    result = await db.execute(
        text(
            """
            SELECT
                h.id AS hotel_id,
                h.name AS hotel_name,
                h.hotel_code,
                h.tenant_id AS owner_user_id,
                h.org_id,
                o.name AS org_name,
                h.created_at
            FROM hotels h
            LEFT JOIN organisations o ON o.id = h.org_id
            WHERE h.id = :hotel_id
            """
        ),
        {"hotel_id": hotel_id},
    )
    row = result.mappings().first()
    if not row:
        raise NotFoundError("Hotel", hotel_id)
    return dict(row)


async def ensure_subscription_row(db: AsyncSession, hotel_id: str) -> dict[str, Any]:
    hotel = await fetch_hotel_row(db, hotel_id)
    result = await db.execute(
        text(
            """
            SELECT
                hs.id AS subscription_id,
                hs.hotel_id,
                hs.org_id,
                hs.plan_code,
                hs.status,
                hs.billing_interval,
                hs.currency,
                hs.unit_amount,
                hs.trial_starts_at,
                hs.trial_ends_at,
                hs.activated_at,
                hs.current_period_starts_at,
                hs.current_period_ends_at,
                hs.next_due_at,
                hs.last_payment_at,
                hs.last_payment_amount,
                hs.feature_entitlements,
                hs.metadata,
                hs.notes
            FROM hotel_subscriptions hs
            WHERE hs.hotel_id = :hotel_id
            """
        ),
        {"hotel_id": hotel_id},
    )
    row = result.mappings().first()
    if row:
        return dict(row)

    entitlements = get_plan_entitlements("starter")
    insert_result = await db.execute(
        text(
            """
            INSERT INTO hotel_subscriptions (
                hotel_id,
                org_id,
                plan_code,
                status,
                billing_interval,
                currency,
                unit_amount,
                feature_entitlements,
                metadata
            )
            VALUES (
                :hotel_id,
                :org_id,
                'starter',
                'inactive',
                'monthly',
                'NGN',
                0,
                CAST(:feature_entitlements AS jsonb),
                CAST('{}' AS jsonb)
            )
            ON CONFLICT (hotel_id) DO NOTHING
            RETURNING id
            """
        ),
        {
            "hotel_id": hotel_id,
            "org_id": hotel["org_id"],
            "feature_entitlements": json_dumps(entitlements),
        },
    )
    if insert_result.scalar_one_or_none():
        await db.commit()

    result = await db.execute(
        text(
            """
            SELECT
                hs.id AS subscription_id,
                hs.hotel_id,
                hs.org_id,
                hs.plan_code,
                hs.status,
                hs.billing_interval,
                hs.currency,
                hs.unit_amount,
                hs.trial_starts_at,
                hs.trial_ends_at,
                hs.activated_at,
                hs.current_period_starts_at,
                hs.current_period_ends_at,
                hs.next_due_at,
                hs.last_payment_at,
                hs.last_payment_amount,
                hs.feature_entitlements,
                hs.metadata,
                hs.notes
            FROM hotel_subscriptions hs
            WHERE hs.hotel_id = :hotel_id
            """
        ),
        {"hotel_id": hotel_id},
    )
    row = result.mappings().first()
    if not row:
        raise NotFoundError("Subscription", hotel_id)
    return dict(row)


async def list_active_overrides(db: AsyncSession, hotel_id: str) -> list[dict[str, Any]]:
    now = now_utc()
    result = await db.execute(
        text(
            """
            SELECT
                CAST(id AS text) AS id,
                feature_key,
                override_mode,
                value,
                reason,
                starts_at,
                ends_at,
                is_active,
                revoked_at,
                CAST(revoked_by AS text) AS revoked_by,
                CAST(created_by AS text) AS created_by,
                created_at,
                updated_at
            FROM subscription_overrides
            WHERE hotel_id = :hotel_id
              AND is_active = TRUE
              AND revoked_at IS NULL
              AND starts_at <= :now
              AND (ends_at IS NULL OR ends_at >= :now)
            ORDER BY created_at DESC
            """
        ),
        {"hotel_id": hotel_id, "now": now},
    )
    return [dict(row) for row in result.mappings().all()]


async def list_all_overrides(db: AsyncSession, hotel_id: str) -> list[dict[str, Any]]:
    result = await db.execute(
        text(
            """
            SELECT
                CAST(id AS text) AS id,
                feature_key,
                override_mode,
                value,
                reason,
                starts_at,
                ends_at,
                is_active,
                revoked_at,
                CAST(revoked_by AS text) AS revoked_by,
                CAST(created_by AS text) AS created_by,
                created_at,
                updated_at
            FROM subscription_overrides
            WHERE hotel_id = :hotel_id
            ORDER BY created_at DESC
            """
        ),
        {"hotel_id": hotel_id},
    )
    return [dict(row) for row in result.mappings().all()]


async def list_ledger_entries(
    db: AsyncSession,
    hotel_id: str,
    *,
    limit: int,
) -> list[dict[str, Any]]:
    result = await db.execute(
        text(
            """
            SELECT
                CAST(id AS text) AS id,
                entry_type,
                plan_code,
                billing_interval,
                amount,
                currency,
                reference,
                period_starts_at,
                period_ends_at,
                due_at,
                effective_at,
                notes,
                metadata,
                CAST(created_by AS text) AS created_by,
                created_at
            FROM subscription_ledger
            WHERE hotel_id = :hotel_id
            ORDER BY created_at DESC
            LIMIT :limit
            """
        ),
        {"hotel_id": hotel_id, "limit": limit},
    )
    return [dict(row) for row in result.mappings().all()]


async def list_audit_entries(
    db: AsyncSession,
    hotel_id: str,
    *,
    limit: int,
) -> list[dict[str, Any]]:
    result = await db.execute(
        text(
            """
            SELECT
                CAST(id AS text) AS id,
                CAST(admin_user_id AS text) AS admin_user_id,
                admin_email,
                CAST(hotel_id AS text) AS hotel_id,
                action,
                entity_type,
                entity_id,
                request_payload,
                result_payload,
                created_at
            FROM platform_audit_logs
            WHERE hotel_id = :hotel_id
            ORDER BY created_at DESC
            LIMIT :limit
            """
        ),
        {"hotel_id": hotel_id, "limit": limit},
    )
    return [dict(row) for row in result.mappings().all()]


async def insert_ledger_entry(
    db: AsyncSession,
    *,
    hotel_id: str,
    subscription_id: str,
    created_by: str,
    entry_type: str,
    plan_code: str | None,
    billing_interval: str | None,
    amount: Decimal | None,
    reference: str | None,
    period_starts_at: datetime | None,
    period_ends_at: datetime | None,
    due_at: datetime | None,
    effective_at: datetime,
    notes: str | None,
    metadata: dict[str, Any],
) -> None:
    await db.execute(
        text(
            """
            INSERT INTO subscription_ledger (
                hotel_id,
                subscription_id,
                entry_type,
                plan_code,
                billing_interval,
                amount,
                currency,
                reference,
                period_starts_at,
                period_ends_at,
                due_at,
                effective_at,
                notes,
                metadata,
                created_by
            )
            VALUES (
                :hotel_id,
                :subscription_id,
                :entry_type,
                :plan_code,
                :billing_interval,
                :amount,
                'NGN',
                :reference,
                :period_starts_at,
                :period_ends_at,
                :due_at,
                :effective_at,
                :notes,
                CAST(:metadata AS jsonb),
                :created_by
            )
            """
        ),
        {
            "hotel_id": hotel_id,
            "subscription_id": subscription_id,
            "entry_type": entry_type,
            "plan_code": plan_code,
            "billing_interval": billing_interval,
            "amount": str(amount) if amount is not None else None,
            "reference": reference,
            "period_starts_at": period_starts_at,
            "period_ends_at": period_ends_at,
            "due_at": due_at,
            "effective_at": effective_at,
            "notes": notes,
            "metadata": json_dumps(metadata),
            "created_by": created_by,
        },
    )


async def insert_platform_audit(
    db: AsyncSession,
    *,
    admin: PlatformAdminContext,
    hotel_id: str | None,
    action: str,
    entity_type: str,
    entity_id: str,
    request_payload: dict[str, Any],
    result_payload: dict[str, Any],
) -> None:
    await db.execute(
        text(
            """
            INSERT INTO platform_audit_logs (
                admin_user_id,
                admin_email,
                hotel_id,
                action,
                entity_type,
                entity_id,
                request_payload,
                result_payload
            )
            VALUES (
                :admin_user_id,
                :admin_email,
                :hotel_id,
                :action,
                :entity_type,
                :entity_id,
                CAST(:request_payload AS jsonb),
                CAST(:result_payload AS jsonb)
            )
            """
        ),
        {
            "admin_user_id": admin.user_id,
            "admin_email": admin.email,
            "hotel_id": hotel_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "request_payload": json_dumps(request_payload),
            "result_payload": json_dumps(result_payload),
        },
    )


async def get_hotel_detail(db: AsyncSession, hotel_id: str) -> HotelDetailResponse:
    subscription = await ensure_subscription_row(db, hotel_id)
    hotel = await fetch_hotel_row(db, hotel_id)
    overrides = await list_active_overrides(db, hotel_id)

    base_entitlements = dict(subscription.get("feature_entitlements") or {})
    if not base_entitlements:
        base_entitlements = get_plan_entitlements(subscription["plan_code"])
    effective_entitlements = apply_overrides(base_entitlements, overrides)

    recent_ledger = await list_ledger_entries(db, hotel_id, limit=25)
    recent_audit = await list_audit_entries(db, hotel_id, limit=25)

    # Compute real-time enforcement state via SQL helpers
    # These functions may not be deployed yet, so fall back gracefully
    try:
        eff_status_result = await db.execute(
            text("SELECT effective_subscription_status(CAST(:hid AS uuid))"),
            {"hid": hotel_id},
        )
        eff_status = eff_status_result.scalar() or "inactive"
    except Exception:
        await db.rollback()
        eff_status = subscription.get("status", "inactive")

    try:
        write_mode_result = await db.execute(
            text("SELECT subscription_write_mode(CAST(:hid AS uuid))"),
            {"hid": hotel_id},
        )
        write_mode = write_mode_result.scalar() or "blocked"
    except Exception:
        await db.rollback()
        write_mode = "normal" if eff_status in ("active", "trialing") else "blocked"

    # Usage metrics
    rooms_used_result = await db.execute(
        text("SELECT count(*) FROM rooms WHERE hotel_id = CAST(:hid AS uuid)"),
        {"hid": hotel_id},
    )
    rooms_used = rooms_used_result.scalar() or 0

    active_bookings_result = await db.execute(
        text("SELECT count(*) FROM bookings WHERE hotel_id = CAST(:hid AS uuid) AND status = 'active'"),
        {"hid": hotel_id},
    )
    active_bookings = active_bookings_result.scalar() or 0

    rooms_limit = base_entitlements.get("rooms_limit")

    return HotelDetailResponse(
        hotel_id=str(hotel["hotel_id"]),
        hotel_name=hotel["hotel_name"],
        hotel_code=hotel["hotel_code"],
        org_id=str(hotel["org_id"]) if hotel["org_id"] else None,
        org_name=hotel["org_name"],
        owner_user_id=str(hotel["owner_user_id"]) if hotel["owner_user_id"] else None,
        created_at=hotel["created_at"],
        subscription=HotelSubscriptionSummary(
            subscription_id=str(subscription["subscription_id"]),
            plan_code=subscription["plan_code"],
            status=subscription["status"],
            effective_status=eff_status,
            write_mode=write_mode,
            billing_interval=subscription["billing_interval"],
            currency=subscription["currency"],
            unit_amount=subscription["unit_amount"],
            trial_starts_at=subscription["trial_starts_at"],
            trial_ends_at=subscription["trial_ends_at"],
            activated_at=subscription["activated_at"],
            current_period_starts_at=subscription["current_period_starts_at"],
            current_period_ends_at=subscription["current_period_ends_at"],
            next_due_at=subscription["next_due_at"],
            last_payment_at=subscription["last_payment_at"],
            last_payment_amount=subscription["last_payment_amount"],
            feature_entitlements=base_entitlements,
            effective_entitlements=effective_entitlements,
            metadata=subscription.get("metadata") or {},
            notes=subscription.get("notes"),
            rooms_used=rooms_used,
            rooms_limit=rooms_limit,
            active_bookings=active_bookings,
        ),
        overrides=[SubscriptionOverrideItem(**row) for row in overrides],
        recent_ledger_entries=[SubscriptionLedgerEntry(**row) for row in recent_ledger],
        recent_audit_entries=[PlatformAuditEntry(**row) for row in recent_audit],
    )


async def get_hotel_history(db: AsyncSession, hotel_id: str) -> HotelHistoryResponse:
    await ensure_subscription_row(db, hotel_id)
    ledger = await list_ledger_entries(db, hotel_id, limit=200)
    audit_logs = await list_audit_entries(db, hotel_id, limit=200)
    overrides = await list_all_overrides(db, hotel_id)
    return HotelHistoryResponse(
        hotel_id=hotel_id,
        subscription_ledger=[SubscriptionLedgerEntry(**row) for row in ledger],
        platform_audit_logs=[PlatformAuditEntry(**row) for row in audit_logs],
        overrides=[SubscriptionOverrideItem(**row) for row in overrides],
    )


async def start_trial(
    db: AsyncSession,
    hotel_id: str,
    admin: PlatformAdminContext,
    payload: dict[str, Any],
) -> HotelDetailResponse:
    plan_code = safe_plan_code(payload["plan_code"])
    billing_interval = safe_billing_interval(payload.get("billing_interval", "monthly"))
    trial_days = int(payload.get("trial_days") or DEFAULT_TRIAL_DAYS)
    starts_at = payload.get("starts_at") or now_utc()
    trial_ends_at = starts_at + timedelta(days=trial_days)
    subscription = await ensure_subscription_row(db, hotel_id)
    hotel = await fetch_hotel_row(db, hotel_id)
    entitlements = get_plan_entitlements(plan_code)
    unit_amount = get_plan_price(plan_code, billing_interval)

    await db.execute(
        text(
            """
            UPDATE hotel_subscriptions
            SET
                org_id = :org_id,
                plan_code = :plan_code,
                status = 'trialing',
                billing_interval = :billing_interval,
                unit_amount = :unit_amount,
                trial_starts_at = :starts_at,
                trial_ends_at = :trial_ends_at,
                activated_at = NULL,
                current_period_starts_at = :starts_at,
                current_period_ends_at = :trial_ends_at,
                next_due_at = :trial_ends_at,
                feature_entitlements = CAST(:feature_entitlements AS jsonb),
                notes = :notes
            WHERE id = :subscription_id
            """
        ),
        {
            "org_id": hotel["org_id"],
            "plan_code": plan_code,
            "billing_interval": billing_interval,
            "unit_amount": str(unit_amount),
            "starts_at": starts_at,
            "trial_ends_at": trial_ends_at,
            "feature_entitlements": json_dumps(entitlements),
            "notes": payload.get("notes"),
            "subscription_id": subscription["subscription_id"],
        },
    )

    await insert_ledger_entry(
        db,
        hotel_id=hotel_id,
        subscription_id=str(subscription["subscription_id"]),
        created_by=admin.user_id,
        entry_type="trial_started",
        plan_code=plan_code,
        billing_interval=billing_interval,
        amount=Decimal("0.00"),
        reference=None,
        period_starts_at=starts_at,
        period_ends_at=trial_ends_at,
        due_at=trial_ends_at,
        effective_at=starts_at,
        notes=payload.get("notes"),
        metadata={"trial_days": trial_days},
    )
    await insert_platform_audit(
        db,
        admin=admin,
        hotel_id=hotel_id,
        action="subscription_trial_started",
        entity_type="hotel_subscription",
        entity_id=str(subscription["subscription_id"]),
        request_payload=payload,
        result_payload={
            "plan_code": plan_code,
            "billing_interval": billing_interval,
            "trial_ends_at": trial_ends_at.isoformat(),
        },
    )
    await db.commit()
    return await get_hotel_detail(db, hotel_id)


async def activate_plan(
    db: AsyncSession,
    hotel_id: str,
    admin: PlatformAdminContext,
    payload: dict[str, Any],
) -> HotelDetailResponse:
    plan_code = safe_plan_code(payload["plan_code"])
    billing_interval = safe_billing_interval(payload.get("billing_interval", "monthly"))
    effective_at = payload.get("effective_at") or now_utc()
    paid_at = payload.get("paid_at") or effective_at
    period_ends_at = add_billing_period(effective_at, billing_interval)
    catalog_amount = get_plan_price(plan_code, billing_interval)
    amount_paid = payload.get("amount_paid") or catalog_amount

    subscription = await ensure_subscription_row(db, hotel_id)
    hotel = await fetch_hotel_row(db, hotel_id)
    entitlements = get_plan_entitlements(plan_code)
    reference = payload.get("payment_reference")
    note = payload.get("notes")

    await db.execute(
        text(
            """
            UPDATE hotel_subscriptions
            SET
                org_id = :org_id,
                plan_code = :plan_code,
                status = 'active',
                billing_interval = :billing_interval,
                unit_amount = :unit_amount,
                activated_at = COALESCE(activated_at, :effective_at),
                current_period_starts_at = :effective_at,
                current_period_ends_at = :period_ends_at,
                next_due_at = :period_ends_at,
                last_payment_at = :paid_at,
                last_payment_amount = :amount_paid,
                feature_entitlements = CAST(:feature_entitlements AS jsonb),
                notes = :notes
            WHERE id = :subscription_id
            """
        ),
        {
            "org_id": hotel["org_id"],
            "plan_code": plan_code,
            "billing_interval": billing_interval,
            "unit_amount": str(catalog_amount),
            "effective_at": effective_at,
            "period_ends_at": period_ends_at,
            "paid_at": paid_at,
            "amount_paid": str(amount_paid),
            "feature_entitlements": json_dumps(entitlements),
            "notes": note,
            "subscription_id": subscription["subscription_id"],
        },
    )

    await insert_ledger_entry(
        db,
        hotel_id=hotel_id,
        subscription_id=str(subscription["subscription_id"]),
        created_by=admin.user_id,
        entry_type="payment_recorded",
        plan_code=plan_code,
        billing_interval=billing_interval,
        amount=amount_paid,
        reference=reference,
        period_starts_at=effective_at,
        period_ends_at=period_ends_at,
        due_at=period_ends_at,
        effective_at=paid_at,
        notes=note,
        metadata={"catalog_amount": str(catalog_amount)},
    )
    await insert_ledger_entry(
        db,
        hotel_id=hotel_id,
        subscription_id=str(subscription["subscription_id"]),
        created_by=admin.user_id,
        entry_type="plan_activated",
        plan_code=plan_code,
        billing_interval=billing_interval,
        amount=catalog_amount,
        reference=reference,
        period_starts_at=effective_at,
        period_ends_at=period_ends_at,
        due_at=period_ends_at,
        effective_at=effective_at,
        notes=note,
        metadata={"amount_paid": str(amount_paid)},
    )
    await insert_platform_audit(
        db,
        admin=admin,
        hotel_id=hotel_id,
        action="subscription_plan_activated",
        entity_type="hotel_subscription",
        entity_id=str(subscription["subscription_id"]),
        request_payload=payload,
        result_payload={
            "plan_code": plan_code,
            "billing_interval": billing_interval,
            "amount_paid": str(amount_paid),
            "next_due_at": period_ends_at.isoformat(),
        },
    )
    await db.commit()
    return await get_hotel_detail(db, hotel_id)


async def renew_plan(
    db: AsyncSession,
    hotel_id: str,
    admin: PlatformAdminContext,
    payload: dict[str, Any],
) -> HotelDetailResponse:
    subscription = await ensure_subscription_row(db, hotel_id)
    plan_code = safe_plan_code(payload.get("plan_code") or subscription["plan_code"])
    billing_interval = safe_billing_interval(
        payload.get("billing_interval") or subscription["billing_interval"]
    )
    period_starts_at = (
        payload.get("period_starts_at")
        or subscription.get("current_period_ends_at")
        or now_utc()
    )
    paid_at = payload.get("paid_at") or now_utc()
    period_ends_at = add_billing_period(period_starts_at, billing_interval)
    catalog_amount = get_plan_price(plan_code, billing_interval)
    amount_paid = payload.get("amount_paid") or catalog_amount
    entitlements = get_plan_entitlements(plan_code)
    hotel = await fetch_hotel_row(db, hotel_id)
    reference = payload.get("payment_reference")
    note = payload.get("notes")

    await db.execute(
        text(
            """
            UPDATE hotel_subscriptions
            SET
                org_id = :org_id,
                plan_code = :plan_code,
                status = 'active',
                billing_interval = :billing_interval,
                unit_amount = :unit_amount,
                current_period_starts_at = :period_starts_at,
                current_period_ends_at = :period_ends_at,
                next_due_at = :period_ends_at,
                last_payment_at = :paid_at,
                last_payment_amount = :amount_paid,
                feature_entitlements = CAST(:feature_entitlements AS jsonb),
                notes = :notes
            WHERE id = :subscription_id
            """
        ),
        {
            "org_id": hotel["org_id"],
            "plan_code": plan_code,
            "billing_interval": billing_interval,
            "unit_amount": str(catalog_amount),
            "period_starts_at": period_starts_at,
            "period_ends_at": period_ends_at,
            "paid_at": paid_at,
            "amount_paid": str(amount_paid),
            "feature_entitlements": json_dumps(entitlements),
            "notes": note,
            "subscription_id": subscription["subscription_id"],
        },
    )

    await insert_ledger_entry(
        db,
        hotel_id=hotel_id,
        subscription_id=str(subscription["subscription_id"]),
        created_by=admin.user_id,
        entry_type="payment_recorded",
        plan_code=plan_code,
        billing_interval=billing_interval,
        amount=amount_paid,
        reference=reference,
        period_starts_at=period_starts_at,
        period_ends_at=period_ends_at,
        due_at=period_ends_at,
        effective_at=paid_at,
        notes=note,
        metadata={"catalog_amount": str(catalog_amount)},
    )
    await insert_ledger_entry(
        db,
        hotel_id=hotel_id,
        subscription_id=str(subscription["subscription_id"]),
        created_by=admin.user_id,
        entry_type="plan_renewed",
        plan_code=plan_code,
        billing_interval=billing_interval,
        amount=catalog_amount,
        reference=reference,
        period_starts_at=period_starts_at,
        period_ends_at=period_ends_at,
        due_at=period_ends_at,
        effective_at=period_starts_at,
        notes=note,
        metadata={"amount_paid": str(amount_paid)},
    )
    await insert_platform_audit(
        db,
        admin=admin,
        hotel_id=hotel_id,
        action="subscription_plan_renewed",
        entity_type="hotel_subscription",
        entity_id=str(subscription["subscription_id"]),
        request_payload=payload,
        result_payload={
            "plan_code": plan_code,
            "billing_interval": billing_interval,
            "amount_paid": str(amount_paid),
            "next_due_at": period_ends_at.isoformat(),
        },
    )
    await db.commit()
    return await get_hotel_detail(db, hotel_id)


async def mark_inactive(
    db: AsyncSession,
    hotel_id: str,
    admin: PlatformAdminContext,
    payload: dict[str, Any],
) -> HotelDetailResponse:
    subscription = await ensure_subscription_row(db, hotel_id)
    effective_at = payload.get("effective_at") or now_utc()

    await db.execute(
        text(
            """
            UPDATE hotel_subscriptions
            SET
                status = 'inactive',
                next_due_at = NULL,
                notes = :notes
            WHERE id = :subscription_id
            """
        ),
        {
            "notes": payload.get("notes"),
            "subscription_id": subscription["subscription_id"],
        },
    )
    await insert_ledger_entry(
        db,
        hotel_id=hotel_id,
        subscription_id=str(subscription["subscription_id"]),
        created_by=admin.user_id,
        entry_type="status_changed",
        plan_code=subscription["plan_code"],
        billing_interval=subscription["billing_interval"],
        amount=None,
        reference=None,
        period_starts_at=subscription.get("current_period_starts_at"),
        period_ends_at=subscription.get("current_period_ends_at"),
        due_at=None,
        effective_at=effective_at,
        notes=payload.get("notes"),
        metadata={"new_status": "inactive"},
    )
    await insert_platform_audit(
        db,
        admin=admin,
        hotel_id=hotel_id,
        action="subscription_marked_inactive",
        entity_type="hotel_subscription",
        entity_id=str(subscription["subscription_id"]),
        request_payload=payload,
        result_payload={"new_status": "inactive"},
    )
    await db.commit()
    return await get_hotel_detail(db, hotel_id)


async def add_override(
    db: AsyncSession,
    hotel_id: str,
    admin: PlatformAdminContext,
    payload: dict[str, Any],
) -> HotelDetailResponse:
    subscription = await ensure_subscription_row(db, hotel_id)
    starts_at = payload.get("starts_at") or now_utc()
    ends_at = payload.get("ends_at")
    if ends_at and ends_at <= starts_at:
        raise ValidationError("Override end date must be after the start date")

    override_mode = payload["override_mode"].strip().lower()
    if override_mode not in {"enable", "disable", "limit", "set"}:
        raise ValidationError("override_mode must be one of enable, disable, limit, or set")

    feature_key = payload["feature_key"].strip()
    value = normalize_override_value(override_mode, payload.get("value"))

    result = await db.execute(
        text(
            """
            INSERT INTO subscription_overrides (
                hotel_id,
                subscription_id,
                feature_key,
                override_mode,
                value,
                reason,
                starts_at,
                ends_at,
                is_active,
                created_by
            )
            VALUES (
                :hotel_id,
                :subscription_id,
                :feature_key,
                :override_mode,
                CAST(:value AS jsonb),
                :reason,
                :starts_at,
                :ends_at,
                TRUE,
                :created_by
            )
            RETURNING id
            """
        ),
        {
            "hotel_id": hotel_id,
            "subscription_id": subscription["subscription_id"],
            "feature_key": feature_key,
            "override_mode": override_mode,
            "value": json_dumps(value),
            "reason": payload.get("reason"),
            "starts_at": starts_at,
            "ends_at": ends_at,
            "created_by": admin.user_id,
        },
    )
    override_id = str(result.scalar_one())

    await insert_ledger_entry(
        db,
        hotel_id=hotel_id,
        subscription_id=str(subscription["subscription_id"]),
        created_by=admin.user_id,
        entry_type="override_added",
        plan_code=subscription["plan_code"],
        billing_interval=subscription["billing_interval"],
        amount=None,
        reference=override_id,
        period_starts_at=starts_at,
        period_ends_at=ends_at,
        due_at=None,
        effective_at=starts_at,
        notes=payload.get("reason"),
        metadata={
            "feature_key": feature_key,
            "override_mode": override_mode,
            "value": value,
        },
    )
    await insert_platform_audit(
        db,
        admin=admin,
        hotel_id=hotel_id,
        action="subscription_override_added",
        entity_type="subscription_override",
        entity_id=override_id,
        request_payload=payload,
        result_payload={"override_id": override_id},
    )
    await db.commit()
    return await get_hotel_detail(db, hotel_id)
