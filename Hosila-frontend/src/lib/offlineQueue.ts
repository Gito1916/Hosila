/**
 * Offline Write Queue — Enterprise-grade write resilience for Hosila PMS.
 *
 * When the network drops mid-session, writes are queued in IndexedDB (via idb-keyval)
 * and replayed in FK-safe order when the connection returns.
 *
 * Safeguards:
 *   ① tempId → realId reconciliation
 *   ② updated_at version control (last-write-wins with server authority)
 *   ③ Update collapsing (merge multiple edits to same record)
 *   ④ FK-aware replay ordering
 *   ⑤ Retry cap + dead-letter queue
 *   ⑥ Flush lock (prevent double-flush from multiple triggers)
 */

import { get as idbGet, set as idbSet } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase';
import { toast } from './errorMessages';

// ============================================================================
// Types
// ============================================================================

export interface QueuedWrite {
    id: string;                   // Queue entry UUID
    table: string;                // Supabase table name
    action: 'insert' | 'update' | 'delete';
    data: Record<string, any>;    // The payload (full record for insert, partial for update)
    recordId?: string;            // For update/delete — the record's ID
    tempId?: string;              // For insert — the optimistic temp ID
    timestamp: string;            // ISO — when the write was queued
    retryCount: number;           // How many flush attempts have failed
    dependsOnTempIds?: string[];  // tempIds this record references (FK)
}

export interface DeadLetterItem extends QueuedWrite {
    error: string;                // Last error message
    diedAt: string;               // When it was moved to dead letter
}

// ============================================================================
// Constants
// ============================================================================

const QUEUE_KEY = 'hosila:offline-queue';
const DEAD_LETTER_KEY = 'hosila:dead-letter';
const MAX_RETRIES = 5;

/**
 * FK-aware replay order. Tables with no FK deps go first.
 * Within each table, items replay in FIFO (timestamp) order.
 */
const REPLAY_ORDER: string[] = [
    'room_types',
    'guests',
    'rooms',
    'services',
    'inventory_items',
    'reservations',
    'bookings',
    'charges',
    'payments',
    'payment_allocations',
    'service_orders',
    'journal_entries',
    'inventory_movements',
    'expenses',
    'other_income',
    'issued_amenities',
    'invoices',
    'receipts',
    'transactions',
];

// ============================================================================
// Flush Lock
// ============================================================================

let _isFlushing = false;

export function isFlushing(): boolean {
    return _isFlushing;
}

// ============================================================================
// Queue Operations
// ============================================================================

async function getQueue(): Promise<QueuedWrite[]> {
    return (await idbGet(QUEUE_KEY)) ?? [];
}

async function setQueue(queue: QueuedWrite[]): Promise<void> {
    await idbSet(QUEUE_KEY, queue);
}

async function getDeadLetter(): Promise<DeadLetterItem[]> {
    return (await idbGet(DEAD_LETTER_KEY)) ?? [];
}

async function setDeadLetter(items: DeadLetterItem[]): Promise<void> {
    await idbSet(DEAD_LETTER_KEY, items);
}

/**
 * Queue a write for later replay.
 */
export async function queueWrite(
    op: Omit<QueuedWrite, 'id' | 'timestamp' | 'retryCount'>,
): Promise<void> {
    const entry: QueuedWrite = {
        ...op,
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        retryCount: 0,
    };
    const queue = await getQueue();
    queue.push(entry);
    await setQueue(queue);
}

/**
 * Get the number of pending writes.
 */
export async function getPendingCount(): Promise<number> {
    const queue = await getQueue();
    return queue.length;
}

/**
 * Get the number of dead-letter items.
 */
export async function getDeadLetterCount(): Promise<number> {
    const dl = await getDeadLetter();
    return dl.length;
}

/**
 * Clear the entire queue (used on logout after confirmation).
 */
export async function clearQueue(): Promise<void> {
    await setQueue([]);
}

/**
 * Clear dead letter queue (admin action).
 */
export async function clearDeadLetter(): Promise<void> {
    await setDeadLetter([]);
}

// ============================================================================
// Network Error Detection
// ============================================================================

/**
 * Detect if an error is a network/connectivity issue (not a validation or auth error).
 */
export function isNetworkError(err: unknown): boolean {
    if (err instanceof TypeError) {
        // fetch() throws TypeError on network failure
        const msg = err.message.toLowerCase();
        return msg.includes('failed to fetch') ||
            msg.includes('network') ||
            msg.includes('abort') ||
            msg.includes('load failed');
    }
    if (err && typeof err === 'object') {
        const e = err as Record<string, any>;
        // Supabase error codes for connectivity issues
        if (e.code === 'PGRST301' || e.code === 'ECONNREFUSED') return true;
        // Generic message checks
        const msg = (e.message || e.msg || '').toLowerCase();
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout') || msg.includes('econnrefused')) return true;
    }
    return false;
}

