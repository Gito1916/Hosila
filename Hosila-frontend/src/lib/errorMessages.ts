/**
 * Error Message Translator — converts Supabase/Postgres errors to plain English.
 *
 * Usage:
 *   import { toast } from '@/lib/errorMessages';
 *
 *   try { ... }
 *   catch (err) { toast.error('Check-in failed', err); }
 *
 *   // Success:
 *   toast.success('Room checked in successfully');
 */

import { useNotificationStore } from '@/stores/notificationStore';

// ============================================================================
// Postgres error code → plain English
// ============================================================================

const POSTGRES_ERROR_MAP: Record<string, string> = {
    // Integrity constraints
    '23505': 'This record already exists. Please use different details.',
    '23503': 'Cannot complete this action — the item is still referenced elsewhere.',
    '23502': 'A required field is missing. Please fill in all required fields.',
    '23514': 'The value you entered is not valid for this field.',

    // Permission / RLS
    '42501': "You don't have permission to perform this action.",
    '42000': "You don't have permission to perform this action.",

    // Resource
    '53300': 'The server is too busy right now. Please try again in a moment.',
    '57014': 'The operation took too long and was cancelled. Please try again.',

    // Syntax (shouldn't reach users, but just in case)
    '42601': 'An unexpected error occurred. Please contact support.',
    '42703': 'An unexpected error occurred. Please contact support.',
};

// ============================================================================
// Named constraint → context-specific plain English
// ============================================================================

const CONSTRAINT_MAP: Record<string, string> = {
    // Reservation overlap (our new exclusion constraint)
    'no_overlapping_reservations': 'This room is already booked for those dates. Please choose different dates or another room.',

    // Unique constraints
    'rooms_hotel_id_room_number_key': 'A room with this number already exists.',
    'guests_hotel_id_id_number_key': 'A guest with this ID number already exists.',
    'users_email_key': 'An account with this email already exists.',
    'services_hotel_id_name_key': 'A service with this name already exists.',
    'room_types_hotel_id_name_key': 'A room type with this name already exists.',
    'inventory_items_hotel_id_name_key': 'An inventory item with this name already exists.',

    // Foreign key constraints
    'bookings_room_id_fkey': 'This room no longer exists or was removed.',
    'bookings_guest_id_fkey': 'This guest no longer exists or was removed.',
    'service_orders_booking_id_fkey': 'The booking for this order no longer exists.',
    'reservations_room_id_fkey': 'This room no longer exists or was removed.',
};

// ============================================================================
// Supabase Auth error → plain English
// ============================================================================

const AUTH_ERROR_MAP: Record<string, string> = {
    'Invalid login credentials': 'Wrong email or password. Please try again.',
    'Email not confirmed': 'Please check your email and click the confirmation link before signing in.',
    'User already registered': 'An account with this email already exists. Try signing in instead.',
    'Password should be at least 6 characters': 'Password must be at least 6 characters.',
    'Signup requires a valid password': 'Please enter a valid password.',
    'Email rate limit exceeded': 'Too many attempts. Please wait a few minutes before trying again.',
    'For security purposes, you can only request this once every 60 seconds': 'Please wait 60 seconds before trying again.',
};

// ============================================================================
// Core translator
// ============================================================================

/**
 * Translates a raw error (Supabase, Postgres, network, or generic) into
 * a human-readable plain English message.
 */
export function translateError(err: unknown): string {
    if (!err) return 'An unexpected error occurred.';

    // String error
    if (typeof err === 'string') {
        return AUTH_ERROR_MAP[err] || err;
    }

    const error = err as Record<string, any>;

    // Supabase/Postgres error object with code + constraint
    if (error.code && typeof error.code === 'string') {
        // Check named constraint first (most specific)
        if (error.constraint && CONSTRAINT_MAP[error.constraint]) {
            return CONSTRAINT_MAP[error.constraint];
        }

        // Check constraint name in message (sometimes not in .constraint)
        if (error.message && typeof error.message === 'string') {
            for (const [constraint, msg] of Object.entries(CONSTRAINT_MAP)) {
                if (error.message.includes(constraint)) {
                    return msg;
                }
            }
        }

        // Check Postgres error code
        if (POSTGRES_ERROR_MAP[error.code]) {
            return POSTGRES_ERROR_MAP[error.code];
        }
    }

    // Supabase Auth error (has .message directly)
    if (error.message && typeof error.message === 'string') {
        // Check auth error map
        for (const [pattern, msg] of Object.entries(AUTH_ERROR_MAP)) {
            if (error.message.includes(pattern)) {
                return msg;
            }
        }

        // Network errors
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            return 'Unable to connect to the server. Please check your internet connection.';
        }
        if (error.message.includes('timeout') || error.message.includes('Timeout')) {
            return 'The request timed out. Please try again.';
        }
        if (error.message.includes('CORS') || error.message.includes('cors')) {
            return 'A connection error occurred. Please try again.';
        }

        // If the message is already reasonably readable (no Postgres jargon), use it
        if (!error.message.includes('violates') &&
            !error.message.includes('constraint') &&
            !error.message.includes('relation') &&
            !error.message.includes('column') &&
            error.message.length < 200) {
            return error.message;
        }
    }

    // Fallback
    return 'Something went wrong. Please try again.';
}

// ============================================================================
// Toast helpers — call directly without hooks
// ============================================================================

/**
 * Global toast helpers that can be called from anywhere (inside or outside React components).
 *
 * Usage:
 *   toast.error('Check-in failed', err)   // Shows translated error as red toast
 *   toast.success('Guest checked in')     // Shows green toast
 *   toast.info('Processing...')           // Shows blue toast
 *   toast.warn('Low inventory')           // Shows amber toast
 */
export const toast = {
    /** Show a red error toast. Translates raw errors to plain English. */
    error(title: string, err?: unknown) {
        const message = err ? translateError(err) : '';
        useNotificationStore.getState().addNotification({
            type: 'error',
            title,
            message,
        });
    },

    /** Show a green success toast. */
    success(title: string, message?: string) {
        useNotificationStore.getState().addNotification({
            type: 'success',
            title,
            message: message ?? '',
        });
    },

    /** Show a blue info toast. */
    info(title: string, message?: string) {
        useNotificationStore.getState().addNotification({
            type: 'info',
            title,
            message: message ?? '',
        });
    },

    /** Show an amber warning toast. */
    warn(title: string, message?: string) {
        useNotificationStore.getState().addNotification({
            type: 'warning',
            title,
            message: message ?? '',
        });
    },
};
