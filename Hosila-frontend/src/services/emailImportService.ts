/**
 * Email Import Service
 * Orchestrates: fetch Gmail emails → parse → deduplicate → create reservations
 */

import { fetchOTAEmails, extractEmailBody, getHeader, markAsRead, type GmailMessage } from '@/lib/gmail';
import { detectOTASource, parseBookingComEmail, parseAirbnbEmail, type ParsedReservation } from '@/lib/emailParser';
import { createReservation } from '@/db/reservations';
import { requireSupabase, getHotelId } from '@/lib/api';

// =========================================================================
// Types
// =========================================================================

export interface ImportResult {
    messageId: string;
    status: 'imported' | 'duplicate' | 'failed' | 'unrecognized';
    reservation?: ParsedReservation;
    error?: string;
    createdReservationId?: string;
}

export interface ImportSummary {
    total: number;
    imported: number;
    duplicates: number;
    failed: number;
    unrecognized: number;
    results: ImportResult[];
    scannedAt: Date;
}

// Storage keys
const LAST_SCAN_KEY = 'hotelflow_email_last_scan';
const IMPORT_LOG_KEY = 'hotelflow_email_import_log';

// =========================================================================
// Last Scan Tracking
// =========================================================================

export function getLastScanDate(): Date | null {
    const stored = localStorage.getItem(LAST_SCAN_KEY);
    if (!stored) return null;
    const date = new Date(stored);
    return isNaN(date.getTime()) ? null : date;
}

function setLastScanDate(date: Date): void {
    localStorage.setItem(LAST_SCAN_KEY, date.toISOString());
}

// =========================================================================
// Import Log
// =========================================================================

export function getImportLog(): ImportSummary[] {
    try {
        const stored = localStorage.getItem(IMPORT_LOG_KEY);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch {
        return [];
    }
}

function saveImportLog(summary: ImportSummary): void {
    const log = getImportLog();
    log.unshift(summary); // Most recent first
    // Keep last 50 entries
    if (log.length > 50) log.length = 50;
    localStorage.setItem(IMPORT_LOG_KEY, JSON.stringify(log));
}

// =========================================================================
// Deduplication
// =========================================================================

/**
 * Check if a booking reference has already been imported
 */
async function isDuplicate(bookingRef: string): Promise<boolean> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data: reservations } = await sb.from('reservations').select('*').eq('hotel_id', hotelId);
    return (reservations ?? []).filter((r: any) => r.notes?.includes(bookingRef)).length > 0;
}

// =========================================================================
// Room Auto-Assignment
// =========================================================================

/**
 * Try to find an available room matching the parsed room type.
 * Returns null if no match found (reservation needs manual assignment).
 */
async function findAvailableRoom(
    parsed: ParsedReservation
): Promise<string | null> {
    const hotelId = await getHotelId();
    const rooms = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('rooms').select('*').eq('hotel_id', hotelId).eq('hotel_id', hotelId); return data ?? []; })();

    if (rooms.length === 0) return null;

    const sb = requireSupabase();
    const { data: conflictingBookings } = await sb.from('bookings').select('*').eq('hotel_id', hotelId).eq('status', 'active');
    const filteredBookings = (conflictingBookings ?? []).filter((b: any) =>
        new Date(b.check_in_time) < parsed.checkOut &&
        new Date(b.check_out_time) > parsed.checkIn
    );

    const { data: conflictingReservations } = await sb.from('reservations').select('*').eq('hotel_id', hotelId).eq('status', 'confirmed');
    const filteredReservations = (conflictingReservations ?? []).filter((r: any) =>
        r.status === 'confirmed' &&
        new Date(r.check_in_date) < parsed.checkOut &&
        new Date(r.check_out_date) > parsed.checkIn
    );

    const occupiedRoomIds = new Set([
        ...filteredBookings.map((b: any) => b.room_id),
        ...filteredReservations.map((r: any) => r.room_id),
    ]);

    // Filter available rooms
    const availableRooms = rooms.filter(r =>
        r.status === 'available' && !occupiedRoomIds.has(r.id)
    );

    if (availableRooms.length === 0) return null;

    // Try to match room type if specified
    if (parsed.roomType) {
        const typeMatch = availableRooms.find(r =>
            r.room_type.toLowerCase().includes(parsed.roomType!.toLowerCase()) ||
            parsed.roomType!.toLowerCase().includes(r.room_type.toLowerCase())
        );
        if (typeMatch) return typeMatch.id;
    }

    // Default to first available room
    return availableRooms[0].id;
}

