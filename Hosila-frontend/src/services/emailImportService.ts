/**
 * Email Import Service
 * Orchestrates: fetch Gmail emails → parse → deduplicate → create reservations
 * 
 * Key behavior:
 * - If no room available, creates reservation with room_id=null + needs_attention=true
 * - Import logs stored in DB (email_import_logs), not localStorage
 * - Dedup by gmail_message_id in DB, not booking ref in notes
 * - Emails always marked as read after recording (success or needs-attention)
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
    status: 'imported' | 'imported_needs_attention' | 'duplicate' | 'failed' | 'unrecognized';
    reservation?: ParsedReservation;
    error?: string;
    createdReservationId?: string;
    attentionReason?: string;
}

export interface ImportSummary {
    total: number;
    imported: number;
    needsAttention: number;
    duplicates: number;
    failed: number;
    unrecognized: number;
    results: ImportResult[];
    scannedAt: Date;
}

// Legacy localStorage keys (kept for backward compat of last-scan date)
const LAST_SCAN_KEY = 'hotelflow_email_last_scan';

// =========================================================================
// Last Scan Tracking (still localStorage — lightweight, per-device is OK)
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
// Import Log (DB-backed)
// =========================================================================

export interface EmailImportLog {
    id: string;
    hotel_id: string;
    gmail_message_id: string;
    status: string;
    guest_name: string | null;
    guest_email: string | null;
    guest_phone: string | null;
    source: string | null;
    booking_ref: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
    requested_room_type: string | null;
    reservation_id: string | null;
    error_message: string | null;
    attention_reason: string | null;
    scanned_at: string;
    created_at: string;
}

/**
 * Get recent import logs from the database
 */
export async function getImportLogs(limit = 50): Promise<EmailImportLog[]> {
    try {
        const sb = requireSupabase();
        const hotelId = await getHotelId();
        const { data, error } = await sb.from('email_import_logs')
            .select('*')
            .eq('hotel_id', hotelId)
            .order('scanned_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data ?? [];
    } catch {
        return [];
    }
}

/**
 * Get count of needs-attention items
 */
export async function getNeedsAttentionCount(): Promise<number> {
    try {
        const sb = requireSupabase();
        const hotelId = await getHotelId();
        const { count, error } = await sb.from('email_import_logs')
            .select('*', { count: 'exact', head: true })
            .eq('hotel_id', hotelId)
            .eq('status', 'imported_needs_attention');
        if (error) throw error;
        return count ?? 0;
    } catch {
        return 0;
    }
}

/**
 * Save an import result to the database
 */
async function saveImportLog(
    messageId: string,
    status: ImportResult['status'],
    parsed: ParsedReservation | null,
    reservationId?: string,
    errorMessage?: string,
    attentionReason?: string,
): Promise<void> {
    try {
        const sb = requireSupabase();
        const hotelId = await getHotelId();
        await sb.from('email_import_logs').upsert({
            hotel_id: hotelId,
            gmail_message_id: messageId,
            status,
            guest_name: parsed?.guestName || null,
            guest_email: parsed?.guestEmail || null,
            guest_phone: parsed?.guestPhone || null,
            source: parsed?.source || null,
            booking_ref: parsed?.bookingRef || null,
            check_in_date: parsed?.checkIn?.toISOString() || null,
            check_out_date: parsed?.checkOut?.toISOString() || null,
            requested_room_type: parsed?.roomType || null,
            reservation_id: reservationId || null,
            error_message: errorMessage || null,
            attention_reason: attentionReason || null,
            scanned_at: new Date().toISOString(),
        }, { onConflict: 'hotel_id,gmail_message_id' });
    } catch (err) {
        console.error('Failed to save import log:', err);
    }
}

// =========================================================================
// Deduplication (DB-backed)
// =========================================================================

/**
 * Check if a gmail message has already been processed
 */
async function isDuplicateMessage(gmailMessageId: string): Promise<boolean> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data } = await sb.from('email_import_logs')
        .select('id')
        .eq('hotel_id', hotelId)
        .eq('gmail_message_id', gmailMessageId)
        .limit(1);
    return (data ?? []).length > 0;
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
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data: rooms } = await sb.from('rooms').select('*').eq('hotel_id', hotelId);
    if (!rooms || rooms.length === 0) return null;

    // Get active bookings overlapping the requested dates
    const { data: conflictingBookings } = await sb.from('bookings')
        .select('room_id')
        .eq('hotel_id', hotelId)
        .eq('status', 'active');
    const filteredBookings = (conflictingBookings ?? []).filter((b: any) =>
        new Date(b.check_in_time) < parsed.checkOut &&
        new Date(b.check_out_time) > parsed.checkIn
    );

    // Get confirmed reservations overlapping the requested dates
    const { data: conflictingReservations } = await sb.from('reservations')
        .select('room_id, check_in_date, check_out_date')
        .eq('hotel_id', hotelId)
        .eq('status', 'confirmed');
    const filteredReservations = (conflictingReservations ?? []).filter((r: any) =>
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
        needsAttention: results.filter(r => r.status === 'imported_needs_attention').length,
        duplicates: results.filter(r => r.status === 'duplicate').length,
        failed: results.filter(r => r.status === 'failed').length,
        unrecognized: results.filter(r => r.status === 'unrecognized').length,
        results,
        scannedAt: scanDate,
    };

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

    // Check if already processed (DB-backed dedup by gmail message ID)
    if (await isDuplicateMessage(message.id)) {
        // Mark as read in case it was left unread from a previous partial run
        await markAsRead(message.id).catch(() => { });
        return {
            messageId: message.id,
            status: 'duplicate',
        };
    }

    // Extract email body
    const body = extractEmailBody(message);
    if (!body) {
        await saveImportLog(message.id, 'failed', null, undefined, 'Could not extract email body');
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
        await saveImportLog(message.id, 'failed', null, undefined, `Failed to parse ${source} email`);
        return {
            messageId: message.id,
            status: 'failed',
            error: `Failed to parse ${source} email`,
        };
    }

    // Try to import
    try {
        const result = await importParsedReservation(parsed, message.id);

        // Always mark as read after successful recording
        await markAsRead(message.id).catch(() => { });

        // Save to import log
        await saveImportLog(
            message.id,
            result.status,
            parsed,
            result.reservationId,
            undefined,
            result.attentionReason,
        );

        return {
            messageId: message.id,
            status: result.status,
            reservation: parsed,
            createdReservationId: result.reservationId,
            attentionReason: result.attentionReason,
        };
    } catch (err: any) {
        // Only truly unexpected errors end up here now
        await saveImportLog(message.id, 'failed', parsed, undefined, err.message || 'Import failed');
        // Still mark as read so it doesn't retry forever
        await markAsRead(message.id).catch(() => { });
        return {
            messageId: message.id,
            status: 'failed',
            reservation: parsed,
            error: err.message || 'Import failed',
        };
    }
}

