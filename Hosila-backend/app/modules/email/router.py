"""
Email API Router — Guest email automation endpoints.

Provides:
- GET/PUT email settings (sending mode, branding, auto-send toggles)
- GET email logs (audit trail)
- POST send manual emails (reservation/checkin/checkout)
"""

import json
import re
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.tenant import TenantContext, get_tenant
from app.modules.email.service import email_service
from app.shared.logger import get_logger

router = APIRouter(prefix="/email", tags=["Email"])
logger = get_logger(__name__)

_CONTACT_RATE_LIMIT: dict[str, list[float]] = {}
_CONTACT_WINDOW_SECONDS = 60 * 10
_CONTACT_MAX_REQUESTS = 5
_SUSPICIOUS_INPUT_PATTERN = re.compile(
    r"(<\s*script|</\s*script|<[^>]+>|`{3,}|\b(?:select|insert|update|delete|drop|alter|create)\b\s+\b(?:from|into|table)\b)",
    flags=re.IGNORECASE,
)


# ── Pydantic Models ───────────────────────────────────────────

class EmailSettingsUpdate(BaseModel):
    sending_mode: Optional[str] = None  # 'shared' or 'custom'
    custom_domain: Optional[str] = None
    custom_sender_email: Optional[str] = None
    primary_color: Optional[str] = None
    promo_enabled: Optional[bool] = None
    promo_title: Optional[str] = None
    promo_body: Optional[str] = None
    custom_footer: Optional[str] = None
    send_reservation_email: Optional[bool] = None
    send_checkin_email: Optional[bool] = None
    send_checkout_email: Optional[bool] = None


class EmailSettingsResponse(BaseModel):
    sending_mode: str = "shared"
    custom_domain: Optional[str] = None
    custom_sender_email: Optional[str] = None
    domain_verified: bool = False
    spf_verified: bool = False
    dkim_verified: bool = False
    dmarc_verified: bool = False
    primary_color: str = "#2563EB"
    promo_enabled: bool = False
    promo_title: Optional[str] = None
    promo_body: Optional[str] = None
    custom_footer: Optional[str] = None
    send_reservation_email: bool = True
    send_checkin_email: bool = True
    send_checkout_email: bool = True


class ContactSubmission(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    hotel_name: Optional[str] = Field(default="", max_length=150)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=30)
    rooms_count: Optional[str] = Field(default="", max_length=30)
    message: str = Field(min_length=12, max_length=3000)
    website: Optional[str] = Field(default="", max_length=200)
    started_at: Optional[int] = None


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _allow_contact_request(ip: str) -> bool:
    now = time.time()
    bucket = _CONTACT_RATE_LIMIT.setdefault(ip, [])
    cutoff = now - _CONTACT_WINDOW_SECONDS
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)

    if len(bucket) >= _CONTACT_MAX_REQUESTS:
        return False

    bucket.append(now)
    return True


def _clean_text(value: str) -> str:
    return " ".join(value.strip().split())


def _normalize_contact_submission(data: ContactSubmission) -> dict:
    return {
        "name": _clean_text(data.name),
        "hotel_name": _clean_text(data.hotel_name) if data.hotel_name else "",
        "email": _clean_text(str(data.email)).lower(),
        "phone": _clean_text(data.phone),
        "rooms_count": _clean_text(data.rooms_count) if data.rooms_count else "",
        "message": data.message.strip(),
    }


def _has_suspicious_content(payload: dict) -> bool:
    combined = "\n".join(str(v) for v in payload.values())
    if "{" in combined or "}" in combined:
        return True
    return bool(_SUSPICIOUS_INPUT_PATTERN.search(combined))


# ── Settings Endpoints ────────────────────────────────────────

