/**
 * Email Parser — Extracts reservation data from OTA confirmation emails.
 * Parses HTML email bodies from Booking.com and Airbnb.
 */

export interface ParsedReservation {
    source: 'booking.com' | 'airbnb';
    bookingRef: string;        // OTA booking/confirmation reference
    guestName: string;
    guestEmail?: string;
    guestPhone?: string;
    checkIn: Date;
    checkOut: Date;
    nights: number;
    numGuests: number;
    roomType?: string;         // e.g., "Deluxe Double Room"
    totalAmount?: number;
    currency?: string;
    notes?: string;
    rawSubject: string;
    rawDate: Date;
}

export type OTASource = 'booking.com' | 'airbnb' | 'unknown';

// =========================================================================
// Source Detection
// =========================================================================

/**
 * Detect which OTA sent the email based on sender and subject
 */
export function detectOTASource(from: string, subject: string): OTASource {
    const fromLower = from.toLowerCase();
    const subjectLower = subject.toLowerCase();

    if (fromLower.includes('booking.com') || subjectLower.includes('booking.com')) {
        return 'booking.com';
    }
    if (fromLower.includes('airbnb.com') || subjectLower.includes('airbnb')) {
        return 'airbnb';
    }
    return 'unknown';
}

// =========================================================================
// Booking.com Parser
// =========================================================================

export function parseBookingComEmail(html: string, subject: string, emailDate: Date): ParsedReservation | null {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const text = doc.body?.textContent || '';

        // Extract booking reference
        const refPatterns = [
            /confirmation\s*(?:number|#|:)\s*(\d{6,12})/i,
            /booking\s*(?:number|#|reference|:)\s*(\d{6,12})/i,
            /reservation\s*(?:id|#|:)\s*(\d{6,12})/i,
            /(?:conf(?:irmation)?\.?\s*(?:no\.?|number|#):?\s*)(\d{6,12})/i,
        ];
        let bookingRef = '';
        for (const pattern of refPatterns) {
            const match = text.match(pattern);
            if (match) {
                bookingRef = match[1];
                break;
            }
        }
        // Try from subject line
        if (!bookingRef) {
            const subjectMatch = subject.match(/(\d{6,12})/);
            if (subjectMatch) bookingRef = subjectMatch[1];
        }
        if (!bookingRef) bookingRef = `BDC-${Date.now()}`;

        // Extract guest name
        const guestName = extractField(text, [
            /guest\s*(?:name)?:?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,
            /booked\s+by:?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,
            /name:?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,
        ]) || 'Guest (Booking.com)';

        // Extract dates
        const { checkIn, checkOut, nights } = extractDates(text, emailDate);

        // Extract number of guests
        const numGuests = extractNumber(text, [
            /(\d+)\s*(?:guest|adult|person)/i,
            /guests?:?\s*(\d+)/i,
        ]) || 1;

        // Extract room type
        const roomType = extractField(text, [
            /room\s*type:?\s*([^\n,]+)/i,
            /(?:standard|deluxe|superior|suite|single|double|twin|family|executive)[^\n,]*/i,
        ]);

        // Extract total amount
        const totalAmount = extractAmount(text);

        return {
            source: 'booking.com',
            bookingRef,
            guestName: cleanName(guestName),
            checkIn,
            checkOut,
            nights,
            numGuests,
            roomType: roomType?.trim(),
            totalAmount: totalAmount?.amount,
            currency: totalAmount?.currency,
            notes: `Booking.com ref: ${bookingRef}`,
            rawSubject: subject,
            rawDate: emailDate,
        };
    } catch (err) {
        console.error('Failed to parse Booking.com email:', err);
        return null;
    }
}

// =========================================================================
// Airbnb Parser
// =========================================================================

export function parseAirbnbEmail(html: string, subject: string, emailDate: Date): ParsedReservation | null {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const text = doc.body?.textContent || '';

        // Extract confirmation code (Airbnb uses alphanumeric codes like HMAB2KY6QR)
        const refPatterns = [
            /confirmation\s*code:?\s*([A-Z0-9]{6,12})/i,
            /reservation\s*code:?\s*([A-Z0-9]{6,12})/i,
            /(?:code|reference):?\s*([A-Z0-9]{8,12})/i,
        ];
        let bookingRef = '';
        for (const pattern of refPatterns) {
            const match = text.match(pattern);
            if (match) {
                bookingRef = match[1];
                break;
            }
        }
        if (!bookingRef) bookingRef = `ABB-${Date.now()}`;

        // Extract guest name
        const guestName = extractField(text, [
            /(?:from|guest|by)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,
            /reservation\s+(?:from|by)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/i,
        ]) || extractNameFromSubject(subject) || 'Guest (Airbnb)';

        // Extract dates
        const { checkIn, checkOut, nights } = extractDates(text, emailDate);

        // Extract number of guests
        const numGuests = extractNumber(text, [
            /(\d+)\s*(?:guest|adult|person)/i,
        ]) || 1;

        // Extract total amount
        const totalAmount = extractAmount(text);

        return {
            source: 'airbnb',
            bookingRef,
            guestName: cleanName(guestName),
            checkIn,
            checkOut,
            nights,
            numGuests,
            totalAmount: totalAmount?.amount,
            currency: totalAmount?.currency,
            notes: `Airbnb ref: ${bookingRef}`,
            rawSubject: subject,
            rawDate: emailDate,
        };
    } catch (err) {
        console.error('Failed to parse Airbnb email:', err);
        return null;
    }
}

// =========================================================================
// Shared Extraction Helpers
// =========================================================================

function extractField(text: string, patterns: RegExp[]): string | null {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1] || match[0];
    }
    return null;
}

function extractNumber(text: string, patterns: RegExp[]): number | null {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return parseInt(match[1], 10);
    }
    return null;
}

