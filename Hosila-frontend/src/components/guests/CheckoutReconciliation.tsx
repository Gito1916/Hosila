import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUnresolvedReturnables, returnAmenity, markAmenityLost, getInventoryItemById } from '@/db/inventory';
import type { IssuedAmenity } from '@/types';
import { RotateCcw, AlertTriangle, Check, X, Loader2 } from 'lucide-react';

interface CheckoutReconciliationProps {
    bookingId: string;
    onComplete: () => void;
    onCancel: () => void;
    performedBy: string;
}

type ReturnStatus = 'returned' | 'lost' | 'pending';

interface ReconciliationItem {
    issuedAmenity: IssuedAmenity;
    status: ReturnStatus;
    returnedQty: number;
    lostQty: number;
    unitCost: number;
}

export function CheckoutReconciliation({
    bookingId,
    onComplete,
    onCancel,
    performedBy
}: CheckoutReconciliationProps) {
    const [items, setItems] = useState<ReconciliationItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get unresolved returnables
    const { data: unresolvedReturnables } = useQuery({ queryKey: ['getUnresolvedReturnables', bookingId], queryFn: () => getUnresolvedReturnables(bookingId), enabled: !!bookingId });

    // Initialize reconciliation items
    useEffect(() => {
        const initializeItems = async () => {
            if (!unresolvedReturnables) return;

            const reconciliationItems: ReconciliationItem[] = [];
            for (const issued of unresolvedReturnables) {
                const item = await getInventoryItemById(issued.item_id);
                reconciliationItems.push({
                    issuedAmenity: issued,
                    status: 'pending',
                    returnedQty: issued.quantity_issued, // Default: all returned
                    lostQty: 0,
                    unitCost: item?.unit_cost ?? 0,
                });
            }
            setItems(reconciliationItems);
        };

        initializeItems();
    }, [unresolvedReturnables]);

    const updateItemStatus = (index: number, status: ReturnStatus) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;

            if (status === 'returned') {
                return {
                    ...item,
                    status,
                    returnedQty: item.issuedAmenity.quantity_issued,
                    lostQty: 0
                };
            } else if (status === 'lost') {
                return {
                    ...item,
                    status,
                    returnedQty: 0,
                    lostQty: item.issuedAmenity.quantity_issued
                };
            }
            return { ...item, status };
        }));
    };

    const updateLostQty = (index: number, lostQty: number) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const maxQty = item.issuedAmenity.quantity_issued;
            const actualLost = Math.min(Math.max(0, lostQty), maxQty);
            return {
                ...item,
                lostQty: actualLost,
                returnedQty: maxQty - actualLost,
                status: actualLost > 0 ? 'lost' : 'returned',
            };
        }));
    };

    const handleConfirm = async () => {
        setIsProcessing(true);
        setError(null);

        try {
            for (const item of items) {
                if (item.lostQty > 0) {
                    // Mark as lost with potential charge
                    await markAmenityLost({
                        issuedAmenityId: item.issuedAmenity.id,
                        lostQuantity: item.lostQty,
                        chargeAmount: item.lostQty * item.unitCost,
                        performedBy,
                    });
                } else {
                    // Mark as fully returned
                    await returnAmenity({
                        issuedAmenityId: item.issuedAmenity.id,
                        quantityReturned: item.returnedQty,
                        returnedBy: performedBy,
                    });
                }
            }
            onComplete();
        } catch (err) {
            console.error('Reconciliation error:', err);
            setError(err instanceof Error ? err.message : 'Failed to process reconciliation');
        } finally {
            setIsProcessing(false);
        }
    };

    // If no returnables, auto-proceed
    if (unresolvedReturnables && unresolvedReturnables.length === 0) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-surface-card rounded-xl border border-border w-full max-w-md p-6 text-center">
                    <Check size={48} className="mx-auto text-green-400 mb-4" />
                    <h3 className="text-lg font-bold text-heading mb-2">No Items to Return</h3>
                    <p className="text-muted mb-4">
                        No returnable items were issued for this booking.
                    </p>
                    <button onClick={onComplete} className="btn btn-primary w-full">
                        Continue Checkout
                    </button>
                </div>
            </div>
        );
    }

    // Loading state
    if (!unresolvedReturnables || items.length === 0 && unresolvedReturnables.length > 0) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-surface-card rounded-xl border border-border w-full max-w-md p-6 text-center">
                    <Loader2 size={32} className="mx-auto animate-spin text-primary-400" />
                    <p className="text-muted mt-4">Loading returnables...</p>
                </div>
            </div>
        );
    }

    const totalLossCharge = items.reduce((sum, item) => sum + (item.lostQty * item.unitCost), 0);
    const hasLostItems = items.some(item => item.lostQty > 0);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <RotateCcw size={20} className="text-blue-400" />
                        <h2 className="text-xl font-bold text-heading">Return Items</h2>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4 overflow-y-auto flex-1">
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <p className="text-muted text-sm">
                        Confirm the status of returnable items issued to this guest.
                    </p>

                    {/* Items list */}
                    <div className="space-y-3">
                        {items.map((item, index) => (
                            <div
                                key={item.issuedAmenity.id}
                                className={`p-3 rounded-lg border ${item.status === 'lost'
                                        ? 'border-red-500/50 bg-red-500/10'
                                        : item.status === 'returned'
                                            ? 'border-green-500/50 bg-green-500/10'
                                            : 'border-border-strong bg-surface-raised/30'
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <p className="font-medium text-heading">
                                            {item.issuedAmenity.item_name}
                                        </p>
                                        <p className="text-xs text-muted">
                                            Issued: {item.issuedAmenity.quantity_issued} •
                                            Value: ₦{(item.issuedAmenity.quantity_issued * item.unitCost).toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                {/* Quick actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => updateItemStatus(index, 'returned')}
                                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${item.status === 'returned' || (item.returnedQty === item.issuedAmenity.quantity_issued && item.status !== 'lost')
                                                ? 'bg-green-500 text-heading'
                                                : 'bg-surface-card text-muted hover:bg-surface-inset0'
                                            }`}
                                    >
                                        <Check size={14} className="inline mr-1" />
                                        All Returned
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateItemStatus(index, 'lost')}
                                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${item.status === 'lost' && item.lostQty === item.issuedAmenity.quantity_issued
                                                ? 'bg-red-500 text-heading'
                                                : 'bg-surface-card text-muted hover:bg-surface-inset0'
                                            }`}
                                    >
                                        <AlertTriangle size={14} className="inline mr-1" />
                                        All Lost
                                    </button>
                                </div>

                                {/* Partial loss input */}
                                {item.issuedAmenity.quantity_issued > 1 && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <span className="text-xs text-muted">Lost qty:</span>
                                        <input
                                            type="number"
                                            value={item.lostQty}
                                            onChange={(e) => updateLostQty(index, parseInt(e.target.value) || 0)}
                                            min="0"
                                            max={item.issuedAmenity.quantity_issued}
                                            className="w-16 text-center bg-surface-raised border-none rounded text-sm text-heading py-1"
                                        />
                                        <span className="text-xs text-muted">
                                            of {item.issuedAmenity.quantity_issued}
                                        </span>
                                        {item.lostQty > 0 && (
                                            <span className="text-xs text-red-400 ml-auto">
                                                Charge: ₦{(item.lostQty * item.unitCost).toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Total loss charge */}
                    {hasLostItems && (
                        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-red-400 font-medium flex items-center gap-2">
                                    <AlertTriangle size={16} />
                                    Total Loss Charge:
                                </span>
                                <span className="text-heading font-bold">
                                    ₦{totalLossCharge.toLocaleString()}
                                </span>
                            </div>
                            <p className="text-xs text-red-400/70 mt-1">
                                This amount will be logged and stock will be deducted.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border flex gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="btn btn-secondary flex-1"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isProcessing}
                        className="btn btn-primary flex-1"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 size={18} className="animate-spin mr-2" />
                                Processing...
                            </>
                        ) : (
                            'Confirm & Checkout'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
