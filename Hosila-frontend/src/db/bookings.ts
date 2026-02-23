/**
 * Booking operations — Supabase implementation
 * Replaces old Dexie-based booking queries with Supabase API calls.
 */

import { v4 as uuidv4 } from 'uuid';
import { requireSupabase, getHotelId } from '@/lib/api';
import { updateRoomStatus } from './rooms';
import type { Booking, BookingType, Guest } from '@/types';
import { addHours, addDays, setHours, setMinutes } from 'date-fns';

// Get all active bookings
export async function getActiveBookings(): Promise<Booking[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('bookings').select('*').eq('hotel_id', hotelId).eq('status', 'active');
    if (error) throw error;
    return data ?? [];
}

// Get all bookings (any status)
export async function getAllBookings(): Promise<Booking[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('bookings').select('*').eq('hotel_id', hotelId);
    if (error) throw error;
    return data ?? [];
}

// Get all payments
export async function getAllPayments() {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('payments').select('*').eq('hotel_id', hotelId);
    if (error) throw error;
    return data ?? [];
}

// Get booking by ID
export async function getBookingById(id: string): Promise<Booking | undefined> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('bookings').select('*').eq('id', id).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Get active booking for a room
export async function getActiveBookingForRoom(roomId: string): Promise<Booking | undefined> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('bookings').select('*').eq('room_id', roomId).eq('status', 'active').limit(1).maybeSingle();
    if (error) return undefined;
    return data ?? undefined;
}

// Get bookings for a guest
export async function getBookingsForGuest(guestId: string): Promise<Booking[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('bookings').select('*').eq('guest_id', guestId);
    if (error) throw error;
    return data ?? [];
}

// Create or get existing guest
export async function findOrCreateGuest(data: {
    name: string;
    phone?: string;
    email?: string;
    gender?: 'male' | 'female' | 'other';
    id_type?: string;
    id_number?: string;
    occupation?: string;
    reason_for_visit?: 'business' | 'leisure' | 'medical' | 'family_event' | 'transit' | 'other';
    vehicle_number?: string;
    vehicle_model?: string;
}): Promise<Guest> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    // Try to find existing guest by phone AND name match
    if (data.phone) {
        const { data: existing } = await sb.from('guests')
            .select('*')
            .eq('hotel_id', hotelId)
            .eq('phone', data.phone)
            .ilike('name', data.name)
            .limit(1)
            .maybeSingle();

        if (existing) {
            // Same person returning — update their details (but not name)
            await sb.from('guests').update({
                email: data.email,
                gender: data.gender,
                id_type: data.id_type,
                id_number: data.id_number,
                occupation: data.occupation,
                reason_for_visit: data.reason_for_visit,
                vehicle_number: data.vehicle_number,
                vehicle_model: data.vehicle_model,
                updated_at: new Date().toISOString(),
            }).eq('id', existing.id);
            return existing as Guest;
        }
    }

    // Create new guest
    const now = new Date().toISOString();
    const guest = {
        id: uuidv4(),
        hotel_id: hotelId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        gender: data.gender,
        id_type: data.id_type,
        id_number: data.id_number,
        occupation: data.occupation,
        reason_for_visit: data.reason_for_visit,
        vehicle_number: data.vehicle_number,
        vehicle_model: data.vehicle_model,
        created_at: now,
        updated_at: now,
    };

    const { data: created, error } = await sb.from('guests').insert(guest).select().single();
    if (error) throw error;
    return created as Guest;
}



