import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import type { IncomeCategory, PaymentMethod } from '@/types';
import { X, Loader2, Building2, Printer } from 'lucide-react';
import { getHotel } from '@/db/settings';
import { requireSupabase, getHotelId } from '@/lib/api';
import { toast } from '@/lib/errorMessages';

interface OtherIncomeFormProps {
    onClose: () => void;
    onSuccess: () => void;
}

interface FormData {
    amount: number;
    category: IncomeCategory;
    description: string;
    customerName: string;
    customerPhone: string;
    paymentMethod: PaymentMethod;
    taxable: boolean;
}

const categoryLabels: Record<IncomeCategory, string> = {
    venue_rental: 'Venue/Hall Rental',
    swimming_pool: 'Swimming Pool Fee',
    parking: 'Parking Fees',
    laundry_external: 'External Laundry',
    caution_fee: 'Caution/Security Deposit',
    other: 'Other Income',
};

export function OtherIncomeForm({ onClose, onSuccess }: OtherIncomeFormProps) {
    const user = useAuthStore((state) => state.user);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedIncomeId, setSavedIncomeId] = useState<string | null>(null);

    // Load hotel tax rate for taxable calculation
    const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: getHotel });
    const taxRate = hotel?.settings?.services_tax_rate ?? hotel?.settings?.tax_rate ?? 0;

    const {
        register,
        handleSubmit,
        control,
        formState: { errors },
    } = useForm<FormData>({
        defaultValues: {
            amount: 0,
            category: 'venue_rental',
            description: '',
            customerName: '',
            customerPhone: '',
            paymentMethod: 'cash',
            taxable: false,
        },
    });

    // Watch values for live tax preview
    const watchAmount = useWatch({ control, name: 'amount' });
    const watchTaxable = useWatch({ control, name: 'taxable' });
    const watchDescription = useWatch({ control, name: 'description' });
    const watchCategory = useWatch({ control, name: 'category' });
    const watchCustomerName = useWatch({ control, name: 'customerName' });
    const watchPaymentMethod = useWatch({ control, name: 'paymentMethod' });

    const baseAmount = Number(watchAmount) || 0;
    const taxAmount = watchTaxable && taxRate > 0 ? Math.round(baseAmount * (taxRate / 100) * 100) / 100 : 0;
    const totalAmount = Math.round((baseAmount + taxAmount) * 100) / 100;

    const onSubmit = async (data: FormData) => {
        if (!user) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const hotelId = await getHotelId();
            const now = new Date();
            const incomeId = uuidv4();

            // Save other income record — totalAmount includes tax if taxable
            await (async () => {
                const sb = requireSupabase(); await sb.from('other_income').insert({
                    id: incomeId,
                    hotel_id: hotelId,
                    category: data.category,
                    description: data.description + (data.taxable && taxRate > 0 ? ` (incl. ${taxRate}% tax: ₦${taxAmount.toLocaleString()})` : ''),
                    amount: totalAmount,
                    payment_method: data.paymentMethod,
                    customer_name: data.customerName || undefined,
                    customer_phone: data.customerPhone || undefined,
                    recorded_by: user.id,
                    date: now,
                    created_at: now,
                });
            })();

            // Create charge record in accounting v2 system
            const { createCharge } = await import('@/db/accounting');
            await createCharge({
                department: 'other_income',
                description: `${categoryLabels[data.category]}: ${data.description}`,
                gross_amount: totalAmount,
                tax_rate: data.taxable && taxRate > 0 ? taxRate : 0,
                reference_id: incomeId,
                reference_type: 'other_income',
                charge_date: now,
            });

            // Immediately settle the charge — other income is paid on the spot
            const { createPaymentWithAllocation } = await import('@/db/accounting');
            await createPaymentWithAllocation({
                amount: totalAmount,
                payment_method: data.paymentMethod,
                notes: `${categoryLabels[data.category]}: ${data.description}`,
                received_by: user.id,
            });

            setSavedIncomeId(incomeId);
            onSuccess();
        } catch (err) {
            console.error('Error recording income:', err);
            setError(err instanceof Error ? err.message : 'Failed to record income');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Print receipt for the recorded income
    const printReceipt = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.warn('Popups blocked', 'Please allow popups in your browser for printing.');
            return;
        }

        const hotelName = hotel?.name ?? 'Hotel';
        const now = new Date();
        const receiptCategory = categoryLabels[watchCategory] ?? 'Other Income';

        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Receipt - ${receiptCategory}</title>
    <style>
        body { font-family: 'Courier New', monospace; padding: 20px; max-width: 400px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
        .header h1 { margin: 0; font-size: 18px; }
        .header p { margin: 2px 0; font-size: 12px; color: #666; }
        .section { margin: 15px 0; }
        .section-title { font-weight: bold; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 8px; }
        .row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
        .row.bold { font-weight: bold; }
        .row.total { font-size: 14px; border-top: 2px solid #000; padding-top: 8px; margin-top: 8px; font-weight: bold; }
        .description { font-size: 12px; color: #333; padding: 5px 0; word-wrap: break-word; }
        .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #666; border-top: 1px dashed #000; padding-top: 10px; }
        @media print { .no-print { display: none; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>${hotelName}</h1>
        <p>Payment Receipt</p>
        <p>${format(now, 'MMM d, yyyy h:mm a')}</p>
    </div>

    <div class="section">
        ${watchCustomerName ? `<div class="row"><span>Customer:</span><span>${watchCustomerName}</span></div>` : ''}
        <div class="row"><span>Category:</span><span>${receiptCategory}</span></div>
        <div class="row"><span>Payment Method:</span><span>${(watchPaymentMethod ?? 'cash').toUpperCase()}</span></div>
    </div>

    <div class="section">
        <div class="section-title">Details</div>
        <div class="description">${watchDescription || receiptCategory}</div>
        <div class="row"><span>Amount</span><span>₦${baseAmount.toLocaleString()}</span></div>
        ${watchTaxable && taxRate > 0 ? `<div class="row"><span>Tax (${taxRate}%)</span><span>₦${taxAmount.toLocaleString()}</span></div>` : ''}
        <div class="row total"><span>TOTAL</span><span>₦${totalAmount.toLocaleString()}</span></div>
    </div>

    <div class="section">
        <div class="row bold"><span>Payment Status</span><span style="color: #080;">PAID</span></div>
    </div>

    <div class="footer">
        <p>Thank you for your patronage!</p>
        <p>${hotelName}</p>
    </div>

    <button class="no-print" onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer; width: 100%;">Print Receipt</button>
</body>
</html>`;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Building2 size={20} className="text-status-available" />
                        <h2 className="text-xl font-bold text-heading">Record Other Income</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Category */}
                    <div>
                        <label className="label">Income Type</label>
                        <select {...register('category')} className="input">
                            {Object.entries(categoryLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>

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

                    {/* Taxable Toggle */}
                    <div className="flex items-center justify-between bg-surface-raised/50 rounded-lg p-3">
                        <div>
                            <label className="text-sm text-heading font-medium">Taxable</label>
                            <p className="text-xs text-muted">
                                {taxRate > 0 ? `Add ${taxRate}% tax to the amount` : 'No tax rate configured'}
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                {...register('taxable')}
                                disabled={taxRate <= 0}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-surface-card peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500 peer-disabled:opacity-50"></div>
                        </label>
                    </div>

                    {/* Tax Preview */}
                    {watchTaxable && taxRate > 0 && baseAmount > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted">Base Amount</span>
                                <span className="text-heading">₦{baseAmount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-amber-400">Tax ({taxRate}%)</span>
                                <span className="text-amber-400">₦{taxAmount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold border-t border-amber-500/30 pt-1">
                                <span className="text-heading">Total</span>
                                <span className="text-heading">₦{totalAmount.toLocaleString()}</span>
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    <div>
                        <label className="label">Description *</label>
                        <textarea
                            {...register('description', { required: 'Description is required' })}
                            className={`input ${errors.description ? 'input-error' : ''}`}
                            rows={2}
                            placeholder="e.g., Event hall rental for wedding reception"
                        />
                        {errors.description && (
                            <p className="text-xs text-error mt-1">{errors.description.message}</p>
                        )}
                    </div>

                    {/* Customer Info */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Customer Name</label>
                            <input
                                {...register('customerName')}
                                className="input"
                                placeholder="Optional"
                            />
                        </div>
                        <div>
                            <label className="label">Phone</label>
                            <input
                                {...register('customerPhone')}
                                className="input"
                                placeholder="Optional"
                            />
                        </div>
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

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting || !!savedIncomeId} className="btn bg-status-available hover:bg-green-600 flex-1">
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={18} className="animate-spin mr-2" />
                                    Recording...
                                </>
                            ) : savedIncomeId ? (
                                '✓ Recorded'
                            ) : (
                                'Record Income'
                            )}
                        </button>
                    </div>

                    {/* Print Receipt — shows after successful save */}
                    {savedIncomeId && (
                        <button
                            type="button"
                            onClick={printReceipt}
                            className="btn btn-primary w-full gap-2"
                        >
                            <Printer size={16} />
                            Print Receipt
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
}
