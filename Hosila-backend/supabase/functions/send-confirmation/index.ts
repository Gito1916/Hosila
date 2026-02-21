// HotelFlow — Reservation Confirmation Email Edge Function
// Sends a confirmation email to the guest after a reservation is created.
//
// Called from the main API edge function after reservation creation.
// Uses Resend API for email delivery (set RESEND_API_KEY in Supabase secrets).
//
// POST /send-confirmation
// Body: { reservation_id, hotel_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

function formatCurrency(amount: number, currency = "NGN"): string {
    return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency,
    }).format(amount);
}

function buildConfirmationHtml(data: {
    hotelName: string;
    hotelPhone: string;
    hotelEmail: string;
    hotelAddress: string;
    guestName: string;
    roomType: string;
    roomNumber: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    totalAmount: number;
    reservationId: string;
    currency: string;
}): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reservation Confirmation</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:32px;border-radius:12px 12px 0 0;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:24px;">${data.hotelName}</h1>
      <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Reservation Confirmation</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#334155;font-size:16px;margin:0 0 24px;">
        Dear <strong>${data.guestName}</strong>,
      </p>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Thank you for your reservation! We're pleased to confirm your upcoming stay at
        <strong>${data.hotelName}</strong>. Below are your booking details:
      </p>

      <!-- Booking Details -->
      <div style="background:#f8fafc;padding:20px;border-radius:8px;border:1px solid #e2e8f0;margin:0 0 24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;color:#64748b;font-size:13px;width:40%;">Confirmation #</td>
            <td style="padding:8px 0;color:#1e293b;font-size:13px;font-weight:600;">${data.reservationId.slice(0, 8).toUpperCase()}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">Room Type</td>
            <td style="padding:8px 0;color:#1e293b;font-size:13px;font-weight:600;border-top:1px solid #e2e8f0;">${data.roomType}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">Room</td>
            <td style="padding:8px 0;color:#1e293b;font-size:13px;font-weight:600;border-top:1px solid #e2e8f0;">${data.roomNumber}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">Check-in</td>
            <td style="padding:8px 0;color:#1e293b;font-size:13px;font-weight:600;border-top:1px solid #e2e8f0;">${formatDate(data.checkIn)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">Check-out</td>
            <td style="padding:8px 0;color:#1e293b;font-size:13px;font-weight:600;border-top:1px solid #e2e8f0;">${formatDate(data.checkOut)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">Duration</td>
            <td style="padding:8px 0;color:#1e293b;font-size:13px;font-weight:600;border-top:1px solid #e2e8f0;">${data.nights} night${data.nights > 1 ? "s" : ""}</td>
          </tr>
          <tr>
            <td style="padding:12px 0 8px;color:#64748b;font-size:14px;border-top:2px solid #cbd5e1;font-weight:600;">Total</td>
            <td style="padding:12px 0 8px;color:#059669;font-size:18px;border-top:2px solid #cbd5e1;font-weight:700;">${formatCurrency(data.totalAmount, data.currency)}</td>
          </tr>
        </table>
      </div>

      <!-- Contact info -->
      <div style="background:#eff6ff;padding:16px;border-radius:8px;border:1px solid #bfdbfe;">
        <p style="color:#1e40af;font-size:13px;margin:0 0 8px;font-weight:600;">Need to modify your reservation?</p>
        <p style="color:#3b82f6;font-size:13px;margin:0;line-height:1.6;">
          Contact us at <a href="tel:${data.hotelPhone}" style="color:#2563eb;">${data.hotelPhone}</a>
          or email <a href="mailto:${data.hotelEmail}" style="color:#2563eb;">${data.hotelEmail}</a>
        </p>
      </div>

      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;text-align:center;">
        ${data.hotelAddress}<br/>
        This email was sent automatically by HotelFlow.
      </p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
    }

    try {
        const { reservation_id, hotel_id } = await req.json();

        if (!reservation_id || !hotel_id) {
            return json({ error: "reservation_id and hotel_id are required" }, 400);
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const resendApiKey = Deno.env.get("RESEND_API_KEY");

        if (!resendApiKey) {
            console.warn("RESEND_API_KEY not set — skipping confirmation email");
            return json({ sent: false, reason: "Email service not configured" });
        }

        const supabase = createClient(supabaseUrl, serviceKey);

        // Fetch reservation with joins
        const { data: reservation, error: resErr } = await supabase
            .from("reservations")
            .select(
                `id, check_in_date, check_out_date, nights, total_amount, status,
         guests!inner(name, email, phone),
         rooms!inner(room_number, room_type)`
            )
            .eq("id", reservation_id)
            .eq("hotel_id", hotel_id)
            .single();

        if (resErr || !reservation) {
            return json({ error: "Reservation not found" }, 404);
        }

        const guest = reservation.guests as any;
        if (!guest?.email) {
            return json({ sent: false, reason: "Guest has no email address" });
        }

        // Fetch hotel info
        const { data: hotel } = await supabase
            .from("hotels")
            .select("name, phone, email, address, settings")
            .eq("id", hotel_id)
            .single();

        if (!hotel) {
            return json({ error: "Hotel not found" }, 404);
        }

        const currency = hotel.settings?.currency || "NGN";
        const room = reservation.rooms as any;

        const html = buildConfirmationHtml({
            hotelName: hotel.name,
            hotelPhone: hotel.phone || "",
            hotelEmail: hotel.email || "",
            hotelAddress: hotel.address || "",
            guestName: guest.name,
            roomType: room.room_type,
            roomNumber: room.room_number,
            checkIn: reservation.check_in_date,
            checkOut: reservation.check_out_date,
            nights: reservation.nights,
            totalAmount: reservation.total_amount,
            reservationId: reservation.id,
            currency,
        });

        // Send via Resend
        const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: `${hotel.name} <reservations@${Deno.env.get("RESEND_DOMAIN") || "hotelflow.app"}>`,
                to: [guest.email],
                subject: `Reservation Confirmed — ${hotel.name} (${formatDate(reservation.check_in_date)})`,
                html,
            }),
        });

        if (!emailRes.ok) {
            const errBody = await emailRes.text();
            console.error("Resend error:", errBody);
            return json({ sent: false, reason: "Email delivery failed" }, 502);
        }

        const result = await emailRes.json();
        console.log("Confirmation email sent:", result.id);

        return json({ sent: true, email_id: result.id });
    } catch (err) {
        console.error("Email error:", err);
        return json({ error: "Failed to send confirmation email" }, 500);
    }
});