// ============================================================================
// Safeguard ③: Update Collapsing
// ============================================================================

/**
 * Collapse the queue before flushing:
 *  - Multiple updates to same (table, recordId) → merge into one
 *  - Insert + subsequent updates to same tempId → merge updates into the insert
 */
function collapseQueue(queue: QueuedWrite[]): QueuedWrite[] {
    const collapsed: QueuedWrite[] = [];
    // Track inserts by tempId so updates can be merged in
    const insertMap = new Map<string, QueuedWrite>();
    // Track updates by (table:recordId)
    const updateMap = new Map<string, QueuedWrite>();

    for (const item of queue) {
        if (item.action === 'insert' && item.tempId) {
            // If there's already an insert for this tempId, merge (shouldn't normally happen)
            insertMap.set(item.tempId, item);
        } else if (item.action === 'update' && item.recordId) {
            const key = `${item.table}:${item.recordId}`;

            // Check if this update targets a temp-inserted record
            if (insertMap.has(item.recordId)) {
                // Merge update data into the insert
                const insert = insertMap.get(item.recordId)!;
                insert.data = { ...insert.data, ...item.data };
                insert.timestamp = item.timestamp; // latest timestamp
                continue; // consumed into the insert
            }

            // Merge with prior updates to same record
            if (updateMap.has(key)) {
                const existing = updateMap.get(key)!;
                existing.data = { ...existing.data, ...item.data };
                existing.timestamp = item.timestamp;
                continue;
            }

            updateMap.set(key, { ...item });
        } else if (item.action === 'delete' && item.recordId) {
            const key = `${item.table}:${item.recordId}`;

            // If deleting a temp-inserted record, remove the insert entirely
            if (insertMap.has(item.recordId)) {
                insertMap.delete(item.recordId);
                continue;
            }

            // If deleting after updates, remove the updates
            if (updateMap.has(key)) {
                updateMap.delete(key);
            }

            // Keep the delete
            collapsed.push(item);
        } else {
            collapsed.push(item);
        }
    }

    // Collect all surviving entries
    return [
        ...insertMap.values(),
        ...updateMap.values(),
        ...collapsed,
    ];
}

// ============================================================================
// Safeguard ④: FK-Aware Ordering
// ============================================================================

function orderByDependency(queue: QueuedWrite[]): QueuedWrite[] {
    const tableOrder = new Map(REPLAY_ORDER.map((t, i) => [t, i]));
    const getOrder = (table: string) => tableOrder.get(table) ?? 999;

    return [...queue].sort((a, b) => {
        const orderDiff = getOrder(a.table) - getOrder(b.table);
        if (orderDiff !== 0) return orderDiff;
        // Within same table, FIFO by timestamp
        return a.timestamp.localeCompare(b.timestamp);
    });
}

// ============================================================================
// Safeguard ①: tempId → realId Reconciliation
// ============================================================================

/**
 * Replace tempId references in remaining queue items.
 * Scans all data fields for FK values matching tempId and replaces with realId.
 */
function reconcileIds(
    queue: QueuedWrite[],
    idMap: Map<string, string>,
): void {
    for (const item of queue) {
        // Replace recordId if it's a tempId
        if (item.recordId && idMap.has(item.recordId)) {
            item.recordId = idMap.get(item.recordId)!;
        }
        // Replace FK values in data
        if (item.data) {
            for (const [key, value] of Object.entries(item.data)) {
                if (typeof value === 'string' && idMap.has(value)) {
                    item.data[key] = idMap.get(value)!;
                }
            }
        }
        // Replace in dependsOnTempIds
        if (item.dependsOnTempIds) {
            item.dependsOnTempIds = item.dependsOnTempIds.map(
                id => idMap.get(id) ?? id,
            );
        }
    }
}

// ============================================================================
// Safeguard ②: updated_at Version Control
// ============================================================================

/**
 * Check if a queued update is stale (server record was modified after this write was queued).
 * Returns true if the update should be SKIPPED.
 */
async function isStaleUpdate(table: string, recordId: string, queuedTimestamp: string): Promise<boolean> {
    if (!supabase) return false;

    try {
        const { data, error } = await supabase
            .from(table)
            .select('updated_at')
            .eq('id', recordId)
            .single();

        if (error || !data?.updated_at) return false; // Can't verify — proceed
        return new Date(data.updated_at) > new Date(queuedTimestamp);
    } catch {
        return false; // Network issue during check — proceed optimistically
    }
}

