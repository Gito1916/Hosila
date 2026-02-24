# Hosila Website API — Integration Guide

Connect your hotel website to Hosila's real-time room availability and reservation system. Guests can check availability and book rooms directly from your website, with reservations appearing instantly in Hosila's front desk.

---

## How It Works

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  Hotel Website   │ ──GET──▶│  Hosila API      │ ──SQL──▶│  Supabase DB │
│  (Your Site)     │◀── JSON─│  (Edge Function) │◀── rows─│  (Cloud)     │
│                  │         │                  │         │              │
│  Booking Form    │ ──POST─▶│  Creates         │ ──ins──▶│  Reservations│
│  (with API Key)  │◀── 201──│  Reservation     │         │  Table       │
└──────────────────┘         └──────────────────┘         └──────────────┘
```

Your hotel website makes HTTP requests to Hosila's API. **Read** endpoints (hotel info, room types, availability) are public — no API key needed. **Write** endpoints (creating a reservation) require an API key for security.

---

## Quick Start

### 1. Generate an API Key

1. Open Hosila → **Settings** → **Cloud & Integrations** → **Website API**
2. Click **Generate API Key**
3. **Copy the key immediately** — it is only shown once
4. Store it securely in your website's backend (never expose it in client-side JavaScript)

### 2. Note Your Hotel ID

Your Hotel ID is displayed in the Website API panel alongside the endpoint URLs. It looks like:
```
c585bf30-700a-4b8e-aa7b-a8a4d484360a
```

### 3. Make Your First API Call

```bash
curl "https://ywxsopiokkdytgsvyacg.supabase.co/functions/v1/api?action=hotel-info&hotel_id=YOUR_HOTEL_ID"
```

---

## API Reference

**Base URL:**
```
https://ywxsopiokkdytgsvyacg.supabase.co/functions/v1/api
```

All endpoints accept query parameters and return JSON. CORS is enabled for all origins.

### Rate Limiting

All endpoints are rate-limited to **60 requests per minute** per IP address. Exceeding this returns `429 Too Many Requests`.

---

### GET — Hotel Info

Retrieve your hotel's public profile information.

**Request:**
```
GET /api?action=hotel-info&hotel_id={hotel_id}
```

**Response:**
```json
{
  "hotel": {
    "id": "c585bf30-...",
    "name": "Hosila Suites",
    "address": "123 Main Street, Lagos",
    "phone": "+234-800-000-0000",
    "email": "info@hosilasuites.com",
    "logo_url": "https://...",
    "currency": "NGN",
    "check_in_time": "14:00",
    "check_out_time": "12:00"
  }
}
```

**Use case:** Display hotel name, contact info, check-in/check-out times on your website header or footer.

---

### GET — Room Types

Retrieve all room categories with pricing and amenities.

**Request:**
```
GET /api?action=room-types&hotel_id={hotel_id}
```

**Response:**
```json
{
  "room_types": [
    {
      "id": "abc123",
      "name": "Deluxe Room",
      "description": "Spacious room with king-size bed",
      "base_rate": 25000,
      "available_rooms": 5,
      "rate_range": { "min": 25000, "max": 30000 },
      "max_occupancy": 2,
      "amenities": ["wifi", "ac", "tv", "minibar"]
    }
  ]
}
```

**Use case:** Build your website's "Rooms & Suites" page with live pricing and availability counts.

---

### GET — Check Availability

Check which rooms are available for specific dates. This cross-references both reservations and active bookings to give accurate results.

**Request:**
```
GET /api?action=availability&hotel_id={hotel_id}&check_in=2026-03-15&check_out=2026-03-18
```

| Parameter | Required | Format | Description |
|-----------|----------|--------|-------------|
| `hotel_id` | Yes | UUID | Your hotel ID |
| `check_in` | Yes | YYYY-MM-DD | Desired check-in date |
| `check_out` | Yes | YYYY-MM-DD | Desired check-out date |

**Response:**
```json
{
  "check_in": "2026-03-15",
  "check_out": "2026-03-18",
  "nights": 3,
  "total_available": 8,
  "availability": [
    {
      "room_type": "Deluxe Room",
      "available": 3,
      "rate_from": 25000,
      "rooms": [
        { "id": "room-uuid-1", "room_number": "101", "rate": 25000 },
        { "id": "room-uuid-2", "room_number": "102", "rate": 25000 },
        { "id": "room-uuid-3", "room_number": "103", "rate": 30000 }
      ]
    },
    {
      "room_type": "Standard Room",
      "available": 5,
      "rate_from": 15000,
      "rooms": [
        { "id": "room-uuid-4", "room_number": "201", "rate": 15000 }
      ]
    }
  ]
}
```

**Use case:** Power a "Check Availability" search form. Show available room types, pricing, and let the guest choose a specific room.

> **Important:** The `room_id` values returned here are what you'll use to create a reservation. You must use one of these IDs — you cannot pass arbitrary room IDs.

---

### POST — Create Reservation 🔐

Create a new reservation. **Requires an API key.**

**Request:**
```
POST /api?action=create-reservation
Content-Type: application/json
X-API-Key: hf_your_api_key_here

