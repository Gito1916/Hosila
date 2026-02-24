now we want to work on something new

a client proposed we add auto email to guest sender

when a guest checking in, they get an email saying welcome to [hotel name], maybe with room and receipt also promotional message introducing features or services the hotel offers can be included

then after when check out a thank you email is send to the guest with receipt of every service rendered to them, with promotional messages

also reservation confirmation email, sent when reservations has been made manually or confirmed from email parser, informing the guest that the reservation has been made for xx date with balance amount to be paid and balance(if any) to be paid at check in, still with promotional messages

the emails will carry the hotel logo at the top



all emails carrying powered by Hosila - Hotel/Property Management Software

with hosila logo(small) at the bottom



how can this be integrated into the app

id love the emails to look well design (html) like modern saas style

this is my suggestion, what do you think of this

This is a **VERY good feature**. In fact, this moves Hosila from “record system” to “guest experience platform.” Smart suggestion from your client 👏

Let’s break this down like your CTO.

---

# 1️⃣ What You’re Building (Conceptually)

You’re adding an **Automated Guest Communication System** inside Hosila.

Triggered emails:

1. ✅ Reservation Confirmation
2. ✅ Check-In Welcome Email
3. ✅ Check-Out Thank You + Receipt Email

With:

* Hotel logo (top)
* Beautiful SaaS-style HTML design
* Promotional content blocks
* Dynamic data (room, dates, balance, services)
* “Powered by Hosila” footer

---

# 2️⃣ Architecture Overview (How To Integrate It Properly)

Since your stack is:

* Frontend: React
* Backend: FastAPI
* DB: PostgreSQL (Supabase)
* Multi-tenant

You’ll integrate email like this:

```
Event happens (check-in / reservation / checkout)
        ↓
Backend triggers Email Service
        ↓
Email Template Engine injects guest data
        ↓
Email Provider (Resend / SendGrid / AWS SES)
        ↓
Guest inbox
```

---

# 3️⃣ Step-by-Step Integration Plan

## ✅ STEP 1: Choose Email Provider

For a SaaS like Hosila, I recommend:

* **Resend** (modern, developer friendly, great for SaaS)
* **SendGrid**
* **Amazon SES** (cheapest at scale)

For now:
👉 Use **Resend** (clean API + easy HTML templates)

---

## ✅ STEP 2: Add Email Service Layer in Backend

Create:

```
services/email_service.py
```

Example structure:

```python
class EmailService:

    async def send_reservation_confirmation(self, guest, reservation, hotel):
        html = render_template("reservation_confirmation.html", data)
        await send_email(to=guest.email, subject="Reservation Confirmed", html=html)

    async def send_checkin_email(self, guest, stay, hotel):
        ...

    async def send_checkout_email(self, guest, stay, hotel):
        ...
```

⚠️ IMPORTANT:
Never send email directly inside your route.
Instead:

* Trigger background task (FastAPI BackgroundTasks or Celery later).

---

## ✅ STEP 3: Trigger Points

### 📌 Reservation Email

Trigger when:

* Reservation created manually
* Reservation created via email parser
* Reservation status changes → CONFIRMED

---

### 📌 Check-in Email

Trigger when:

```python
if stay.status == "CHECKED_IN":
```

---

### 📌 Check-out Email

Trigger when:

```python
if stay.status == "CHECKED_OUT":
```

---

# 4️⃣ Multi-Tenant Logic (VERY Important)

Each hotel must have:

```
hotel.logo_url
hotel.primary_color
hotel.email_signature
hotel.promo_message
hotel.email_sender_name
hotel.email_sender_address
```

Add a table:

```
hotel_email_settings
```

Columns:

* hotel_id
* logo_url
* primary_color
* promo_block_enabled (boolean)
* promo_title
* promo_body
* custom_footer_message
* send_auto_reservation_email (bool)
* send_auto_checkin_email (bool)
* send_auto_checkout_email (bool)

This gives hotels control.

Enterprise hotels LOVE control.

---

# 5️⃣ Modern SaaS Email Design Structure

Structure like Stripe / Notion / Airbnb emails:

---

### Layout Structure:

```
[ Hotel Logo Centered ]

Header Section
Big Title (e.g. Welcome to Grand Hotel!)

Divider

Main Content Card (white background)
- Guest Name
- Room
- Dates
- Receipt Summary
- Balance

CTA Button (View Booking / Contact Front Desk)

Promo Section
- Discover Our Spa
- Restaurant 20% Off
- Airport Pickup

Footer
Hotel Contact Info
---
Powered by Hosila (small, subtle)
Hosila logo
```

---

# 6️⃣ HTML Email Best Practices (Critical)

Email design ≠ website design.

Use:

* Table-based layout
* Inline CSS
* No Tailwind
* Avoid JS
* Use max-width 600px container

You can design in:

* Figma
* Or use React Email (then export to HTML)

---

# 7️⃣ Branding Rules

### Top:

