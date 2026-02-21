/**
 * Finance operations — Supabase implementation
 * Replaces old Dexie-based finance queries with Supabase API calls.
 */

import { v4 as uuidv4 } from 'uuid';
import { requireSupabase, getHotelId } from '@/lib/api';
import type { Expense, ExpenseCategory, Payment, Booking } from '@/types';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from 'date-fns';

// =============================================================================
// Expenses
// =============================================================================

// Get all expenses
export async function getAllExpenses(): Promise<Expense[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('expenses').select('*').eq('hotel_id', hotelId).order('date', { ascending: false });
    if (error) throw error;
    return data ?? [];
}

// Get expenses by date range
export async function getExpensesByDateRange(startDate: Date, endDate: Date): Promise<Expense[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('expenses')
        .select('*')
        .eq('hotel_id', hotelId)
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString());
    if (error) throw error;
    return data ?? [];
}

// Get today's expenses
export async function getTodayExpenses(): Promise<Expense[]> {
    const today = new Date();
    return getExpensesByDateRange(startOfDay(today), endOfDay(today));
}

// Create expense
export async function createExpense(data: {
    amount: number;
    category: ExpenseCategory;
    vendorName?: string;
    description?: string;
    receiptUrl?: string;
    recordedBy: string;
    paymentMethod?: 'cash' | 'transfer' | 'pos';
}): Promise<Expense> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date();
    const nowIso = now.toISOString();

    const expense = {
        id: uuidv4(),
        hotel_id: hotelId,
        date: nowIso,
        amount: data.amount,
        category: data.category,
        vendor_name: data.vendorName,
        description: data.description,
        receipt_url: data.receiptUrl,
        payment_method: data.paymentMethod ?? 'cash',
        status: 'active',
        recorded_by: data.recordedBy,
        created_at: nowIso,
        updated_at: nowIso,
    };

    const { error } = await sb.from('expenses').insert(expense);
    if (error) throw error;

    // Log audit
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: data.recordedBy,
        action: 'create_expense',
        entity_type: 'expense',
        entity_id: expense.id,
        details: {
            amount: data.amount,
            category: data.category,
            vendor: data.vendorName,
        },
        timestamp: nowIso,
    });

    // Create transaction record for unified ledger
    const { createTransactionFromExpense } = await import('./transactions');
    const categoryLabels: Record<string, string> = {
        utilities: 'Utilities',
        maintenance: 'Maintenance',
        supplies: 'Supplies',
        salaries: 'Salaries',
        marketing: 'Marketing',
        caution_refund: 'Caution Refund',
        cancellation_refund: 'Cancellation Refund',
        caution_deposit_refund: 'Deposit Refund',
        other: 'Other',
    };
    await createTransactionFromExpense(
        expense.id,
        categoryLabels[data.category] ?? data.category,
        data.description ?? data.vendorName ?? 'Expense',
        data.amount,
        data.paymentMethod ?? 'cash',
        data.recordedBy
    );

    return expense as unknown as Expense;
}

// Update expense with audit trail
export async function updateExpense(
    id: string,
    updates: {
        amount?: number;
        category?: ExpenseCategory;
        vendor_name?: string;
        description?: string;
        payment_method?: 'cash' | 'transfer' | 'pos';
    },
    userId: string
): Promise<void> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const nowIso = new Date().toISOString();

    // Fetch old values for audit
    const { data: old, error: fetchErr } = await sb
        .from('expenses').select('*').eq('id', id).single();
    if (fetchErr) throw fetchErr;

    const { error } = await sb.from('expenses').update({
        ...updates,
        updated_at: nowIso,
        updated_by: userId,
    }).eq('id', id);
    if (error) throw error;

    // Audit log
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: userId,
        action: 'update_expense',
        entity_type: 'expense',
        entity_id: id,
        details: {
            old: { amount: old.amount, category: old.category, vendor_name: old.vendor_name, description: old.description, payment_method: old.payment_method },
            new: updates,
        },
        timestamp: nowIso,
    });
}

// Void (soft-delete) expense
export async function voidExpense(id: string, userId: string, reason: string): Promise<void> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const nowIso = new Date().toISOString();

    const { error } = await sb.from('expenses').update({
        status: 'voided',
        voided_at: nowIso,
        voided_by: userId,
        voided_reason: reason,
        updated_at: nowIso,
        updated_by: userId,
    }).eq('id', id);
    if (error) throw error;

    // Audit log
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: userId,
        action: 'void_expense',
        entity_type: 'expense',
        entity_id: id,
        details: { reason },
        timestamp: nowIso,
    });
}

