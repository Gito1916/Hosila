/**
 * Offline-aware wrappers for business operations.
 *
 * These functions are called by UI components instead of the direct db/ functions.
 * When online, they execute normally. When offline, they queue a command and
 * apply optimistic updates to the React Query cache + local store.
 */

import { v4 as uuidv4 } from 'uuid';
import { isOnline } from './offlinePolicy';
import { queueCommand } from './commandQueue';
import { patchLocalRecord, addLocalRecord } from './localStore';
import { queryClient } from './queryClient';
import { queryKeys } from '@/hooks/useSupabaseData';
import type { Booking, BookingType, Room, RoomStatus } from '@/types';
import { addHours, addDays, setHours, setMinutes } from 'date-fns';

// ============================================================================
// CheckIn — offline-aware
// ============================================================================

export interface CheckInData {
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
    numNights?: number;
    rate: number;
    totalWithTax?: number;
    durationHours?: number;
    paymentMethod: 'cash' | 'transfer' | 'pos';
    amountPaid: number;
    createdBy: string;
    existingGuestId?: string;
}

/**
 * Check in a guest — works offline with optimistic updates.
 */
export async function offlineCheckIn(data: CheckInData): Promise<Booking> {
    if (isOnline()) {
        // Online: execute normally
        const { checkIn } = await import('@/db/bookings');
        return checkIn(data);
    }

    // Offline: queue command + apply optimistic update
    const now = new Date();
    const nowIso = now.toISOString();

    // Calculate planned checkout
    let plannedCheckout: Date;
    if (data.bookingType === 'short_rest' && data.durationHours) {
        plannedCheckout = addHours(now, data.durationHours);
    } else {
        const nights = data.numNights ?? 1;
        plannedCheckout = addDays(now, nights);
        plannedCheckout = setMinutes(setHours(plannedCheckout, 12), 0);
    }

    const totalCharged = Number(data.totalWithTax ?? data.rate);
    const amountPaid = Number(data.amountPaid);

    // Create optimistic booking object
    const optimisticBooking: Booking = {
        id: uuidv4(), // temp ID, will be reconciled on sync
        hotel_id: '', // not needed for display
        guest_id: data.existingGuestId || uuidv4(),
        room_id: data.roomId,
        booking_type: data.bookingType,
        check_in_time: nowIso,
        check_out_time: plannedCheckout.toISOString(),
        planned_checkout: plannedCheckout.toISOString(),
        num_guests: data.numGuests,
        rate: Number(data.rate),
        duration_hours: data.durationHours,
        total_charged: totalCharged,
        total_paid: amountPaid,
        balance: totalCharged - amountPaid,
        status: 'active',
        created_by: data.createdBy,
        created_at: nowIso,
        updated_at: nowIso,
    } as unknown as Booking;

    // Queue command for later execution
    await queueCommand('check_in', data as unknown as Record<string, any>);

    // Optimistic updates to React Query cache
    queryClient.setQueryData<Booking[]>(queryKeys.bookings, (old = []) => [...old, optimisticBooking]);
    queryClient.setQueryData<Booking[]>(queryKeys.activeBookings, (old = []) => [...old, optimisticBooking]);

    // Update room status optimistically
    queryClient.setQueryData<any[]>(queryKeys.rooms, (old = []) =>
        old.map((room: any) =>
            room.id === data.roomId
                ? { ...room, status: data.bookingType === 'short_rest' ? 'short_rest' : 'occupied' }
                : room
        )
    );

    // Write to local store
    await addLocalRecord('bookings', optimisticBooking);
    await patchLocalRecord<Room>('rooms', data.roomId, {
        status: data.bookingType === 'short_rest' ? 'short_rest' : 'occupied',
    } as Partial<Room>);

    return optimisticBooking;
}

// ============================================================================
// RecordPayment — offline-aware
// ============================================================================

