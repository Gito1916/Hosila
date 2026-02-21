/**
 * Accounting operations — Supabase implementation
 * Replaces old Dexie-based accounting queries with Supabase API calls.
 * Handles charges, payments, journal entries, FIFO allocation, reversals, and refunds.
 */

import { v4 as uuidv4 } from 'uuid';
import { requireSupabase, getHotelId } from '@/lib/api';
import type {
    Charge,
    ChargeDepartment,
    ChargeStatus,
    PaymentAllocation,
    JournalEntry,
    JournalAccountCode,
    PaymentMethod,
} from '@/types';

// =============================================================================
// Tax Calculation
// =============================================================================

/**
 * Calculate tax breakdown from a gross (tax-inclusive) amount.
 * Revenue = Gross ÷ (1 + taxRate)
 * Tax = Gross - Revenue
 */
export function calculateTaxBreakdown(grossAmount: number, taxRate: number = 7.5): {
    gross_amount: number;
    net_revenue: number;
    tax_amount: number;
    tax_rate: number;
} {
    if (taxRate <= 0) {
        return {
            gross_amount: grossAmount,
            net_revenue: grossAmount,
            tax_amount: 0,
            tax_rate: 0,
        };
    }
    const rate = taxRate / 100;
    const netRevenue = Math.round((grossAmount / (1 + rate)) * 100) / 100;
    const taxAmount = Math.round((grossAmount - netRevenue) * 100) / 100;
    return {
        gross_amount: grossAmount,
        net_revenue: netRevenue,
        tax_amount: taxAmount,
        tax_rate: taxRate,
    };
}

/**
 * Get the revenue account code for a given department.
 */
function getRevenueAccountCode(department: ChargeDepartment): JournalAccountCode {
    switch (department) {
        case 'accommodation': return '4010';
        case 'restaurant': return '4020';
        case 'other_services': return '4030';
        case 'other_income': return '4040';
    }
}

/**
 * Get the contra-revenue (refund) account code for a given department.
 */
function getRefundAccountCode(department: ChargeDepartment): JournalAccountCode {
    switch (department) {
        case 'accommodation': return '4910';
        case 'restaurant': return '4920';
        case 'other_services': return '4930';
        case 'other_income': return '4940';
    }
}

// =============================================================================
// Journal Entry Generation (immutable)
// =============================================================================

async function addJournalEntries(entries: Omit<JournalEntry, 'id' | 'hotel_id' | 'created_at'>[]): Promise<JournalEntry[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();
    const journalEntries = entries.map(e => ({
        ...e,
        id: uuidv4(),
        hotel_id: hotelId,
        created_at: now,
        entry_date: e.entry_date instanceof Date ? e.entry_date.toISOString() : e.entry_date,
    }));
    const { error } = await sb.from('journal_entries').insert(journalEntries);
    if (error) throw error;
    return journalEntries as unknown as JournalEntry[];
}

// =============================================================================
// Charge Creation
// =============================================================================

export interface CreateChargeData {
    guest_id?: string;
    booking_id?: string;
    department: ChargeDepartment;
    description: string;
    gross_amount: number;
    tax_rate: number;
    reference_id?: string;
    reference_type?: string;
    charge_date?: Date;
}

/**
 * Create a charge (revenue recognition) with corresponding journal entries.
 *
 * Journal entries generated:
 *   DR: Guest AR (1020)          grossAmount
 *   CR: Revenue (40xx)           netRevenue
 *   CR: Tax Payable (2010)       taxAmount
 */
