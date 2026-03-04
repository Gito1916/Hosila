// Hosila Website API — Supabase Edge Function
// Provides public read endpoints and authenticated write endpoints for hotel websites
//
// Endpoints:
//   GET  /api?action=hotel-info&hotel_id=...
//   GET  /api?action=room-types&hotel_id=...
//   GET  /api?action=availability&hotel_id=...&check_in=...&check_out=...[&room_type=...][&room_number=...]
//   POST /api?action=create-reservation  (body: { api_key, hotel_id, ... })
//   GET  /api?action=reservation-status&hotel_id=...&reservation_id=...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function error(message: string, status = 400) {
    return json({ error: message }, status);
}

function getSupabaseAdmin() {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    return createClient(url, serviceKey);
}

// ------------------------------------------------------------------
// API Key Validation
// ------------------------------------------------------------------

async function hashApiKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function validateApiKey(
    supabase: ReturnType<typeof createClient>,
    apiKey: string
): Promise<string | null> {
    const keyHash = await hashApiKey(apiKey);

    const { data, error: err } = await supabase.rpc("validate_api_key", {
        p_key_hash: keyHash,
    });

    if (err || !data || data.length === 0) return null;

    // Touch last_used_at in background
    supabase.rpc("touch_api_key", { p_key_hash: keyHash }).catch(() => { });

    return data[0].hotel_id;
}

// ------------------------------------------------------------------
// Handlers
// ------------------------------------------------------------------

async function handleHotelInfo(
    supabase: ReturnType<typeof createClient>,
    hotelId: string
) {
    const { data, error: err } = await supabase
        .from("hotels")
        .select("id, name, address, phone, email, logo_url, settings")
        .eq("id", hotelId)
        .single();

    if (err || !data) return error("Hotel not found", 404);

    return json({
        hotel: {
            id: data.id,
            name: data.name,
            address: data.address,
            phone: data.phone,
            email: data.email,
            logo_url: data.logo_url,
            currency: data.settings?.currency || "NGN",
            check_in_time: data.settings?.checkInTime || "14:00",
            check_out_time: data.settings?.checkOutTime || "12:00",
        },
    });
}

async function handleRoomTypes(
    supabase: ReturnType<typeof createClient>,
    hotelId: string
) {
    const { data: roomTypes, error: err } = await supabase
        .from("room_types")
        .select("id, name, description, base_rate")
        .eq("hotel_id", hotelId)
        .order("name");

    if (err) return error("Failed to fetch room types", 500);

    // Get room counts per type
    const { data: rooms } = await supabase
        .from("rooms")
        .select("room_type, night_rate, amenities, max_occupancy")
        .eq("hotel_id", hotelId)
        .eq("status", "available");

    // Group rooms by type
    const typeMap: Record<
        string,
        { count: number; min_rate: number; max_rate: number; amenities: string[]; max_occupancy: number }
    > = {};

    for (const room of rooms || []) {
        if (!typeMap[room.room_type]) {
            typeMap[room.room_type] = {
                count: 0,
                min_rate: room.night_rate,
                max_rate: room.night_rate,
                amenities: [],
                max_occupancy: room.max_occupancy,
            };
        }
        const t = typeMap[room.room_type];
        t.count++;
        t.min_rate = Math.min(t.min_rate, room.night_rate);
        t.max_rate = Math.max(t.max_rate, room.night_rate);
        t.max_occupancy = Math.max(t.max_occupancy, room.max_occupancy);
        if (Array.isArray(room.amenities)) {
            for (const a of room.amenities) {
                if (!t.amenities.includes(a)) t.amenities.push(a);
            }
        }
    }

    const enriched = (roomTypes || []).map((rt) => ({
        id: rt.id,
        name: rt.name,
        description: rt.description,
        base_rate: rt.base_rate,
        available_rooms: typeMap[rt.name]?.count || 0,
        rate_range: typeMap[rt.name]
            ? { min: typeMap[rt.name].min_rate, max: typeMap[rt.name].max_rate }
            : null,
        max_occupancy: typeMap[rt.name]?.max_occupancy || 2,
        amenities: typeMap[rt.name]?.amenities || [],
    }));

    return json({ room_types: enriched });
}