export interface RecordPaymentData {
    bookingId: string;
    amount: number;
    method: 'cash' | 'transfer' | 'pos';
    userId: string;
    reference?: string;
}

/**
 * Record a payment for a booking — works offline with optimistic updates.
 */
export async function offlineRecordPayment(data: RecordPaymentData): Promise<string> {
    if (isOnline()) {
        const { recordPayment } = await import('@/db/bookings');
        return recordPayment(data.bookingId, data.amount, data.method, data.userId, data.reference);
    }

    // Queue command
    await queueCommand('record_payment', data as unknown as Record<string, any>);

    const paymentId = uuidv4();

    // Optimistic: update booking balance in cache
    queryClient.setQueryData<Booking[]>(queryKeys.bookings, (old = []) =>
        old.map((b: any) =>
            b.id === data.bookingId
                ? {
                    ...b,
                    total_paid: Number(b.total_paid) + data.amount,
                    balance: Number(b.balance) - data.amount,
                    updated_at: new Date().toISOString(),
                }
                : b
        )
    );
    queryClient.setQueryData<Booking[]>(queryKeys.activeBookings, (old = []) =>
        old.map((b: any) =>
            b.id === data.bookingId
                ? {
                    ...b,
                    total_paid: Number(b.total_paid) + data.amount,
                    balance: Number(b.balance) - data.amount,
                    updated_at: new Date().toISOString(),
                }
                : b
        )
    );

    return paymentId;
}

// ============================================================================
// UpdateRoomStatus — offline-aware
// ============================================================================

export async function offlineUpdateRoomStatus(
    roomId: string,
    status: RoomStatus,
): Promise<void> {
    if (isOnline()) {
        const { updateRoomStatus } = await import('@/db/rooms');
        return updateRoomStatus(roomId, status);
    }

    await queueCommand('update_room_status', { roomId, status });

    // Optimistic update
    queryClient.setQueryData<any[]>(queryKeys.rooms, (old = []) =>
        old.map((room: any) =>
            room.id === roomId ? { ...room, status, updated_at: new Date().toISOString() } : room
        )
    );
    await patchLocalRecord<Room>('rooms', roomId, { status } as Partial<Room>);
}

// ============================================================================
// PostRestaurantOrder — offline-aware
// ============================================================================

export interface RestaurantOrderData {
    orders: Array<{
        id: string;
        hotel_id: string;
        booking_id: string;
        service_id: string;
        quantity: number;
        unit_price: number;
        total_price: number;
        status: string;
        order_type?: string;
        notes?: string;
        order_number?: string;
        ordered_at: string;
        created_by: string;
        created_by_name?: string;
        created_at: string;
    }>;
    bookingId: string;
    totalAmount: number;
}

/**
 * Post a restaurant order — works offline with optimistic updates.
 */
export async function offlinePostRestaurantOrder(data: RestaurantOrderData): Promise<void> {
    if (isOnline()) {
        // Online: insert directly
        const { supabase: sb } = await import('@/lib/supabase');
        if (!sb) throw new Error('Supabase not configured');
        const { error } = await sb.from('service_orders').insert(data.orders);
        if (error) throw error;

        // Update booking total — restaurant charges are added to the booking
        // This is handled server-side via the accounting module
        return;
    }

    // Queue for offline execution
    await queueCommand('post_restaurant_order', data as unknown as Record<string, any>);

    // Optimistic: add orders to local cache
    queryClient.setQueryData<any[]>(queryKeys.serviceOrders, (old = []) => [...old, ...data.orders]);

    // Optimistic: update booking balance
    if (data.bookingId) {
        queryClient.setQueryData<Booking[]>(queryKeys.bookings, (old = []) =>
            old.map((b: any) =>
                b.id === data.bookingId
                    ? {
                        ...b,
                        total_charged: Number(b.total_charged) + data.totalAmount,
                        balance: Number(b.balance) + data.totalAmount,
                        updated_at: new Date().toISOString(),
                    }
                    : b
            )
        );
    }
}
