import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import type { PaymentMethod } from '@/types';
import { getAllCharges } from '@/db/accounting';
import { getAllPayments } from '@/db/bookings';
import { getAllExpenses } from '@/db/finance';
import {
    Search,
    Filter,
    TrendingUp,
    TrendingDown,
    Building2,
    Utensils,
    MoreHorizontal,
    Receipt,
    ArrowUpDown,
    Landmark,
} from 'lucide-react';

type DateFilter = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface TransactionsListProps {
    dateFilter?: DateFilter;
}

// Department labels and icons
const departmentLabels: Record<string, string> = {
    accommodation: 'Accommodation',
    restaurant: 'Restaurant',
    other_services: 'Other Services',
    other_income: 'Other Income',
    expense: 'Expense',
    payment: 'Payment',
    tax: 'Tax',
};

const departmentIcons: Record<string, typeof Building2> = {
    accommodation: Building2,
    restaurant: Utensils,
    other_services: MoreHorizontal,
    other_income: MoreHorizontal,
    expense: Receipt,
    payment: Landmark,
    tax: Receipt,
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
    cash: 'Cash',
    transfer: 'Transfer',
    pos: 'POS',
};



function getDateRange(filter: DateFilter): { start: Date; end: Date } {
    const today = new Date();
    switch (filter) {
        case 'daily':
            return { start: startOfDay(today), end: endOfDay(today) };
        case 'weekly':
            return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
        case 'monthly':
            return { start: startOfMonth(today), end: endOfMonth(today) };
        case 'yearly':
            return { start: startOfYear(today), end: endOfYear(today) };
        default:
            return { start: startOfDay(today), end: endOfDay(today) };
    }
}

// A display row derived from journal entries grouped by reference
interface TransactionRow {
    id: string;
    date: Date;
    description: string;
    department: string;
    type: 'charge' | 'payment' | 'reversal' | 'refund' | 'expense';
    grossAmount: number;
    netRevenue: number;
    taxAmount: number;
    paymentMethod?: PaymentMethod;
}

