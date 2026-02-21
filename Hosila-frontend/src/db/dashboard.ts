/**
 * Dashboard data helpers for KPIs and alerts
 * 
 * Fetches data directly from Supabase (replaces Dexie queries).
 */
import { supabase } from '@/lib/supabase';
import { getHotelId } from '@/lib/api';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import type { InventoryItem } from '@/types';

function requireSupabase() {
    if (!supabase) throw new Error('Supabase not configured');
    return supabase;
}

// ============================================
// ARRIVALS & DEPARTURES
// ============================================

/**
 * Get reservations expected to arrive today (status = confirmed, check-in date = today)
 */
export async function getTodayArrivals() {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const today = new Date();
    const dayStart = startOfDay(today).toISOString();
    const dayEnd = endOfDay(today).toISOString();

    const { data: reservations, error } = await sb
        .from('reservations')
        .select('*, guests(name, phone), rooms(room_number, room_type)')
        .eq('hotel_id', hotelId)
        .eq('status', 'confirmed')
        .gte('check_in_date', dayStart)
        .lte('check_in_date', dayEnd);

    if (error) throw error;

    return (reservations ?? []).map((res: any) => ({
        reservation: res,
        guestName: res.guests?.name ?? 'Unknown',
        guestPhone: res.guests?.phone,
        roomNumber: res.rooms?.room_number ?? 'TBD',
        roomType: res.rooms?.room_type,
    }));
}

/**
 * Get active bookings expected to check out today
 */
export async function getTodayDepartures() {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const today = new Date();
    const dayStart = startOfDay(today).toISOString();
    const dayEnd = endOfDay(today).toISOString();

    const { data: bookings, error } = await sb
        .from('bookings')
        .select('*, guests(name, phone), rooms(room_number)')
        .eq('hotel_id', hotelId)
        .eq('status', 'active')
        .gte('planned_checkout', dayStart)
        .lte('planned_checkout', dayEnd);

    if (error) throw error;

    return (bookings ?? []).map((b: any) => ({
        booking: b,
        guestName: b.guests?.name ?? 'Unknown',
        guestPhone: b.guests?.phone,
        roomNumber: b.rooms?.room_number ?? '?',
        balance: b.balance,
        isOverdue: new Date(b.planned_checkout) < new Date(),
    }));
}

/**
 * Get bookings that are overdue for checkout (past checkout time, still active)
 */
export async function getOverdueCheckouts() {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    const { data: overdue, error } = await sb
        .from('bookings')
        .select('*, guests(name), rooms(room_number)')
        .eq('hotel_id', hotelId)
        .eq('status', 'active')
        .lt('planned_checkout', now);

    if (error) throw error;

    return (overdue ?? []).map((b: any) => ({
        booking: b,
        roomNumber: b.rooms?.room_number ?? '?',
        guestName: b.guests?.name ?? 'Unknown',
    }));
}

// ============================================
// REVENUE & PAYMENTS
// ============================================

/**
 * Get total revenue received today
 */
export async function getTodayRevenue() {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const today = new Date();
    const dayStart = startOfDay(today).toISOString();
    const dayEnd = endOfDay(today).toISOString();

    // Get payments made today
    const { data: payments, error: pErr } = await sb
        .from('payments')
        .select('amount')
        .eq('hotel_id', hotelId)
        .gte('payment_time', dayStart)
        .lte('payment_time', dayEnd);

    if (pErr) throw pErr;

    const totalRevenue = (payments ?? []).reduce((sum: number, p: any) => sum + p.amount, 0);

    // Also get other income entries for today
    const { data: otherIncome, error: oErr } = await sb
        .from('other_income')
        .select('amount')
        .eq('hotel_id', hotelId)
        .gte('date', dayStart)
        .lte('date', dayEnd);

    if (oErr) throw oErr;

    const otherTotal = (otherIncome ?? []).reduce((sum: number, i: any) => sum + i.amount, 0);

    return {
        paymentsTotal: totalRevenue,
        otherIncomeTotal: otherTotal,
        total: totalRevenue + otherTotal,
        transactionCount: (payments?.length ?? 0) + (otherIncome?.length ?? 0),
    };
}

/**
 * Get revenue for current month
 */
export async function getMonthRevenue() {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const today = new Date();
    const monthStart = startOfMonth(today).toISOString();
    const monthEnd = endOfMonth(today).toISOString();

    const { data: payments, error } = await sb
        .from('payments')
        .select('amount')
        .eq('hotel_id', hotelId)
        .gte('payment_time', monthStart)
        .lte('payment_time', monthEnd);

    if (error) throw error;

    return (payments ?? []).reduce((sum: number, p: any) => sum + p.amount, 0);
}

