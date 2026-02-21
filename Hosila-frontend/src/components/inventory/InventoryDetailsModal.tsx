import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { recordMovement, getMovementsForItem, deleteInventoryItem } from '@/db/inventory';
import { toast } from '@/lib/errorMessages';
import type { InventoryItem, MovementType } from '@/types';
import { format } from 'date-fns';
import {
    X,
    Plus,
    Minus,
    History,
    TrendingUp,
    TrendingDown,
    Loader2,
    Trash2,
    Phone,
    PackageOpen,
} from 'lucide-react';

interface InventoryDetailsModalProps {
    item: InventoryItem;
    onClose: () => void;
    onDeleted?: () => void;
}

export function InventoryDetailsModal({ item, onClose, onDeleted }: InventoryDetailsModalProps) {
    const user = useAuthStore((state) => state.user);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showMovement, setShowMovement] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [movementType, setMovementType] = useState<MovementType>('add');
    const [quantity, setQuantity] = useState(1);
    const [reason, setReason] = useState('');
    const [department, setDepartment] = useState('');

    // Get movement history
    const { data: movements } = useQuery({ queryKey: ['getMovementsForItem', item.id], queryFn: () => getMovementsForItem(item.id), enabled: !!item.id });

    const isLowStock = item.current_stock <= item.min_stock_level;
    const stockValue = item.current_stock * item.unit_cost;

    const handleRecordMovement = async () => {
        if (!user || quantity <= 0) return;

        setIsSubmitting(true);
        try {
            await recordMovement({
                itemId: item.id,
                movementType,
                quantity,
                reason: reason || undefined,
                department: department || undefined,
                performedBy: user.id,
            });

            setShowMovement(false);
            setQuantity(1);
            setReason('');
            setDepartment('');
        } catch (err) {
            toast.error('Failed to record movement', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteInventoryItem(item.id);
            onDeleted?.();
            onClose();
        } catch (err) {
            toast.error('Failed to delete item', err);
            setIsDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div>
                        <h2 className="text-xl font-bold text-white">{item.name}</h2>
                        <p className="text-sm text-slate-400 capitalize">{item.category.replace('_', ' ')}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Stock Status */}
                    <div className={`rounded-lg p-4 ${isLowStock ? 'bg-red-500/20' : 'bg-slate-700/50'}`}>
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm text-slate-400">Current Stock</p>
                                <p className={`text-3xl font-bold ${isLowStock ? 'text-red-400' : 'text-white'}`}>
                                    {item.current_stock} <span className="text-lg font-normal">{item.unit_type}</span>
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-slate-400">Min Level</p>
                                <p className="text-xl font-semibold text-slate-300">{item.min_stock_level}</p>
                            </div>
                        </div>
                        {isLowStock && (
                            <p className="text-red-400 text-sm mt-2">⚠️ Stock is below minimum level!</p>
                        )}
                    </div>

                    {/* Value Info */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="card p-3">
                            <p className="text-sm text-slate-400">Unit Cost</p>
                            <p className="text-xl font-bold text-white">₦{item.unit_cost.toLocaleString()}</p>
                        </div>
                        <div className="card p-3">
                            <p className="text-sm text-slate-400">Stock Value</p>
                            <p className="text-xl font-bold text-status-available">₦{stockValue.toLocaleString()}</p>
                        </div>
                    </div>

                    {/* Supplier Information */}
                    {(item.supplier_name || item.supplier_contact || item.reorder_quantity) && (
                        <div className="card p-3 space-y-2">
                            <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                <PackageOpen size={14} />
                                Supplier Information
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                {item.supplier_name && (
                                    <div>
                                        <p className="text-xs text-slate-500">Vendor</p>
                                        <p className="text-white">{item.supplier_name}</p>
                                    </div>
                                )}
                                {item.supplier_contact && (
                                    <div>
                                        <p className="text-xs text-slate-500">Contact</p>
                                        <p className="text-white flex items-center gap-1">
                                            <Phone size={12} className="text-slate-400" />
                                            {item.supplier_contact}
                                        </p>
                                    </div>
                                )}
                                {item.reorder_quantity && item.reorder_quantity > 0 && (
                                    <div>
                                        <p className="text-xs text-slate-500">Reorder Qty</p>
                                        <p className="text-white">{item.reorder_quantity} {item.unit_type}</p>
                                    </div>
                                )}
                                {item.last_purchase_date && (
                                    <div>
                                        <p className="text-xs text-slate-500">Last Purchase</p>
                                        <p className="text-white">{format(new Date(item.last_purchase_date), 'MMM d, yyyy')}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Movement Form */}
                    {!showMovement ? (
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowMovement(true); setMovementType('add'); }}
                                className="btn btn-primary flex-1"
                            >
                                <Plus size={18} className="mr-1" /> Add Stock
                            </button>
                            <button
                                onClick={() => { setShowMovement(true); setMovementType('deduct'); }}
                                className="btn btn-secondary flex-1"
                            >
                                <Minus size={18} className="mr-1" /> Deduct
                            </button>
                        </div>
                    ) : (
                        <div className="card p-4 space-y-3">
                            <h3 className="font-medium text-white flex items-center gap-2">
                                {movementType === 'add' ? (
                                    <><TrendingUp size={18} className="text-status-available" /> Add Stock</>
                                ) : (
                                    <><TrendingDown size={18} className="text-red-400" /> Deduct Stock</>
                                )}
                            </h3>

                            <div>
                                <label className="label">Quantity</label>
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                                    className="input"
                                    min="1"
                                />
                            </div>

                            <div>
                                <label className="label">Reason</label>
                                <input
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    className="input"
                                    placeholder={movementType === 'add' ? 'e.g., Purchase, Restock' : 'e.g., Used, Damaged'}
                                />
                            </div>

                            <div>
                                <label className="label">Department</label>
                                <select
                                    value={department}
                                    onChange={(e) => setDepartment(e.target.value)}
                                    className="input"
                                >
                                    <option value="">Select department...</option>
                                    <option value="housekeeping">Housekeeping</option>
                                    <option value="kitchen">Kitchen</option>
                                    <option value="front_desk">Front Desk</option>
                                    <option value="maintenance">Maintenance</option>
                                    <option value="laundry">Laundry</option>
                                </select>
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => setShowMovement(false)} className="btn btn-secondary flex-1">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRecordMovement}
                                    disabled={isSubmitting || quantity <= 0}
                                    className={`btn flex-1 ${movementType === 'add' ? 'btn-primary' : 'bg-red-500 hover:bg-red-600'}`}
                                >
                                    {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Confirm'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Movement History */}
                    <div className="card p-4">
                        <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                            <History size={16} />
                            Movement History
                        </h3>
                        {!movements || movements.length === 0 ? (
                            <p className="text-sm text-slate-500">No movements recorded yet</p>
                        ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {movements.slice(0, 10).map((m) => (
                                    <div key={m.id} className="flex justify-between items-center text-sm p-2 bg-slate-700/50 rounded">
                                        <div className="flex items-center gap-2">
                                            {m.movement_type === 'add' ? (
                                                <TrendingUp size={14} className="text-status-available" />
                                            ) : (
                                                <TrendingDown size={14} className="text-red-400" />
                                            )}
                                            <span className={m.movement_type === 'add' ? 'text-status-available' : 'text-red-400'}>
                                                {m.movement_type === 'add' ? '+' : '-'}{m.quantity}
                                            </span>
                                            {m.reason && <span className="text-slate-400">• {m.reason}</span>}
                                        </div>
                                        <div className="text-right text-xs text-slate-500">
                                            <p>{format(new Date(m.movement_time), 'MMM d, h:mm a')}</p>
                                            <p>Balance: {m.balance_after}</p>
                                            {m.source && (
                                                <p className="text-slate-400 capitalize">{m.source.replace('_', ' ')}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Delete Section */}
                    {!showDeleteConfirm ? (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="w-full p-3 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 text-sm flex items-center justify-center gap-2 transition-all"
                        >
                            <Trash2 size={16} />
                            Delete Item
                        </button>
                    ) : (
                        <div className="card p-4 border-red-500/50 bg-red-500/10">
                            <p className="text-red-400 text-sm mb-3">
                                Are you sure you want to delete <strong>{item.name}</strong>? This action cannot be undone.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="btn btn-secondary flex-1"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                    className="btn flex-1 bg-red-500 hover:bg-red-600 text-white"
                                >
                                    {isDeleting ? (
                                        <><Loader2 size={16} className="animate-spin mr-1" /> Deleting...</>
                                    ) : (
                                        'Confirm Delete'
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