export async function createCharge(data: CreateChargeData): Promise<Charge> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date();
    const chargeDate = data.charge_date || now;

    const taxBreakdown = calculateTaxBreakdown(data.gross_amount, data.tax_rate);

    const charge = {
        id: uuidv4(),
        hotel_id: hotelId,
        guest_id: data.guest_id,
        booking_id: data.booking_id,
        department: data.department,
        description: data.description,
        gross_amount: taxBreakdown.gross_amount,
        net_revenue: taxBreakdown.net_revenue,
        tax_amount: taxBreakdown.tax_amount,
        tax_rate: taxBreakdown.tax_rate,
        status: 'active',
        reference_id: data.reference_id,
        reference_type: data.reference_type,
        charge_date: chargeDate instanceof Date ? chargeDate.toISOString() : chargeDate,
        created_at: now.toISOString(),
    };

    const { error } = await sb.from('charges').insert(charge);
    if (error) throw error;

    // Generate immutable journal entries
    const revenueAccount = getRevenueAccountCode(data.department);

    const journalData: Omit<JournalEntry, 'id' | 'hotel_id' | 'created_at'>[] = [
        {
            entry_date: chargeDate,
            description: data.description,
            account_code: '1020', // Guest AR
            entry_type: 'debit',
            amount: taxBreakdown.gross_amount,
            department: data.department,
            reference_type: 'charge',
            reference_id: charge.id,
        },
        {
            entry_date: chargeDate,
            description: data.description,
            account_code: revenueAccount,
            entry_type: 'credit',
            amount: taxBreakdown.net_revenue,
            department: data.department,
            reference_type: 'charge',
            reference_id: charge.id,
        },
    ];

    // Only add tax entry if there is tax
    if (taxBreakdown.tax_amount > 0) {
        journalData.push({
            entry_date: chargeDate,
            description: `Tax on: ${data.description}`,
            account_code: '2010', // Tax Payable
            entry_type: 'credit',
            amount: taxBreakdown.tax_amount,
            department: data.department,
            reference_type: 'charge',
            reference_id: charge.id,
        });
    }

    await addJournalEntries(journalData);

    return charge as unknown as Charge;
}

// =============================================================================
// Payment & FIFO Allocation
// =============================================================================

export interface CreatePaymentData {
    booking_id?: string;
    guest_id?: string;
    amount: number;
    payment_method: PaymentMethod;
    payment_reference?: string;
    notes?: string;
    received_by: string;
}

/**
 * Create a payment and auto-allocate to outstanding charges via FIFO.
 *
 * Journal entries generated:
 *   DR: Cash (1010)              paymentAmount
 *   CR: Guest AR (1020)          paymentAmount
 *
 * Returns the payment ID.
 */
export async function createPaymentWithAllocation(data: CreatePaymentData): Promise<string> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date();
    const nowIso = now.toISOString();
    const paymentId = uuidv4();

    // Create the payment record
    const { error } = await sb.from('payments').insert({
        id: paymentId,
        hotel_id: hotelId,
        booking_id: data.booking_id || null,
        amount: data.amount,
        payment_method: data.payment_method,
        payment_reference: data.payment_reference,
        notes: data.notes,
        received_by: data.received_by,
        payment_time: nowIso,
        created_at: nowIso,
    });
    if (error) throw error;

    // FIFO Allocation
    await allocatePaymentFIFO(paymentId, data.amount, data.booking_id, data.guest_id);

    // Journal entries: DR Cash, CR Guest AR
    await addJournalEntries([
        {
            entry_date: now,
            description: `Payment received${data.notes ? ': ' + data.notes : ''}`,
            account_code: '1010', // Cash
            entry_type: 'debit',
            amount: data.amount,
            reference_type: 'payment',
            reference_id: paymentId,
        },
        {
            entry_date: now,
            description: `Payment received${data.notes ? ': ' + data.notes : ''}`,
            account_code: '1020', // Guest AR
            entry_type: 'credit',
            amount: data.amount,
            reference_type: 'payment',
            reference_id: paymentId,
        },
    ]);

    return paymentId;
}

/**
 * Apply payment to outstanding charges for a booking/guest in FIFO order (oldest first).
 */