/**
 * Get outstanding payments (guests with balance > 0)
 */
export async function getOutstandingPayments() {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data: unpaidBookings, error } = await sb
        .from('bookings')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('status', 'active')
        .gt('balance', 0);

    if (error) throw error;

    const bookings = unpaidBookings ?? [];
    const totalOutstanding = bookings.reduce((sum: number, b: any) => sum + b.balance, 0);

    return {
        count: bookings.length,
        total: totalOutstanding,
        bookings,
    };
}

/**
 * Get unpaid guests due to checkout today
 */
export async function getUnpaidDueToday() {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const today = new Date();
    const dayStart = startOfDay(today).toISOString();
    const dayEnd = endOfDay(today).toISOString();

    const { data: unpaidDueToday, error } = await sb
        .from('bookings')
        .select('*, guests(name), rooms(room_number)')
        .eq('hotel_id', hotelId)
        .eq('status', 'active')
        .gt('balance', 0)
        .gte('planned_checkout', dayStart)
        .lte('planned_checkout', dayEnd);

    if (error) throw error;

    return (unpaidDueToday ?? []).map((b: any) => ({
        booking: b,
        guestName: b.guests?.name ?? 'Unknown',
        roomNumber: b.rooms?.room_number ?? '?',
    }));
}

// ============================================
// INVENTORY ALERTS
// ============================================

/**
 * Get low stock inventory items
 */
export async function getLowStockAlerts(): Promise<InventoryItem[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data: items, error } = await sb
        .from('inventory_items')
        .select('*')
        .eq('hotel_id', hotelId);

    if (error) throw error;

    return (items ?? []).filter((item: any) => item.current_stock <= item.min_stock_level) as InventoryItem[];
}

// ============================================
// RESTAURANT REVENUE
// ============================================

/**
 * Get restaurant/service revenue today
 */
export async function getTodayServiceRevenue() {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const today = new Date();
    const dayStart = startOfDay(today).toISOString();
    const dayEnd = endOfDay(today).toISOString();

    const { data: orders, error } = await sb
        .from('service_orders')
        .select('total_price')
        .eq('hotel_id', hotelId)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);

    if (error) throw error;

    const total = (orders ?? []).reduce((sum: number, o: any) => sum + o.total_price, 0);

    return {
        total,
        orderCount: orders?.length ?? 0,
    };
}

// ============================================
// OCCUPANCY STATS
// ============================================

/**
 * Get occupancy statistics
 */
export async function getOccupancyStats() {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data: rooms, error } = await sb
        .from('rooms')
        .select('status')
        .eq('hotel_id', hotelId);

    if (error) throw error;

    const allRooms = rooms ?? [];
    const total = allRooms.length;
    const occupied = allRooms.filter((r: any) => r.status === 'occupied' || r.status === 'short_rest').length;
    const available = allRooms.filter((r: any) => r.status === 'available').length;
    const dirty = allRooms.filter((r: any) => r.status === 'dirty').length;
    const maintenance = allRooms.filter((r: any) => r.status === 'maintenance').length;

    return {
        total,
        occupied,
        available,
        dirty,
        maintenance,
        occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
    };
}

// ============================================
// ADR & RevPAR (Manager KPIs)
// ============================================

/**
 * Calculate Average Daily Rate (ADR) for current month
 * ADR = Total Room Revenue / Number of Rooms Sold
 */
export async function getADR() {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const today = new Date();
    const monthStart = startOfMonth(today).toISOString();
    const monthEnd = endOfMonth(today).toISOString();

    const { data: bookings, error } = await sb
        .from('bookings')
        .select('rate')
        .eq('hotel_id', hotelId)
        .gte('check_in_time', monthStart)
        .lte('check_in_time', monthEnd);

    if (error) throw error;

    const allBookings = bookings ?? [];
    if (allBookings.length === 0) return 0;

    const totalRevenue = allBookings.reduce((sum: number, b: any) => sum + b.rate, 0);
    return Math.round(totalRevenue / allBookings.length);
}

/**
 * Calculate RevPAR for current month
 * RevPAR = ADR × Occupancy Rate
 */
export async function getRevPAR() {
    const adr = await getADR();
    const occupancy = await getOccupancyStats();
    return Math.round(adr * (occupancy.occupancyRate / 100));
}
