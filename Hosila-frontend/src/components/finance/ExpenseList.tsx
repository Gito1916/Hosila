import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import type { Expense, ExpenseCategory } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { requireSupabase, getHotelId } from '@/lib/api';
import { voidExpense } from '@/db/finance';
import { ExpenseForm } from './ExpenseForm';
import {
    Zap, Wrench, Package, Users, Megaphone, MoreHorizontal, Undo2,
    Pencil, Ban, AlertTriangle, Loader2, Receipt,
} from 'lucide-react';

const categoryIcons: Record<ExpenseCategory, React.ReactNode> = {
    utilities: <Zap size={14} />,
    maintenance: <Wrench size={14} />,
    supplies: <Package size={14} />,
    salaries: <Users size={14} />,
    marketing: <Megaphone size={14} />,
    caution_refund: <Undo2 size={14} />,
    cancellation_refund: <Undo2 size={14} />,
    caution_deposit_refund: <Undo2 size={14} />,
    other: <MoreHorizontal size={14} />,
};

const categoryColors: Record<ExpenseCategory, string> = {
    utilities: 'bg-yellow-500/20 text-yellow-400',
    maintenance: 'bg-orange-500/20 text-orange-400',
    supplies: 'bg-cyan-500/20 text-cyan-400',
    salaries: 'bg-purple-500/20 text-purple-400',
    marketing: 'bg-pink-500/20 text-pink-400',
    caution_refund: 'bg-amber-500/20 text-amber-400',
    cancellation_refund: 'bg-red-500/20 text-red-400',
    caution_deposit_refund: 'bg-amber-500/20 text-amber-400',
    other: 'bg-slate-500/20 text-slate-400',
};

const methodBadge: Record<string, string> = {
    cash: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    transfer: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    pos: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
};

const methodLabels: Record<string, string> = {
    cash: 'Cash',
    transfer: 'Transfer',
    pos: 'POS',
};