async function allocatePaymentFIFO(
    paymentId: string,
    paymentAmount: number,
    bookingId?: string,
    guestId?: string,
): Promise<PaymentAllocation[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    // Get all active charges for this booking, ordered by charge_date ASC (FIFO)
    let query = sb.from('charges').select('*').eq('hotel_id', hotelId);
    if (bookingId) {
        query = query.eq('booking_id', bookingId);
    } else if (guestId) {
        query = query.eq('guest_id', guestId);
    } else {
        return [];
    }

    const { data: allCharges, error: chargeErr } = await query;
    if (chargeErr) throw chargeErr;

    // Filter to active/partially_refunded charges and sort by date (oldest first)
    const charges = (allCharges ?? [])
        .filter((c: any) => c.status === 'active' || c.status === 'partially_refunded')
        .sort((a: any, b: any) => new Date(a.charge_date).getTime() - new Date(b.charge_date).getTime());

    // For each charge, calculate existing paid amount
    const chargeIds = charges.map((c: any) => c.id);
    let activeAllocations: any[] = [];
    if (chargeIds.length > 0) {
        const { data: allocData } = await sb.from('payment_allocations')
            .select('*')
            .eq('hotel_id', hotelId)
            .eq('status', 'active')
            .in('charge_id', chargeIds);
        activeAllocations = allocData ?? [];
    }

    let remaining = paymentAmount;
    const newAllocations: any[] = [];

    for (const charge of charges) {
        if (remaining <= 0) break;

        // Calculate how much is already paid on this charge
        const paidOnCharge = activeAllocations
            .filter((a: any) => a.charge_id === charge.id)
            .reduce((sum: number, a: any) => sum + a.allocated_amount, 0);
        const chargeBalance = charge.gross_amount - paidOnCharge;

        if (chargeBalance <= 0) continue; // Already fully paid

        const allocAmount = Math.min(remaining, chargeBalance);

        newAllocations.push({
            id: uuidv4(),
            hotel_id: hotelId,
            payment_id: paymentId,
            charge_id: charge.id,
            allocated_amount: allocAmount,
            status: 'active',
            allocation_date: now,
            created_at: now,
        });
        remaining -= allocAmount;
    }

    if (newAllocations.length > 0) {
        const { error } = await sb.from('payment_allocations').insert(newAllocations);
        if (error) throw error;
    }

    return newAllocations as PaymentAllocation[];
}

// =============================================================================
// Reversals & Refunds
// =============================================================================

/**
 * Create a reversal for a charge (cancellation before payment).
 *
 * Journal entries generated:
 *   DR: Revenue Refund (49xx)    netRevenue
 *   DR: Tax Payable (2010)       taxAmount
 *   CR: Guest AR (1020)          grossAmount
 */
export async function createReversal(
    chargeId: string,
    reason: string,
): Promise<void> {
    const sb = requireSupabase();
    const { data: charge, error: fetchErr } = await sb.from('charges').select('*').eq('id', chargeId).single();
    if (fetchErr || !charge || charge.status !== 'active') {
        throw new Error('Charge not found or already cancelled/refunded');
    }

    const now = new Date();
    const refundAccount = getRefundAccountCode(charge.department);

    // Update charge status
    const { error: updateErr } = await sb.from('charges').update({
        status: 'cancelled' as ChargeStatus,
        cancelled_date: now.toISOString(),
    }).eq('id', chargeId);
    if (updateErr) throw updateErr;

    // Generate reversal journal entries
    const journalData: Omit<JournalEntry, 'id' | 'hotel_id' | 'created_at'>[] = [
        {
            entry_date: now,
            description: `Reversal: ${reason}`,
            account_code: refundAccount, // DR Revenue Refund
            entry_type: 'debit',
            amount: charge.net_revenue,
            department: charge.department,
            reference_type: 'reversal',
            reference_id: chargeId,
        },
        {
            entry_date: now,
            description: `Reversal: ${reason}`,
            account_code: '1020', // CR Guest AR
            entry_type: 'credit',
            amount: charge.gross_amount,
            department: charge.department,
            reference_type: 'reversal',
            reference_id: chargeId,
        },
    ];

    if (charge.tax_amount > 0) {
        journalData.push({
            entry_date: now,
            description: `Tax reversal: ${reason}`,
            account_code: '2010', // DR Tax Payable
            entry_type: 'debit',
            amount: charge.tax_amount,
            department: charge.department,
            reference_type: 'reversal',
            reference_id: chargeId,
        });
    }

    await addJournalEntries(journalData);
}

/**
 * Create a refund for a charge that has already been paid.
 *
 * Journal entries generated:
 *   DR: Revenue Refund (49xx)    refundNetRevenue
 *   DR: Tax Payable (2010)       refundTax
 *   CR: Cash (1010)              refundAmount
 */
