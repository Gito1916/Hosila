/**
 * Command Queue — business-level offline sync for Hosila PMS.
 *
 * Instead of queuing individual INSERT/UPDATE/DELETE operations per table,
 * this queues **business commands** (check_in, record_payment, etc.) that
 * are replayed via client-side functions when connectivity returns.
 *
 * Each command carries an idempotency key. On flush, we first check the
 * server-side `execute_command` RPC — if the key was already executed,
 * we skip (preventing double-execution). Otherwise, we run the actual
 * business function and mark it complete.
 */

import { get as idbGet, set as idbSet } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase';

// ============================================================================
// Types
// ============================================================================

export type CommandName =
    | 'check_in'
    | 'check_out'
    | 'record_payment'
    | 'update_room_status'
    | 'post_restaurant_order'
    | 'extend_stay'
    | 'add_note';

export interface OfflineCommand {
    id: string;                      // Queue entry UUID
    idempotencyKey: string;          // Prevents server-side double-execution
    command: CommandName;             // Business operation name
    payload: Record<string, any>;    // Command-specific data
    createdAt: string;               // ISO timestamp
    status: 'pending' | 'syncing' | 'synced' | 'failed';
    retryCount: number;
    error?: string;                  // Last error message
}

export interface CommandFlushResult {
    synced: number;
    failed: number;
    errors: Array<{ command: string; error: string }>;
}

// ============================================================================
// Constants
// ============================================================================

const COMMAND_QUEUE_KEY = 'hosila:command-queue';
const MAX_RETRIES = 5;

// ============================================================================
// Flush Lock
// ============================================================================

let _isCommandFlushing = false;

export function isCommandFlushing(): boolean {
    return _isCommandFlushing;
}

// ============================================================================
// Queue Operations
// ============================================================================

async function getCommands(): Promise<OfflineCommand[]> {
    return (await idbGet(COMMAND_QUEUE_KEY)) ?? [];
}

async function setCommands(commands: OfflineCommand[]): Promise<void> {
    await idbSet(COMMAND_QUEUE_KEY, commands);
}

/**
 * Queue a business command for later execution.
 * Returns the idempotency key for optimistic cache tracking.
 */
export async function queueCommand(
    command: CommandName,
    payload: Record<string, any>,
): Promise<string> {
    const idempotencyKey = uuidv4();
    const entry: OfflineCommand = {
        id: uuidv4(),
        idempotencyKey,
        command,
        payload,
        createdAt: new Date().toISOString(),
        status: 'pending',
        retryCount: 0,
    };

    const commands = await getCommands();
    commands.push(entry);
    await setCommands(commands);

    return idempotencyKey;
}

/**
 * Get the number of pending commands.
 */
export async function getPendingCommandCount(): Promise<number> {
    const commands = await getCommands();
    return commands.filter(c => c.status === 'pending' || c.status === 'failed').length;
}

/**
 * Clear the command queue (used on logout).
 */
export async function clearCommandQueue(): Promise<void> {
    await setCommands([]);
}

// ============================================================================
// Command Executor — maps command names to actual business functions
// ============================================================================

/**
 * Execute a single command by calling the appropriate business function.
 * This is where we map command names to their actual implementations.
 */
async function executeBusinessCommand(cmd: OfflineCommand): Promise<void> {
    switch (cmd.command) {
        case 'check_in': {
            const { checkIn } = await import('@/db/bookings');
            await checkIn(cmd.payload as any);
            break;
        }
        case 'check_out': {
            const { checkOut } = await import('@/db/bookings');
            await checkOut(cmd.payload.bookingId, cmd.payload.userId);
            break;
        }
        case 'record_payment': {
            const { recordPayment } = await import('@/db/bookings');
            await recordPayment(
                cmd.payload.bookingId,
                cmd.payload.amount,
                cmd.payload.method,
                cmd.payload.userId,
                cmd.payload.reference,
            );
            break;
        }
        case 'update_room_status': {
            const { updateRoomStatus } = await import('@/db/rooms');
            await updateRoomStatus(cmd.payload.roomId, cmd.payload.status);
            break;
        }
        case 'post_restaurant_order': {
            // Restaurant orders use the service_orders table directly
            const sb = (await import('@/lib/supabase')).supabase;
            if (!sb) throw new Error('Supabase not configured');
            const { error } = await sb.from('service_orders').insert(cmd.payload.orders);
            if (error) throw error;
            break;
        }
        case 'extend_stay': {
            const { extendShortRest, extendNightStay } = await import('@/db/bookings');
            if (cmd.payload.bookingType === 'short_rest') {
                await extendShortRest(
                    cmd.payload.bookingId,
                    cmd.payload.additionalHours,
                    cmd.payload.additionalRate,
                    cmd.payload.userId,
                );
            } else {
                await extendNightStay(
                    cmd.payload.bookingId,
                    cmd.payload.additionalNights,
                    cmd.payload.additionalRate,
                    cmd.payload.userId,
                );
            }
            break;
        }
        case 'add_note': {
            const sb = (await import('@/lib/supabase')).supabase;
            if (!sb) throw new Error('Supabase not configured');
            await sb.from(cmd.payload.table)
                .update({ notes: cmd.payload.notes, updated_at: new Date().toISOString() })
                .eq('id', cmd.payload.recordId);
            break;
        }
        default:
            throw new Error(`Unknown command: ${cmd.command}`);
    }
}

