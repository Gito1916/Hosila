/**
 * Reservation operations — Supabase implementation
 * Replaces old Dexie-based reservation queries with Supabase API calls.
 */

import { v4 as uuidv4 } from 'uuid';
import { requireSupabase, getHotelId } from '@/lib/api';
import { findOrCreateGuest } from './bookings';
import type { Reservation, ReservationStatus, ReservationSource } from '@/types';
import { differenceInDays, startOfDay, endOfDay } from 'date-fns';

// Get all reservations
export async function getAllReservations(): Promise<Reservation[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('reservations').select('*').eq('hotel_id', hotelId).order('check_in_date');
    if (error) throw error;
    return data ?? [];
}

// Get reservations by status
export async function getReservationsByStatus(status: ReservationStatus): Promise<Reservation[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('reservations').select('*').eq('hotel_id', hotelId).eq('status', status);
    if (error) throw error;
    return data ?? [];
}

// Get upcoming reservations (confirmed, arriving in future)
export async function getUpcomingReservations(): Promise<Reservation[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const today = startOfDay(new Date()).toISOString();

    const { data, error } = await sb.from('reservations')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('status', 'confirmed')
        .gte('check_in_date', today)
        .order('check_in_date');
    if (error) throw error;
    return data ?? [];
}

// Get today's arrivals
export async function getTodaysArrivals(): Promise<Reservation[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const todayStart = startOfDay(new Date()).toISOString();
    const todayEnd = endOfDay(new Date()).toISOString();

    const { data, error } = await sb.from('reservations')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('status', 'confirmed')
        .gte('check_in_date', todayStart)
        .lte('check_in_date', todayEnd);
    if (error) throw error;
    return data ?? [];
}

// Get reservation by ID
export async function getReservationById(id: string): Promise<Reservation | undefined> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('reservations').select('*').eq('id', id).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Check for conflicting reservations
export async function checkConflicts(
    roomId: string,
    checkInDate: Date,
    checkOutDate: Date,
    excludeReservationId?: string
): Promise<Reservation[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data, error } = await sb.from('reservations')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('room_id', roomId)
        .neq('status', 'cancelled');
    if (error) throw error;

    return (data ?? []).filter(r => {
        if (excludeReservationId && r.id === excludeReservationId) return false;

        const resCheckIn = new Date(r.check_in_date);
        const resCheckOut = new Date(r.check_out_date);

        // Check for overlap
        return checkInDate < resCheckOut && checkOutDate > resCheckIn;
    });
}

// Create new reservation
export async function createReservation(data: {
    guestName: string;
    guestPhone?: string;
    guestEmail?: string;
    guestGender?: 'male' | 'female' | 'other';
    guestIdType?: string;
    guestIdNumber?: string;
    vehicleNumber?: string;
    vehicleModel?: string;
    roomId: string;
    checkInDate: Date;
    checkOutDate: Date;
    source: ReservationSource;
    depositPaid: number;
    notes?: string;
    createdBy: string;
    existingGuestId?: string;
}): Promise<Reservation> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date();
    const nowIso = now.toISOString();

    // Check for conflicts
    const conflicts = await checkConflicts(data.roomId, data.checkInDate, data.checkOutDate);
    if (conflicts.length > 0) {
        throw new Error('Room is not available for the selected dates');
    }

    // Get or create guest
    let guestId: string;
    if (data.existingGuestId) {
        guestId = data.existingGuestId;
        // Update existing guest with new info
        await sb.from('guests').update({
            email: data.guestEmail,
            gender: data.guestGender,
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
            vehicle_number: data.vehicleNumber,
            vehicle_model: data.vehicleModel,
        });
        guestId = guest.id;
    }

    // Get room to calculate rate
    const { data: room, error: roomErr } = await sb.from('rooms').select('*').eq('id', data.roomId).single();
    if (roomErr || !room) throw new Error('Room not found');

    const nights = differenceInDays(data.checkOutDate, data.checkInDate);
    const totalAmount = room.night_rate * nights;

    const reservation = {
        id: uuidv4(),
        hotel_id: hotelId,
        guest_id: guestId,
        room_id: data.roomId,
        check_in_date: data.checkInDate.toISOString(),
        check_out_date: data.checkOutDate.toISOString(),
        nights,
        total_amount: totalAmount,
        deposit_paid: data.depositPaid,
        status: 'confirmed',
        source: data.source,
        notes: data.notes,
        created_at: nowIso,
        updated_at: nowIso,
    };

    const { error: insertErr } = await sb.from('reservations').insert(reservation);
    if (insertErr) throw insertErr;

    // Log audit
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: data.createdBy,
        action: 'create_reservation',
        entity_type: 'reservation',
        entity_id: reservation.id,
        details: {
            guest_name: data.guestName,
            room_id: data.roomId,
            check_in: data.checkInDate.toISOString(),
            check_out: data.checkOutDate.toISOString(),
        },
        timestamp: nowIso,
    });

    return reservation as unknown as Reservation;
}

