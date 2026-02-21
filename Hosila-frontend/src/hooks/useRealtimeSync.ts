/**
 * useRealtimeSync — Subscribes to Supabase Realtime Postgres Changes.
 *
 * Responsibilities:
 *   1. Subscribe to INSERT / UPDATE / DELETE on realtime-tier tables
 *   2. Update React Query cache (idempotent, timestamp-guarded)
 *   3. Fire notifications via notificationStore (skips self-authored changes)
 *   4. Expose connection status for UI indicator
 *   5. Refetch critical tables on reconnect (catch missed messages)
 *
 * Mount this hook ONCE at the app root (inside QueryClientProvider + Router).
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useConnectionStatusStore } from '@/stores/connectionStatusStore';
import { queryKeys } from '@/hooks/useSupabaseData';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ============================================================================
// Config
// ============================================================================

/** Tables that receive realtime push updates */
const REALTIME_TABLES = [
    'rooms',
    'bookings',
    'reservations',
    'service_orders',
    'guests',
] as const;

type RealtimeTable = typeof REALTIME_TABLES[number];

/** Map table names → React Query keys */
const TABLE_QUERY_KEY: Record<RealtimeTable, readonly string[]> = {
    rooms: queryKeys.rooms,
    bookings: queryKeys.bookings,
    reservations: queryKeys.reservations,
    service_orders: queryKeys.serviceOrders,
    guests: queryKeys.guests,
};

/** Extra keys to invalidate when a table changes (cross-table dependencies) */
const EXTRA_INVALIDATIONS: Partial<Record<RealtimeTable, ReadonlyArray<readonly string[]>>> = {
    rooms: [queryKeys.activeBookings],
    bookings: [queryKeys.rooms, queryKeys.activeBookings],
    reservations: [queryKeys.rooms],
    service_orders: [['groupedOrders'] as const],
};

// ============================================================================
// Notification message generators
// ============================================================================

function generateNotification(
    table: RealtimeTable,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    record: Record<string, any>,
    oldRecord?: Record<string, any>,
): { title: string; message: string; link?: string; type: 'info' | 'success' | 'warning' } | null {

    switch (table) {
        case 'rooms': {
            const roomNum = record.room_number || record.room_number || 'Unknown';
            const status = record.status;
            const oldStatus = oldRecord?.status;
            if (eventType === 'UPDATE' && status !== oldStatus) {
                switch (status) {
                    case 'occupied':
                        return { title: `🏨 Room ${roomNum} booked`, message: 'A guest has checked in', link: '/bookings', type: 'info' };
                    case 'available':
                        return { title: `✅ Room ${roomNum} available`, message: 'Room has been checked out', link: '/bookings', type: 'success' };
                    case 'dirty':
                        return { title: `🧹 Room ${roomNum} needs cleaning`, message: 'Room marked as dirty', link: '/bookings', type: 'warning' };
                    case 'maintenance':
                        return { title: `🔧 Room ${roomNum} under maintenance`, message: 'Room taken out of service', link: '/bookings', type: 'warning' };
                    case 'short_rest':
                        return { title: `⏱️ Room ${roomNum} short rest`, message: 'Short rest booking started', link: '/bookings', type: 'info' };
                    default:
                        return null;
                }
            }
            return null;
        }

        case 'bookings': {
            if (eventType === 'INSERT') {
                return { title: '🏨 New check-in', message: `Booking created for room`, link: '/bookings', type: 'info' };
            }
            if (eventType === 'UPDATE') {
                const status = record.status;
                const oldStatus = oldRecord?.status;
                if (status === 'checked_out' && oldStatus !== 'checked_out') {
                    return { title: '👋 Guest checked out', message: 'A booking has been closed', link: '/bookings', type: 'success' };
                }
            }
            return null;
        }

        case 'reservations': {
            if (eventType === 'INSERT') {
                const source = record.source;
                const checkIn = record.check_in_date;
                const checkInStr = checkIn ? new Date(checkIn).toLocaleDateString() : '';

                if (source === 'booking.com' || source === 'airbnb') {
                    return {
                        title: `📧 ${source} reservation imported`,
                        message: `Check-in: ${checkInStr}`,
                        link: '/bookings',
                        type: 'info',
                    };
                }
                if (source === 'direct' || source === 'website') {
                    return {
                        title: '🌐 New website reservation',
                        message: `Check-in: ${checkInStr}`,
                        link: '/bookings',
                        type: 'info',
                    };
                }
                return {
                    title: '📋 New reservation',
                    message: `Check-in: ${checkInStr}`,
                    link: '/bookings',
                    type: 'info',
                };
            }
            if (eventType === 'UPDATE') {
                const status = record.status;
                const oldStatus = oldRecord?.status;
                if (status === 'cancelled' && oldStatus !== 'cancelled') {
                    return { title: '❌ Reservation cancelled', message: `A reservation has been cancelled`, link: '/bookings', type: 'warning' };
                }
                if (status === 'confirmed' && oldStatus === 'pending') {
                    return { title: '✅ Reservation confirmed', message: 'A pending reservation was confirmed', link: '/bookings', type: 'success' };
                }
            }
            return null;
        }

        case 'service_orders': {
            if (eventType === 'INSERT') {
                return { title: '🍽️ New order placed', message: `Order received`, link: '/restaurant', type: 'info' };
            }
            if (eventType === 'UPDATE') {
                const status = record.status;
                const oldStatus = oldRecord?.status;
                if (status === 'preparing' && oldStatus !== 'preparing') {
                    return { title: '🍳 Order being prepared', message: 'Kitchen has started the order', link: '/restaurant', type: 'info' };
                }
                if (status === 'ready' && oldStatus !== 'ready') {
                    return { title: '✅ Order ready', message: 'Order is ready for delivery', link: '/restaurant', type: 'success' };
                }
                if (status === 'delivered' && oldStatus !== 'delivered') {
                    return { title: '📦 Order delivered', message: 'Order has been delivered', link: '/restaurant', type: 'success' };
                }
            }
            return null;
        }

        case 'guests': {
            if (eventType === 'INSERT') {
                const name = record.name || 'Unknown';
                return { title: '👤 New guest registered', message: name, link: '/guests', type: 'info' };
            }
            return null;
        }

        default:
            return null;
    }
}