// ============================================================================
// Flush: Replay pending commands via client-side business functions
// ============================================================================

/**
 * Flush pending commands to the server.
 *
 * For each command:
 *   1. Call `execute_command` RPC to check idempotency
 *   2. If 'already_executed', skip (prevents double-execution)
 *   3. If 'execute', run the actual business function client-side
 */
export async function flushCommands(): Promise<CommandFlushResult | null> {
    if (_isCommandFlushing) {
        console.warn('[CommandQueue] Flush already in progress');
        return null;
    }
    if (!supabase) {
        console.warn('[CommandQueue] No Supabase configured');
        return null;
    }

    _isCommandFlushing = true;

    const result: CommandFlushResult = {
        synced: 0,
        failed: 0,
        errors: [],
    };

    try {
        const commands = await getCommands();
        const pending = commands.filter(c => c.status === 'pending' || c.status === 'failed');

        if (pending.length === 0) return result;

        for (const cmd of pending) {
            try {
                cmd.status = 'syncing';
                await setCommands(commands);

                // Step 1: Check idempotency via server RPC
                const { data: idempResult, error: rpcError } = await supabase.rpc('execute_command', {
                    p_command: cmd.command,
                    p_payload: cmd.payload,
                    p_idempotency_key: cmd.idempotencyKey,
                });

                if (rpcError) {
                    throw new Error(rpcError.message);
                }

                if (idempResult?.status === 'already_executed') {
                    // Already synced previously — just mark as done
                    cmd.status = 'synced';
                    result.synced++;
                    continue;
                }

                // Step 2: Execute the actual business logic
                await executeBusinessCommand(cmd);

                // Success
                cmd.status = 'synced';
                result.synced++;

            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);

                // Network error — stop flushing, retry later
                if (isNetworkError(err)) {
                    cmd.status = 'pending';
                    console.warn('[CommandQueue] Network error, pausing flush');
                    break;
                }

                // Business logic error
                cmd.retryCount++;
                if (cmd.retryCount >= MAX_RETRIES) {
                    cmd.status = 'failed';
                    cmd.error = errMsg;
                    result.errors.push({ command: cmd.command, error: errMsg });
                    console.error(`[CommandQueue] Command permanently failed: ${cmd.command}`, errMsg);
                } else {
                    cmd.status = 'failed';
                    cmd.error = errMsg;
                    result.failed++;
                    console.warn(`[CommandQueue] Retry ${cmd.retryCount}/${MAX_RETRIES}: ${cmd.command}`, errMsg);
                }
            }
        }

        // Remove synced commands, keep pending/failed
        const remaining = commands.filter(c => c.status !== 'synced');
        await setCommands(remaining);

        return result;
    } finally {
        _isCommandFlushing = false;
    }
}

/**
 * Get all commands (for debug/admin UI).
 */
export async function getAllCommands(): Promise<OfflineCommand[]> {
    return getCommands();
}

// ============================================================================
// Network Error Detection
// ============================================================================

function isNetworkError(err: unknown): boolean {
    if (err instanceof TypeError) {
        const msg = err.message.toLowerCase();
        return msg.includes('failed to fetch') ||
            msg.includes('network') ||
            msg.includes('abort') ||
            msg.includes('load failed');
    }
    if (err && typeof err === 'object') {
        const e = err as Record<string, any>;
        if (e.code === 'PGRST301' || e.code === 'ECONNREFUSED') return true;
        const msg = (e.message || e.msg || '').toLowerCase();
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) return true;
    }
    return false;
}