// Check in a guest
export async function checkIn(data: {
    roomId: string;
    guestName: string;
    guestPhone?: string;
    guestEmail?: string;
    guestGender?: 'male' | 'female' | 'other';
    guestIdType?: string;
    guestIdNumber?: string;
    guestOccupation?: string;
    guestReasonForVisit?: 'business' | 'leisure' | 'medical' | 'family_event' | 'transit' | 'other';
    vehicleNumber?: string;
    vehicleModel?: string;
    bookingType: BookingType;
    numGuests: number;
    numNights?: number; // For night stays
    rate: number;
    totalWithTax?: number; // Tax-inclusive total for correct folio calculation
    durationHours?: number; // For short rest
    paymentMethod: 'cash' | 'transfer' | 'pos';
    amountPaid: number;
    createdBy: string;
    existingGuestId?: string; // Use existing guest from Guest Directory
}): Promise<Booking> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date();
    const nowIso = now.toISOString();

    // Use existing guest if ID provided, otherwise create/find
    let guestId: string;
    if (data.existingGuestId) {
        guestId = data.existingGuestId;
        // Also update existing guest with new info if provided
        await sb.from('guests').update({
            email: data.guestEmail,
            gender: data.guestGender,
            occupation: data.guestOccupation,
            reason_for_visit: data.guestReasonForVisit,
            vehicle_number: data.vehicleNumber,
            vehicle_model: data.vehicleModel,
            updated_at: nowIso,
        }).eq('id', data.existingGuestId);
    } else {
        const guest = await findOrCreateGuest({
            name: data.guestName,
            phone: data.guestPhone,
            email: data.guestEmail,
            gender: data.guestGender,
            id_type: data.guestIdType,
            id_number: data.guestIdNumber,
            occupation: data.guestOccupation,
            reason_for_visit: data.guestReasonForVisit,
            vehicle_number: data.vehicleNumber,
            vehicle_model: data.vehicleModel,
        });
        guestId = guest.id;
    }

    // Calculate checkout time
    let plannedCheckout: Date;
    if (data.bookingType === 'short_rest' && data.durationHours) {
        plannedCheckout = addHours(now, data.durationHours);
    } else {
        // Night stay - checkout at noon after numNights
        const nights = data.numNights ?? 1;
        plannedCheckout = addDays(now, nights);
        plannedCheckout = setMinutes(setHours(plannedCheckout, 12), 0); // Noon
    }

    // Coerce all financial values to Number — API responses (Pydantic Decimal)
    // and react-hook-form setValue() can pass strings, causing JS string
    // concatenation instead of arithmetic (e.g. "3525.00" + "2643.75" → "3525.002643.75").
    const totalCharged = Number(data.totalWithTax ?? data.rate);
    const amountPaid = Number(data.amountPaid);
    const rate = Number(data.rate);

    // Create booking
    const booking = {
        id: uuidv4(),
        hotel_id: hotelId,
        guest_id: guestId,
        room_id: data.roomId,
        booking_type: data.bookingType,
        check_in_time: nowIso,
        check_out_time: plannedCheckout.toISOString(),
        planned_checkout: plannedCheckout.toISOString(),
        num_guests: data.numGuests,
        rate: rate,
        duration_hours: data.durationHours,
        total_charged: totalCharged,
        total_paid: amountPaid,
        balance: totalCharged - amountPaid,
        status: 'active',
        created_by: data.createdBy,
        created_at: nowIso,
        updated_at: nowIso,
    };

    const { error: bookingErr } = await sb.from('bookings').insert(booking);
    if (bookingErr) throw bookingErr;

    // === ACCOUNTING v2: Create accommodation charge ===
    const { data: room } = await sb.from('rooms').select('room_number').eq('id', data.roomId).single();
    const roomNumber = room?.room_number ?? 'Unknown';
    const { data: hotel } = await sb.from('hotels').select('settings').limit(1).single();
    const taxRate = hotel?.settings?.accommodation_tax_rate ?? hotel?.settings?.tax_rate ?? 0;

    const { createCharge, createPaymentWithAllocation } = await import('./accounting');

    const typeLabel = data.bookingType === 'short_rest'
        ? `Short Rest (${data.durationHours}hr)`
        : `Night Stay (${data.numNights ?? 1} night${(data.numNights ?? 1) > 1 ? 's' : ''})`;

    await createCharge({
        guest_id: guestId,
        booking_id: booking.id,
        department: 'accommodation',
        description: `Room ${roomNumber} – ${typeLabel}`,
        gross_amount: totalCharged,
        tax_rate: Number(taxRate),
        reference_id: booking.id,
        reference_type: 'room',
        charge_date: now,
    });

    // Record payment via FIFO allocation if any
    if (amountPaid > 0) {
        await createPaymentWithAllocation({
            booking_id: booking.id,
            guest_id: guestId,
            amount: amountPaid,
            payment_method: data.paymentMethod,
            received_by: data.createdBy,
            notes: `Check-in payment – Room ${roomNumber}`,
        });
    }

    // Update room status
    const newStatus = data.bookingType === 'short_rest' ? 'short_rest' : 'occupied';
    await updateRoomStatus(data.roomId, newStatus);

    // Log audit
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: data.createdBy,
        action: 'check_in',
        entity_type: 'booking',
        entity_id: booking.id,
        details: {
            room_id: data.roomId,
            guest_name: data.guestName,
            booking_type: data.bookingType,
            rate: data.rate,
        },
        timestamp: nowIso,
    });

    return booking as unknown as Booking;
}