// =========================================================================
// Main Import Function
// =========================================================================

/**
 * Scan Gmail for new OTA reservation emails and import them.
 */
export async function scanForNewReservations(): Promise<ImportSummary> {
    const lastScan = getLastScanDate();
    const scanDate = new Date();
    const results: ImportResult[] = [];

    // Fetch emails (only after last scan, or last 30 days for first scan)
    const afterDate = lastScan || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const messages = await fetchOTAEmails(afterDate);

    for (const message of messages) {
        const result = await processEmail(message);
        results.push(result);
    }

    // Update last scan timestamp
    setLastScanDate(scanDate);

    const summary: ImportSummary = {
        total: results.length,
        imported: results.filter(r => r.status === 'imported').length,
        duplicates: results.filter(r => r.status === 'duplicate').length,
        failed: results.filter(r => r.status === 'failed').length,
        unrecognized: results.filter(r => r.status === 'unrecognized').length,
        results,
        scannedAt: scanDate,
    };

    saveImportLog(summary);
    return summary;
}

/**
 * Process a single email message
 */
async function processEmail(message: GmailMessage): Promise<ImportResult> {
    const from = getHeader(message, 'From');
    const subject = getHeader(message, 'Subject');
    const emailDate = new Date(parseInt(message.internalDate));

    // Detect OTA source
    const source = detectOTASource(from, subject);
    if (source === 'unknown') {
        return {
            messageId: message.id,
            status: 'unrecognized',
        };
    }

    // Extract email body
    const body = extractEmailBody(message);
    if (!body) {
        return {
            messageId: message.id,
            status: 'failed',
            error: 'Could not extract email body',
        };
    }

    // Parse based on source
    let parsed: ParsedReservation | null = null;
    if (source === 'booking.com') {
        parsed = parseBookingComEmail(body, subject, emailDate);
    } else if (source === 'airbnb') {
        parsed = parseAirbnbEmail(body, subject, emailDate);
    }

    if (!parsed) {
        return {
            messageId: message.id,
            status: 'failed',
            error: `Failed to parse ${source} email`,
        };
    }

    // Check for duplicates
    if (await isDuplicate(parsed.bookingRef)) {
        // Mark as read even for duplicates so we don't re-fetch
        await markAsRead(message.id).catch(() => { });
        return {
            messageId: message.id,
            status: 'duplicate',
            reservation: parsed,
        };
    }

    // Try to import
    try {
        const reservationId = await importParsedReservation(parsed);
        // Mark as read after successful import
        await markAsRead(message.id).catch(() => { });
        return {
            messageId: message.id,
            status: 'imported',
            reservation: parsed,
            createdReservationId: reservationId,
        };
    } catch (err: any) {
        return {
            messageId: message.id,
            status: 'failed',
            reservation: parsed,
            error: err.message || 'Import failed',
        };
    }
}

/**
 * Import a parsed reservation into the database
 */
async function importParsedReservation(parsed: ParsedReservation): Promise<string> {
    // Find an available room
    const roomId = await findAvailableRoom(parsed);

    if (!roomId) {
        throw new Error('No available room found. Please assign a room manually.');
    }

    const reservation = await createReservation({
        guestName: parsed.guestName,
        guestEmail: parsed.guestEmail,
        guestPhone: parsed.guestPhone,
        roomId,
        checkInDate: parsed.checkIn,
        checkOutDate: parsed.checkOut,
        source: parsed.source,
        depositPaid: 0,
        notes: parsed.notes || `Imported from ${parsed.source} - Ref: ${parsed.bookingRef}`,
        createdBy: 'email-import',
    });

    return reservation.id;
}