// ============================================================================
// Flush: The Main Replay Engine
// ============================================================================

export interface FlushResult {
    synced: number;
    skipped: number;
    failed: number;
    deadLettered: number;
    /** Map of tempId → realId for cache reconciliation */
    idMap: Map<string, string>;
    /** Tables that were modified (for React Query invalidation) */
    affectedTables: Set<string>;
}

/**
 * Flush the offline queue to Supabase.
 * Collapses updates → orders by FK deps → replays sequentially → reconciles IDs.
 */
export async function flushQueue(): Promise<FlushResult | null> {
    // ⑥ Flush lock — prevent double-flush
    if (_isFlushing) {
        console.warn('[OfflineQueue] Flush already in progress, skipping');
        return null;
    }
    if (!supabase) {
        console.warn('[OfflineQueue] No Supabase configured, cannot flush');
        return null;
    }

    _isFlushing = true;

    const result: FlushResult = {
        synced: 0,
        skipped: 0,
        failed: 0,
        deadLettered: 0,
        idMap: new Map(),
        affectedTables: new Set(),
    };

    try {
        let queue = await getQueue();
        if (queue.length === 0) return result;

        // ③ Collapse updates
        queue = collapseQueue(queue);

        // ④ Order by FK dependencies
        queue = orderByDependency(queue);

        const deadLetter = await getDeadLetter();
        const remaining: QueuedWrite[] = [];

        for (const item of queue) {
            try {
                // ① Reconcile any FK references to already-resolved tempIds
                reconcileIds([item], result.idMap);

                if (item.action === 'insert') {
                    await replayInsert(item, result);
                } else if (item.action === 'update') {
                    await replayUpdate(item, result);
                } else if (item.action === 'delete') {
                    await replayDelete(item, result);
                }

                result.affectedTables.add(item.table);
            } catch (err) {
                if (isNetworkError(err)) {
                    // Network dropped again mid-flush — keep remaining items
                    remaining.push(item);
                    // Also keep all subsequent items (stop processing)
                    const idx = queue.indexOf(item);
                    remaining.push(...queue.slice(idx + 1));
                    break;
                }

                // Non-network error (validation, RLS, schema, etc.)
                item.retryCount++;

                if (item.retryCount >= MAX_RETRIES) {
                    // ⑤ Move to dead letter queue
                    deadLetter.push({
                        ...item,
                        error: err instanceof Error ? err.message : String(err),
                        diedAt: new Date().toISOString(),
                    });
                    result.deadLettered++;
                    console.error(`[OfflineQueue] Dead-lettered after ${MAX_RETRIES} retries:`, item.table, item.action, err);
                } else {
                    // Retry later
                    remaining.push(item);
                    result.failed++;
                    console.warn(`[OfflineQueue] Retry ${item.retryCount}/${MAX_RETRIES}:`, item.table, item.action, err);
                }
            }
        }

        // Persist remaining queue + dead letter
        await setQueue(remaining);
        await setDeadLetter(deadLetter);

        return result;
    } finally {
        _isFlushing = false;
    }
}

// ============================================================================
// Replay Helpers
// ============================================================================

async function replayInsert(item: QueuedWrite, result: FlushResult): Promise<void> {
    const sb = supabase!;

    // Remove the temp ID so Supabase can generate its own (or use server default)
    // Actually, we send the temp ID — if the server uses client-provided UUIDs it's fine.
    // If there's a conflict (UUID already exists), the insert will fail and retry.
    const { data, error } = await sb
        .from(item.table)
        .insert(item.data)
        .select()
        .single();

    if (error) throw error;

    // ① Store tempId → realId mapping
    if (item.tempId && data?.id && data.id !== item.tempId) {
        result.idMap.set(item.tempId, data.id);
    }

    result.synced++;
}

async function replayUpdate(item: QueuedWrite, result: FlushResult): Promise<void> {
    if (!item.recordId) throw new Error('Update without recordId');

    // ② Version control — check if server record is newer
    const stale = await isStaleUpdate(item.table, item.recordId, item.timestamp);
    if (stale) {
        console.info(`[OfflineQueue] Skipping stale update: ${item.table}/${item.recordId}`);
        result.skipped++;
        return;
    }

    const sb = supabase!;
    const { error } = await sb
        .from(item.table)
        .update(item.data)
        .eq('id', item.recordId);

    if (error) throw error;
    result.synced++;
}

async function replayDelete(item: QueuedWrite, result: FlushResult): Promise<void> {
    if (!item.recordId) throw new Error('Delete without recordId');

    const sb = supabase!;
    const { error } = await sb
        .from(item.table)
        .delete()
        .eq('id', item.recordId);

    if (error) throw error;
    result.synced++;
}
