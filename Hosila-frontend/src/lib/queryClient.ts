/**
 * React Query Client — with IndexedDB cache persistence for offline support.
 *
 * The cache is persisted to IndexedDB so that after a page reload while offline,
 * the app still has data to display. Stale data is revalidated when connectivity returns.
 */

import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

// ============================================================================
// Query Client
// ============================================================================

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 1000,           // 5 seconds — quick revalidation for responsive UI
            gcTime: 24 * 60 * 60 * 1000,   // 24 hours — keep cache alive for offline
            retry: 2,
            refetchOnWindowFocus: true,
            refetchOnReconnect: 'always',   // Always refetch on reconnect to get fresh data
            networkMode: 'offlineFirst',    // Serve cache first, then revalidate from network
        },
        mutations: {
            retry: 1,
            networkMode: 'offlineFirst',
        },
    },
});

// ============================================================================
// IndexedDB Persister (custom, using idb-keyval)
// ============================================================================

const PERSIST_KEY = 'hosila:react-query-cache';
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

const idbPersister = {
    persistClient: async (client: any) => {
        try {
            await idbSet(PERSIST_KEY, client);
        } catch (err) {
            console.warn('[QueryClient] Failed to persist cache:', err);
        }
    },
    restoreClient: async () => {
        try {
            return await idbGet(PERSIST_KEY);
        } catch (err) {
            console.warn('[QueryClient] Failed to restore cache:', err);
            return undefined;
        }
    },
    removeClient: async () => {
        try {
            await idbDel(PERSIST_KEY);
        } catch (err) {
            console.warn('[QueryClient] Failed to remove cache:', err);
        }
    },
};

// ============================================================================
// Initialize persistence
// ============================================================================

persistQueryClient({
    queryClient,
    persister: idbPersister,
    maxAge: PERSIST_MAX_AGE,
    // Only persist specific query keys (critical tables)
    dehydrateOptions: {
        shouldDehydrateQuery: (query) => {
            // Only persist queries that have data and aren't errored
            if (query.state.status !== 'success') return false;

            // Persist critical table queries
            const key = query.queryKey[0] as string;
            const persistedKeys = new Set([
                'hotel', 'rooms', 'roomTypes', 'guests', 'reservations',
                'bookings', 'services', 'serviceOrders', 'payments',
                'inventoryItems', 'charges', 'paymentAllocations',
            ]);
            return persistedKeys.has(key);
        },
    },
});
