/**
 * Centralized Supabase API Layer
 * 
 * All database operations go through this module.
 * This replaces the old Dexie (IndexedDB) local database calls.
 */

import { supabase } from './supabase';
import { queueWrite, isNetworkError } from './offlineQueue';
import { toast } from './errorMessages';
import type {
    Hotel, Room, Guest, Reservation, Booking, Service, ServiceOrder,
    Payment, InventoryItem, InventoryMovement, Expense, User,
    Invoice, Receipt, OtherIncome, IssuedAmenity, Transaction,
    Charge, PaymentAllocation, JournalEntry, RoomType,
} from '@/types';

// ============================================================================
// Helper: Get the current user's hotel_id
// ============================================================================

let _cachedHotelId: string | null = null;

export async function getHotelId(): Promise<string> {
    if (_cachedHotelId) return _cachedHotelId;

    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('hotels')
        .select('id')
        .limit(1)
        .single();

    if (error || !data) throw new Error('No hotel found. Please complete setup first.');
    _cachedHotelId = data.id;
    return data.id;
}

export function clearHotelIdCache() {
    _cachedHotelId = null;
}

export function setHotelIdCache(id: string) {
    _cachedHotelId = id;
}

// ============================================================================


// ============================================================================
// Generic CRUD helpers
// ============================================================================