export function TransactionsList({ dateFilter = 'daily' }: TransactionsListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');

    const { start, end } = getDateRange(dateFilter);

    // === ACCOUNTING v2: Read from charges + payments + journal_entries ===
    const { data: charges } = useQuery({ queryKey: ['charges'], queryFn: getAllCharges });
    const { data: payments } = useQuery({ queryKey: ['payments'], queryFn: getAllPayments });
    const { data: expenses } = useQuery({ queryKey: ['expenses'], queryFn: getAllExpenses });

    // Build transaction rows from charges + payments + expenses
    // Other income now appears through charges with department='other_services'
    const rows: TransactionRow[] = [];

    // Add charge rows (revenue)
    for (const charge of (charges ?? [])) {
        const d = new Date(charge.charge_date);
        if (d < start || d > end) continue;

        const isReversal = charge.status === 'cancelled';
        rows.push({
            id: charge.id,
            date: d,
            description: charge.description,
            department: charge.department,
            type: isReversal ? 'reversal' : 'charge',
            grossAmount: charge.gross_amount,
            netRevenue: charge.net_revenue,
            taxAmount: charge.tax_amount,
        });
    }

    // Add payment rows
    for (const payment of (payments ?? [])) {
        const d = new Date(payment.payment_time ?? payment.created_at);
        if (d < start || d > end) continue;

        rows.push({
            id: payment.id,
            date: d,
            description: payment.notes ?? `Payment – ${paymentMethodLabels[payment.payment_method as PaymentMethod] ?? payment.payment_method}`,
            department: 'payment',
            type: 'payment',
            grossAmount: payment.amount,
            netRevenue: 0,
            taxAmount: 0,
            paymentMethod: payment.payment_method,
        });
    }

    // Add expense rows
    for (const expense of (expenses ?? [])) {
        const d = new Date(expense.date);
        if (d < start || d > end) continue;

        rows.push({
            id: expense.id,
            date: d,
            description: expense.description ?? '',
            department: 'expense',
            type: 'expense',
            grossAmount: expense.amount,
            netRevenue: 0,
            taxAmount: 0,
            paymentMethod: expense.payment_method as PaymentMethod,
        });
    }

    // Sort by date descending
    rows.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Apply filters
    const filteredRows = rows.filter(row => {
        if (departmentFilter !== 'all' && row.department !== departmentFilter) return false;
        if (typeFilter !== 'all' && row.type !== typeFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!row.description.toLowerCase().includes(q) && !row.department.toLowerCase().includes(q)) {
                return false;
            }
        }
        return true;
    });

    // Calculate totals
    const totalCharges = filteredRows
        .filter(r => r.type === 'charge')
        .reduce((sum, r) => sum + r.grossAmount, 0);

    const totalPaymentsReceived = filteredRows
        .filter(r => r.type === 'payment')
        .reduce((sum, r) => sum + r.grossAmount, 0);

    const totalExpenses = filteredRows
        .filter(r => r.type === 'expense')
        .reduce((sum, r) => sum + r.grossAmount, 0);

    const totalTax = filteredRows
        .filter(r => r.type === 'charge')
        .reduce((sum, r) => sum + r.taxAmount, 0);

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                        <ArrowUpDown size={14} />
                        Entries
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {filteredRows.length}
                    </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-green-500/30">
                    <div className="flex items-center gap-2 text-sm text-green-400 mb-1">
                        <TrendingUp size={14} />
                        Charges (Gross)
                    </div>
                    <div className="text-2xl font-bold text-green-400">
                        ₦{totalCharges.toLocaleString()}
                    </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-cyan-500/30">
                    <div className="flex items-center gap-2 text-sm text-cyan-400 mb-1">
                        <Landmark size={14} />
                        Payment Received
                    </div>
                    <div className="text-2xl font-bold text-cyan-400">
                        ₦{totalPaymentsReceived.toLocaleString()}
                    </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-red-500/30">
                    <div className="flex items-center gap-2 text-sm text-red-400 mb-1">
                        <TrendingDown size={14} />
                        Expenses
                    </div>
                    <div className="text-2xl font-bold text-red-400">
                        ₦{totalExpenses.toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Tax Collected Banner */}
            {totalTax > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-400 text-sm">
                        <Receipt size={16} />
                        <span className="font-medium">Tax Collected (VAT Liability)</span>
                    </div>
                    <span className="text-amber-400 font-bold">₦{totalTax.toLocaleString()}</span>
                </div>
            )}

            {/* Filters — compact inline */}
            <div className="flex items-center gap-2 flex-wrap">
                {/* Search — compact */}
                <div className="relative w-56">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="text-sm w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 bg-white dark:bg-navy-800 dark:border-navy-600 dark:text-slate-300 focus:outline-none focus:border-primary-400"
                    />
                </div>

                <Filter size={14} className="text-slate-400" />

                {/* Department Filter */}
                <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white dark:bg-navy-800 dark:border-navy-600 dark:text-slate-300 focus:outline-none focus:border-primary-400 cursor-pointer appearance-none pr-7"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
                >
                    <option value="all">All Departments</option>
                    <option value="accommodation">Accommodation</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="payment">Payments</option>
                    <option value="expense">Expenses</option>
                </select>

                {/* Type Filter */}
                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white dark:bg-navy-800 dark:border-navy-600 dark:text-slate-300 focus:outline-none focus:border-primary-400 cursor-pointer appearance-none pr-7"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
                >
                    <option value="all">All Types</option>
                    <option value="charge">Charges</option>
                    <option value="payment">Payments</option>
                    <option value="reversal">Reversals</option>
                    <option value="expense">Expenses</option>
                </select>
            </div>

            {/* Transactions Table */}
            <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
                {filteredRows.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                        <Receipt size={32} className="mx-auto mb-2 opacity-50" />
                        <p>No transactions found</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-900/50 text-slate-400 text-left">
                                    <th className="px-4 py-3 font-medium">Date/Time</th>
                                    <th className="px-4 py-3 font-medium">Type</th>
                                    <th className="px-4 py-3 font-medium">Department</th>
                                    <th className="px-4 py-3 font-medium">Description</th>
                                    <th className="px-4 py-3 font-medium text-right">Gross</th>
                                    <th className="px-4 py-3 font-medium text-right">Net Revenue</th>
                                    <th className="px-4 py-3 font-medium text-right">VAT</th>
                                    <th className="px-4 py-3 font-medium">Method</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {filteredRows.map((row) => {
                                    const DeptIcon = departmentIcons[row.department] ?? Receipt;
                                    const isReversal = row.type === 'reversal';
                                    const isExpense = row.type === 'expense';

                                    const typeColors: Record<string, string> = {
                                        charge: 'bg-green-500/20 text-green-400',
                                        payment: 'bg-cyan-500/20 text-cyan-400',
                                        reversal: 'bg-amber-500/20 text-amber-400',
                                        refund: 'bg-orange-500/20 text-orange-400',
                                        expense: 'bg-red-500/20 text-red-400',
                                    };

                                    return (
                                        <tr
                                            key={row.id}
                                            className={`hover:bg-slate-700/30 transition-colors ${isReversal ? 'opacity-60' : ''}`}
                                        >
                                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                                                {format(row.date, 'dd MMM HH:mm')}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[row.type] ?? ''}`}>
                                                    {row.type === 'charge' && <TrendingUp size={12} />}
                                                    {row.type === 'payment' && <Landmark size={12} />}
                                                    {row.type === 'reversal' && <TrendingDown size={12} />}
                                                    {row.type === 'expense' && <TrendingDown size={12} />}
                                                    {row.type.charAt(0).toUpperCase() + row.type.slice(1)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2 text-slate-300">
                                                    <DeptIcon size={14} className="text-slate-400" />
                                                    {departmentLabels[row.department] ?? row.department}
                                                </div>
                                            </td>
                                            <td className={`px-4 py-3 max-w-[250px] truncate ${isReversal ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                                                {row.description}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-medium ${isReversal ? 'text-amber-400' : isExpense ? 'text-red-400' : row.type === 'payment' ? 'text-cyan-400' : 'text-green-400'
                                                }`}>
                                                {isReversal ? '-' : ''}₦{row.grossAmount.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-400">
                                                {row.netRevenue > 0 ? `₦${row.netRevenue.toLocaleString()}` : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-400">
                                                {row.taxAmount > 0 ? `₦${row.taxAmount.toLocaleString()}` : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-400">
                                                {row.paymentMethod ? paymentMethodLabels[row.paymentMethod] : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