// =========================================================================
// Data Quality Validation
// =========================================================================

interface ValidationIssue {
    code: string;
    message: string;
}

/**
 * Validate parsed reservation data for completeness and sanity.
 * Returns an array of issues (empty = all good).
 */
function validateParsedData(parsed: ParsedReservation): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Missing or placeholder guest name
    if (!parsed.guestName || parsed.guestName.trim().length < 2 || parsed.guestName.toLowerCase() === 'guest') {
        issues.push({ code: 'MISSING_GUEST_NAME', message: 'Guest name could not be identified' });
    }

    // Missing pricing
    if (parsed.totalAmount === undefined || parsed.totalAmount === null || parsed.totalAmount <= 0) {
        issues.push({ code: 'MISSING_PRICING', message: 'Total amount could not be extracted from the email' });
    }

    // Suspicious dates
    if (parsed.checkIn && parsed.checkOut) {
        const nights = Math.round((parsed.checkOut.getTime() - parsed.checkIn.getTime()) / (1000 * 60 * 60 * 24));
        if (nights <= 0) {
            issues.push({ code: 'SUSPICIOUS_DATES', message: 'Check-out date is on or before check-in date' });
        } else if (nights > 90) {
            issues.push({ code: 'SUSPICIOUS_DATES', message: `Stay of ${nights} nights seems unusually long — please verify` });
        }
    }

    // Missing booking reference
    if (!parsed.bookingRef || parsed.bookingRef.trim().length === 0) {
        issues.push({ code: 'MISSING_BOOKING_REF', message: 'Booking reference could not be extracted' });
    }

    return issues;
}

/**
 * Check if the parsed room type matches any of the hotel's actual room types.
 * Returns 'ROOM_TYPE_MISMATCH' issue if parsed type doesn't match, null otherwise.
 */
