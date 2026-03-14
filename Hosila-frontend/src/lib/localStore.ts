/**
 * Local Read Store — IndexedDB cache for critical hotel tables.
 *
 * Stores the last-known-good snapshot of key tables so the app can
 * render a useful (read-only / degraded) UI while offline.
 *
 * Uses idb-keyval with namespaced keys.
 */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

// ============================================================================
// Types
// ============================================================================

export interface LocalCacheEntry<T> {
    data: T[];
    lastSynced: string; // ISO timestamp
}

/** Tables we cache locally for offline reads */
export const CACHED_TABLES = [
    'rooms',
    'room_types',
    'bookings',
    'guests',
    'reservations',
    'services',
    'service_orders',
    'inventory_items',
    'hotels',
    'charges',
    'payments',
    'payment_allocations',
] as const;

export type CachedTable = typeof CACHED_TABLES[number];

// ============================================================================
// Key helpers
// ============================================================================

const KEY_PREFIX = 'hosila:local:';
const cacheKey = (table: string) => `${KEY_PREFIX}${table}`;

// ============================================================================
// Public API
// ============================================================================

/**
 * Save a table's full dataset to the local cache.
 * Called after every successful cloud fetch (via React Query onSuccess / select).
 */
export async function saveToLocal<T>(table: CachedTable, data: T[]): Promise<void> {
    const entry: LocalCacheEntry<T> = {
        data,
        lastSynced: new Date().toISOString(),
    };
    await idbSet(cacheKey(table), entry);
}

/**
 * Load a table's dataset from the local cache.
 * Returns null if no cache exists (first-ever load while offline).
 */
export async function loadFromLocal<T>(table: CachedTable): Promise<LocalCacheEntry<T> | null> {
    const entry = await idbGet(cacheKey(table)) as LocalCacheEntry<T> | undefined;
    return entry ?? null;
}

/**
 * Get the last synced timestamp for a table.
 */
export async function getLastSynced(table: CachedTable): Promise<string | null> {
    const entry = await idbGet(cacheKey(table)) as LocalCacheEntry<unknown> | undefined;
    return entry?.lastSynced ?? null;
}

/**
 * Save a single record into the local cache for a table.
 * Used for optimistic updates — patches the matching record in the array.
 */
export async function patchLocalRecord<T extends { id: string }>(
    table: CachedTable,
    id: string,
    patch: Partial<T>,
): Promise<void> {
    const entry = await loadFromLocal<T>(table);
    if (!entry) return;

    const updated = entry.data.map(item =>
        item.id === id ? { ...item, ...patch } : item
    );
    await saveToLocal(table, updated);
}

/**
 * Add a record to the local cache for a table.
 * Used for optimistic inserts.
 */
export async function addLocalRecord<T>(table: CachedTable, record: T): Promise<void> {
    const entry = await loadFromLocal<T>(table);
    const data = entry?.data ?? [];
    data.push(record);
    await saveToLocal(table, data);
}

/**
 * Remove a record from the local cache.
 */
export async function removeLocalRecord<T extends { id: string }>(
    table: CachedTable,
    id: string,
): Promise<void> {
    const entry = await loadFromLocal<T>(table);
    if (!entry) return;
    const data = entry.data.filter(item => item.id !== id);
    await saveToLocal(table, data);
}

/**
 * Clear all local caches (called on logout).
 */
export async function clearLocalStore(): Promise<void> {
    for (const table of CACHED_TABLES) {
        await idbDel(cacheKey(table));
    }
}

/**
 * Check if we have any locally cached data at all.
 * Used to determine if offline mode is viable.
 */
export async function hasLocalData(): Promise<boolean> {
    // Check if at least rooms and hotels are cached (minimum for useful offline)
    const rooms = await loadFromLocal('rooms');
    const hotels = await loadFromLocal('hotels');
    return rooms !== null && hotels !== null && rooms.data.length > 0;
}