{
  "guest_name": "John Doe",
  "guest_email": "john@example.com",
  "guest_phone": "+234-800-111-2222",
  "room_id": "room-uuid-1",
  "check_in": "2026-03-15",
  "check_out": "2026-03-18",
  "notes": "Late arrival, around 10 PM"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `guest_name` | Yes | Full name of the guest |
| `guest_email` | No | Email address (enables confirmation email) |
| `guest_phone` | No | Phone number |
| `room_id` | Yes | Room ID from the availability endpoint |
| `check_in` | Yes | Check-in date (YYYY-MM-DD) |
| `check_out` | Yes | Check-out date (YYYY-MM-DD) |
| `notes` | No | Special requests or notes |

**Authentication:** Pass your API key in either:
- **Header:** `X-API-Key: hf_...` (recommended)
- **Body:** `"api_key": "hf_..."` (alternative)

**Response (201 Created):**
```json
{
  "reservation": {
    "id": "res-uuid",
    "status": "pending",
    "room": {
      "number": "101",
      "type": "Deluxe Room",
      "rate_per_night": 25000
    },
    "guest_name": "John Doe",
    "check_in": "2026-03-15",
    "check_out": "2026-03-18",
    "nights": 3,
    "total_amount": 75000,
    "message": "Reservation created. You will receive a confirmation email shortly."
  }
}
```

**What happens in Hosila:**
- The reservation appears on the **Reservations** page with status `pending`
- Front desk staff can confirm, modify, or cancel it
- If the guest provided an email, a confirmation email is sent automatically

**Error responses:**
| Status | Meaning |
|--------|---------|
| `401` | Missing API key |
| `403` | Invalid or revoked API key |
| `404` | Room not found |
| `409` | Room not available for selected dates (already booked) |

---

### GET — Reservation Status

Let guests check the status of their reservation.

**Request:**
```
GET /api?action=reservation-status&hotel_id={hotel_id}&reservation_id={reservation_id}
```

**Response:**
```json
{
  "reservation": {
    "id": "res-uuid",
    "status": "confirmed",
    "check_in": "2026-03-15",
    "check_out": "2026-03-18",
    "nights": 3,
    "total_amount": 75000,
    "deposit_paid": 25000,
    "balance": 50000,
    "guest": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "room": {
      "number": "101",
      "type": "Deluxe Room"
    }
  }
}
```

**Use case:** Build a "Check My Reservation" page where guests enter their reservation ID to see their booking status and balance.

---

## Website Integration Examples

### Example 1: Availability Search Form (HTML + JavaScript)

```html
<form id="availability-form">
  <input type="date" id="check-in" required />
  <input type="date" id="check-out" required />
  <button type="submit">Check Availability</button>
</form>

<div id="results"></div>

<script>
const HOTEL_ID = "YOUR_HOTEL_ID";
const API_BASE = "https://ywxsopiokkdytgsvyacg.supabase.co/functions/v1/api";

document.getElementById("availability-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const checkIn = document.getElementById("check-in").value;
  const checkOut = document.getElementById("check-out").value;

  const res = await fetch(
    `${API_BASE}?action=availability&hotel_id=${HOTEL_ID}&check_in=${checkIn}&check_out=${checkOut}`
  );
  const data = await res.json();

  const resultsDiv = document.getElementById("results");
  if (data.total_available === 0) {
    resultsDiv.innerHTML = "<p>No rooms available for these dates.</p>";
    return;
  }

  resultsDiv.innerHTML = data.availability.map(type => `
    <div class="room-type">
      <h3>${type.room_type}</h3>
      <p>${type.available} rooms from ₦${type.rate_from.toLocaleString()}/night</p>
      <p><strong>Total for ${data.nights} nights: ₦${(type.rate_from * data.nights).toLocaleString()}</strong></p>
      ${type.rooms.map(room => `
        <button onclick="bookRoom('${room.id}', '${checkIn}', '${checkOut}')">
          Book Room ${room.room_number} — ₦${room.rate.toLocaleString()}/night
        </button>
      `).join("")}
    </div>
  `).join("");
});
</script>
```

### Example 2: Booking via Your Backend (Node.js / PHP / Python)

> **Security:** Never expose your API key in client-side code. Always make the `create-reservation` call from your server.

**Node.js:**
```javascript
const response = await fetch(
  "https://ywxsopiokkdytgsvyacg.supabase.co/functions/v1/api?action=create-reservation",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.HOSILA_API_KEY,
    },
    body: JSON.stringify({
      guest_name: "John Doe",
      guest_email: "john@example.com",
      room_id: "room-uuid-from-availability",
      check_in: "2026-03-15",
      check_out: "2026-03-18",
    }),
  }
);
const booking = await response.json();
console.log("Reservation created:", booking.reservation.id);
```

**PHP:**
```php
$response = file_get_contents(
  'https://ywxsopiokkdytgsvyacg.supabase.co/functions/v1/api?action=create-reservation',
  false,
  stream_context_create([
    'http' => [
      'method' => 'POST',
      'header' => "Content-Type: application/json\r\nX-API-Key: " . $_ENV['HOSILA_API_KEY'],
      'content' => json_encode([
        'guest_name' => 'John Doe',
        'guest_email' => 'john@example.com',
        'room_id' => 'room-uuid',
        'check_in' => '2026-03-15',
        'check_out' => '2026-03-18',
      ]),
    ],
  ])
);
$booking = json_decode($response, true);
```

**Python:**
```python
import requests, os

response = requests.post(
    "https://ywxsopiokkdytgsvyacg.supabase.co/functions/v1/api?action=create-reservation",
    headers={
        "Content-Type": "application/json",
        "X-API-Key": os.environ["HOSILA_API_KEY"],
    },
    json={
        "guest_name": "John Doe",
        "guest_email": "john@example.com",
        "room_id": "room-uuid",
        "check_in": "2026-03-15",
        "check_out": "2026-03-18",
    },
)
booking = response.json()
print("Reservation created:", booking["reservation"]["id"])
```

---

## Typical Website Integration Flow

```
  Guest visits hotel website
         │
         ▼
  ┌─────────────────────┐
  │ 1. Show room types  │◀── GET room-types
  │    and pricing       │
  └─────────┬───────────┘
            │ Guest selects dates
            ▼
  ┌─────────────────────┐
  │ 2. Check availability│◀── GET availability
  │    for those dates   │
  └─────────┬───────────┘
            │ Guest picks a room
            ▼
  ┌─────────────────────┐
  │ 3. Collect guest     │
  │    name, email,      │
  │    phone             │
  └─────────┬───────────┘
            │ Submit form
            ▼
  ┌─────────────────────┐
  │ 4. Create reservation│◀── POST create-reservation (API key)
  │    Show confirmation │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │ 5. Guest receives    │     (automatic)
  │    confirmation email│
  └─────────────────────┘
```

---

## Security Best Practices

| ✅ Do | ❌ Don't |
|-------|---------|
| Store API keys on your server only | Put API keys in client-side JavaScript |
| Use `X-API-Key` header | Hardcode keys in HTML source code |
| Generate separate keys per website | Share one key across multiple sites |
| Revoke keys immediately if compromised | Leave old keys active when staff change |
| Use HTTPS for all API calls | Make API calls over plain HTTP |

---

## API Key Management

| Action | How |
|--------|-----|
| **Generate** | Settings → Cloud & Integrations → Website API → Generate API Key |
| **View** | Key prefix shown (e.g., `hf_a1b2c3d4...`) with creation date and last used |
| **Revoke** | Click the ⚠ icon next to the key — key becomes inactive but can be re-viewed |
| **Delete** | Click the 🗑 icon — permanently removes the key |

Keys are stored as SHA-256 hashes — Hosila never stores your raw API key. The full key is shown only once at generation.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `401 — API key required` | Include your key in the `X-API-Key` header or `api_key` body field |
| `403 — Invalid or inactive API key` | Check the key hasn't been revoked. Generate a new one if needed |
| `404 — Hotel not found` | Verify your `hotel_id` parameter is correct |
| `409 — Room not available` | The room is already booked for those dates. Re-check availability |
| `429 — Rate limit exceeded` | You're making more than 60 requests/minute. Add caching or slow down |
| Empty room types | Ensure rooms are configured in Hosila settings with proper room types |
| No confirmation email | Guest needs an email address; `RESEND_API_KEY` must be configured |

---

## Current Limitations

- **No payment processing** — Reservations are created as `pending`. Payment is handled at the front desk during check-in.
- **No deposit collection** — The API does not collect deposits online. Future versions may integrate with payment gateways.
- **No modification/cancellation API** — Guests must contact the hotel to modify or cancel. Front desk handles this in Hosila.
- **Single-room bookings** — Each API call books one room. For multi-room bookings, make multiple calls.

---

## Setup Checklist

Before your website integration will work, ensure:

- [ ] **Edge functions deployed** — The `api` and `send-confirmation` Supabase Edge Functions must be deployed to your Supabase project
- [ ] **API key generated** — At least one active API key exists in Settings → Website API
- [ ] **Room types configured** — Room types are defined in Hosila with rooms assigned
- [ ] **RESEND_API_KEY set** — (Optional) Add to Supabase Edge Function secrets for confirmation emails
- [ ] **RESEND_DOMAIN set** — (Optional) Your verified email domain for sending from your hotel's address