async function handleAvailability(
    supabase: ReturnType<typeof createClient>,
    hotelId: string,
    checkIn: string,
    checkOut: string,
    roomType?: string,
    roomNumber?: string,
    ipAddress?: string
) {
    if (!checkIn || !checkOut) {
        return error("check_in and check_out are required");
    }

    // Validate dates
    const ciDate = new Date(checkIn);
    const coDate = new Date(checkOut);
    if (isNaN(ciDate.getTime()) || isNaN(coDate.getTime())) {
        return error("Invalid date format. Use YYYY-MM-DD");
    }
    if (coDate <= ciDate) {
        return error("check_out must be after check_in");
    }

    // Get all rooms for this hotel
    const { data: allRooms, error: roomErr } = await supabase
        .from("rooms")
        .select("id, room_number, room_type, night_rate, max_occupancy, amenities")
        .eq("hotel_id", hotelId)
        .in("status", ["available", "occupied"]); // exclude maintenance rooms

    if (roomErr) return error("Failed to fetch rooms", 500);

    // Get reservations that overlap with the requested dates (include checkout for next_available calc)
    const { data: overlapping } = await supabase
        .from("reservations")
        .select("room_id, check_out_date")
        .eq("hotel_id", hotelId)
        .in("status", ["confirmed", "pending", "checked_in"])
        .lt("check_in_date", checkOut)
        .gt("check_out_date", checkIn);

    const bookedRoomIds = new Set((overlapping || []).map((r: any) => r.room_id));

    // Build a map of room_id → latest checkout date (for next_available calculation)
    const latestCheckoutByRoom: Record<string, string> = {};
    for (const r of overlapping || []) {
        const rid = (r as any).room_id;
        const co = (r as any).check_out_date;
        if (!latestCheckoutByRoom[rid] || co > latestCheckoutByRoom[rid]) {
            latestCheckoutByRoom[rid] = co;
        }
    }

    // Get active bookings that overlap
    const { data: activeBookings } = await supabase
        .from("bookings")
        .select("room_id, check_out_time")
        .eq("hotel_id", hotelId)
        .eq("status", "active")
        .lt("check_in_time", checkOut)
        .gt("check_out_time", checkIn);

    for (const b of activeBookings || []) {
        bookedRoomIds.add(b.room_id);
        // Also track checkout from bookings (check_out_time is a timestamp, extract date)
        const co = (b as any).check_out_time?.split("T")[0] || (b as any).check_out_time;
        if (co && (!latestCheckoutByRoom[b.room_id] || co > latestCheckoutByRoom[b.room_id])) {
            latestCheckoutByRoom[b.room_id] = co;
        }
    }

    // Filter available rooms
    const available = (allRooms || []).filter((r) => !bookedRoomIds.has(r.id));

    // Group by room type
    const byType: Record<
        string,
        { room_type: string; available: number; rate_from: number; rooms: { id: string; room_number: string; rate: number }[] }
    > = {};

    for (const room of available) {
        if (!byType[room.room_type]) {
            byType[room.room_type] = {
                room_type: room.room_type,
                available: 0,
                rate_from: room.night_rate,
                rooms: [],
            };
        }
        byType[room.room_type].available++;
        byType[room.room_type].rate_from = Math.min(
            byType[room.room_type].rate_from,
            room.night_rate
        );
        byType[room.room_type].rooms.push({
            id: room.id,
            room_number: room.room_number,
            rate: room.night_rate,
        });
    }

    const nights = Math.ceil(
        (coDate.getTime() - ciDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // --- Room type filter handling ---
    let requestedTypeAvailable = true;
    let alternatives: { room_type: string; available: number; rate_from: number }[] | undefined;

    if (roomType) {
        // Check if the requested type has availability
        const requestedTypeLower = roomType.toLowerCase();
        const matchedType = Object.keys(byType).find(
            (t) => t.toLowerCase() === requestedTypeLower || t.toLowerCase().includes(requestedTypeLower) || requestedTypeLower.includes(t.toLowerCase())
        );

        if (!matchedType || byType[matchedType].available === 0) {
            requestedTypeAvailable = false;
            // Build alternatives — other available room types
            alternatives = Object.values(byType)
                .filter((t) => t.available > 0)
                .map((t) => ({
                    room_type: t.room_type,
                    available: t.available,
                    rate_from: t.rate_from,
                }));
        }
    }

    // --- Room number filter handling ---
    let requestedRoomAvailable: boolean | undefined;
    let requestedRoomInfo: { room_number: string; room_type: string; rate: number } | undefined;
    let nextAvailable: string | undefined;

    if (roomNumber) {
        const roomNumLower = roomNumber.toLowerCase();
        // Find the room in all rooms (not just available)
        const matchedRoom = (allRooms || []).find(
            (r: any) => r.room_number.toLowerCase() === roomNumLower
        );

        if (!matchedRoom) {
            // Room number doesn't exist at this hotel
            requestedRoomAvailable = undefined; // unknown room
        } else {
            requestedRoomInfo = {
                room_number: matchedRoom.room_number,
                room_type: matchedRoom.room_type,
                rate: matchedRoom.night_rate,
            };
            // Check if this specific room is in the available list
            requestedRoomAvailable = available.some((r: any) => r.id === matchedRoom.id);

            if (!requestedRoomAvailable) {
                // Calculate next_available: day AFTER latest checkout (allows cleaning time)
                const latestCO = latestCheckoutByRoom[matchedRoom.id];
                if (latestCO) {
                    const coDate2 = new Date(latestCO);
                    coDate2.setDate(coDate2.getDate() + 1); // +1 day for cleaning
                    nextAvailable = coDate2.toISOString().split("T")[0];
                }

                if (!alternatives) {
                    // Build alternatives — other available rooms
                    alternatives = Object.values(byType)
                        .filter((t) => t.available > 0)
                        .map((t) => ({
                            room_type: t.room_type,
                            available: t.available,
                            rate_from: t.rate_from,
                        }));
                }
            }
        }
    }

    // --- Log the availability check to DB (fire-and-forget) ---
    supabase.from("availability_checks").insert({
        hotel_id: hotelId,
        check_in: checkIn,
        check_out: checkOut,
        room_type_requested: roomType || roomNumber || null,
        rooms_found: available.length,
        requested_type_available: roomNumber ? (requestedRoomAvailable ?? false) : requestedTypeAvailable,
        alternatives_shown: alternatives !== undefined && alternatives.length > 0,
        ip_address: ipAddress || null,
    }).then(() => { }).catch((err: any) => console.warn("Failed to log availability check:", err));

    // Build response
    const response: Record<string, unknown> = {
        check_in: checkIn,
        check_out: checkOut,
        nights,
        total_available: available.length,
        availability: Object.values(byType),
    };

    if (roomType) {
        response.requested_room_type = roomType;
        response.requested_type_available = requestedTypeAvailable;
        if (alternatives) {
            response.alternatives = alternatives;
        }
    }

    if (roomNumber) {
        response.requested_room_number = roomNumber;
        if (requestedRoomAvailable === undefined) {
            response.requested_room_found = false;
            response.requested_room_available = false;
            response.message = `Room "${roomNumber}" was not found at this hotel`;
        } else {
            response.requested_room_found = true;
            response.requested_room_available = requestedRoomAvailable;
            response.requested_room = requestedRoomInfo;
            if (!requestedRoomAvailable) {
                if (nextAvailable) {
                    response.next_available = nextAvailable;
                    response.message = `Room "${roomNumber}" (${requestedRoomInfo?.room_type}) is booked for these dates. Next available: ${nextAvailable}`;
                } else {
                    response.message = `Room "${roomNumber}" (${requestedRoomInfo?.room_type}) is booked for these dates`;
                }
                if (alternatives && alternatives.length > 0) {
                    response.alternatives = alternatives;
                }
            }
        }
    }

    return json(response);
}

async function handleCreateReservation(
    supabase: ReturnType<typeof createClient>,
    hotelId: string,
    body: {
        guest_name: string;
        guest_email?: string;
        guest_phone?: string;
        room_id: string;
        check_in: string;
        check_out: string;
        notes?: string;
    }
) {
    // Validate required fields
    if (!body.guest_name || !body.room_id || !body.check_in || !body.check_out) {
        return error(
            "guest_name, room_id, check_in, and check_out are required"
        );
    }

    const ciDate = new Date(body.check_in);
    const coDate = new Date(body.check_out);
    if (isNaN(ciDate.getTime()) || isNaN(coDate.getTime())) {
        return error("Invalid date format. Use YYYY-MM-DD");
    }
    if (coDate <= ciDate) {
        return error("check_out must be after check_in");
    }

    // Verify room exists and belongs to this hotel
    const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .select("id, room_number, room_type, night_rate")
        .eq("id", body.room_id)
        .eq("hotel_id", hotelId)
        .single();

    if (roomErr || !room) return error("Room not found", 404);

    // Check room is available for dates
    const { data: conflicts } = await supabase
        .from("reservations")
        .select("id")
        .eq("room_id", body.room_id)
        .in("status", ["confirmed", "pending", "checked_in"])
        .lt("check_in_date", body.check_out)
        .gt("check_out_date", body.check_in)
        .limit(1);

    if (conflicts && conflicts.length > 0) {
        return error("Room is not available for the selected dates", 409);
    }

    const nights = Math.ceil(
        (coDate.getTime() - ciDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const totalAmount = room.night_rate * nights;

    // Create or find guest
    let guestId: string;
    if (body.guest_email) {
        const { data: existingGuest } = await supabase
            .from("guests")
            .select("id")
            .eq("hotel_id", hotelId)
            .eq("email", body.guest_email)
            .limit(1);

        if (existingGuest && existingGuest.length > 0) {
            guestId = existingGuest[0].id;
        } else {
            const { data: newGuest, error: guestErr } = await supabase
                .from("guests")
                .insert({
                    hotel_id: hotelId,
                    name: body.guest_name,
                    email: body.guest_email,
                    phone: body.guest_phone || null,
                })
                .select("id")
                .single();

            if (guestErr || !newGuest) return error("Failed to create guest", 500);
            guestId = newGuest.id;
        }
    } else {
        const { data: newGuest, error: guestErr } = await supabase
            .from("guests")
            .insert({
                hotel_id: hotelId,
                name: body.guest_name,
                phone: body.guest_phone || null,
            })
            .select("id")
            .single();

        if (guestErr || !newGuest) return error("Failed to create guest", 500);
        guestId = newGuest.id;
    }

    // Create reservation
    const { data: reservation, error: resErr } = await supabase
        .from("reservations")
        .insert({
            hotel_id: hotelId,
            guest_id: guestId,
            room_id: body.room_id,
            check_in_date: body.check_in,
            check_out_date: body.check_out,
            nights,
            total_amount: totalAmount,
            status: "pending",
            source: "direct",
            notes: body.notes || null,
        })
        .select("id, status, total_amount, check_in_date, check_out_date")
        .single();

    if (resErr || !reservation) return error("Failed to create reservation", 500);

    // Fire-and-forget: send confirmation email
    if (body.guest_email) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        fetch(`${supabaseUrl}/functions/v1/send-confirmation`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
                reservation_id: reservation.id,
                hotel_id: hotelId,
            }),
        }).catch((err) => console.warn("Failed to trigger confirmation email:", err));
    }

    return json(
        {
            reservation: {
                id: reservation.id,
                status: reservation.status,
                room: {
                    number: room.room_number,
                    type: room.room_type,
                    rate_per_night: room.night_rate,
                },
                guest_name: body.guest_name,
                check_in: reservation.check_in_date,
                check_out: reservation.check_out_date,
                nights,
                total_amount: reservation.total_amount,
                message:
                    "Reservation created. You will receive a confirmation email shortly.",
            },
        },
        201
    );
}

