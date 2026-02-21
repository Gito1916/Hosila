/**
 * Guest operations — Supabase implementation
 * Replaces old Dexie-based guest queries with Supabase API calls.
 */

import { v4 as uuidv4 } from 'uuid';
import { requireSupabase, getHotelId } from '@/lib/api';
import type { Guest, IdType } from '@/types';

// Get all guests
export async function getAllGuests(): Promise<Guest[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('guests').select('*').eq('hotel_id', hotelId).order('name');
    if (error) throw error;
    return data ?? [];
}

// Get guest by ID
export async function getGuestById(id: string): Promise<Guest | undefined> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('guests').select('*').eq('id', id).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Search guests by name or phone
export async function searchGuests(query: string): Promise<Guest[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const lowerQuery = query.toLowerCase();

    // Supabase doesn't support complex OR filters easily with case-insensitive,
    // so we fetch all and filter client-side (same approach as original)
    const { data, error } = await sb.from('guests').select('*').eq('hotel_id', hotelId);
    if (error) throw error;

    return (data ?? []).filter(g =>
        g.name.toLowerCase().includes(lowerQuery) ||
        (g.phone && g.phone.includes(query)) ||
        (g.email && g.email.toLowerCase().includes(lowerQuery))
    );
}

// Get guest by phone
export async function getGuestByPhone(phone: string): Promise<Guest | undefined> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('guests').select('*').eq('hotel_id', hotelId).eq('phone', phone).limit(1).maybeSingle();
    if (error) return undefined;
    return data ?? undefined;
}

// Create new guest
export async function createGuest(data: {
    name: string;
    phone?: string;
    email?: string;
    idType?: IdType;
    idNumber?: string;
    occupation?: string;
    reason_for_visit?: 'business' | 'leisure' | 'medical' | 'family_event' | 'transit' | 'other';
    address?: string;
}): Promise<Guest> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    const guest = {
        id: uuidv4(),
        hotel_id: hotelId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        id_type: data.idType,
        id_number: data.idNumber,
        occupation: data.occupation,
        reason_for_visit: data.reason_for_visit,
        address: data.address,
        created_at: now,
        updated_at: now,
    };

    const { data: created, error } = await sb.from('guests').insert(guest).select().single();
    if (error) throw error;
    return created;
}

// Update guest
export async function updateGuest(id: string, data: Partial<Guest>): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('guests').update({
        ...data,
        updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
}

// Delete guest (only if no active bookings)
export async function deleteGuest(id: string): Promise<void> {
    const sb = requireSupabase();
    const { data: activeBooking } = await sb.from('bookings')
        .select('id')
        .eq('guest_id', id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

    if (activeBooking) {
        throw new Error('Cannot delete guest with active booking');
    }

    const { error } = await sb.from('guests').delete().eq('id', id);
    if (error) throw error;
}

// Get guests with active stays
export async function getGuestsWithActiveBookings(): Promise<Guest[]> {
    const sb = requireSupabase();
    const { data: activeBookings, error: bErr } = await sb.from('bookings')
        .select('guest_id')
        .eq('status', 'active');
    if (bErr) throw bErr;

    const guestIds = [...new Set((activeBookings ?? []).map(b => b.guest_id))];
    if (guestIds.length === 0) return [];

    const { data, error } = await sb.from('guests').select('*').in('id', guestIds);
    if (error) throw error;
    return data ?? [];
}

// Get guest stay history
export async function getGuestHistory(guestId: string): Promise<{
    totalStays: number;
    totalSpent: number;
    lastVisit: Date | null;
}> {
    const sb = requireSupabase();
    const { data: bookings, error } = await sb.from('bookings')
        .select('*')
        .eq('guest_id', guestId);
    if (error) throw error;

    const allBookings = bookings ?? [];
    const totalStays = allBookings.filter(b => b.status === 'checked_out').length;
    const totalSpent = allBookings.reduce((sum: number, b: any) => sum + (b.total_paid ?? 0), 0);

    const completedBookings = allBookings
        .filter(b => b.actual_checkout)
        .sort((a: any, b: any) => new Date(b.actual_checkout).getTime() - new Date(a.actual_checkout).getTime());

    const lastVisit = completedBookings.length > 0
        ? new Date(completedBookings[0].actual_checkout)
        : null;

    return { totalStays, totalSpent, lastVisit };
}
