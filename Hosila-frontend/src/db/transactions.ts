/**
 * Transaction operations — Supabase implementation
 * Replaces old Dexie-based transaction queries with Supabase API calls.
 */

import { v4 as uuidv4 } from 'uuid';
import { requireSupabase, getHotelId } from '@/lib/api';
import type {
    Transaction,
    TransactionType,
    TransactionSource,
    TransactionDepartment,
    PaymentMethod
} from '@/types';

// =============================================================================
// Transaction Creation Functions
// =============================================================================

interface CreateTransactionData {
    type: TransactionType;
    source: TransactionSource;
    department: TransactionDepartment;
    description: string;
    amount: number;
    payment_method: PaymentMethod;
    reference_id?: string;
    reference_type?: string;
    is_taxable: boolean;
    tax_rate?: number;
    tax_amount?: number;
    recorded_by: string;
    date?: Date;
}

/**
 * Base function to create a transaction record
 */
export async function createTransaction(data: CreateTransactionData): Promise<Transaction> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date();
    const nowIso = now.toISOString();

    const transaction = {
        id: uuidv4(),
        hotel_id: hotelId,
        type: data.type,
        source: data.source,
        department: data.department,
        description: data.description,
        amount: data.amount,
        payment_method: data.payment_method,
        reference_id: data.reference_id,
        reference_type: data.reference_type,
        is_taxable: data.is_taxable,
        tax_rate: data.tax_rate,
        tax_amount: data.tax_amount,
        recorded_by: data.recorded_by,
        date: data.date ? data.date.toISOString() : nowIso,
        created_at: nowIso,
        status: 'completed', // All new transactions start as completed
    };

    const { error } = await sb.from('transactions').insert(transaction);
    if (error) throw error;
    return transaction as unknown as Transaction;
}

/**
 * Create transaction from accommodation payment
 */
export async function createTransactionFromPayment(
    paymentId: string,
    _bookingId: string,
    guestName: string,
    roomNumber: string,
    amount: number,
    paymentMethod: PaymentMethod,
    recordedBy: string,
    taxRate: number = 7.5
): Promise<Transaction> {
    const taxAmount = Math.round(amount * (taxRate / (100 + taxRate)));

    return createTransaction({
        type: 'income',
        source: 'accommodation',
        department: 'accommodation',
        description: `Room ${roomNumber} - ${guestName}`,
        amount: amount,
        payment_method: paymentMethod,
        reference_id: paymentId,
        reference_type: 'payment',
        is_taxable: true,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        recorded_by: recordedBy,
    });
}

/**
 * Create transaction from restaurant/service order
 */
export async function createTransactionFromServiceOrder(
    orderId: string,
    description: string,
    amount: number,
    paymentMethod: PaymentMethod,
    recordedBy: string,
    isRoomTab: boolean = false,
    taxRate: number = 5
): Promise<Transaction> {
    const taxAmount = Math.round(amount * (taxRate / (100 + taxRate)));

    return createTransaction({
        type: 'income',
        source: 'restaurant',
        department: 'restaurant',
        description: isRoomTab ? `Room Tab: ${description}` : description,
        amount: amount,
        payment_method: paymentMethod,
        reference_id: orderId,
        reference_type: 'service_order',
        is_taxable: true,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        recorded_by: recordedBy,
    });
}

/**
 * Create pending transaction for room tab restaurant orders
 * These are not counted as revenue until payment is received
 */
export async function createPendingRestaurantTransaction(data: {
    orderNumber: string;
    description: string;
    amount: number;
    bookingId: string;
    recordedBy: string;
    taxRate?: number;
}): Promise<Transaction> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date();
    const nowIso = now.toISOString();
    const taxRate = data.taxRate ?? 5;
    const taxAmount = Math.round(data.amount * (taxRate / (100 + taxRate)));

    const transaction = {
        id: uuidv4(),
        hotel_id: hotelId,
        type: 'income',
        source: 'restaurant',
        department: 'restaurant',
        description: data.description,
        amount: data.amount,
        payment_method: 'transfer', // Placeholder - will be updated when paid
        reference_id: data.orderNumber,
        reference_type: 'room_tab_order',
        is_taxable: true,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        recorded_by: data.recordedBy,
        date: nowIso,
        created_at: nowIso,
        status: 'pending', // Key difference: pending until paid
        // Store booking ID for lookup when completing
        reversed_transaction_id: data.bookingId, // Reusing field for booking reference
    };

    const { error } = await sb.from('transactions').insert(transaction);
    if (error) throw error;
    return transaction as unknown as Transaction;
}

/**
 * Complete pending transactions when payment is received
 */