// Update reservation
export async function updateReservation(
    id: string,
    data: Partial<{
        roomId: string;
        checkInDate: Date;
        checkOutDate: Date;
        depositPaid: number;
        notes: string;
        status: ReservationStatus;
    }>,
    userId: string
): Promise<void> {
    const sb = requireSupabase();
    const reservation = await getReservationById(id);
    if (!reservation) throw new Error('Reservation not found');

    // If changing room or dates, check for conflicts
    if (data.roomId || data.checkInDate || data.checkOutDate) {
        const roomId = data.roomId ?? reservation.room_id;
        const checkIn = data.checkInDate ?? new Date(reservation.check_in_date);
        const checkOut = data.checkOutDate ?? new Date(reservation.check_out_date);

        const conflicts = await checkConflicts(roomId, checkIn, checkOut, id);
        if (conflicts.length > 0) {
            throw new Error('Room is not available for the selected dates');
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
        updated_at: new Date().toISOString(),
    };

    if (data.roomId) updates.room_id = data.roomId;
    if (data.checkInDate) {
        updates.check_in_date = data.checkInDate.toISOString();
        const checkOut = data.checkOutDate ?? new Date(reservation.check_out_date);
        updates.nights = differenceInDays(checkOut, data.checkInDate);
    }
    if (data.checkOutDate) {
        updates.check_out_date = data.checkOutDate.toISOString();
        const checkIn = data.checkInDate ?? new Date(reservation.check_in_date);
        updates.nights = differenceInDays(data.checkOutDate, checkIn);
    }
    if (data.depositPaid !== undefined) updates.deposit_paid = data.depositPaid;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.status) updates.status = data.status;

    const { error } = await sb.from('reservations').update(updates).eq('id', id);
    if (error) throw error;

    // Log audit
    const hotelId = await getHotelId();
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: userId,
        action: 'update_reservation',
        entity_type: 'reservation',
        entity_id: id,
        details: { updates: data },
        timestamp: new Date().toISOString(),
    });
}

// Cancel reservation
export async function cancelReservation(id: string, reason: string, userId: string): Promise<void> {
    const sb = requireSupabase();
    const reservation = await getReservationById(id);
    if (!reservation) throw new Error('Reservation not found');

    const { error } = await sb.from('reservations').update({
        status: 'cancelled',
        notes: reservation.notes
            ? `${reservation.notes}\n\nCancelled: ${reason}`
            : `Cancelled: ${reason}`,
        updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;

    // Log audit
    const hotelId = await getHotelId();
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: userId,
        action: 'cancel_reservation',
        entity_type: 'reservation',
        entity_id: id,
        details: { reason },
        timestamp: new Date().toISOString(),
    });
}

// Convert reservation to booking (check-in)
export async function markReservationCheckedIn(id: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('reservations').update({
        status: 'checked_in',
        updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
}

// Get reservations for a specific date range
export async function getReservationsInRange(startDate: Date, endDate: Date): Promise<Reservation[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data, error } = await sb.from('reservations')
        .select('*')
        .eq('hotel_id', hotelId)
        .neq('status', 'cancelled');
    if (error) throw error;

    return (data ?? []).filter(r => {
        const checkIn = new Date(r.check_in_date);
        const checkOut = new Date(r.check_out_date);

        // Include if reservation overlaps with date range
        return checkIn <= endDate && checkOut >= startDate;
    });
}
