/**
 * useOfflineSync — Monitors connectivity and flushes the offline write queue on reconnect.
 *
 * Mount this hook ONCE at the app root, alongside useRealtimeSync.
 *
 * Responsibilities:
 *   1. Listen for 'online' event → trigger flushQueue()
 *   2. After flush, invalidate affected React Query keys so UI refreshes
 *   3. Show toast with sync results
 *   4. Expose pending count for SyncStatusIndicator
 */

import { useEffect, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { flushQueue, getPendingCount, isFlushing } from '@/lib/offlineQueue';
import { toast } from '@/lib/errorMessages';
import { queryKeys } from '@/hooks/useSupabaseData';

/** Map table names → React Query keys for invalidation after flush */
const TABLE_QUERY_KEYS: Record<string, readonly string[]> = {
    hotels: queryKeys.hotel,
    rooms: queryKeys.rooms,
    room_types: queryKeys.roomTypes,
    guests: queryKeys.guests,
    reservations: queryKeys.reservations,
    bookings: queryKeys.bookings,
    services: queryKeys.services,
    service_orders: queryKeys.serviceOrders,
    payments: queryKeys.payments,
    inventory_items: queryKeys.inventoryItems,
    inventory_movements: queryKeys.inventoryMovements,
    expenses: queryKeys.expenses,
    users: queryKeys.users,
    invoices: queryKeys.invoices,
    receipts: queryKeys.receipts,
    other_income: queryKeys.otherIncome,
    charges: queryKeys.charges,
    payment_allocations: queryKeys.paymentAllocations,
    journal_entries: queryKeys.journalEntries,
};

export function useOfflineSync() {
    const queryClient = useQueryClient();
    const [pendingCount, setPendingCount] = useState(0);

    // Refresh pending count periodically and after queue changes
    const refreshPending = useCallback(async () => {
        const count = await getPendingCount();
        setPendingCount(count);
    }, []);

    const handleFlush = useCallback(async () => {
        if (isFlushing()) return;

        const pending = await getPendingCount();
        if (pending === 0) return;

        const result = await flushQueue();
        if (!result) return;

        // Invalidate React Query caches for affected tables
        for (const table of result.affectedTables) {
            const key = TABLE_QUERY_KEYS[table];
            if (key) {
                queryClient.invalidateQueries({ queryKey: [...key] });
            }
        }

        // Also invalidate cross-table deps (active bookings, etc.)
        if (result.affectedTables.has('bookings') || result.affectedTables.has('rooms')) {
            queryClient.invalidateQueries({ queryKey: [...queryKeys.activeBookings] });
        }

        // Reconcile temp IDs in React Query cache
        for (const [tempId, realId] of result.idMap) {
            // For each affected table, replace the temp record with the real one
            for (const table of result.affectedTables) {
                const key = TABLE_QUERY_KEYS[table];
                if (!key) continue;
                queryClient.setQueryData<any[]>(key, (old = []) =>
                    old.map((item: any) => {
                        if (item.id === tempId) {
                            return { ...item, id: realId };
                        }
                        return item;
                    }),
                );
            }
        }

        // Show results toast
        const parts: string[] = [];
        if (result.synced > 0) parts.push(`${result.synced} synced`);
        if (result.skipped > 0) parts.push(`${result.skipped} skipped (modified elsewhere)`);
        if (result.deadLettered > 0) parts.push(`${result.deadLettered} failed permanently`);

        if (parts.length > 0) {
            if (result.deadLettered > 0) {
                toast.warn('Offline sync completed', parts.join(', '));
            } else {
                toast.success('Changes synced', parts.join(', '));
            }
        }

        // Refresh pending count
        await refreshPending();
    }, [queryClient, refreshPending]);

    useEffect(() => {
        // Listen for connectivity restoration
        const handleOnline = () => {
            // Small delay to let network stabilize
            setTimeout(handleFlush, 1000);
        };

        window.addEventListener('online', handleOnline);

        // Also try to flush on mount (in case app loaded while online with pending items)
        handleFlush();

        // Refresh pending count on an interval (for the UI badge)
        refreshPending();
        const interval = setInterval(refreshPending, 5000);

        return () => {
            window.removeEventListener('online', handleOnline);
            clearInterval(interval);
        };
    }, [handleFlush, refreshPending]);

    return { pendingCount, flushNow: handleFlush, refreshPending };
}