@router.get("/settings", response_model=EmailSettingsResponse)
async def get_email_settings(
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Get hotel email settings."""
    result = await db.execute(
        text("SELECT * FROM hotel_email_settings WHERE hotel_id = :hid"),
        {"hid": tenant.hotel_id},
    )
    row = result.mappings().first()

    if not row:
        # Return defaults (no settings row yet)
        return EmailSettingsResponse()

    return EmailSettingsResponse(
        sending_mode=row.get("sending_mode", "shared"),
        custom_domain=row.get("custom_domain"),
        custom_sender_email=row.get("custom_sender_email"),
        domain_verified=row.get("domain_verified", False),
        spf_verified=row.get("spf_verified", False),
        dkim_verified=row.get("dkim_verified", False),
        dmarc_verified=row.get("dmarc_verified", False),
        primary_color=row.get("primary_color", "#2563EB"),
        promo_enabled=row.get("promo_enabled", False),
        promo_title=row.get("promo_title"),
        promo_body=row.get("promo_body"),
        custom_footer=row.get("custom_footer"),
        send_reservation_email=row.get("send_reservation_email", True),
        send_checkin_email=row.get("send_checkin_email", True),
        send_checkout_email=row.get("send_checkout_email", True),
    )


@router.put("/settings", response_model=EmailSettingsResponse)
async def update_email_settings(
    data: EmailSettingsUpdate,
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Create or update hotel email settings."""
    # Check if row exists
    result = await db.execute(
        text("SELECT id FROM hotel_email_settings WHERE hotel_id = :hid"),
        {"hid": tenant.hotel_id},
    )
    existing = result.first()

    # Build update dict (only non-None fields)
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    if existing:
        # Update existing
        set_clauses = ", ".join(f"{k} = :{k}" for k in update_fields)
        update_fields["hid"] = tenant.hotel_id
        await db.execute(
            text(f"UPDATE hotel_email_settings SET {set_clauses}, updated_at = NOW() WHERE hotel_id = :hid"),
            update_fields,
        )
    else:
        # Insert new row
        update_fields["hotel_id"] = tenant.hotel_id
        columns = ", ".join(update_fields.keys())
        values = ", ".join(f":{k}" for k in update_fields.keys())
        await db.execute(
            text(f"INSERT INTO hotel_email_settings ({columns}) VALUES ({values})"),
            update_fields,
        )

    await db.commit()

    # Return updated settings
    return await get_email_settings(tenant, db)


# ── Email Logs ────────────────────────────────────────────────

@router.get("/logs")
async def get_email_logs(
    page: int = 1,
    limit: int = 20,
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated email send logs."""
    limit = min(limit, 100)  # Cap to prevent unbounded OFFSET queries
    offset = (page - 1) * limit

    # Get total count
    count_result = await db.execute(
        text("SELECT COUNT(*) FROM guest_email_logs WHERE hotel_id = :hid"),
        {"hid": tenant.hotel_id},
    )
    total = count_result.scalar()

    # Get logs
    result = await db.execute(
        text("""
            SELECT gel.*, g.name AS guest_name
            FROM guest_email_logs gel
            LEFT JOIN guests g ON g.id = gel.guest_id
            WHERE gel.hotel_id = :hid
            ORDER BY gel.sent_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"hid": tenant.hotel_id, "limit": limit, "offset": offset},
    )
    logs = [dict(r) for r in result.mappings().all()]

    return {
        "logs": logs,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total else 0,
    }


# ── Manual Send Endpoints ────────────────────────────────────

# ── Public Contact Endpoint ───────────────────────────────────────

@router.post("/contact")
async def submit_contact_form(
    payload: ContactSubmission,
    request: Request,
):
    """
    Public website contact endpoint.
    Sends a contact notification email to Hosila team inbox via Resend.
    """
    client_ip = _client_ip(request)

    if not _allow_contact_request(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many submissions from this IP. Please try again in a few minutes.",
        )

    if payload.website and payload.website.strip():
        raise HTTPException(status_code=400, detail="Spam detected.")

    if payload.started_at:
        elapsed = int(time.time()) - int(payload.started_at)
        if elapsed < 2:
            raise HTTPException(status_code=400, detail="Submission rejected.")
        if elapsed > 60 * 60 * 24:
            raise HTTPException(status_code=400, detail="Form session expired.")

    normalized = _normalize_contact_submission(payload)

    if _has_suspicious_content(normalized):
        raise HTTPException(
            status_code=422,
            detail="Message contains unsupported code-like input. Please send plain text only.",
        )

    result = await email_service.send_contact_email(normalized)
    if result.get("status") != "sent":
        logger.warning("Contact email send failed ip=%s result=%s", client_ip, result)
        raise HTTPException(
            status_code=502,
            detail="Unable to deliver message right now. Please try again shortly.",
        )

    return {"status": "sent", "message": "Contact request delivered."}


# â”€â”€ Manual Send Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.post("/send/reservation/{reservation_id}")
async def send_reservation_email(
    reservation_id: str,
    background_tasks: BackgroundTasks,
    tenant: TenantContext = Depends(get_tenant),
):
    """Trigger reservation confirmation email (runs in background)."""
    background_tasks.add_task(
        email_service.send_reservation_email,
        tenant.hotel_id,
        reservation_id,
    )
    return {"message": "Reservation email queued", "status": "queued"}


@router.post("/send/checkin/{booking_id}")
async def send_checkin_email(
    booking_id: str,
    background_tasks: BackgroundTasks,
    tenant: TenantContext = Depends(get_tenant),
):
    """Trigger check-in welcome email (runs in background)."""
    background_tasks.add_task(
        email_service.send_checkin_email,
        tenant.hotel_id,
        booking_id,
    )
    return {"message": "Check-in email queued", "status": "queued"}


@router.post("/send/welcome")
async def send_welcome_email(
    background_tasks: BackgroundTasks,
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Send onboarding welcome email to the authenticated user.
    Triggered after onboarding is marked complete.
    """
    # Resolve user email from the auth context
    user_id = tenant.user_id
    result = await db.execute(
        text("SELECT email, raw_user_meta_data->>'name' AS name FROM auth.users WHERE id = :uid"),
        {"uid": user_id},
    )
    row = result.mappings().first()
    if not row or not row.get("email"):
        return {"status": "skipped", "reason": "no_user_email"}

    background_tasks.add_task(
        email_service.send_welcome_email,
        row["email"],
        row.get("name") or "",
    )
    return {"message": "Welcome email queued", "status": "queued"}


@router.post("/send/checkout/{booking_id}")
async def send_checkout_email(
    booking_id: str,
    background_tasks: BackgroundTasks,
    tenant: TenantContext = Depends(get_tenant),
):
    """Trigger check-out receipt email (runs in background)."""
    background_tasks.add_task(
        email_service.send_checkout_email,
        tenant.hotel_id,
        booking_id,
    )
    return {"message": "Check-out email queued", "status": "queued"}