// Hard delete expense (kept for backward compatibility, prefer voidExpense)
export async function deleteExpense(id: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('expenses').delete().eq('id', id);
    if (error) throw error;
}

// =============================================================================
// Revenue & Financial Summary
// =============================================================================

// Get revenue by date range (from payments)
export async function getRevenueByDateRange(startDate: Date, endDate: Date): Promise<{
    total: number;
    byMethod: { cash: number; transfer: number; pos: number };
    payments: Payment[];
}> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data: payments, error } = await sb.from('payments')
        .select('*')
        .eq('hotel_id', hotelId)
        .gte('payment_time', startDate.toISOString())
        .lte('payment_time', endDate.toISOString());
    if (error) throw error;

    const filteredPayments = payments ?? [];
    const total = filteredPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
    const byMethod = {
        cash: filteredPayments.filter((p: any) => p.payment_method === 'cash').reduce((sum: number, p: any) => sum + p.amount, 0),
        transfer: filteredPayments.filter((p: any) => p.payment_method === 'transfer').reduce((sum: number, p: any) => sum + p.amount, 0),
        pos: filteredPayments.filter((p: any) => p.payment_method === 'pos').reduce((sum: number, p: any) => sum + p.amount, 0),
    };

    return { total, byMethod, payments: filteredPayments as Payment[] };
}

// Get today's revenue
export async function getTodayRevenue(): Promise<{
    total: number;
    byMethod: { cash: number; transfer: number; pos: number };
}> {
    const today = new Date();
    const { total, byMethod } = await getRevenueByDateRange(startOfDay(today), endOfDay(today));
    return { total, byMethod };
}

// Get outstanding balances (unpaid amounts)
export async function getOutstandingBalances(): Promise<{
    total: number;
    count: number;
    bookings: Booking[];
}> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data: bookings, error } = await sb.from('bookings')
        .select('*')
        .eq('hotel_id', hotelId)
        .gt('balance', 0);
    if (error) throw error;

    const withBalance = bookings ?? [];
    const total = withBalance.reduce((sum: number, b: any) => sum + b.balance, 0);

    return { total, count: withBalance.length, bookings: withBalance as Booking[] };
}

// Get financial summary for a period
export async function getFinancialSummary(startDate: Date, endDate: Date): Promise<{
    revenue: number;
    expenses: number;
    profit: number;
    revenueByMethod: { cash: number; transfer: number; pos: number };
    expensesByCategory: Record<ExpenseCategory, number>;
    checkouts: number;
    averageRate: number;
}> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    // Get revenue
    const { total: revenue, byMethod: revenueByMethod } = await getRevenueByDateRange(startDate, endDate);

    // Get expenses
    const expenseList = await getExpensesByDateRange(startDate, endDate);
    const expenses = expenseList.reduce((sum: number, e: any) => sum + e.amount, 0);

    // Group expenses by category
    const expensesByCategory = expenseList.reduce((acc: any, e: any) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
    }, {} as Record<ExpenseCategory, number>);

    // Get checkouts in period
    const { data: bookings, error } = await sb.from('bookings')
        .select('*')
        .eq('hotel_id', hotelId)
        .not('actual_checkout', 'is', null)
        .gte('actual_checkout', startDate.toISOString())
        .lte('actual_checkout', endDate.toISOString());
    if (error) throw error;

    const checkoutsInPeriod = bookings ?? [];
    const checkouts = checkoutsInPeriod.length;
    const averageRate = checkouts > 0
        ? checkoutsInPeriod.reduce((sum: number, b: any) => sum + b.rate, 0) / checkouts
        : 0;

    return {
        revenue,
        expenses,
        profit: revenue - expenses,
        revenueByMethod,
        expensesByCategory,
        checkouts,
        averageRate,
    };
}

// Get daily summary for last N days
export async function getDailySummaries(days: number = 7): Promise<Array<{
    date: Date;
    revenue: number;
    expenses: number;
    profit: number;
}>> {
    const summaries = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
        const date = subDays(today, i);
        const start = startOfDay(date);
        const end = endOfDay(date);

        const { revenue, expenses, profit } = await getFinancialSummary(start, end);
        summaries.push({ date, revenue, expenses, profit });
    }

    return summaries.reverse();
}

// Get monthly summary
export async function getMonthlySummary(): Promise<{
    revenue: number;
    expenses: number;
    profit: number;
    revenueByMethod: { cash: number; transfer: number; pos: number };
}> {
    const today = new Date();
    const start = startOfMonth(today);
    const end = endOfMonth(today);

    const { revenue, expenses, profit, revenueByMethod } = await getFinancialSummary(start, end);
    return { revenue, expenses, profit, revenueByMethod };
}
