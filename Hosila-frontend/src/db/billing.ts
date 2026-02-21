/**
 * Billing operations — Supabase implementation
 * Replaces old Dexie-based billing queries with Supabase API calls.
 */

import { v4 as uuidv4 } from 'uuid';
import { requireSupabase, getHotelId } from '@/lib/api';
import type { Invoice, Receipt, InvoiceItem, PaymentMethod } from '@/types';

// Generate invoice number (format: HF-INV-YYYY-NNNNNN)
async function generateInvoiceNumber(): Promise<string> {
    const sb = requireSupabase();
    const date = new Date();
    const year = date.getFullYear();

    // Count existing invoices this year for sequential number
    const { count, error } = await sb.from('invoices')
        .select('id', { count: 'exact', head: true })
        .or(`invoice_number.ilike.%-${year}-%,created_at.gte.${year}-01-01T00:00:00Z`);
    const nextNum = (error ? 0 : (count ?? 0)) + 1;

    return `HF-INV-${year}-${String(nextNum).padStart(6, '0')}`;
}

// Generate receipt number (format: HF-RC-YYYY-NNNNNN)
async function generateReceiptNumber(): Promise<string> {
    const sb = requireSupabase();
    const date = new Date();
    const year = date.getFullYear();

    // Count existing receipts this year for sequential number
    const { count, error } = await sb.from('receipts')
        .select('id', { count: 'exact', head: true })
        .or(`receipt_number.ilike.%-${year}-%,created_at.gte.${year}-01-01T00:00:00Z`);
    const nextNum = (error ? 0 : (count ?? 0)) + 1;

    return `HF-RC-${year}-${String(nextNum).padStart(6, '0')}`;
}

// Create invoice from booking (checkout or view invoice)
export async function createInvoiceFromBooking(
    bookingId: string,
    guestName: string,
    guestPhone?: string
): Promise<Invoice> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    // Get booking details
    const { data: booking, error: bErr } = await sb.from('bookings').select('*').eq('id', bookingId).single();
    if (bErr || !booking) throw new Error('Booking not found');

    // Get room details
    const { data: room, error: rErr } = await sb.from('rooms').select('*').eq('id', booking.room_id).single();
    if (rErr || !room) throw new Error('Room not found');

    // === ACCOUNTING v2: Build invoice from charges table ===
    const { data: bookingCharges, error: cErr } = await sb.from('charges')
        .select('*')
        .eq('booking_id', bookingId);
    if (cErr) throw cErr;

    // Only include active/partially_refunded charges (not cancelled)
    const activeCharges = (bookingCharges ?? []).filter((c: any) =>
        c.status === 'active' || c.status === 'partially_refunded'
    );

    // Build invoice items from charges
    const items: InvoiceItem[] = activeCharges.map((charge: any) => ({
        description: charge.description,
        quantity: 1,
        unit_price: charge.gross_amount,
        total: charge.gross_amount,
    }));

    // Calculate totals from charges
    const subtotal = activeCharges.reduce((sum: number, c: any) => sum + c.net_revenue, 0);
    const tax = activeCharges.reduce((sum: number, c: any) => sum + c.tax_amount, 0);
    const total = activeCharges.reduce((sum: number, c: any) => sum + c.gross_amount, 0);

    // Get payments + allocations for status calculation
    const { getBookingBalance } = await import('./accounting');
    const balance = await getBookingBalance(bookingId);

    let status: 'unpaid' | 'partial' | 'paid' = 'unpaid';
    if (balance.balance <= 0 && balance.totalPaid > 0) status = 'paid';
    else if (balance.totalPaid > 0) status = 'partial';

    const invoice = {
        id: uuidv4(),
        hotel_id: hotelId,
        booking_id: bookingId,
        invoice_number: await generateInvoiceNumber(),
        guest_name: guestName,
        guest_phone: guestPhone,
        items,
        subtotal,
        tax,
        total,
        status,
        created_at: now,
    };

    const { error } = await sb.from('invoices').insert(invoice);
    if (error) throw error;
    return invoice as unknown as Invoice;
}

// Create receipt after payment
export async function createReceipt(
    paymentId: string,
    invoiceId: string | undefined,
    bookingId: string | undefined,
    guestName: string,
    amountPaid: number,
    paymentMethod: PaymentMethod
): Promise<Receipt> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    const receipt = {
        id: uuidv4(),
        hotel_id: hotelId,
        invoice_id: invoiceId,
        booking_id: bookingId,
        receipt_number: await generateReceiptNumber(),
        payment_id: paymentId,
        guest_name: guestName,
        amount_paid: amountPaid,
        payment_method: paymentMethod,
        created_at: now,
    };

    const { error } = await sb.from('receipts').insert(receipt);
    if (error) throw error;

    // Update invoice status if linked
    if (invoiceId) {
        const { data: invoice } = await sb.from('invoices').select('total').eq('id', invoiceId).single();
        if (invoice) {
            // Get all receipts for this invoice
            const { data: receipts } = await sb.from('receipts')
                .select('amount_paid')
                .eq('invoice_id', invoiceId);
            const totalPaid = (receipts ?? []).reduce((sum: number, r: any) => sum + r.amount_paid, 0);

            let invStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
            if (totalPaid >= invoice.total) invStatus = 'paid';
            else if (totalPaid > 0) invStatus = 'partial';

            await sb.from('invoices').update({ status: invStatus }).eq('id', invoiceId);
        }
    }

    return receipt as unknown as Receipt;
}

// Get invoice by ID
export async function getInvoice(id: string): Promise<Invoice | undefined> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('invoices').select('*').eq('id', id).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Get invoice by booking ID
export async function getInvoiceByBooking(bookingId: string): Promise<Invoice | undefined> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('invoices')
        .select('*')
        .eq('booking_id', bookingId)
        .limit(1)
        .maybeSingle();
    if (error) return undefined;
    return data ?? undefined;
}

// Get receipt by ID
export async function getReceipt(id: string): Promise<Receipt | undefined> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('receipts').select('*').eq('id', id).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Get receipts by booking ID
export async function getReceiptsByBooking(bookingId: string): Promise<Receipt[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('receipts').select('*').eq('booking_id', bookingId);
    if (error) throw error;
    return data ?? [];
}

// Get receipts by invoice ID
export async function getReceiptsByInvoice(invoiceId: string): Promise<Receipt[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('receipts').select('*').eq('invoice_id', invoiceId);
    if (error) throw error;
    return data ?? [];
}