async function handleReservationStatus(
    supabase: ReturnType<typeof createClient>,
    hotelId: string,
    reservationId: string
) {
    if (!reservationId) return error("reservation_id is required");

    const { data, error: err } = await supabase
        .from("reservations")
        .select(
            `id, status, check_in_date, check_out_date, nights, total_amount, deposit_paid, source,
       guests!inner(name, email, phone),
       rooms!inner(room_number, room_type)`
        )
        .eq("id", reservationId)
        .eq("hotel_id", hotelId)
        .single();

    if (err || !data) return error("Reservation not found", 404);

    return json({
        reservation: {
            id: data.id,
            status: data.status,
            check_in: data.check_in_date,
            check_out: data.check_out_date,
            nights: data.nights,
            total_amount: data.total_amount,
            deposit_paid: data.deposit_paid,
            balance: data.total_amount - data.deposit_paid,
            guest: {
                name: (data.guests as any).name,
                email: (data.guests as any).email,
            },
            room: {
                number: (data.rooms as any).room_number,
                type: (data.rooms as any).room_type,
            },
        },
    });
}

// ------------------------------------------------------------------
// Rate Limiting (simple in-memory, per-IP)
// ------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per minute
const RATE_WINDOW = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
        return true;
    }

    entry.count++;
    return entry.count <= RATE_LIMIT;
}