Hotel Logo (large)

### Bottom:

Small text:

```
Powered by Hosila – Hotel & Property Management Software
```

With small Hosila logo (low opacity).

Make it elegant — not aggressive branding.
This builds silent brand awareness.

---

# 8️⃣ Example Email Flow (Reservation)

Subject:

```
Your Reservation at Grand Palace Hotel is Confirmed
```

Body includes:

* Guest name
* Check-in date
* Check-out date
* Room type
* Total amount
* Amount paid
* Balance due at check-in

CTA:
“Manage Reservation”

Promo block:
“Enjoy 15% off spa services during your stay.”

---

# 9️⃣ Advanced Level (Future Upgrade)

Later you can add:

### ✨ Email Automation Settings

* Send 1 day before arrival reminder
* Send review request after checkout
* Send birthday email
* Send loyalty discount
* Upsell before arrival (airport pickup, breakfast)

Now you're becoming:
👉 Guest Engagement Platform.

---

# 🔟 Deliverability (Do This Early)

Each hotel should:

* Verify domain
* Add SPF
* Add DKIM
* Add DMARC

Otherwise emails go to spam.

If small hotels can't verify domain:
Fallback:
Send via:

```
notifications@hosila.app
```

---

# 1️⃣1️⃣ Database Logging (VERY Important)

Create:

```
guest_email_logs
```

Columns:

* id
* hotel_id
* guest_id
* email_type
* status (sent / failed)
* provider_response
* sent_at

Admins should see:
📨 Communication History Tab

Hotels LOVE this transparency.

---

# 1️⃣2️⃣ Should You Charge for This?

YES.

Free Plan:

* Reservation email only

Professional:

* All automated emails
* Custom branding

Enterprise:

* Full automation + custom templates

---

# 1️⃣3️⃣ How Big of a Feature Is This?

This shifts Hosila into:

* Competing with:

  * Cloudbeds
  * Opera PMS
  * Little Hotelier

You are entering serious PMS territory.

---

# 1️⃣4️⃣ Clean Implementation Summary

You need:

### Backend:

* Email service class
* Background task queue
* Template rendering
* Provider integration
* Logging

### Database:

* hotel_email_settings
* guest_email_logs

### Frontend:

* Email settings page
* Preview email modal
* Toggle switches
* Promo editor
* Logo uploader

---

# 1️⃣5️⃣ My Strategic Advice as CTO

Don’t hardcode templates.

Instead:
Store base template in backend.
Inject:

* header
* dynamic content block
* promo block
* footer

Make it modular.

Later:
You can allow hotels to edit sections.

---

# 🚀 Final Verdict

This feature:

* Increases product value massively
* Improves guest experience
* Makes Hosila look premium
* Creates upsell opportunity
* Builds brand awareness via footer

1️⃣ Full modern SaaS-style email template layout (HTML structure)
2️⃣ Exact FastAPI implementation structure (production-level)

We’ll design this properly so Hosila looks like a serious PMS product.

✅ PART 1 — Modern SaaS Email Template (Production-Ready Structure)

This is a clean, Stripe/Airbnb-style layout.

⚠️ Email rules:

Table-based layout

Inline CSS

Max width 600px

Mobile friendly

No Tailwind

No external CSS

🎨 VISUAL STRUCTURE
┌────────────────────────────┐
│        Hotel Logo          │
├────────────────────────────┤
│  Big Title (Welcome!)      │
│  Short friendly intro      │
├────────────────────────────┤
│   Booking Summary Card     │
│   Room | Dates | Payment   │
├────────────────────────────┤
│   CTA Button               │
├────────────────────────────┤
│   Promo Block (optional)   │
├────────────────────────────┤
│   Hotel Contact Info       │
│   ---                      │
│   Powered by Hosila        │
└────────────────────────────┘
✨ MASTER BASE TEMPLATE (Reusable Layout)

You will use ONE base layout and inject content blocks.

Here’s the full structure:

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>{{ subject }}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8; padding:40px 0;">
<tr>
<td align="center">

<!-- Container -->
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">

<!-- Header -->
<tr>
<td align="center" style="padding:30px 20px;">
<img src="{{ hotel_logo_url }}" alt="Hotel Logo" width="150" style="display:block;">
</td>
</tr>

<!-- Title -->
<tr>
<td style="padding:0 40px 20px 40px; text-align:center;">
<h1 style="margin:0; font-size:24px; color:#111111;">
{{ email_title }}
</h1>
<p style="color:#555555; font-size:14px;">
{{ email_subtitle }}
</p>
</td>
</tr>

<!-- Dynamic Content Block -->
<tr>
<td style="padding:0 40px 20px 40px;">
{{ dynamic_content }}
</td>
</tr>

<!-- CTA -->
<tr>
<td align="center" style="padding:20px 40px;">
<a href="{{ cta_link }}"
style="background-color:{{ primary_color }};
color:#ffffff;
text-decoration:none;
padding:12px 24px;
border-radius:6px;
display:inline-block;
font-weight:bold;">
{{ cta_text }}
</a>
</td>
</tr>