// Extend short rest
export async function extendShortRest(
    bookingId: string,
    additionalHours: number,
    additionalRate: number,
    userId: string
): Promise<void> {
    const sb = requireSupabase();
    const booking = await getBookingById(bookingId);
    if (!booking || booking.status !== 'active' || booking.booking_type !== 'short_rest') {
        throw new Error('Invalid booking for extension');
    }

    const hotelId = await getHotelId();
    const now = new Date();
    const nowIso = now.toISOString();
    const newCheckout = addHours(new Date(booking.planned_checkout), additionalHours);
    const newTotalCharged = Number(booking.total_charged) + Number(additionalRate);
    const newBalance = newTotalCharged - Number(booking.total_paid);

    // Get room number for description
    const { data: room } = await sb.from('rooms').select('room_number').eq('id', booking.room_id).single();
    const roomNumber = room?.room_number ?? '?';

    await sb.from('bookings').update({
        planned_checkout: newCheckout.toISOString(),
        duration_hours: (booking.duration_hours ?? 0) + additionalHours,
        total_charged: newTotalCharged,
        balance: newBalance,
        updated_at: nowIso,
    }).eq('id', bookingId);

    // Get tax settings
    const { data: hotel } = await sb.from('hotels').select('settings').limit(1).single();
    const taxRate = hotel?.settings?.accommodation_tax_rate ?? hotel?.settings?.tax_rate ?? 0;

    const extensionDescription = `Room ${roomNumber} extension: +${additionalHours}hr`;

    // Create service order for folio display
    const orderNumber = `${now.getDate().toString().padStart(2, '0')}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getFullYear()}-EXT`;
    await sb.from('service_orders').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        booking_id: bookingId,
        service_id: 'extension',
        quantity: additionalHours,
        unit_price: additionalRate / additionalHours,
        total_price: additionalRate,
        status: 'delivered',
        ordered_at: nowIso,
        delivered_at: nowIso,
        created_by: userId,
        notes: extensionDescription,
        order_number: orderNumber,
        created_at: nowIso,
    });

    // === ACCOUNTING v2: Create extension charge ===
    const { createCharge } = await import('./accounting');
    await createCharge({
        guest_id: booking.guest_id,
        booking_id: bookingId,
        department: 'accommodation',
        description: extensionDescription,
        gross_amount: additionalRate,
        tax_rate: taxRate,
        reference_id: bookingId,
        reference_type: 'extension',
        charge_date: now,
    });

    // Log audit
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: userId,
        action: 'extend_short_rest',
        entity_type: 'booking',
        entity_id: bookingId,
        details: {
            additional_hours: additionalHours,
            additional_rate: additionalRate,
        },
        timestamp: nowIso,
    });
}

// Extend night stay
export async function extendNightStay(
    bookingId: string,
    additionalNights: number,
    additionalRate: number,
    userId: string
): Promise<void> {
    const sb = requireSupabase();
    const booking = await getBookingById(bookingId);
    if (!booking || booking.status !== 'active' || booking.booking_type !== 'night') {
        throw new Error('Invalid booking for extension');
    }

    const hotelId = await getHotelId();
    const now = new Date();
    const nowIso = now.toISOString();
    const newCheckout = addDays(new Date(booking.planned_checkout), additionalNights);
    const newTotalCharged = Number(booking.total_charged) + Number(additionalRate);
    const newBalance = newTotalCharged - Number(booking.total_paid);

    // Get room number for description
    const { data: room } = await sb.from('rooms').select('room_number').eq('id', booking.room_id).single();
    const roomNumber = room?.room_number ?? '?';

    await sb.from('bookings').update({
        planned_checkout: newCheckout.toISOString(),
        total_charged: newTotalCharged,
        balance: newBalance,
        updated_at: nowIso,
    }).eq('id', bookingId);

    // Get tax settings
    const { data: hotel } = await sb.from('hotels').select('settings').limit(1).single();
    const taxRate = hotel?.settings?.accommodation_tax_rate ?? hotel?.settings?.tax_rate ?? 0;

    const extensionDescription = `Room ${roomNumber} extension: +${additionalNights} night${additionalNights > 1 ? 's' : ''}`;

    // Create service order for folio display
    const orderNumber = `${now.getDate().toString().padStart(2, '0')}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getFullYear()}-EXT`;
    await sb.from('service_orders').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        booking_id: bookingId,
        service_id: 'extension',
        quantity: additionalNights,
        unit_price: additionalRate / additionalNights,
        total_price: additionalRate,
        status: 'delivered',
        ordered_at: nowIso,
        delivered_at: nowIso,
        created_by: userId,
        notes: extensionDescription,
        order_number: orderNumber,
        created_at: nowIso,
    });

    // === ACCOUNTING v2: Create extension charge ===
    const { createCharge } = await import('./accounting');
    await createCharge({
        guest_id: booking.guest_id,
        booking_id: bookingId,
        department: 'accommodation',
        description: extensionDescription,
        gross_amount: additionalRate,
        tax_rate: taxRate,
        reference_id: bookingId,
        reference_type: 'extension',
        charge_date: now,
    });

    // Log audit
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: userId,
        action: 'extend_night_stay',
        entity_type: 'booking',
        entity_id: bookingId,
        details: {
            additional_nights: additionalNights,
            additional_rate: additionalRate,
            new_checkout: newCheckout.toISOString(),
        },
        timestamp: nowIso,
    });
}