// ------------------------------------------------------------------
// Main Router
// ------------------------------------------------------------------

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Rate limiting
    const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("cf-connecting-ip") ||
        "unknown";
    if (!checkRateLimit(ip)) {
        return error("Rate limit exceeded. Max 60 requests per minute.", 429);
    }

    try {
        const url = new URL(req.url);
        const action = url.searchParams.get("action");
        const hotelId = url.searchParams.get("hotel_id");

        if (!action) return error("Missing 'action' query parameter");

        const supabase = getSupabaseAdmin();

        // ---- READ endpoints (require hotel_id in query, no auth) ----
        if (req.method === "GET") {
            if (!hotelId) return error("Missing 'hotel_id' query parameter");

            switch (action) {
                case "hotel-info":
                    return handleHotelInfo(supabase, hotelId);

                case "room-types":
                    return handleRoomTypes(supabase, hotelId);

                case "availability":
                    return handleAvailability(
                        supabase,
                        hotelId,
                        url.searchParams.get("check_in") || "",
                        url.searchParams.get("check_out") || "",
                        url.searchParams.get("room_type") || undefined,
                        url.searchParams.get("room_number") || undefined,
                        ip
                    );

                case "reservation-status": {
                    const resId = url.searchParams.get("reservation_id");
                    if (!resId) return error("Missing 'reservation_id' query parameter");
                    return handleReservationStatus(supabase, hotelId, resId);
                }

                default:
                    return error(`Unknown action: ${action}`, 404);
            }
        }

        // ---- WRITE endpoints (require API key) ----
        if (req.method === "POST") {
            const body = await req.json().catch(() => null);
            if (!body) return error("Invalid JSON body");

            // Get API key from header or body
            const apiKey =
                req.headers.get("X-API-Key") || body.api_key;
            if (!apiKey) return error("API key required (X-API-Key header or api_key in body)", 401);

            // Validate API key and get hotel_id
            const validatedHotelId = await validateApiKey(supabase, apiKey);
            if (!validatedHotelId) return error("Invalid or inactive API key", 403);

            switch (action) {
                case "create-reservation":
                    return handleCreateReservation(supabase, validatedHotelId, body);

                default:
                    return error(`Unknown action: ${action}`, 404);
            }
        }

        return error("Method not allowed", 405);
    } catch (err) {
        console.error("API error:", err);
        return error("Internal server error", 500);
    }
});
