/**
 * Room operations — Supabase implementation
 * Replaces old Dexie-based room queries with Supabase API calls.
 */

import { v4 as uuidv4 } from 'uuid';
import { requireSupabase, getHotelId } from '@/lib/api';
import type { Room, RoomStatus } from '@/types';

// Get all rooms
export async function getAllRooms(): Promise<Room[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('rooms').select('*').eq('hotel_id', hotelId).order('room_number');
    if (error) throw error;
    return data ?? [];
}

// Get rooms by status
export async function getRoomsByStatus(status: RoomStatus): Promise<Room[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('rooms').select('*').eq('hotel_id', hotelId).eq('status', status);
    if (error) throw error;
    return data ?? [];
}

// Get available rooms
export async function getAvailableRooms(): Promise<Room[]> {
    return getRoomsByStatus('available');
}

// Get single room by ID
export async function getRoomById(id: string): Promise<Room | undefined> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('rooms').select('*').eq('id', id).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Get room by room number
export async function getRoomByNumber(roomNumber: string): Promise<Room | undefined> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('rooms').select('*').eq('hotel_id', hotelId).eq('room_number', roomNumber).limit(1).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Create new room
export async function createRoom(data: Omit<Room, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>): Promise<Room> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    const room = {
        id: uuidv4(),
        hotel_id: hotelId,
        ...data,
        created_at: now,
        updated_at: now,
    };

    const { data: created, error } = await sb.from('rooms').insert(room).select().single();
    if (error) throw error;
    return created;
}

// Update room
export async function updateRoom(id: string, data: Partial<Room>): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('rooms').update({
        ...data,
        updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
}

// Update room status
export async function updateRoomStatus(id: string, status: RoomStatus): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('rooms').update({
        status,
        updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
}

// Delete room
export async function deleteRoom(id: string): Promise<void> {
    const sb = requireSupabase();
    // Check if room has active bookings
    const { data: activeBooking } = await sb.from('bookings')
        .select('id')
        .eq('room_id', id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

    if (activeBooking) {
        throw new Error('Cannot delete room with active booking');
    }

    const { error } = await sb.from('rooms').delete().eq('id', id);
    if (error) throw error;
}

// Get room statistics
export async function getRoomStats(): Promise<{
    total: number;
    available: number;
    occupied: number;
    shortRest: number;
    dirty: number;
    maintenance: number;
}> {
    const rooms = await getAllRooms();

    return {
        total: rooms.length,
        available: rooms.filter(r => r.status === 'available').length,
        occupied: rooms.filter(r => r.status === 'occupied').length,
        shortRest: rooms.filter(r => r.status === 'short_rest').length,
        dirty: rooms.filter(r => r.status === 'dirty').length,
        maintenance: rooms.filter(r => r.status === 'maintenance').length,
    };
}

// Get rooms grouped by floor
export async function getRoomsGroupedByFloor(): Promise<Record<number, Room[]>> {
    const rooms = await getAllRooms();

    return rooms.reduce((acc, room) => {
        const floor = room.floor_number ?? 1;
        if (!acc[floor]) {
            acc[floor] = [];
        }
        acc[floor].push(room);
        return acc;
    }, {} as Record<number, Room[]>);
}

// Get unique room types
export async function getRoomTypes(): Promise<string[]> {
    const rooms = await getAllRooms();
    const types = new Set(rooms.map(r => r.room_type));
    return Array.from(types);
}
