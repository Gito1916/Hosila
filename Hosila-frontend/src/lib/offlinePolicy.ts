/**
 * Offline Policy — defines what is allowed vs blocked when the app is offline.
 *
 * The philosophy: allow low-risk reads and writes that can be safely replayed,
 * block anything that requires global availability or sequential numbering.
 */

// ============================================================================
// Action definitions
// ============================================================================

export type OfflineAction =
    // ✅ ALLOWED offline
    | 'view_rooms'
    | 'view_bookings'
    | 'view_guests'
    | 'view_dashboard'
    | 'view_reservations'
    | 'view_restaurant'
    | 'view_inventory'
    | 'update_housekeeping'
    | 'add_note'
    | 'restaurant_order'       // only for in-house guests
    | 'record_payment'
    | 'check_in'               // allowed with conflict risk acknowledged
    // ❌ BLOCKED offline
    | 'new_reservation'
    | 'room_reassignment'
    | 'check_out'
    | 'invoice_finalize'
    | 'settings'
    | 'user_management'
    | 'financial_reports'
    | 'inventory_restock'
    | 'email_integration';

// ============================================================================
// Policy map
// ============================================================================

interface PolicyEntry {
    allowed: boolean;
    reason: string;
}

const POLICY: Record<OfflineAction, PolicyEntry> = {
    // ✅ Allowed
    view_rooms: { allowed: true, reason: '' },
    view_bookings: { allowed: true, reason: '' },
    view_guests: { allowed: true, reason: '' },
    view_dashboard: { allowed: true, reason: '' },
    view_reservations: { allowed: true, reason: '' },
    view_restaurant: { allowed: true, reason: '' },
    view_inventory: { allowed: true, reason: '' },
    update_housekeeping: { allowed: true, reason: '' },
    add_note: { allowed: true, reason: '' },
    restaurant_order: { allowed: true, reason: '' },
    record_payment: { allowed: true, reason: '' },
    check_in: { allowed: true, reason: '' },

    // ❌ Blocked
    new_reservation: { allowed: false, reason: 'New reservations require a live availability check' },
    room_reassignment: { allowed: false, reason: 'Room assignment needs real-time availability' },
    check_out: { allowed: false, reason: 'Checkout requires finalized accounting' },
    invoice_finalize: { allowed: false, reason: 'Invoice numbering must be sequential' },
    settings: { allowed: false, reason: 'Settings changes need immediate server sync' },
    user_management: { allowed: false, reason: 'User management requires server validation' },
    financial_reports: { allowed: false, reason: 'Reports need up-to-date aggregations' },
    inventory_restock: { allowed: false, reason: 'Inventory restocking needs stock verification' },
    email_integration: { allowed: false, reason: 'Email requires an active connection' },
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if an action is allowed while offline.
 * When online, all actions are allowed.
 */
export function isActionAllowed(action: OfflineAction): boolean {
    if (navigator.onLine) return true;
    return POLICY[action]?.allowed ?? false;
}

/**
 * Get the reason an action is blocked offline.
 * Returns empty string if the action is allowed.
 */
export function getBlockReason(action: OfflineAction): string {
    if (navigator.onLine) return '';
    return POLICY[action]?.reason ?? '';
}

/**
 * Check if the app is currently online.
 * Convenience wrapper used throughout the app.
 */
export function isOnline(): boolean {
    return navigator.onLine;
}

/**
 * Get a user-friendly description of what's available offline.
 */
export function getOfflineCapabilities(): { allowed: string[]; blocked: string[] } {
    return {
        allowed: [
            'View rooms, bookings, and guests',
            'Check in guests',
            'Record payments',
            'Place restaurant orders for in-house guests',
            'Update housekeeping status',
            'Add internal notes',
        ],
        blocked: [
            'Create new reservations',
            'Process checkout',
            'Finalize invoices',
            'Change room assignments',
            'Access settings',
            'Run financial reports',
        ],
    };
}