export async function completePendingTransactions(
    bookingId: string,
    paymentMethod: PaymentMethod
): Promise<number> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    // Find pending transactions for this booking
    const { data: pendingTxns, error } = await sb.from('transactions')
        .select('id')
        .eq('hotel_id', hotelId)
        .eq('status', 'pending')
        .eq('reference_type', 'room_tab_order')
        .eq('reversed_transaction_id', bookingId);
    if (error) throw error;

    // Mark each as completed
    if (pendingTxns && pendingTxns.length > 0) {
        const ids = pendingTxns.map((t: any) => t.id);
        await sb.from('transactions').update({
            status: 'completed',
            payment_method: paymentMethod,
            date: now,
        }).in('id', ids);
    }

    return (pendingTxns ?? []).length;
}

/**
 * Get total amount of pending transactions for a booking
 */
export async function getPendingTransactionsTotal(bookingId: string): Promise<number> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data: pendingTxns, error } = await sb.from('transactions')
        .select('amount')
        .eq('hotel_id', hotelId)
        .eq('status', 'pending')
        .eq('reference_type', 'room_tab_order')
        .eq('reversed_transaction_id', bookingId);
    if (error) throw error;

    return (pendingTxns ?? []).reduce((sum: number, t: any) => sum + t.amount, 0);
}

/**
 * Create transaction from other income entry
 */
export async function createTransactionFromOtherIncome(
    otherIncomeId: string,
    category: string,
    description: string,
    amount: number,
    paymentMethod: PaymentMethod,
    recordedBy: string,
    isTaxable: boolean = true,
    taxRate: number = 5
): Promise<Transaction> {
    const taxAmount = isTaxable ? Math.round(amount * (taxRate / (100 + taxRate))) : 0;

    return createTransaction({
        type: 'income',
        source: 'other_income',
        department: 'other',
        description: `${category}: ${description}`,
        amount: amount,
        payment_method: paymentMethod,
        reference_id: otherIncomeId,
        reference_type: 'other_income',
        is_taxable: isTaxable,
        tax_rate: isTaxable ? taxRate : undefined,
        tax_amount: isTaxable ? taxAmount : undefined,
        recorded_by: recordedBy,
    });
}

/**
 * Create transaction from expense entry
 */
export async function createTransactionFromExpense(
    expenseId: string,
    category: string,
    description: string,
    amount: number,
    paymentMethod: PaymentMethod,
    recordedBy: string
): Promise<Transaction> {
    return createTransaction({
        type: 'expense',
        source: 'expense',
        department: 'other',
        description: `${category}: ${description}`,
        amount: -Math.abs(amount), // Expenses are negative
        payment_method: paymentMethod,
        reference_id: expenseId,
        reference_type: 'expense',
        is_taxable: false,
        recorded_by: recordedBy,
    });
}

/**
 * Create a reversal transaction for a cancelled order/payment
 */
export async function createReversalTransaction(
    originalTransactionId: string,
    reason: string,
    recordedBy: string
): Promise<Transaction | null> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    // Find the original transaction
    const { data: original, error: fetchErr } = await sb.from('transactions')
        .select('*')
        .eq('id', originalTransactionId)
        .single();
    if (fetchErr || !original) {
        console.error('Original transaction not found:', originalTransactionId);
        return null;
    }

    // Don't reverse already reversed transactions
    if (original.status === 'reversed') {
        console.warn('Transaction already reversed:', originalTransactionId);
        return null;
    }

    // Create reversal transaction (negative of original)
    const reversalTransaction = {
        id: uuidv4(),
        hotel_id: hotelId,
        type: original.type,
        source: original.source,
        department: original.department,
        description: `[REVERSAL] ${original.description}`,
        amount: -original.amount,
        payment_method: original.payment_method,
        reference_id: original.reference_id,
        reference_type: original.reference_type,
        is_taxable: original.is_taxable,
        tax_rate: original.tax_rate,
        tax_amount: original.tax_amount ? -original.tax_amount : undefined,
        recorded_by: recordedBy,
        date: now,
        created_at: now,
        status: 'reversal',
        reversed_transaction_id: original.id,
        reversal_reason: reason,
    };

    const { error: insertErr } = await sb.from('transactions').insert(reversalTransaction);
    if (insertErr) throw insertErr;

    // Mark original as reversed
    await sb.from('transactions').update({ status: 'reversed' }).eq('id', original.id);

    return reversalTransaction as unknown as Transaction;
}

/**
 * Find transaction by reference (e.g., order_id, payment_id)
 */
export async function findTransactionByReference(
    referenceId: string,
    referenceType?: string
): Promise<Transaction | undefined> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    let query = sb.from('transactions')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('reference_id', referenceId)
        .neq('status', 'reversal');

    if (referenceType) {
        query = query.eq('reference_type', referenceType);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) return undefined;
    return data ?? undefined;
}