export async function createRefund(
    chargeId: string,
    refundAmount: number,
    reason: string,
): Promise<void> {
    const sb = requireSupabase();
    const { data: charge, error: fetchErr } = await sb.from('charges').select('*').eq('id', chargeId).single();
    if (fetchErr || !charge || (charge.status !== 'active' && charge.status !== 'partially_refunded')) {
        throw new Error('Charge not found or already fully cancelled/refunded');
    }

    const now = new Date();
    const isFullRefund = refundAmount >= charge.gross_amount;
    const refundAccount = getRefundAccountCode(charge.department);

    // Calculate refund tax breakdown using the same rate as the original charge
    const refundBreakdown = calculateTaxBreakdown(refundAmount, charge.tax_rate);

    // Update charge
    const newStatus: ChargeStatus = isFullRefund ? 'refunded' : 'partially_refunded';
    const { error: updateErr } = await sb.from('charges').update({
        status: newStatus,
        refunded_amount: (charge.refunded_amount || 0) + refundAmount,
        ...(isFullRefund ? {
            net_revenue: 0,
            tax_amount: 0,
            gross_amount: 0,
        } : {
            net_revenue: charge.net_revenue - refundBreakdown.net_revenue,
            tax_amount: charge.tax_amount - refundBreakdown.tax_amount,
            gross_amount: charge.gross_amount - refundAmount,
        }),
    }).eq('id', chargeId);
    if (updateErr) throw updateErr;

    // Void related payment allocations for full refunds
    if (isFullRefund) {
        const { data: allocations } = await sb.from('payment_allocations')
            .select('id')
            .eq('charge_id', chargeId);
        if (allocations && allocations.length > 0) {
            const allocIds = allocations.map((a: any) => a.id);
            await sb.from('payment_allocations')
                .update({ status: 'voided' })
                .in('id', allocIds);
        }
    }

    // Generate refund journal entries
    const journalData: Omit<JournalEntry, 'id' | 'hotel_id' | 'created_at'>[] = [
        {
            entry_date: now,
            description: `Refund: ${reason}`,
            account_code: refundAccount,
            entry_type: 'debit',
            amount: refundBreakdown.net_revenue,
            department: charge.department,
            reference_type: 'refund',
            reference_id: chargeId,
        },
        {
            entry_date: now,
            description: `Refund: ${reason}`,
            account_code: '1010', // CR Cash (money going out)
            entry_type: 'credit',
            amount: refundAmount,
            department: charge.department,
            reference_type: 'refund',
            reference_id: chargeId,
        },
    ];

    if (refundBreakdown.tax_amount > 0) {
        journalData.push({
            entry_date: now,
            description: `Tax refund: ${reason}`,
            account_code: '2010', // DR Tax Payable
            entry_type: 'debit',
            amount: refundBreakdown.tax_amount,
            department: charge.department,
            reference_type: 'refund',
            reference_id: chargeId,
        });
    }

    await addJournalEntries(journalData);
}

// Get all charges for the hotel
export async function getAllCharges(): Promise<Charge[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('charges').select('*').eq('hotel_id', hotelId);
    if (error) throw error;
    return data ?? [];
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Get the outstanding balance for a booking (sum of charges - sum of allocations).
 */
export async function getBookingBalance(bookingId: string): Promise<{
    totalCharges: number;
    totalPaid: number;
    balance: number;
    charges: Charge[];
}> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data: charges, error } = await sb.from('charges')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('booking_id', bookingId);
    if (error) throw error;

    const activeCharges = (charges ?? []).filter((c: any) => c.status === 'active' || c.status === 'partially_refunded');
    const chargeIds = activeCharges.map((c: any) => c.id);
    const totalCharges = activeCharges.reduce((sum: number, c: any) => sum + c.gross_amount, 0);

    // Get all allocations for these charges
    let totalPaid = 0;
    if (chargeIds.length > 0) {
        const { data: allocations } = await sb.from('payment_allocations')
            .select('allocated_amount')
            .eq('status', 'active')
            .in('charge_id', chargeIds);
        totalPaid = (allocations ?? []).reduce((sum: number, a: any) => sum + a.allocated_amount, 0);
    }

    return {
        totalCharges,
        totalPaid,
        balance: totalCharges - totalPaid,
        charges: activeCharges as Charge[],
    };
}