function formatCategory(cat: string) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function ExpenseList() {
    const queryClient = useQueryClient();
    const user = useAuthStore((s) => s.user);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [voidingId, setVoidingId] = useState<string | null>(null);
    const [voidReason, setVoidReason] = useState('');
    const [voidLoading, setVoidLoading] = useState(false);
    const [showVoided, setShowVoided] = useState(false);

    const { data: expenses, isLoading } = useQuery({
        queryKey: ['expenses'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('expenses').select('*').eq('hotel_id', hotelId).order('date', { ascending: false });
            return (data ?? []) as Expense[];
        },
    });

    const handleVoid = async () => {
        if (!voidingId || !user || !voidReason.trim()) return;
        setVoidLoading(true);
        try {
            await voidExpense(voidingId, user.id, voidReason.trim());
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            setVoidingId(null);
            setVoidReason('');
        } catch (err) {
            console.error('Failed to void expense:', err);
        } finally {
            setVoidLoading(false);
        }
    };

    const filtered = (expenses ?? []).filter(e =>
        showVoided ? true : (e.status ?? 'active') === 'active'
    );

    if (isLoading) {
        return (
            <div className="card p-8 flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
        );
    }

    if (!expenses || expenses.length === 0) {
        return (
            <div className="card p-8 text-center">
                <Receipt size={40} className="mx-auto text-slate-500 mb-3" />
                <p className="text-slate-400 font-medium">No expenses recorded yet</p>
                <p className="text-sm text-slate-500 mt-1">Expenses you record will appear here as a table</p>
            </div>
        );
    }

    return (
        <>
            <div className="card">
                {/* Header */}
                <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                    <h3 className="font-semibold text-white">Expenses</h3>
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showVoided}
                            onChange={() => setShowVoided(!showVoided)}
                            className="rounded border-slate-600 bg-slate-700 text-primary-500 focus:ring-primary-500/30"
                        />
                        Show voided
                    </label>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-700/50 text-slate-400 text-xs uppercase tracking-wider">
                                <th className="text-left py-3 px-4 font-medium">Date</th>
                                <th className="text-left py-3 px-4 font-medium">Category</th>
                                <th className="text-left py-3 px-4 font-medium">Vendor/Payee</th>
                                <th className="text-left py-3 px-4 font-medium">Description</th>
                                <th className="text-left py-3 px-4 font-medium">Method</th>
                                <th className="text-right py-3 px-4 font-medium">Amount</th>
                                <th className="text-center py-3 px-4 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                            {filtered.map((expense) => {
                                const isVoided = expense.status === 'voided';
                                return (
                                    <tr
                                        key={expense.id}
                                        className={`transition-colors hover:bg-slate-700/20 ${isVoided ? 'opacity-50' : ''}`}
                                    >
                                        {/* Date */}
                                        <td className="py-3 px-4 whitespace-nowrap">
                                            <span className={`text-slate-300 ${isVoided ? 'line-through' : ''}`}>
                                                {format(new Date(expense.date), 'MMM d')}
                                            </span>
                                            <span className="block text-xs text-slate-500">
                                                {format(new Date(expense.date), 'h:mm a')}
                                            </span>
                                        </td>

                                        {/* Category */}
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${categoryColors[expense.category as ExpenseCategory] || 'bg-slate-500/20 text-slate-400'}`}>
                                                    {categoryIcons[expense.category as ExpenseCategory] || <MoreHorizontal size={14} />}
                                                </span>
                                                <span className={`text-slate-200 capitalize ${isVoided ? 'line-through' : ''}`}>
                                                    {formatCategory(expense.category)}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Vendor/Payee */}
                                        <td className="py-3 px-4">
                                            <span className={`text-slate-300 ${isVoided ? 'line-through' : ''}`}>
                                                {expense.vendor_name || '—'}
                                            </span>
                                        </td>

                                        {/* Description */}
                                        <td className="py-3 px-4 max-w-[200px]">
                                            <span className={`text-slate-400 text-xs truncate block ${isVoided ? 'line-through' : ''}`}>
                                                {expense.description || '—'}
                                            </span>
                                        </td>

                                        {/* Payment Method */}
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${methodBadge[expense.payment_method ?? 'cash'] || methodBadge.cash}`}>
                                                {methodLabels[expense.payment_method ?? 'cash'] || 'Cash'}
                                            </span>
                                        </td>

                                        {/* Amount */}
                                        <td className="py-3 px-4 text-right whitespace-nowrap">
                                            <span className={`font-semibold ${isVoided ? 'text-slate-500 line-through' : 'text-red-400'}`}>
                                                -₦{expense.amount.toLocaleString()}
                                            </span>
                                            {isVoided && (
                                                <span className="block text-xs text-red-400/60 mt-0.5">Voided</span>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="py-3 px-4 text-center">
                                            {!isVoided ? (
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => setEditingExpense(expense)}
                                                        className="p-1.5 rounded-md text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                                                        title="Edit expense"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => setVoidingId(expense.id)}
                                                        className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                        title="Void expense"
                                                    >
                                                        <Ban size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-500" title={expense.voided_reason || ''}>
                                                    Voided
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Summary row */}
                <div className="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400">
                    <span>{filtered.length} expense{filtered.length !== 1 ? 's' : ''}</span>
                    <span className="font-semibold text-red-400">
                        Total: -₦{filtered
                            .filter(e => (e.status ?? 'active') === 'active')
                            .reduce((s, e) => s + e.amount, 0)
                            .toLocaleString()
                        }
                    </span>
                </div>
            </div>

            {/* Edit Modal */}
            {editingExpense && (
                <ExpenseForm
                    expense={editingExpense}
                    onClose={() => setEditingExpense(null)}
                    onSuccess={() => {
                        setEditingExpense(null);
                        queryClient.invalidateQueries({ queryKey: ['expenses'] });
                    }}
                />
            )}

            {/* Void Confirmation Modal */}
            {voidingId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-sm p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                                <AlertTriangle size={20} className="text-red-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white">Void Expense</h3>
                                <p className="text-xs text-slate-400">
                                    This expense will be excluded from financial reports
                                </p>
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className="label">Reason for voiding *</label>
                            <textarea
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                                className="input"
                                rows={2}
                                placeholder="e.g., Entered wrong amount, duplicate entry"
                                autoFocus
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setVoidingId(null); setVoidReason(''); }}
                                className="btn btn-secondary flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleVoid}
                                disabled={!voidReason.trim() || voidLoading}
                                className="btn bg-red-500 hover:bg-red-600 disabled:opacity-50 flex-1"
                            >
                                {voidLoading ? (
                                    <><Loader2 size={16} className="animate-spin mr-1" /> Voiding...</>
                                ) : 'Void Expense'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
