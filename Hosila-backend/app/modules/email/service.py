"""
Email Service — Automated Guest Communication System

Handles rendering HTML email templates and sending via Resend.
Supports dual sending mode:
  - "shared": Send from notifications@hosila.app with Reply-To hotel email
  - "custom": Send from hotel's verified domain
"""

import os
import html
from datetime import datetime
from typing import Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import text

from app.config import settings
from app.database import async_session_factory
from app.shared.logger import get_logger

logger = get_logger(__name__)

# ── Template Engine ───────────────────────────────────────────
_template_dir = os.path.join(os.path.dirname(__file__), "templates")
_jinja_env = Environment(
    loader=FileSystemLoader(_template_dir),
    autoescape=select_autoescape(["html"]),
)


def _render_template(template_name: str, context: dict) -> str:
    """Render a Jinja2 template with the given context."""
    template = _jinja_env.get_template(template_name)
    return template.render(**context)


def _format_currency(amount: float) -> str:
    """Format amount as currency string (NGN default)."""
    return f"₦{amount:,.2f}"


# ── Core Email Service ────────────────────────────────────────

class EmailService:
    """
    Orchestrates guest email automation:
    1. Fetches context data (hotel, guest, booking/reservation)
    2. Checks settings (auto-send enabled? guest has email?)
    3. Renders HTML template
    4. Sends via Resend
    5. Logs result to guest_email_logs
    """

    async def _get_email_settings(self, hotel_id: str) -> dict:
        """Get hotel email settings, returning defaults if none exist."""
        async with async_session_factory() as session:
            result = await session.execute(
                text("SELECT * FROM hotel_email_settings WHERE hotel_id = :hid"),
                {"hid": hotel_id},
            )
            row = result.mappings().first()
            if row:
                return dict(row)

        # Return defaults
        return {
            "sending_mode": "shared",
            "custom_domain": None,
            "custom_sender_email": None,
            "domain_verified": False,
            "primary_color": "#2563EB",
            "promo_enabled": False,
            "promo_title": None,
            "promo_body": None,
            "custom_footer": None,
            "send_reservation_email": True,
            "send_checkin_email": True,
            "send_checkout_email": True,
        }

    async def _get_hotel_info(self, hotel_id: str) -> dict:
        """Fetch hotel details for email template."""
        async with async_session_factory() as session:
            result = await session.execute(
                text("SELECT name, logo_url, address, phone, email, settings FROM hotels WHERE id = :hid"),
                {"hid": hotel_id},
            )
            row = result.mappings().first()
            if row:
                return dict(row)
            return {}

    def _resolve_sender(self, email_settings: dict, hotel_info: dict) -> dict:
        """
        Dynamically resolve the from/reply-to based on sending mode.
        - shared: from Hosila domain, reply-to hotel email
        - custom: from hotel's verified domain
        """
        hotel_email = hotel_info.get("email") or ""

        if (
            email_settings.get("sending_mode") == "custom"
            and email_settings.get("domain_verified")
            and email_settings.get("custom_sender_email")
        ):
            return {
                "from_email": f"{hotel_info.get('name', 'Hotel')} <{email_settings['custom_sender_email']}>",
                "reply_to": email_settings["custom_sender_email"],
            }

        # Shared mode (default)
        hotel_name = hotel_info.get("name", "Hotel")
        return {
            "from_email": f"{hotel_name} via Hosila <{settings.email_from_address}>",
            "reply_to": hotel_email or settings.email_from_address,
        }

    def _build_base_context(self, hotel_info: dict, email_settings: dict) -> dict:
        """Build the shared context for the base email template."""
        return {
            "hotel_name": hotel_info.get("name", "Hotel"),
            "hotel_logo_url": hotel_info.get("logo_url"),
            "hotel_address": hotel_info.get("address"),
            "hotel_phone": hotel_info.get("phone"),
            "hotel_email": hotel_info.get("email"),
            "primary_color": email_settings.get("primary_color", "#2563EB"),
            "promo_enabled": email_settings.get("promo_enabled", False),
            "promo_title": email_settings.get("promo_title"),
            "promo_body": email_settings.get("promo_body"),
            "custom_footer": email_settings.get("custom_footer"),
            "hosila_logo_url": settings.hosila_logo_url,
            "currency": "₦",
        }

    async def _send_via_resend(self, to: str, subject: str, html: str, sender: dict) -> dict:
        """Send email using Resend API. Returns provider response."""
        if not settings.resend_api_key:
            logger.warning("RESEND_API_KEY not set — email not sent (dev mode)")
            return {"status": "skipped", "reason": "no_api_key"}

        try:
            import resend
            resend.api_key = settings.resend_api_key

            params = {
                "from": sender["from_email"],
                "to": [to],
                "subject": subject,
                "html": html,
            }
            if sender.get("reply_to"):
                params["reply_to"] = sender["reply_to"]

            response = resend.Emails.send(params)
            return {"status": "sent", "id": getattr(response, "id", str(response))}

        except Exception as e:
            logger.error("Resend send error: %s", e, exc_info=True)
            return {"status": "failed", "error": str(e)}

    async def send_contact_email(self, payload: dict) -> dict:
        """
        Send contact-form submissions to Hosila team inbox.
        Uses explicit contact sender identity on mail.hosila.com with reply-to
        set to the email entered by the submitter.
        """
        subject = f"[Website Contact] {payload['name']}"
        body_lines = [
            ("Name", payload["name"]),
        ]
        if payload.get("hotel_name"):
            body_lines.append(("Hotel", payload["hotel_name"]))
        body_lines.append(("Email", payload["email"]))
        body_lines.append(("Phone", payload["phone"]))
        if payload.get("rooms_count"):
            body_lines.append(("Rooms", payload["rooms_count"]))
        body_lines.append(("Submitted At", datetime.utcnow().isoformat() + "Z"))
        body_html = "".join(
            f"<p><strong>{html.escape(key)}:</strong> {html.escape(value)}</p>"
            for key, value in body_lines
        )
        message_html = f"""
            <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827;">
              <h2 style="margin:0 0 12px;">New Website Contact Submission</h2>
              {body_html}
              <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
              <p style="margin:0 0 6px;"><strong>Message</strong></p>
              <pre style="white-space:pre-wrap;font-family:inherit;background:#f9fafb;padding:12px;border-radius:8px;border:1px solid #e5e7eb;">{html.escape(payload["message"])}</pre>
            </div>
        """

        sender = {
            "from_email": f"Hosila Contact <{settings.contact_sender_email}>",
            "reply_to": payload["email"],
        }
        result = await self._send_via_resend(
            settings.contact_inbox_email, subject, message_html, sender
        )
        logger.info(
            "Contact email dispatch status=%s inbox=%s",
            result.get("status"),
            settings.contact_inbox_email,
        )
        return result

    async def send_new_hotel_notification(
        self,
        hotel_name: str,
        hotel_email: str = "",
        hotel_phone: str = "",
        hotel_address: str = "",
    ) -> dict:
        """
        Notify hosilateam@gmail.com when a new hotel completes registration.
        """
        subject = f"[New Hotel Registration] {hotel_name}"
        body_lines = [("Hotel Name", hotel_name)]
        if hotel_email:
            body_lines.append(("Email", hotel_email))
        if hotel_phone:
            body_lines.append(("Phone", hotel_phone))
        if hotel_address:
            body_lines.append(("Address", hotel_address))
        body_lines.append(("Registered At", datetime.utcnow().isoformat() + "Z"))

        body_html = "".join(
            f"<p><strong>{html.escape(k)}:</strong> {html.escape(v)}</p>"
            for k, v in body_lines
        )
        message_html = f"""
            <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827;">
              <h2 style="margin:0 0 12px;">🏨 New Hotel Registration</h2>
              {body_html}
              <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
              <p style="font-size:13px;color:#6b7280;">
                A new hotel just completed onboarding on Hosila.
                Reach out to offer assistance and ensure they get started smoothly.
              </p>
            </div>
        """
        sender = {
            "from_email": f"Hosila System <{settings.contact_sender_email}>",
        }
        result = await self._send_via_resend(
            "hosilateam@gmail.com", subject, message_html, sender
        )
        logger.info("New hotel notification sent for hotel=%s status=%s", hotel_name, result.get("status"))
        return result

    async def _log_email(
        self,
        hotel_id: str,
        guest_id: Optional[str],
        booking_id: Optional[str],
        reservation_id: Optional[str],
        email_type: str,
        recipient_email: str,
        subject: str,
        status: str,
        provider_response: dict,
        error_message: Optional[str] = None,
    ):
        """Log email send attempt to guest_email_logs."""
        import json

        async with async_session_factory() as session:
            await session.execute(
                text("""
                    INSERT INTO guest_email_logs
                    (hotel_id, guest_id, booking_id, reservation_id, email_type,
                     recipient_email, subject, status, provider_response, error_message)
                    VALUES (:hotel_id, :guest_id, :booking_id, :reservation_id, :email_type,
                            :recipient_email, :subject, :status, :provider_response::jsonb, :error_message)
                """),
                {
                    "hotel_id": hotel_id,
                    "guest_id": guest_id,
                    "booking_id": booking_id,
                    "reservation_id": reservation_id,
                    "email_type": email_type,
                    "recipient_email": recipient_email,
                    "subject": subject,
                    "status": status,
                    "provider_response": json.dumps(provider_response),
                    "error_message": error_message,
                },
            )
            await session.commit()

    # ── Public Methods ────────────────────────────────────────

    async def send_reservation_email(self, hotel_id: str, reservation_id: str) -> dict:
        """Send reservation confirmation email to guest."""
        email_settings = await self._get_email_settings(hotel_id)

        if not email_settings.get("send_reservation_email", True):
            return {"status": "skipped", "reason": "auto_send_disabled"}

        hotel_info = await self._get_hotel_info(hotel_id)

        # Fetch reservation + guest + room data
        async with async_session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT r.*, g.name AS guest_name, g.email AS guest_email,
                           rm.room_number, rm.room_type
                    FROM reservations r
                    JOIN guests g ON g.id = r.guest_id
                    LEFT JOIN rooms rm ON rm.id = r.room_id
                    WHERE r.id = :rid AND r.hotel_id = :hid
                """),
                {"rid": reservation_id, "hid": hotel_id},
            )
            row = result.mappings().first()

        if not row:
            return {"status": "failed", "reason": "reservation_not_found"}

        guest_email = row.get("guest_email")
        if not guest_email:
            await self._log_email(
                hotel_id, str(row.get("guest_id")), None, reservation_id,
                "reservation_confirmation", "", "N/A", "skipped", {},
                "Guest has no email address",
            )
            return {"status": "skipped", "reason": "no_guest_email"}

        # Render content
        base_amount = float(row.get("total_amount") or 0)
        deposit_paid = float(row.get("deposit_paid") or 0)
        checkin_date = row.get("check_in_date")
        checkout_date = row.get("check_out_date")

        # Compute tax-inclusive total using the tax engine so the email
        # shows the actual amount the guest will be charged at check-in
        total_amount = base_amount
        try:
            from app.modules.tax_engine.service import calculate_tax_breakdown
            from app.modules.tax_engine.schemas import TaxCalculationRequest
            from decimal import Decimal
            async with async_session_factory() as tax_session:
                tax_request = TaxCalculationRequest(
                    base_amount=Decimal(str(base_amount)),
                    department="accommodation",
                )
                breakdown = await calculate_tax_breakdown(tax_session, hotel_id, tax_request)
                total_amount = float(breakdown.total)
        except Exception as e:
            logger.warning("Tax calc failed for reservation email, using base amount: %s", e)

        content_context = {
            "guest_name": row["guest_name"],
            "checkin_date": checkin_date.strftime("%B %d, %Y") if checkin_date else "TBD",
            "checkout_date": checkout_date.strftime("%B %d, %Y") if checkout_date else "TBD",
            "room_type": row.get("room_type") or "TBD",
            "nights": int(row.get("nights") or 1),
            "total_amount": total_amount,
            "deposit_paid": deposit_paid,
            "balance_due": total_amount - deposit_paid,
            "currency": "₦",
            "primary_color": email_settings.get("primary_color", "#2563EB"),
        }
        dynamic_content = _render_template("reservation_content.html", content_context)

        # Build full email
        hotel_name = hotel_info.get("name", "Hotel")
        subject = f"Your Reservation at {hotel_name} is Confirmed ✅"
        base_context = self._build_base_context(hotel_info, email_settings)
        base_context.update({
            "subject": subject,
            "email_title": "Reservation Confirmed!",
            "email_subtitle": f"Hi {row['guest_name']}, your reservation has been confirmed. We look forward to welcoming you!",
            "dynamic_content": dynamic_content,
            "cta_link": None,
            "cta_text": None,
        })
        html = _render_template("base_email.html", base_context)

        # Send
        sender = self._resolve_sender(email_settings, hotel_info)
        result = await self._send_via_resend(guest_email, subject, html, sender)

        # Log
        status = result.get("status", "failed")
        await self._log_email(
            hotel_id, str(row.get("guest_id")), None, reservation_id,
            "reservation_confirmation", guest_email, subject, status, result,
            result.get("error"),
        )

        return result

    async def send_checkin_email(self, hotel_id: str, booking_id: str) -> dict:
        """Send check-in welcome email to guest."""
        email_settings = await self._get_email_settings(hotel_id)

        if not email_settings.get("send_checkin_email", True):
            return {"status": "skipped", "reason": "auto_send_disabled"}

        hotel_info = await self._get_hotel_info(hotel_id)

        # Fetch booking + guest + room data
        async with async_session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT b.*, g.name AS guest_name, g.email AS guest_email,
                           rm.room_number, rm.room_type
                    FROM bookings b
                    JOIN guests g ON g.id = b.guest_id
                    JOIN rooms rm ON rm.id = b.room_id
                    WHERE b.id = :bid AND b.hotel_id = :hid
                """),
                {"bid": booking_id, "hid": hotel_id},
            )
            row = result.mappings().first()

        if not row:
            return {"status": "failed", "reason": "booking_not_found"}

        guest_email = row.get("guest_email")
        if not guest_email:
            await self._log_email(
                hotel_id, str(row.get("guest_id")), booking_id, None,
                "checkin_welcome", "", "N/A", "skipped", {},
                "Guest has no email address",
            )
            return {"status": "skipped", "reason": "no_guest_email"}

        # Prepare template context
        checkin_time = row.get("check_in_time")
        checkout_time = row.get("check_out_time") or row.get("planned_checkout")
        booking_type = row.get("booking_type", "night")

        stay_type = "Night Stay" if booking_type == "night" else "Short Rest"
        if booking_type == "short_rest" and row.get("duration_hours"):
            stay_type = f"Short Rest ({int(row['duration_hours'])}hr)"

        hotel_settings_json = hotel_info.get("settings") or {}
        wifi_name = hotel_settings_json.get("wifi_name")
        wifi_password = hotel_settings_json.get("wifi_password")

        # Parse custom_footer into checkin_info_items
        custom_footer = email_settings.get("custom_footer") or ""
        checkin_info_items = []
        if custom_footer.strip():
            for line in custom_footer.strip().splitlines():
                line = line.strip()
                if not line:
                    continue
                # Try to split on first ':'  →  "🛎️ Front Desk: Dial 0"
                if ":" in line:
                    label_part, _, value_part = line.partition(":")
                    # Extract emoji icon from start of label if present
                    label_part = label_part.strip()
                    value_part = value_part.strip()
                    # Check for leading emoji
                    icon = ""
                    if label_part and not label_part[0].isalnum():
                        # First char(s) is emoji/symbol
                        icon = label_part[0]
                        label_part = label_part[1:].strip()
                    checkin_info_items.append({
                        "icon": icon,
                        "label": label_part,
                        "value": value_part,
                    })
                else:
                    # No colon — treat entire line as label
                    checkin_info_items.append({
                        "icon": "",
                        "label": line,
                        "value": "",
                    })

        content_context = {
            "guest_name": row["guest_name"],
            "room_number": row.get("room_number", "N/A"),
            "room_type": row.get("room_type", "Standard"),
            "checkin_time": checkin_time.strftime("%b %d, %Y %I:%M %p") if checkin_time else "Today",
            "checkout_time": checkout_time.strftime("%b %d, %Y %I:%M %p") if checkout_time else "TBD",
            "stay_type": stay_type,
            "num_guests": row.get("num_guests", 1),
            "wifi_name": wifi_name,
            "wifi_password": wifi_password,
            "primary_color": email_settings.get("primary_color", "#2563EB"),
            "checkin_info_items": checkin_info_items if checkin_info_items else None,
        }
        dynamic_content = _render_template("checkin_content.html", content_context)

        # Build full email
        hotel_name = hotel_info.get("name", "Hotel")
        subject = f"Welcome to {hotel_name}! 🛎️"
        base_context = self._build_base_context(hotel_info, email_settings)
        # Don't show custom_footer in the base email footer — it's already
        # rendered as checkin_info_items inside the check-in content body
        base_context["custom_footer"] = None
        base_context.update({
            "subject": subject,
            "email_title": f"Welcome, {row['guest_name']}!",
            "email_subtitle": f"We're excited to have you at {hotel_name}. Your room is ready!",
            "dynamic_content": dynamic_content,
            "cta_link": None,
            "cta_text": None,
        })
        html = _render_template("base_email.html", base_context)

        # Send
        sender = self._resolve_sender(email_settings, hotel_info)
        result = await self._send_via_resend(guest_email, subject, html, sender)

        # Log
        status = result.get("status", "failed")
        await self._log_email(
            hotel_id, str(row.get("guest_id")), booking_id, None,
            "checkin_welcome", guest_email, subject, status, result,
            result.get("error"),
        )

        return result

    async def send_checkout_email(self, hotel_id: str, booking_id: str) -> dict:
        """Send check-out receipt email with itemized charges."""
        email_settings = await self._get_email_settings(hotel_id)

        if not email_settings.get("send_checkout_email", True):
            return {"status": "skipped", "reason": "auto_send_disabled"}

        hotel_info = await self._get_hotel_info(hotel_id)

        # Fetch booking + guest + room
        async with async_session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT b.*, g.name AS guest_name, g.email AS guest_email,
                           rm.room_number, rm.room_type
                    FROM bookings b
                    JOIN guests g ON g.id = b.guest_id
                    JOIN rooms rm ON rm.id = b.room_id
                    WHERE b.id = :bid AND b.hotel_id = :hid
                """),
                {"bid": booking_id, "hid": hotel_id},
            )
            booking_row = result.mappings().first()

            if not booking_row:
                return {"status": "failed", "reason": "booking_not_found"}

            # Fetch all charges for this booking
            charges_result = await session.execute(
                text("""
                    SELECT description, department, gross_amount
                    FROM charges
                    WHERE booking_id = :bid AND hotel_id = :hid AND status = 'active'
                    ORDER BY charge_date ASC
                """),
                {"bid": booking_id, "hid": hotel_id},
            )
            charges = [dict(r) for r in charges_result.mappings().all()]

        guest_email = booking_row.get("guest_email")
        if not guest_email:
            await self._log_email(
                hotel_id, str(booking_row.get("guest_id")), booking_id, None,
                "checkout_receipt", "", "N/A", "skipped", {},
                "Guest has no email address",
            )
            return {"status": "skipped", "reason": "no_guest_email"}

        # Prepare charge items
        charge_items = [
            {
                "description": c.get("description", "Charge"),
                "department": c.get("department", ""),
                "amount": float(c.get("gross_amount", 0)),
            }
            for c in charges
        ]

        checkin_time = booking_row.get("check_in_time")
        checkout_time = booking_row.get("actual_checkout") or booking_row.get("check_out_time")
        total_charged = float(booking_row.get("total_charged", 0))
        total_paid = float(booking_row.get("total_paid", 0))

        content_context = {
            "guest_name": booking_row["guest_name"],
            "room_number": booking_row.get("room_number", "N/A"),
            "room_type": booking_row.get("room_type", "Standard"),
            "checkin_time": checkin_time.strftime("%b %d, %Y %I:%M %p") if checkin_time else "",
            "checkout_time": checkout_time.strftime("%b %d, %Y %I:%M %p") if checkout_time else "Now",
            "charges": charge_items,
            "total_charged": total_charged,
            "total_paid": total_paid,
            "balance": total_charged - total_paid,
            "currency": "₦",
            "primary_color": email_settings.get("primary_color", "#2563EB"),
        }
        dynamic_content = _render_template("checkout_content.html", content_context)

        # Build full email
        hotel_name = hotel_info.get("name", "Hotel")
        subject = f"Thank You for Staying at {hotel_name}! 🙏"
        base_context = self._build_base_context(hotel_info, email_settings)
        base_context.update({
            "subject": subject,
            "email_title": "Thank You for Your Stay!",
            "email_subtitle": f"Hi {booking_row['guest_name']}, here's your receipt for your recent stay at {hotel_name}. We hope to welcome you again soon!",
            "dynamic_content": dynamic_content,
            "cta_link": None,
            "cta_text": None,
        })
        html = _render_template("base_email.html", base_context)

        # Send
        sender = self._resolve_sender(email_settings, hotel_info)
        result = await self._send_via_resend(guest_email, subject, html, sender)

        # Log
        status = result.get("status", "failed")
        await self._log_email(
            hotel_id, str(booking_row.get("guest_id")), booking_id, None,
            "checkout_receipt", guest_email, subject, status, result,
            result.get("error"),
        )

        return result

    async def send_welcome_email(self, user_email: str, user_name: str = "") -> dict:
        """
        Send onboarding welcome email to a newly registered user.
        Uses Hosila platform branding (not hotel-specific branding).
        """
        display_name = user_name or "there"
        subject = "Welcome to Hosila! 🚀"

        primary_color = "#21C29C"
        content_context = {"primary_color": primary_color}
        dynamic_content = _render_template("welcome_content.html", content_context)

        base_context = {
            "hotel_name": "Hosila",
            "hotel_logo_url": settings.hosila_logo_url,
            "hotel_address": None,
            "hotel_phone": None,
            "hotel_email": None,
            "primary_color": primary_color,
            "promo_enabled": False,
            "promo_title": None,
            "promo_body": None,
            "custom_footer": None,
            "hosila_logo_url": settings.hosila_logo_url,
            "subject": subject,
            "email_title": f"Welcome to Hosila, {display_name}!",
            "email_subtitle": "Run your property smarter, faster, and without the paperwork chaos.",
            "dynamic_content": dynamic_content,
            "cta_link": "https://hosila.vercel.app",
            "cta_text": "Open Hosila →",
        }
        html_body = _render_template("base_email.html", base_context)

        sender = {
            "from_email": f"Hosila <{settings.email_from_address}>",
            "reply_to": settings.email_from_address,
        }
        result = await self._send_via_resend(user_email, subject, html_body, sender)
        logger.info(
            "Welcome email dispatch status=%s to=%s",
            result.get("status"),
            user_email,
        )
        return result


# Singleton instance
email_service = EmailService()