function extractDates(text: string, fallbackDate: Date): { checkIn: Date; checkOut: Date; nights: number } {
    // Common date formats in OTA emails
    const datePatterns = [
        // "Check-in: January 15, 2026" / "Check-out: January 18, 2026"
        /check[\s-]*in:?\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
        /check[\s-]*out:?\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
        // "15 Jan 2026 - 18 Jan 2026"
        /(\d{1,2}\s+\w{3,}\s+\d{4})\s*[-–—to]+\s*(\d{1,2}\s+\w{3,}\s+\d{4})/i,
        // "2026-01-15 to 2026-01-18"
        /(\d{4}-\d{2}-\d{2})\s*[-–—to]+\s*(\d{4}-\d{2}-\d{2})/,
        // "01/15/2026 - 01/18/2026"
        /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–—to]+\s*(\d{1,2}\/\d{1,2}\/\d{4})/,
    ];

    // Try check-in / check-out separately
    const checkInMatch = text.match(/check[\s-]*in:?\s*(\w+\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w+\.?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i);
    const checkOutMatch = text.match(/check[\s-]*out:?\s*(\w+\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w+\.?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i);

    if (checkInMatch && checkOutMatch) {
        const checkIn = parseFlexibleDate(checkInMatch[1]);
        const checkOut = parseFlexibleDate(checkOutMatch[1]);
        if (checkIn && checkOut) {
            const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
            return { checkIn, checkOut, nights };
        }
    }

    // Try date range patterns
    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[2]) {
            const checkIn = parseFlexibleDate(match[1]);
            const checkOut = parseFlexibleDate(match[2]);
            if (checkIn && checkOut) {
                const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
                return { checkIn, checkOut, nights };
            }
        }
    }

    // Try to extract nights count
    const nightsMatch = text.match(/(\d+)\s*night/i);
    const nights = nightsMatch ? parseInt(nightsMatch[1], 10) : 1;

    // Fallback: use email date as check-in
    const checkIn = new Date(fallbackDate);
    checkIn.setDate(checkIn.getDate() + 1); // Assume check-in is tomorrow
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + nights);

    return { checkIn, checkOut, nights };
}

function parseFlexibleDate(dateStr: string): Date | null {
    // Try native parsing first
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;

    // Try manual parsing for formats like "15 Jan 2026"
    const dayMonthYear = dateStr.match(/(\d{1,2})\s+(\w{3,})\s+(\d{4})/);
    if (dayMonthYear) {
        const d = new Date(`${dayMonthYear[2]} ${dayMonthYear[1]}, ${dayMonthYear[3]}`);
        if (!isNaN(d.getTime())) return d;
    }

    return null;
}

function extractAmount(text: string): { amount: number; currency: string } | null {
    const patterns = [
        // "$1,234.56" or "USD 1,234.56"
        /(?:total|amount|price|cost|payout):?\s*(?:USD|US\$|\$)\s*([\d,]+\.?\d*)/i,
        /(?:USD|US\$|\$)\s*([\d,]+\.?\d*)/i,
        // "€1,234.56" or "EUR 1,234.56"
        /(?:total|amount|price|cost):?\s*(?:EUR|€)\s*([\d,]+\.?\d*)/i,
        /(?:EUR|€)\s*([\d,]+\.?\d*)/i,
        // "₦1,234.56" or "NGN 1,234.56"
        /(?:total|amount|price|cost):?\s*(?:NGN|₦)\s*([\d,]+\.?\d*)/i,
        /(?:NGN|₦)\s*([\d,]+\.?\d*)/i,
        // "GBP 1,234.56" or "£1,234.56"
        /(?:total|amount):?\s*(?:GBP|£)\s*([\d,]+\.?\d*)/i,
        /(?:GBP|£)\s*([\d,]+\.?\d*)/i,
        // Generic: "Total: 1,234.56"
        /total:?\s*([\d,]+\.?\d{2})/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const amount = parseFloat(match[1].replace(/,/g, ''));
            if (!isNaN(amount) && amount > 0) {
                // Detect currency
                let currency = 'USD';
                if (/€|EUR/i.test(text.slice(Math.max(0, (match.index || 0) - 10), (match.index || 0) + match[0].length + 5))) currency = 'EUR';
                if (/₦|NGN/i.test(text.slice(Math.max(0, (match.index || 0) - 10), (match.index || 0) + match[0].length + 5))) currency = 'NGN';
                if (/£|GBP/i.test(text.slice(Math.max(0, (match.index || 0) - 10), (match.index || 0) + match[0].length + 5))) currency = 'GBP';
                return { amount, currency };
            }
        }
    }
    return null;
}

function cleanName(name: string): string {
    return name
        .replace(/\s+/g, ' ')
        .replace(/[^a-zA-Z\s'-]/g, '')
        .trim();
}

function extractNameFromSubject(subject: string): string | null {
    // "Reservation from John Doe" or "New booking by John Doe"
    const match = subject.match(/(?:from|by)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/i);
    return match ? match[1] : null;
}
