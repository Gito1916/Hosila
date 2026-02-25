import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { cancelReservation } from '@/db/reservations';
import { createExpense } from '@/db/finance';
import type { Reservation, Guest } from '@/types';
import { X, Loader2, AlertTriangle, DollarSign, Edit3 } from 'lucide-react';
import { format } from 'date-fns';

interface CancellationModalProps {
    reservation: Reservation;
    guest: Guest;
    onClose: () => void;
    onSuccess: () => void;
    onModify: () => void; // Switch to modify mode
}

type RefundOption = 'full' | 'partial' | 'none';

export function CancellationModal({ reservation, guest, onClose, onSuccess, onModify }: CancellationModalProps) {
    const user = useAuthStore((state) => state.user);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reason, setReason] = useState('');
    const [refundOption, setRefundOption] = useState<RefundOption>('none');
    const [partialAmount, setPartialAmount] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const depositPaid = reservation.deposit_paid || 0;

    const handleConfirm = async () => {
        if (!reason.trim()) {
            setError('Please enter a cancellation reason');
            return;
        }

        if (refundOption === 'partial' && (partialAmount <= 0 || partialAmount > depositPaid)) {
            setError(`Partial refund must be between ₦1 and ₦${depositPaid.toLocaleString()}`);
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // Calculate refund amount
            const refundAmount = refundOption === 'full' ? depositPaid
                : refundOption === 'partial' ? partialAmount
                    : 0;

            // Cancel the reservation
            await cancelReservation(reservation.id, reason, user?.id || 'unknown');

            // Create expense record if refund
            if (refundAmount > 0) {
                await createExpense({
                    category: 'cancellation_refund',
                    amount: refundAmount,
                    description: `Refund for cancelled reservation - ${guest.name}`,
                    recordedBy: user?.id || 'unknown',
                });
            }

            onSuccess();
        } catch (err) {
            console.error('Error cancelling reservation:', err);
            setError(err instanceof Error ? err.message : 'Failed to cancel reservation');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2 text-red-400">
                        <AlertTriangle size={20} />
                        <h2 className="text-xl font-bold text-heading">Cancel Reservation</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Reservation Info */}
                    <div className="bg-surface-raised/50 rounded-lg p-3 space-y-1">
                        <p className="text-heading font-medium">{guest.name}</p>
                        <p className="text-sm text-muted">
                            {format(new Date(reservation.check_in_date), 'MMM d')} - {format(new Date(reservation.check_out_date), 'MMM d, yyyy')}
                            {' • '}{reservation.nights} nights
                        </p>
                        {depositPaid > 0 && (
                            <p className="text-sm text-primary-400">
                                Deposit Paid: ₦{depositPaid.toLocaleString()}
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Cancellation Reason */}
                    <div>
                        <label className="label">Cancellation Reason *</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Guest requested cancellation, no-show, etc."
                            className="input min-h-[80px]"
                        />
                    </div>

                    {/* Refund Options - Only show if deposit was paid */}
                    {depositPaid > 0 && (
                        <div>
                            <label className="label flex items-center gap-2">
                                <DollarSign size={16} />
                                What happens to the deposit?
                            </label>
                            <div className="space-y-2">
                                <label className="flex items-start gap-3 p-3 rounded-lg border border-border-strong cursor-pointer hover:border-primary-500 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-500/10">
                                    <input
                                        type="radio"
                                        name="refund"
                                        value="full"
                                        checked={refundOption === 'full'}
                                        onChange={() => setRefundOption('full')}
                                        className="mt-1 accent-primary-500"
                                    />
                                    <div>
                                        <p className="text-heading font-medium">Full Refund</p>
                                        <p className="text-xs text-muted">Refund ₦{depositPaid.toLocaleString()} to guest</p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-lg border border-border-strong cursor-pointer hover:border-primary-500 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-500/10">
                                    <input
                                        type="radio"
                                        name="refund"
                                        value="partial"
                                        checked={refundOption === 'partial'}
                                        onChange={() => setRefundOption('partial')}
                                        className="mt-1 accent-primary-500"
                                    />
                                    <div className="flex-1">
                                        <p className="text-heading font-medium">Partial Refund</p>
                                        {refundOption === 'partial' && (
                                            <div className="mt-2">
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₦</span>
                                                    <input
                                                        type="number"
                                                        value={partialAmount}
                                                        onChange={(e) => setPartialAmount(Number(e.target.value))}
                                                        className="input pl-8 w-full"
                                                        min="1"
                                                        max={depositPaid}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-lg border border-border-strong cursor-pointer hover:border-primary-500 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-500/10">
                                    <input
                                        type="radio"
                                        name="refund"
                                        value="none"
                                        checked={refundOption === 'none'}
                                        onChange={() => setRefundOption('none')}
                                        className="mt-1 accent-primary-500"
                                    />
                                    <div>
                                        <p className="text-heading font-medium">No Refund</p>
                                        <p className="text-xs text-muted">Guest forfeits deposit per policy</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Modify Option */}
                    <button
                        onClick={onModify}
                        className="w-full p-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-muted hover:text-heading hover:border-primary-500 transition-colors"
                    >
                        <Edit3 size={16} />
                        <span>Modify reservation instead (change dates/room)</span>
                    </button>
                </div>

                {/* Actions */}
                <div className="flex gap-3 p-4 border-t border-border">
                    <button onClick={onClose} className="btn btn-secondary flex-1">
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isSubmitting}
                        className="btn bg-red-500 hover:bg-red-600 flex-1"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={18} className="animate-spin mr-2" />
                                Cancelling...
                            </>
                        ) : (
                            'Confirm Cancellation'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
