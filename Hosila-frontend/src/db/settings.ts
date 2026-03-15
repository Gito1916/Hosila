/**
 * Settings operations — Supabase implementation
 * Replaces old Dexie-based settings/user queries with Supabase API calls.
 */

import { v4 as uuidv4 } from 'uuid';
import { requireSupabase, getHotelId } from '@/lib/api';
import type { User, UserRole, Hotel, HotelSettings } from '@/types';
// Password hashing is handled server-side via Supabase RPCs

// Safe column list for users — never expose password_hash to the frontend
const USER_SAFE_COLUMNS = 'id, hotel_id, username, name, role, is_active, must_change_password, last_login, created_at, updated_at';

// =============================================================================
// Users
// =============================================================================

// Get all users
export async function getAllUsers(): Promise<User[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('users').select(USER_SAFE_COLUMNS).eq('hotel_id', hotelId);
    if (error) throw error;
    return data ?? [];
}

// Get user by ID
export async function getUserById(id: string): Promise<User | undefined> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('users').select(USER_SAFE_COLUMNS).eq('id', id).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Get user by username
export async function getUserByUsername(username: string): Promise<User | undefined> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('users').select(USER_SAFE_COLUMNS).eq('hotel_id', hotelId).eq('username', username).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Create new user
export async function createUser(data: {
    username: string;
    password: string;
    name: string;
    role: UserRole;
}): Promise<User> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    // Check if username already exists
    const existing = await getUserByUsername(data.username);
    if (existing) throw new Error('Username already exists');

    // Hash password server-side
    const { data: password_hash, error: hashError } = await sb.rpc('hash_password', {
        p_password: data.password,
    });
    if (hashError || !password_hash) throw new Error(hashError?.message || 'Failed to hash password');

    const user = {
        id: uuidv4(),
        hotel_id: hotelId,
        username: data.username,
        password_hash,
        name: data.name,
        role: data.role,
        is_active: true,
        must_change_password: true,
        created_at: now,
        updated_at: now,
    };

    const { data: created, error } = await sb.from('users').insert(user).select().single();
    if (error) throw error;
    return created as User;
}

// Update user
export async function updateUser(id: string, data: {
    name?: string;
    role?: UserRole;
    is_active?: boolean;
}): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('users').update({
        ...data,
        updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
}

// Update user password (admin only, no verification)
export async function updateUserPassword(id: string, newPassword: string): Promise<void> {
    const sb = requireSupabase();
    // Hash password server-side
    const { data: password_hash, error: hashError } = await sb.rpc('hash_password', {
        p_password: newPassword,
    });
    if (hashError || !password_hash) throw new Error(hashError?.message || 'Failed to hash password');
    const { error } = await sb.from('users').update({
        password_hash,
        updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
}

// Change password (with current password verification)
export async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
): Promise<{ success: boolean; error?: string }> {
    const sb = requireSupabase();

    // Verify current password and change — all server-side
    const { data, error } = await sb.rpc('verify_and_change_password', {
        p_user_id: userId,
        p_current_password: currentPassword,
        p_new_password: newPassword,
    });

    if (error) {
        return { success: false, error: 'Failed to change password' };
    }

    return data as { success: boolean; error?: string };
}

// Delete user
export async function deleteUser(id: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('users').delete().eq('id', id);
    if (error) throw error;
}

// =============================================================================
// Hotel Settings
// =============================================================================

// Get hotel
export async function getHotel(): Promise<Hotel | undefined> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('hotels').select('*').eq('id', hotelId).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Update hotel info
export async function updateHotel(data: Partial<Hotel>): Promise<void> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { error } = await sb.from('hotels').update({
        ...data,
        updated_at: new Date().toISOString(),
    }).eq('id', hotelId);
    if (error) throw error;
}

// Get hotel settings
export async function getHotelSettings(): Promise<HotelSettings | undefined> {
    const hotel = await getHotel();
    return hotel?.settings;
}

// Update hotel settings
export async function updateHotelSettings(settings: Partial<HotelSettings>): Promise<void> {
    const hotel = await getHotel();
    if (!hotel) throw new Error('Hotel not found');

    const newSettings: HotelSettings = {
        ...hotel.settings!,
        ...settings,
    };

    await updateHotel({ settings: newSettings });
}

// =============================================================================
// Data Backup & Restore
// =============================================================================

// Export all data as JSON
export async function exportData(): Promise<string> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const [hotel, users, rooms, guests, bookings, reservations, payments, services, service_orders, inventory_items, inventory_movements, expenses] = await Promise.all([
        sb.from('hotels').select('*').eq('id', hotelId).single(),
        sb.from('users').select(USER_SAFE_COLUMNS).eq('hotel_id', hotelId),
        sb.from('rooms').select('*').eq('hotel_id', hotelId),
        sb.from('guests').select('*').eq('hotel_id', hotelId),
        sb.from('bookings').select('*').eq('hotel_id', hotelId),
        sb.from('reservations').select('*').eq('hotel_id', hotelId),
        sb.from('payments').select('*').eq('hotel_id', hotelId),
        sb.from('services').select('*').eq('hotel_id', hotelId),
        sb.from('service_orders').select('*').eq('hotel_id', hotelId),
        sb.from('inventory_items').select('*').eq('hotel_id', hotelId),
        sb.from('inventory_movements').select('*').eq('hotel_id', hotelId),
        sb.from('expenses').select('*').eq('hotel_id', hotelId),
    ]);

    const data = {
        exportDate: new Date().toISOString(),
        hotel: hotel.data,
        users: users.data ?? [],
        rooms: rooms.data ?? [],
        guests: guests.data ?? [],
        bookings: bookings.data ?? [],
        reservations: reservations.data ?? [],
        payments: payments.data ?? [],
        services: services.data ?? [],
        service_orders: service_orders.data ?? [],
        inventory_items: inventory_items.data ?? [],
        inventory_movements: inventory_movements.data ?? [],
        expenses: expenses.data ?? [],
    };

    return JSON.stringify(data, null, 2);
}

// Download backup as file
export function downloadBackup(data: string): void {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hotelflow-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