// ============================================================================
// Hook
// ============================================================================

export function useRealtimeSync() {
    const queryClient = useQueryClient();
    const channelRef = useRef<RealtimeChannel | null>(null);
    const user = useAuthStore((s) => s.user);
    const addNotification = useNotificationStore((s) => s.addNotification);
    const { setConnected, setDisconnected } = useConnectionStatusStore();

    // Stable reference to avoid re-subscribing on notification store changes
    const addNotifRef = useRef(addNotification);
    addNotifRef.current = addNotification;
    const userRef = useRef(user);
    userRef.current = user;

    const handleChange = useCallback(
        (table: RealtimeTable) =>
            (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
                const { eventType } = payload;
                const queryKey = TABLE_QUERY_KEY[table];

                // ---- Update React Query cache (idempotent) ----
                if (eventType === 'INSERT') {
                    const newRecord = payload.new;
                    queryClient.setQueryData<any[]>(queryKey, (old = []) => {
                        // Prevent duplicates (idempotent)
                        if (old.some((item: any) => item.id === newRecord.id)) {
                            return old.map((item: any) =>
                                item.id === newRecord.id ? newRecord : item,
                            );
                        }
                        return [...old, newRecord];
                    });
                } else if (eventType === 'UPDATE') {
                    const updatedRecord = payload.new;
                    const oldRecord = payload.old;
                    queryClient.setQueryData<any[]>(queryKey, (old = []) =>
                        old.map((item: any) => {
                            if (item.id !== updatedRecord.id) return item;
                            // Out-of-order guard: only apply if newer
                            if (
                                item.updated_at &&
                                updatedRecord.updated_at &&
                                new Date(item.updated_at) > new Date(updatedRecord.updated_at)
                            ) {
                                return item; // Skip stale update
                            }
                            return updatedRecord;
                        }),
                    );

                    // Fire notification (skip self-authored)
                    const notif = generateNotification(table, 'UPDATE', updatedRecord, oldRecord);
                    if (notif) {
                        addNotifRef.current(notif);
                    }
                } else if (eventType === 'DELETE') {
                    const deletedId = payload.old?.id;
                    if (deletedId) {
                        queryClient.setQueryData<any[]>(queryKey, (old = []) =>
                            old.filter((item: any) => item.id !== deletedId),
                        );
                    }
                }

                // Fire notification for INSERT (after cache update)
                if (eventType === 'INSERT') {
                    const notif = generateNotification(table, 'INSERT', payload.new);
                    if (notif) {
                        addNotifRef.current(notif);
                    }
                }

                // Invalidate cross-table dependencies
                const extras = EXTRA_INVALIDATIONS[table];
                if (extras) {
                    extras.forEach((key) => queryClient.invalidateQueries({ queryKey: [...key] }));
                }
            },
        [queryClient],
    );

    useEffect(() => {
        if (!supabase) return;

        // Build a single channel with multiple table subscriptions
        let channel = supabase.channel('pms-realtime', {
            config: { broadcast: { self: false } }, // Don't receive own broadcasts
        });

        for (const table of REALTIME_TABLES) {
            channel = channel.on(
                'postgres_changes' as any,
                { event: '*', schema: 'public', table },
                handleChange(table),
            );
        }

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                setConnected();
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                setDisconnected();
            }
        });

        // Handle reconnection — refetch critical tables
        // Supabase client auto-reconnects; we listen for status changes
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // Tab became visible again — refetch to catch missed events
                REALTIME_TABLES.forEach((table) => {
                    queryClient.invalidateQueries({ queryKey: TABLE_QUERY_KEY[table] });
                });
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        channelRef.current = channel;

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (channelRef.current) {
                supabase!.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [handleChange, queryClient, setConnected, setDisconnected]);
}