// Check out a guest
export async function checkOut(
    bookingId: string,
    userId: string
): Promise<void> {
    const sb = requireSupabase();
    const booking = await getBookingById(bookingId);
    if (!booking || booking.status !== 'active') {
        throw new Error('Invalid booking for checkout');
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Update booking
    await sb.from('bookings').update({
        status: 'checked_out',
        actual_checkout: nowIso,
        check_out_time: nowIso,
        updated_at: nowIso,
    }).eq('id', bookingId);

    // Update room status to dirty
    await updateRoomStatus(booking.room_id, 'dirty');

    // Log audit
    const hotelId = await getHotelId();
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: userId,
        action: 'check_out',
        entity_type: 'booking',
        entity_id: bookingId,
        details: {
            room_id: booking.room_id,
            total_charged: booking.total_charged,
            total_paid: booking.total_paid,
        },
        timestamp: nowIso,
    });
}

// Record payment for booking — uses FIFO allocation to correctly attribute to departments
export async function recordPayment(
    bookingId: string,
    amount: number,
    method: 'cash' | 'transfer' | 'pos',
    userId: string,
    reference?: string
): Promise<string> {
    const sb = requireSupabase();
    const booking = await getBookingById(bookingId);
    if (!booking) {
        throw new Error('Booking not found');
    }

    const now = new Date().toISOString();

    // === ACCOUNTING v2: Create payment with FIFO allocation ===
    const { data: room } = await sb.from('rooms').select('room_number').eq('id', booking.room_id).single();
    const { createPaymentWithAllocation, getBookingBalance } = await import('./accounting');

    const paymentId = await createPaymentWithAllocation({
        booking_id: bookingId,
        guest_id: booking.guest_id,
        amount,
        payment_method: method,
        payment_reference: reference,
        received_by: userId,
        notes: `Payment – Room ${room?.room_number ?? '?'}`,
    });

    // Update booking totals from the accounting engine's balance
    const balance = await getBookingBalance(bookingId);
    await sb.from('bookings').update({
        total_paid: balance.totalPaid,
        total_charged: balance.totalCharges,
        balance: balance.balance,
        updated_at: now,
    }).eq('id', bookingId);

    return paymentId;
}

// Get bookings checking out today
export async function getCheckoutsToday(): Promise<Booking[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date();
    const endOfDayDate = addDays(new Date(now.setHours(0, 0, 0, 0)), 1);

    const { data, error } = await sb.from('bookings')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('status', 'active');
    if (error) throw error;

    return (data ?? []).filter((b: any) => new Date(b.planned_checkout) <= endOfDayDate);
}

// Get short rest bookings expiring soon (within 30 minutes)
export async function getExpiringShortRests(): Promise<Booking[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date();
    const soon = addHours(now, 0.5); // 30 minutes

    const { data, error } = await sb.from('bookings')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('status', 'active');
    if (error) throw error;

    return (data ?? []).filter(
        (b: any) => b.booking_type === 'short_rest' && new Date(b.planned_checkout) <= soon
    );
}