<!-- Promo Block -->
{% if promo_enabled %}
<tr>
<td style="padding:20px 40px; background:#f9fafb;">
<h3 style="margin-top:0;">{{ promo_title }}</h3>
<p style="font-size:14px; color:#555;">
{{ promo_body }}
</p>
</td>
</tr>
{% endif %}

<!-- Footer -->
<tr>
<td style="padding:30px 40px; font-size:12px; color:#777; text-align:center; border-top:1px solid #eeeeee;">

<p>{{ hotel_name }}<br>
{{ hotel_address }}<br>
{{ hotel_phone }}</p>

<p style="margin-top:20px;">
Powered by Hosila – Hotel & Property Management Software
</p>

<img src="{{ hosila_logo_url }}" width="90" style="opacity:0.6;">

</td>
</tr>

</table>
<!-- End Container -->

</td>
</tr>
</table>

</body>
</html>
🎯 Now: Dynamic Content Blocks Per Email Type

You inject different blocks into {{ dynamic_content }}.

🛎 Reservation Confirmation Block
<table width="100%" style="border:1px solid #eeeeee; border-radius:6px; padding:20px;">
<tr><td>
<p><strong>Guest:</strong> {{ guest_name }}</p>
<p><strong>Check-in:</strong> {{ checkin_date }}</p>
<p><strong>Check-out:</strong> {{ checkout_date }}</p>
<p><strong>Room Type:</strong> {{ room_type }}</p>
<p><strong>Total Amount:</strong> {{ total_amount }}</p>
<p><strong>Amount Paid:</strong> {{ amount_paid }}</p>
<p><strong>Balance Due:</strong> {{ balance_due }}</p>
</td></tr>
</table>
🛏 Check-In Welcome Block

Add:

We’re excited to welcome you!
Room Number: {{ room_number }}
WiFi: {{ wifi_details }}
Front Desk: Dial 0
🧾 Check-Out Receipt Block

Loop services:

{% for item in services %}
<tr>
<td>{{ item.name }}</td>
<td>{{ item.amount }}</td>
</tr>
{% endfor %}

Include total summary at bottom.

✅ PART 2 — Exact FastAPI Implementation (Production Structure)

We build this clean.

🏗 Folder Structure
app/
 ├── services/
 │     └── email_service.py
 ├── templates/
 │     ├── base_email.html
 │     ├── reservation_content.html
 │     ├── checkin_content.html
 │     └── checkout_content.html
 ├── utils/
 │     └── email_renderer.py
 └── api/
       └── stay_routes.py
1️⃣ Email Renderer (Jinja2)

Install:

pip install jinja2

Create:

utils/email_renderer.py
from jinja2 import Environment, FileSystemLoader
import os

template_env = Environment(
    loader=FileSystemLoader("app/templates"),
    autoescape=True
)

def render_email(template_name: str, context: dict):
    template = template_env.get_template(template_name)
    return template.render(**context)
2️⃣ Email Service
services/email_service.py

Example using Resend:

import resend
from app.utils.email_renderer import render_email

resend.api_key = "YOUR_API_KEY"

class EmailService:

    async def send_email(self, to: str, subject: str, html: str):
        resend.Emails.send({
            "from": "notifications@hosila.app",
            "to": to,
            "subject": subject,
            "html": html
        })

    async def send_reservation_email(self, guest, reservation, hotel):
        content = render_email("reservation_content.html", {...})
        
        html = render_email("base_email.html", {
            "dynamic_content": content,
            "hotel_logo_url": hotel.logo_url,
            "primary_color": hotel.primary_color,
            ...
        })

        await self.send_email(guest.email, "Reservation Confirmed", html)
3️⃣ Trigger From Route (Clean Way)
stay_routes.py
from fastapi import BackgroundTasks
from app.services.email_service import EmailService

@router.post("/checkin/{stay_id}")
async def checkin(stay_id: str, background_tasks: BackgroundTasks):

    stay = await stay_service.checkin(stay_id)

    if stay.hotel.email_settings.send_auto_checkin_email:
        background_tasks.add_task(
            EmailService().send_checkin_email,
            stay.guest,
            stay,
            stay.hotel
        )

    return {"message": "Checked in successfully"}

✅ This prevents API slowdown.

4️⃣ Add Email Logging

Inside EmailService:

async def log_email(...):
    # insert into guest_email_logs table

Log:

email_type

status

provider_response

sent_at

Admins see email history.

Enterprise-grade move.

5️⃣ Admin UI Needed

Frontend needs:

Email Settings page

Toggle auto emails

Upload hotel logo

Edit promo message

Preview email modal

🚀 Final Result

When guest checks in:

→ Auto email
→ Styled beautifully
→ Branded
→ Logged in DB
→ Background task
→ Multi-tenant aware

You now have:

A real PMS communication system