export function requireSupabase() {
    if (!supabase) throw new Error('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    return supabase;
}

// Fetch all records for a table, filtered by hotel_id
export async function fetchAll<T>(table: string, orderBy?: string): Promise<T[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    let query = sb.from(table).select('*').eq('hotel_id', hotelId);
    if (orderBy) {
        query = query.order(orderBy, { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as T[];
}

// Fetch a single record by id
export async function fetchById<T>(table: string, id: string): Promise<T | null> {
    const sb = requireSupabase();
    const { data, error } = await sb.from(table).select('*').eq('id', id).single();
    if (error) {
        if (error.code === 'PGRST116') return null; // not found
        throw error;
    }
    return data as T;
}

export async function insertRecord<T>(table: string, record: any): Promise<T> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const payload = { ...record, hotel_id: hotelId };

    try {
        const { data, error } = await sb.from(table).insert(payload).select().single();
        if (error) {
            // Check if the Supabase error is actually a network issue
            if (isNetworkError(error)) {
                const tempId = record.id || (await import('uuid')).v4();
                const queuePayload = { ...payload, id: tempId };
                await queueWrite({ table, action: 'insert', data: queuePayload, tempId });
                toast.info('Saved offline', 'Will sync when connection returns');
                return queuePayload as T;
            }
            throw error;
        }
        return data as T;
    } catch (err) {
        if (isNetworkError(err)) {
            const tempId = record.id || (await import('uuid')).v4();
            const queuePayload = { ...payload, id: tempId };
            await queueWrite({ table, action: 'insert', data: queuePayload, tempId });
            toast.info('Saved offline', 'Will sync when connection returns');
            return queuePayload as T;
        }
        throw err;
    }
}

export async function updateRecord<T>(table: string, id: string, updates: any): Promise<T> {
    const sb = requireSupabase();

    try {
        const { data, error } = await sb.from(table).update(updates).eq('id', id).select().single();
        if (error) {
            if (isNetworkError(error)) {
                await queueWrite({ table, action: 'update', data: updates, recordId: id });
                toast.info('Update queued', 'Will sync when connection returns');
                return { id, ...updates } as T;
            }
            throw error;
        }
        return data as T;
    } catch (err) {
        if (isNetworkError(err)) {
            await queueWrite({ table, action: 'update', data: updates, recordId: id });
            toast.info('Update queued', 'Will sync when connection returns');
            return { id, ...updates } as T;
        }
        throw err;
    }
}

export async function deleteRecord(table: string, id: string): Promise<void> {
    const sb = requireSupabase();

    try {
        const { error } = await sb.from(table).delete().eq('id', id);
        if (error) {
            if (isNetworkError(error)) {
                await queueWrite({ table, action: 'delete', data: {}, recordId: id });
                toast.info('Delete queued', 'Will sync when connection returns');
                return;
            }
            throw error;
        }
    } catch (err) {
        if (isNetworkError(err)) {
            await queueWrite({ table, action: 'delete', data: {}, recordId: id });
            toast.info('Delete queued', 'Will sync when connection returns');
            return;
        }
        throw err;
    }
}

// ============================================================================
// Hotel
// ============================================================================

export async function fetchHotel(): Promise<Hotel | null> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('hotels').select('*').limit(1).single();
    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data as Hotel;
}

export async function updateHotel(id: string, updates: Partial<Hotel>): Promise<Hotel> {
    return updateRecord<Hotel>('hotels', id, updates);
}

export async function createHotel(hotel: Omit<Hotel, 'id'>): Promise<Hotel> {
    const sb = requireSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await sb
        .from('hotels')
        .insert({ ...hotel, tenant_id: user.id })
        .select()
        .single();
    if (error) throw error;
    return data as Hotel;
}

// ============================================================================
// Rooms
// ============================================================================

export async function fetchRooms(): Promise<Room[]> {
    return fetchAll<Room>('rooms', 'room_number');
}

export async function createRoom(room: Omit<Room, 'id'>): Promise<Room> {
    return insertRecord<Room>('rooms', room as Room);
}

export async function updateRoom(id: string, updates: Partial<Room>): Promise<Room> {
    return updateRecord<Room>('rooms', id, updates);
}

export async function deleteRoom(id: string): Promise<void> {
    return deleteRecord('rooms', id);
}

// ============================================================================
// Room Types
// ============================================================================

export async function fetchRoomTypes(): Promise<RoomType[]> {
    return fetchAll<RoomType>('room_types', 'name');
}

export async function createRoomType(rt: Omit<RoomType, 'id'>): Promise<RoomType> {
    return insertRecord<RoomType>('room_types', rt as RoomType);
}

export async function updateRoomType(id: string, updates: Partial<RoomType>): Promise<RoomType> {
    return updateRecord<RoomType>('room_types', id, updates);
}

export async function deleteRoomType(id: string): Promise<void> {
    return deleteRecord('room_types', id);
}

// ============================================================================
// Guests
// ============================================================================

export async function fetchGuests(): Promise<Guest[]> {
    return fetchAll<Guest>('guests', 'created_at');
}

export async function fetchGuestById(id: string): Promise<Guest | null> {
    return fetchById<Guest>('guests', id);
}

export async function createGuest(guest: Omit<Guest, 'id'>): Promise<Guest> {
    return insertRecord<Guest>('guests', guest as Guest);
}

export async function updateGuest(id: string, updates: Partial<Guest>): Promise<Guest> {
    return updateRecord<Guest>('guests', id, updates);
}

// ============================================================================
// Reservations
// ============================================================================

export async function fetchReservations(): Promise<Reservation[]> {
    return fetchAll<Reservation>('reservations', 'check_in_date');
}

export async function createReservation(reservation: Omit<Reservation, 'id'>): Promise<Reservation> {
    return insertRecord<Reservation>('reservations', reservation as Reservation);
}

export async function updateReservation(id: string, updates: Partial<Reservation>): Promise<Reservation> {
    return updateRecord<Reservation>('reservations', id, updates);
}

// ============================================================================
// Bookings
// ============================================================================

export async function fetchBookings(): Promise<Booking[]> {
    return fetchAll<Booking>('bookings', 'check_in_time');
}

export async function fetchActiveBookings(): Promise<Booking[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb
        .from('bookings')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('status', 'active')
        .order('check_in_time', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Booking[];
}

export async function createBooking(booking: Omit<Booking, 'id'>): Promise<Booking> {
    return insertRecord<Booking>('bookings', booking as Booking);
}

export async function updateBooking(id: string, updates: Partial<Booking>): Promise<Booking> {
    return updateRecord<Booking>('bookings', id, updates);
}

// ============================================================================
// Services (Restaurant menu)
// ============================================================================

export async function fetchServices(): Promise<Service[]> {
    return fetchAll<Service>('services', 'name');
}

export async function createService(service: Omit<Service, 'id'>): Promise<Service> {
    return insertRecord<Service>('services', service as Service);
}

export async function updateService(id: string, updates: Partial<Service>): Promise<Service> {
    return updateRecord<Service>('services', id, updates);
}

export async function deleteService(id: string): Promise<void> {
    return deleteRecord('services', id);
}

// ============================================================================
// Service Orders
// ============================================================================

export async function fetchServiceOrders(): Promise<ServiceOrder[]> {
    return fetchAll<ServiceOrder>('service_orders', 'order_time');
}

export async function createServiceOrder(order: Omit<ServiceOrder, 'id'>): Promise<ServiceOrder> {
    return insertRecord<ServiceOrder>('service_orders', order as ServiceOrder);
}

export async function updateServiceOrder(id: string, updates: Partial<ServiceOrder>): Promise<ServiceOrder> {
    return updateRecord<ServiceOrder>('service_orders', id, updates);
}

// ============================================================================
// Payments
// ============================================================================

export async function fetchPayments(): Promise<Payment[]> {
    return fetchAll<Payment>('payments', 'payment_time');
}

export async function createPayment(payment: Omit<Payment, 'id'>): Promise<Payment> {
    return insertRecord<Payment>('payments', payment as Payment);
}

// ============================================================================
// Inventory
// ============================================================================

export async function fetchInventoryItems(): Promise<InventoryItem[]> {
    return fetchAll<InventoryItem>('inventory_items', 'name');
}

export async function createInventoryItem(item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
    return insertRecord<InventoryItem>('inventory_items', item as InventoryItem);
}

export async function updateInventoryItem(id: string, updates: Partial<InventoryItem>): Promise<InventoryItem> {
    return updateRecord<InventoryItem>('inventory_items', id, updates);
}

export async function deleteInventoryItem(id: string): Promise<void> {
    return deleteRecord('inventory_items', id);
}

export async function fetchInventoryMovements(): Promise<InventoryMovement[]> {
    return fetchAll<InventoryMovement>('inventory_movements', 'movement_time');
}

export async function createInventoryMovement(movement: Omit<InventoryMovement, 'id'>): Promise<InventoryMovement> {
    return insertRecord<InventoryMovement>('inventory_movements', movement as InventoryMovement);
}

// ============================================================================
// Expenses
// ============================================================================

export async function fetchExpenses(): Promise<Expense[]> {
    return fetchAll<Expense>('expenses', 'date');
}

export async function createExpense(expense: Omit<Expense, 'id'>): Promise<Expense> {
    return insertRecord<Expense>('expenses', expense as Expense);
}

export async function updateExpense(id: string, updates: Partial<Expense>): Promise<Expense> {
    return updateRecord<Expense>('expenses', id, updates);
}

export async function deleteExpense(id: string): Promise<void> {
    return deleteRecord('expenses', id);
}

// ============================================================================
// Users
// ============================================================================

export async function fetchUsers(): Promise<User[]> {
    return fetchAll<User>('users', 'created_at');
}

export async function fetchUserByUsername(username: string): Promise<User | null> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb
        .from('users')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('username', username)
        .single();
    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data as User;
}

export async function createUser(user: Omit<User, 'id'>): Promise<User> {
    return insertRecord<User>('users', user as User);
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User> {
    return updateRecord<User>('users', id, updates);
}

export async function deleteUser(id: string): Promise<void> {
    return deleteRecord('users', id);
}

// ============================================================================
// Invoices & Receipts
// ============================================================================

export async function fetchInvoices(): Promise<Invoice[]> {
    return fetchAll<Invoice>('invoices', 'created_at');
}

export async function createInvoice(invoice: Omit<Invoice, 'id'>): Promise<Invoice> {
    return insertRecord<Invoice>('invoices', invoice as Invoice);
}

export async function fetchReceipts(): Promise<Receipt[]> {
    return fetchAll<Receipt>('receipts', 'created_at');
}

export async function createReceipt(receipt: Omit<Receipt, 'id'>): Promise<Receipt> {
    return insertRecord<Receipt>('receipts', receipt as Receipt);
}

// ============================================================================
// Other Income
// ============================================================================

export async function fetchOtherIncome(): Promise<OtherIncome[]> {
    return fetchAll<OtherIncome>('other_income', 'date');
}

export async function createOtherIncome(income: Omit<OtherIncome, 'id'>): Promise<OtherIncome> {
    return insertRecord<OtherIncome>('other_income', income as OtherIncome);
}

export async function updateOtherIncome(id: string, updates: Partial<OtherIncome>): Promise<OtherIncome> {
    return updateRecord<OtherIncome>('other_income', id, updates);
}

export async function deleteOtherIncome(id: string): Promise<void> {
    return deleteRecord('other_income', id);
}

// ============================================================================
// Issued Amenities
// ============================================================================

export async function fetchIssuedAmenities(): Promise<IssuedAmenity[]> {
    return fetchAll<IssuedAmenity>('issued_amenities', 'created_at');
}

export async function createIssuedAmenity(amenity: Omit<IssuedAmenity, 'id'>): Promise<IssuedAmenity> {
    return insertRecord<IssuedAmenity>('issued_amenities', amenity as IssuedAmenity);
}

export async function updateIssuedAmenity(id: string, updates: Partial<IssuedAmenity>): Promise<IssuedAmenity> {
    return updateRecord<IssuedAmenity>('issued_amenities', id, updates);
}

// ============================================================================
// Transactions (Legacy unified ledger)
// ============================================================================

export async function fetchTransactions(): Promise<Transaction[]> {
    return fetchAll<Transaction>('transactions', 'date');
}

export async function createTransaction(tx: Omit<Transaction, 'id'>): Promise<Transaction> {
    return insertRecord<Transaction>('transactions', tx as Transaction);
}

// ============================================================================
// Accounting v2: Charges, Payment Allocations, Journal Entries
// ============================================================================

export async function fetchCharges(): Promise<Charge[]> {
    return fetchAll<Charge>('charges', 'charge_date');
}

export async function createCharge(charge: Omit<Charge, 'id'>): Promise<Charge> {
    return insertRecord<Charge>('charges', charge as Charge);
}

export async function updateCharge(id: string, updates: Partial<Charge>): Promise<Charge> {
    return updateRecord<Charge>('charges', id, updates);
}

export async function fetchPaymentAllocations(): Promise<PaymentAllocation[]> {
    return fetchAll<PaymentAllocation>('payment_allocations');
}

export async function createPaymentAllocation(alloc: Omit<PaymentAllocation, 'id'>): Promise<PaymentAllocation> {
    return insertRecord<PaymentAllocation>('payment_allocations', alloc as PaymentAllocation);
}

export async function fetchJournalEntries(): Promise<JournalEntry[]> {
    return fetchAll<JournalEntry>('journal_entries', 'entry_date');
}

export async function createJournalEntry(entry: Omit<JournalEntry, 'id'>): Promise<JournalEntry> {
    return insertRecord<JournalEntry>('journal_entries', entry as JournalEntry);
}
