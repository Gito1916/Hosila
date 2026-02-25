import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createInventoryItem } from '@/db/inventory';
import type { InventoryCategory, AmenityBehavior } from '@/types';
import { X, Loader2, Package, RotateCcw } from 'lucide-react';

interface InventoryFormProps {
    onClose: () => void;
    onSuccess: () => void;
}

interface FormData {
    name: string;
    category: InventoryCategory;
    behavior: AmenityBehavior;
    isAmenity: boolean;
    defaultIssueQty: number;
    unitType: string;
    currentStock: number;
    minStockLevel: number;
    unitCost: number;
    sellingPrice: number;
    supplierName: string;
    supplierContact: string;
    reorderQuantity: number;
}

export function InventoryForm({ onClose, onSuccess }: InventoryFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<FormData>({
        defaultValues: {
            name: '',
            category: 'food',
            behavior: 'consumable',
            isAmenity: false,
            defaultIssueQty: 0,
            unitType: 'units',
            currentStock: 0,
            minStockLevel: 10,
            unitCost: 0,
            sellingPrice: 0,
            supplierName: '',
            supplierContact: '',
            reorderQuantity: 0,
        },
    });

    const isAmenity = watch('isAmenity');

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);

        try {
            await createInventoryItem({
                name: data.name,
                category: data.category,
                behavior: data.behavior,
                isAmenity: data.isAmenity,
                defaultIssueQty: data.isAmenity ? Number(data.defaultIssueQty) : 0,
                unitType: data.unitType,
                currentStock: Number(data.currentStock),
                minStockLevel: Number(data.minStockLevel),
                unitCost: Number(data.unitCost),
                sellingPrice: data.sellingPrice ? Number(data.sellingPrice) : undefined,
                supplierName: data.supplierName || undefined,
                supplierContact: data.supplierContact || undefined,
                reorderQuantity: data.reorderQuantity ? Number(data.reorderQuantity) : undefined,
            });

            onSuccess();
        } catch (err) {
            console.error('Error creating item:', err);
            setError(err instanceof Error ? err.message : 'Failed to create item');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold text-heading">Add Inventory Item</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Name */}
                    <div>
                        <label className="label">Item Name *</label>
                        <input
                            {...register('name', { required: 'Name is required' })}
                            className={`input ${errors.name ? 'input-error' : ''}`}
                            placeholder="e.g., Toilet Paper"
                        />
                        {errors.name && (
                            <p className="text-xs text-error mt-1">{errors.name.message}</p>
                        )}
                    </div>

                    {/* Category & Unit */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Category</label>
                            <select {...register('category')} className="input">
                                <option value="food">Food / Kitchen</option>
                                <option value="housekeeping">Housekeeping</option>
                                <option value="maintenance">Maintenance</option>
                                <option value="front_office">Front Office</option>
                                <option value="beverages">Beverages</option>
                                <option value="laundry">Laundry</option>
                                <option value="amenities">Amenities</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">Unit Type</label>
                            <input
                                {...register('unitType')}
                                className="input"
                                placeholder="e.g., rolls, packs"
                            />
                        </div>
                    </div>

                    {/* Behavior */}
                    <div>
                        <label className="label">Item Behavior</label>
                        <div className="grid grid-cols-2 gap-2">
                            <label className="flex items-center gap-2 p-3 rounded-lg border border-border-strong cursor-pointer hover:border-primary-500 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-500/10">
                                <input
                                    type="radio"
                                    value="consumable"
                                    {...register('behavior')}
                                    className="accent-primary-500"
                                />
                                <Package size={18} className="text-muted" />
                                <div>
                                    <p className="text-sm font-medium text-heading">Consumable</p>
                                    <p className="text-xs text-muted">Deducted immediately</p>
                                </div>
                            </label>
                            <label className="flex items-center gap-2 p-3 rounded-lg border border-border-strong cursor-pointer hover:border-primary-500 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-500/10">
                                <input
                                    type="radio"
                                    value="returnable"
                                    {...register('behavior')}
                                    className="accent-primary-500"
                                />
                                <RotateCcw size={18} className="text-muted" />
                                <div>
                                    <p className="text-sm font-medium text-heading">Returnable</p>
                                    <p className="text-xs text-muted">Tracked until checkout</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Amenity Toggle */}
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border-strong">
                        <div>
                            <p className="text-sm font-medium text-heading">Issue at Check-In</p>
                            <p className="text-xs text-muted">Show in check-in amenities list</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                {...register('isAmenity')}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-surface-card peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                        </label>
                    </div>

                    {/* Default Issue Quantity (only if amenity) */}
                    {isAmenity && (
                        <div>
                            <label className="label">Default Issue Quantity</label>
                            <input
                                {...register('defaultIssueQty')}
                                type="number"
                                className="input"
                                min="0"
                                placeholder="Quantity per room (0 = off)"
                            />
                            <p className="text-xs text-muted mt-1">Auto-selected quantity at check-in</p>
                        </div>
                    )}

                    {/* Stock Levels */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Current Stock</label>
                            <input
                                {...register('currentStock')}
                                type="number"
                                className="input"
                                min="0"
                            />
                        </div>
                        <div>
                            <label className="label">Min Stock Level</label>
                            <input
                                {...register('minStockLevel')}
                                type="number"
                                className="input"
                                min="0"
                            />
                        </div>
                    </div>

                    {/* Cost */}
                    <div>
                        <label className="label">Unit Cost (₦)</label>
                        <input
                            {...register('unitCost')}
                            type="number"
                            className="input"
                            min="0"
                        />
                    </div>

                    {/* Selling Price */}
                    <div>
                        <label className="label">Selling Price (₦)</label>
                        <input
                            {...register('sellingPrice')}
                            type="number"
                            className="input"
                            min="0"
                        />
                        <p className="text-xs text-muted mt-1">Price shown in restaurant menu (for beverages)</p>
                    </div>

                    {/* Supplier Section */}
                    <div className="border-t border-border pt-4 mt-4">
                        <h4 className="text-sm font-medium text-muted mb-3">Supplier Information</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Supplier Name</label>
                                <input
                                    {...register('supplierName')}
                                    className="input"
                                    placeholder="Vendor name"
                                />
                            </div>
                            <div>
                                <label className="label">Contact</label>
                                <input
                                    {...register('supplierContact')}
                                    className="input"
                                    placeholder="Phone/Email"
                                />
                            </div>
                        </div>
                        <div className="mt-3">
                            <label className="label">Reorder Quantity</label>
                            <input
                                {...register('reorderQuantity')}
                                type="number"
                                className="input"
                                min="0"
                                placeholder="Suggested order qty"
                            />
                            <p className="text-xs text-muted mt-1">How many to order when restocking</p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={18} className="animate-spin mr-2" />
                                    Saving...
                                </>
                            ) : (
                                'Add Item'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