async function checkRoomTypeMismatch(
    parsed: ParsedReservation,
    assignedRoomId: string | null
): Promise<ValidationIssue | null> {
    if (!parsed.roomType) return null; // No room type parsed — can't compare

    const sb = requireSupabase();
    const hotelId = await getHotelId();

    // Get all room types for this hotel
    const { data: rooms } = await sb.from('rooms')
        .select('room_type')
        .eq('hotel_id', hotelId);

    if (!rooms || rooms.length === 0) return null;

    const hotelRoomTypes = [...new Set(rooms.map(r => r.room_type.toLowerCase()))];
    const parsedTypeLower = parsed.roomType.toLowerCase();

    // Check if any hotel room type matches (fuzzy)
    const matched = hotelRoomTypes.some(t =>
        t.includes(parsedTypeLower) || parsedTypeLower.includes(t)
    );

    if (!matched) {
        return {
            code: 'ROOM_TYPE_MISMATCH',
            message: `Requested "${parsed.roomType}" doesn't match any hotel room types — assigned to best available`,
        };
    }

    // If we matched a type but got assigned a different one, that's also a mismatch
    if (assignedRoomId) {
        const { data: assignedRoom } = await sb.from('rooms')
            .select('room_type')
            .eq('id', assignedRoomId)
            .single();

        if (assignedRoom) {
            const assignedLower = assignedRoom.room_type.toLowerCase();
            const typeMatch = assignedLower.includes(parsedTypeLower) || parsedTypeLower.includes(assignedLower);
            if (!typeMatch) {
                return {
                    code: 'ROOM_TYPE_MISMATCH',
                    message: `Requested "${parsed.roomType}" but assigned to "${assignedRoom.room_type}" — requested type was full`,
                };
            }
        }
    }

    return null;
}

// =========================================================================
// Full Import Pipeline
// =========================================================================

/**
 * Import a parsed reservation into the database.
 * If no room is available, creates the reservation anyway as "needs attention".
 * If data quality issues are found, flags the reservation even with a room.
 */
async function importParsedReservation(
    parsed: ParsedReservation,
    gmailMessageId: string
): Promise<{ reservationId: string; status: 'imported' | 'imported_needs_attention'; attentionReason?: string }> {
    // ── Step 1: Validate parsed data ────────────────────────────────
    const dataIssues = validateParsedData(parsed);

    // ── Step 2: Find an available room ──────────────────────────────
    const roomId = await findAvailableRoom(parsed);

    // ── Step 3: Check room type mismatch ────────────────────────────
    const typeMismatch = await checkRoomTypeMismatch(parsed, roomId).catch(() => null);
    if (typeMismatch) dataIssues.push(typeMismatch);

    // ── Step 4: Determine all attention reasons ─────────────────────
    const allReasons: string[] = [];
    if (!roomId) allReasons.push('NO_AVAILABILITY');
    allReasons.push(...dataIssues.map(i => i.code));

    const needsAttention = allReasons.length > 0;
    const primaryReason = allReasons[0] || undefined;
    const issuesSummary = dataIssues.map(i => `• ${i.message}`).join('\n');

    // ── Step 5: Build notes ─────────────────────────────────────────
    const noteLines: string[] = [];
    if (needsAttention) noteLines.push('⚠️ Needs manual review:');
    if (!roomId) noteLines.push('• No room available — needs room assignment');
    if (issuesSummary) noteLines.push(issuesSummary);
    noteLines.push(`Imported from ${parsed.source} — Ref: ${parsed.bookingRef || 'unknown'}`);
    if (parsed.roomType) noteLines.push(`Requested type: ${parsed.roomType}`);
    if (parsed.totalAmount) noteLines.push(`Price: ${parsed.totalAmount}`);

    // ── Step 6: Create reservation ──────────────────────────────────
    const reservation = await createReservation({
        guestName: parsed.guestName || 'Unknown Guest',
        guestEmail: parsed.guestEmail,
        guestPhone: parsed.guestPhone,
        roomId: roomId ?? null,
        checkInDate: parsed.checkIn,
        checkOutDate: parsed.checkOut,
        source: parsed.source,
        depositPaid: 0,
        notes: noteLines.join('\n'),
        createdBy: 'email-import',
        needsAttention: needsAttention || undefined,
        attentionReason: primaryReason,
        sourceEmailId: gmailMessageId,
        requestedRoomType: parsed.roomType || undefined,
        totalAmountOverride: (!roomId && parsed.totalAmount) ? parsed.totalAmount : undefined,
    });

    return {
        reservationId: reservation.id,
        status: needsAttention ? 'imported_needs_attention' : 'imported',
        attentionReason: primaryReason,
    };
}