// =============================================================================
// Transaction Query Functions
// =============================================================================

export interface TransactionFilters {
    startDate?: Date;
    endDate?: Date;
    type?: TransactionType;
    source?: TransactionSource;
    department?: TransactionDepartment;
    paymentMethod?: PaymentMethod;
    recordedBy?: string;
}

/**
 * Get transactions with optional filters
 */
export async function getTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    let query = sb.from('transactions').select('*').eq('hotel_id', hotelId);

    // Apply filters at query level where possible
    if (filters) {
        if (filters.startDate) {
            query = query.gte('date', filters.startDate.toISOString());
        }
        if (filters.endDate) {
            query = query.lte('date', filters.endDate.toISOString());
        }
        if (filters.type) {
            query = query.eq('type', filters.type);
        }
        if (filters.source) {
            query = query.eq('source', filters.source);
        }
        if (filters.department) {
            query = query.eq('department', filters.department);
        }
        if (filters.paymentMethod) {
            query = query.eq('payment_method', filters.paymentMethod);
        }
        if (filters.recordedBy) {
            query = query.eq('recorded_by', filters.recordedBy);
        }
    }

    query = query.order('date', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Transaction[];
}

/**
 * Get transactions by date range
 */
export async function getTransactionsByDateRange(
    startDate: Date,
    endDate: Date
): Promise<Transaction[]> {
    return getTransactions({ startDate, endDate });
}

/**
 * Get financial summary from transactions
 */
export async function getFinancialSummary(startDate?: Date, endDate?: Date) {
    const transactions = await getTransactions({ startDate, endDate });

    const income = transactions.filter((t: any) => t.type === 'income');
    const expenses = transactions.filter((t: any) => t.type === 'expense');

    const totalRevenue = income.reduce((sum: number, t: any) => sum + t.amount, 0);
    const totalExpenses = Math.abs(expenses.reduce((sum: number, t: any) => sum + t.amount, 0));
    const netProfit = totalRevenue - totalExpenses;

    const accommodationRevenue = income
        .filter((t: any) => t.source === 'accommodation')
        .reduce((sum: number, t: any) => sum + t.amount, 0);

    const restaurantRevenue = income
        .filter((t: any) => t.source === 'restaurant')
        .reduce((sum: number, t: any) => sum + t.amount, 0);

    const otherIncomeTotal = income
        .filter((t: any) => t.source === 'other_income')
        .reduce((sum: number, t: any) => sum + t.amount, 0);

    const totalVAT = transactions
        .filter((t: any) => t.is_taxable && t.tax_amount)
        .reduce((sum: number, t: any) => sum + (t.tax_amount ?? 0), 0);

    return {
        totalRevenue,
        totalExpenses,
        netProfit,
        accommodationRevenue,
        restaurantRevenue,
        otherIncomeTotal,
        totalVAT,
        transactionCount: transactions.length,
    };
}

/**
 * Get VAT summary by department
 */
export async function getVATSummary(startDate?: Date, endDate?: Date) {
    const transactions = await getTransactions({ startDate, endDate });
    const taxableTransactions = transactions.filter((t: any) => t.is_taxable && t.tax_amount);

    const accommodationVAT = taxableTransactions
        .filter((t: any) => t.department === 'accommodation')
        .reduce((sum: number, t: any) => sum + (t.tax_amount ?? 0), 0);

    const restaurantVAT = taxableTransactions
        .filter((t: any) => t.department === 'restaurant')
        .reduce((sum: number, t: any) => sum + (t.tax_amount ?? 0), 0);

    const otherVAT = taxableTransactions
        .filter((t: any) => t.department === 'other')
        .reduce((sum: number, t: any) => sum + (t.tax_amount ?? 0), 0);

    return {
        accommodationVAT,
        restaurantVAT,
        otherVAT,
        totalVAT: accommodationVAT + restaurantVAT + otherVAT,
    };
}

/**
 * Get transactions grouped by payment method
 */
export async function getTransactionsByPaymentMethod(startDate?: Date, endDate?: Date) {
    const transactions = await getTransactions({ startDate, endDate });
    const income = transactions.filter((t: any) => t.type === 'income');

    return {
        cash: income.filter((t: any) => t.payment_method === 'cash').reduce((sum: number, t: any) => sum + t.amount, 0),
        transfer: income.filter((t: any) => t.payment_method === 'transfer').reduce((sum: number, t: any) => sum + t.amount, 0),
        pos: income.filter((t: any) => t.payment_method === 'pos').reduce((sum: number, t: any) => sum + t.amount, 0),
    };
}