/**
 * Get how much has been paid against a specific charge.
 */
export async function getChargePaidAmount(chargeId: string): Promise<number> {
    const sb = requireSupabase();
    const { data: allocations, error } = await sb.from('payment_allocations')
        .select('allocated_amount')
        .eq('charge_id', chargeId)
        .eq('status', 'active');
    if (error) throw error;
    return (allocations ?? []).reduce((sum: number, a: any) => sum + a.allocated_amount, 0);
}

/**
 * Get charges for a booking, with paid amounts calculated.
 */
export async function getBookingChargesWithPaid(bookingId: string): Promise<Array<Charge & { paid_amount: number; charge_balance: number }>> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data: charges, error } = await sb.from('charges')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('booking_id', bookingId);
    if (error) throw error;

    const activeCharges = (charges ?? []).filter((c: any) => c.status === 'active' || c.status === 'partially_refunded');

    const chargeIds = activeCharges.map((c: any) => c.id);
    let activeAllocations: any[] = [];
    if (chargeIds.length > 0) {
        const { data: allocData } = await sb.from('payment_allocations')
            .select('*')
            .eq('status', 'active')
            .in('charge_id', chargeIds);
        activeAllocations = allocData ?? [];
    }

    return activeCharges.map((c: any) => {
        const paid = activeAllocations
            .filter((a: any) => a.charge_id === c.id)
            .reduce((sum: number, a: any) => sum + a.allocated_amount, 0);
        return {
            ...c,
            paid_amount: paid,
            charge_balance: c.gross_amount - paid,
        };
    });
}

/**
 * Get all charges for a department within a date range (for KPIs).
 * Revenue = net_revenue of active charges (excluding tax).
 */
export async function getDepartmentRevenue(
    department: ChargeDepartment,
    startDate: Date,
    endDate: Date,
): Promise<{ net_revenue: number; gross_amount: number; tax_amount: number }> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data: charges, error } = await sb.from('charges')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('department', department)
        .in('status', ['active', 'partially_refunded'])
        .gte('charge_date', startDate.toISOString())
        .lte('charge_date', endDate.toISOString());
    if (error) throw error;

    const filtered = charges ?? [];

    return {
        net_revenue: filtered.reduce((sum: number, c: any) => sum + c.net_revenue, 0),
        gross_amount: filtered.reduce((sum: number, c: any) => sum + c.gross_amount, 0),
        tax_amount: filtered.reduce((sum: number, c: any) => sum + c.tax_amount, 0),
    };
}

/**
 * Get department transactions (payments allocated to that department's charges).
 */
export async function getDepartmentTransactions(
    department: ChargeDepartment,
    startDate: Date,
    endDate: Date,
): Promise<number> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    // Get all charges for this department
    const { data: charges, error: chargeErr } = await sb.from('charges')
        .select('id')
        .eq('hotel_id', hotelId)
        .eq('department', department)
        .in('status', ['active', 'partially_refunded']);
    if (chargeErr) throw chargeErr;

    const activeChargeIds = (charges ?? []).map((c: any) => c.id);
    if (activeChargeIds.length === 0) return 0;

    // Get payments in date range
    const { data: payments, error: payErr } = await sb.from('payments')
        .select('id')
        .eq('hotel_id', hotelId)
        .gte('payment_time', startDate.toISOString())
        .lte('payment_time', endDate.toISOString());
    if (payErr) throw payErr;

    const filteredPaymentIds = (payments ?? []).map((p: any) => p.id);
    if (filteredPaymentIds.length === 0) return 0;

    // Get allocations linking these payments to these charges
    const { data: allocations, error: allocErr } = await sb.from('payment_allocations')
        .select('allocated_amount')
        .eq('status', 'active')
        .in('charge_id', activeChargeIds)
        .in('payment_id', filteredPaymentIds);
    if (allocErr) throw allocErr;

    return (allocations ?? []).reduce((sum: number, a: any) => sum + a.allocated_amount, 0);
}
