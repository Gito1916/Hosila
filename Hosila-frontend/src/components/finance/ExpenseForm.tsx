import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/stores/authStore';
import { createExpense, updateExpense } from '@/db/finance';
import type { Expense, ExpenseCategory } from '@/types';
import { X, Loader2, Receipt, AlertTriangle } from 'lucide-react';

interface ExpenseFormProps {
    onClose: () => void;
    onSuccess: () => void;
    /** If provided, the form is in "edit mode" and pre-fills with this expense */
    expense?: Expense;
}

interface FormData {
    amount: number;
    category: ExpenseCategory;
    vendorName: string;
    description: string;
    paymentMethod: 'cash' | 'transfer' | 'pos';
}

export function ExpenseForm({ onClose, onSuccess, expense }: ExpenseFormProps) {
    const user = useAuthStore((state) => state.user);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const isEditing = !!expense;

    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = useForm<FormData>({
        defaultValues: {
            amount: 0,
            category: 'supplies',
            vendorName: '',
            description: '',
            paymentMethod: 'cash',
        },
    });

    // Pre-fill form when editing
    useEffect(() => {
        if (expense) {
            reset({
                amount: expense.amount,
                category: expense.category,
                vendorName: expense.vendor_name || '',
                description: expense.description || '',
                paymentMethod: (expense.payment_method as 'cash' | 'transfer' | 'pos') || 'cash',
            });
        }
    }, [expense, reset]);

    const onSubmit = async (data: FormData) => {
        if (!user) return;

        // Show confirmation dialog when editing
        if (isEditing && !showConfirm) {
            setShowConfirm(true);
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            if (isEditing && expense) {
                await updateExpense(
                    expense.id,
                    {
                        amount: Number(data.amount),
                        category: data.category,
                        vendor_name: data.vendorName || undefined,
                        description: data.description || undefined,
                        payment_method: data.paymentMethod,
                    },
                    user.id
                );
            } else {
                await createExpense({
                    amount: Number(data.amount),
                    category: data.category,
                    vendorName: data.vendorName || undefined,
                    description: data.description || undefined,
                    recordedBy: user.id,
                    paymentMethod: data.paymentMethod,
                });
            }

            onSuccess();
        } catch (err) {
            console.error('Error saving expense:', err);
            setError(err instanceof Error ? err.message : 'Failed to save expense');
            setShowConfirm(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <Receipt size={20} className="text-red-400" />
                        <h2 className="text-xl font-bold text-white">
                            {isEditing ? 'Edit Expense' : 'Record Expense'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Confirmation overlay when editing */}
                {showConfirm && (
                    <div className="p-4 bg-amber-500/10 border-b border-amber-500/30">
                        <div className="flex items-start gap-3">
                            <AlertTriangle size={20} className="text-amber-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-amber-300">
                                    Editing this expense will update financial reports.
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                    This change will be logged in the audit trail. Continue?
                                </p>
                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={() => setShowConfirm(false)}
                                        className="btn btn-secondary text-xs px-3 py-1.5"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSubmit(onSubmit)}
                                        disabled={isSubmitting}
                                        className="btn bg-amber-500 hover:bg-amber-600 text-xs px-3 py-1.5"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin mr-1" />
                                                Saving...
                                            </>
                                        ) : (
                                            'Yes, Update Expense'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Amount */}
                    <div>
                        <label className="label">Amount (₦) *</label>
                        <input
                            {...register('amount', {
                                required: 'Amount is required',
                                min: { value: 1, message: 'Amount must be greater than 0' }
                            })}
                            type="number"
                            className={`input text-2xl font-bold ${errors.amount ? 'input-error' : ''}`}
                            placeholder="0"
                        />
                        {errors.amount && (
                            <p className="text-xs text-error mt-1">{errors.amount.message}</p>
                        )}
                    </div>

                    {/* Category */}
                    <div>
                        <label className="label">Category</label>
                        <select {...register('category')} className="input">
                            <option value="utilities">Utilities (Electricity, Water, Gas)</option>
                            <option value="maintenance">Maintenance & Repairs</option>
                            <option value="supplies">Supplies & Consumables</option>
                            <option value="salaries">Salaries & Wages</option>
                            <option value="marketing">Marketing & Advertising</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    {/* Payment Method */}
                    <div>
                        <label className="label">Payment Method</label>
                        <select {...register('paymentMethod')} className="input">
                            <option value="cash">Cash</option>
                            <option value="transfer">Bank Transfer</option>
                            <option value="pos">POS</option>
                        </select>
                    </div>

                    {/* Vendor/Payee */}
                    <div>
                        <label className="label">Vendor / Payee</label>
                        <input
                            {...register('vendorName')}
                            className="input"
                            placeholder="e.g., NEPA, Plumber John"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="label">Description</label>
                        <textarea
                            {...register('description')}
                            className="input"
                            rows={2}
                            placeholder="Brief description of expense"
                        />
                    </div>

                    {/* Actions */}
                    {!showConfirm && (
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                                Cancel
                            </button>
                            <button type="submit" disabled={isSubmitting} className="btn bg-red-500 hover:bg-red-600 flex-1">
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin mr-2" />
                                        {isEditing ? 'Updating...' : 'Recording...'}
                                    </>
                                ) : (
                                    isEditing ? 'Update Expense' : 'Record Expense'
                                )}
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
