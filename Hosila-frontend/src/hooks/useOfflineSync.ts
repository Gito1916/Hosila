/**
 * useOfflineSync — Monitors connectivity and flushes offline queues on reconnect.
 *
 * Mount this hook ONCE at the app root, alongside useRealtimeSync.
 *
 * Responsibilities:
 *   1. Listen for 'online' event → flush command queue, then row queue
 *   2. After flush, invalidate affected React Query keys so UI refreshes
 *   3. Show toast with sync results
 *   4. Expose pending counts for status badges
 *   5. Hydrate local store from cloud data after reconnect
 */

import { useEffect, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { flushQueue, getPendingCount, isFlushing } from '@/lib/offlineQueue';
import { flushCommands, getPendingCommandCount, isCommandFlushing } from '@/lib/commandQueue';
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

/** Commands → which React Query keys they affect (for invalidation) */
const COMMAND_AFFECTED_KEYS: Record<string, (readonly string[])[]> = {
    check_in: [queryKeys.bookings, queryKeys.activeBookings, queryKeys.rooms, queryKeys.guests, queryKeys.charges, queryKeys.payments],
    check_out: [queryKeys.bookings, queryKeys.activeBookings, queryKeys.rooms],
    record_payment: [queryKeys.bookings, queryKeys.payments, queryKeys.paymentAllocations],
    update_room_status: [queryKeys.rooms],
    post_restaurant_order: [queryKeys.serviceOrders, queryKeys.bookings],
    extend_stay: [queryKeys.bookings, queryKeys.charges],
    add_note: [],
};

export function useOfflineSync() {
    const queryClient = useQueryClient();
    const [pendingCount, setPendingCount] = useState(0);
    const [pendingCommandCount, setPendingCommandCount] = useState(0);

    // Refresh pending counts
    const refreshPending = useCallback(async () => {
        const [rowCount, cmdCount] = await Promise.all([
            getPendingCount(),
            getPendingCommandCount(),
        ]);
        setPendingCount(rowCount);
        setPendingCommandCount(cmdCount);
    }, []);

    // Flush command queue (business-level operations first)
    const handleCommandFlush = useCallback(async () => {
        if (isCommandFlushing()) return;

        const pending = await getPendingCommandCount();
        if (pending === 0) return;

        const result = await flushCommands();
        if (!result) return;

        // Invalidate React Query caches for affected commands
        const keysToInvalidate = new Set<string>();
        // Since commands are synced, we need to invalidate ALL potentially affected keys
        for (const cmd of Object.keys(COMMAND_AFFECTED_KEYS)) {
            COMMAND_AFFECTED_KEYS[cmd]?.forEach(key => {
                keysToInvalidate.add(JSON.stringify(key));
            });
        }

        // Invalidate all unique keys
        for (const keyJson of keysToInvalidate) {
            const key = JSON.parse(keyJson);
            queryClient.invalidateQueries({ queryKey: [...key] });
        }

        // Show results
        if (result.synced > 0) {
            toast.success('Offline actions synced', `${result.synced} operation${result.synced > 1 ? 's' : ''} completed`);
        }
        if (result.errors.length > 0) {
            const errorSummary = result.errors.map(e => `${e.command}: ${e.error}`).join('; ');
            toast.warn('Some offline actions failed', errorSummary);
        }
    }, [queryClient]);

    // Flush row-level queue (legacy/simple writes)
    const handleRowFlush = useCallback(async () => {
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
    }, [queryClient]);

    // Combined flush: commands first, then rows
    const handleFlush = useCallback(async () => {
        await handleCommandFlush();
        await handleRowFlush();
        await refreshPending();
    }, [handleCommandFlush, handleRowFlush, refreshPending]);

    useEffect(() => {
        // Listen for connectivity restoration
        const handleOnline = () => {
            // Small delay to let network stabilize
            setTimeout(handleFlush, 1500);
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

    return {
        pendingCount: pendingCount + pendingCommandCount,
        pendingRowCount: pendingCount,
        pendingCommandCount,
        flushNow: handleFlush,
        refreshPending,
    };
}
