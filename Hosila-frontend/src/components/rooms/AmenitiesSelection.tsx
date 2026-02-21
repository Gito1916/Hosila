import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAmenityItems } from '@/db/inventory';
import { Package, RotateCcw, Plus, Minus, AlertTriangle } from 'lucide-react';

export interface AmenitySelection {
    itemId: string;
    itemName: string;
    quantity: number;
    behavior: 'consumable' | 'returnable';
}

interface AmenitiesSelectionProps {
    onSelectionChange: (selections: AmenitySelection[]) => void;
}

export function AmenitiesSelection({ onSelectionChange }: AmenitiesSelectionProps) {
    const [selections, setSelections] = useState<Record<string, number>>({});

    // Get amenity items
    const { data: amenityItems } = useQuery({ queryKey: ['getAmenityItems'], queryFn: getAmenityItems });

    // Initialize with default quantities
    useEffect(() => {
        if (amenityItems && Object.keys(selections).length === 0) {
            const defaults: Record<string, number> = {};
            amenityItems.forEach(item => {
                if (item.default_issue_qty > 0) {
                    defaults[item.id] = item.default_issue_qty;
                }
            });
            setSelections(defaults);
        }
    }, [amenityItems]);

    // Notify parent of changes
    useEffect(() => {
        if (!amenityItems) return;

        const selectedItems: AmenitySelection[] = [];
        Object.entries(selections).forEach(([itemId, qty]) => {
            if (qty > 0) {
                const item = amenityItems.find(i => i.id === itemId);
                if (item) {
                    selectedItems.push({
                        itemId: item.id,
                        itemName: item.name,
                        quantity: qty,
                        behavior: item.behavior,
                    });
                }
            }
        });
        onSelectionChange(selectedItems);
    }, [selections, amenityItems, onSelectionChange]);

    const updateQuantity = (itemId: string, delta: number) => {
        setSelections(prev => {
            const current = prev[itemId] || 0;
            const newQty = Math.max(0, current + delta);
            if (newQty === 0) {
                const { [itemId]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [itemId]: newQty };
        });
    };

    const setQuantity = (itemId: string, qty: number) => {
        setSelections(prev => {
            if (qty <= 0) {
                const { [itemId]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [itemId]: qty };
        });
    };

    if (!amenityItems || amenityItems.length === 0) {
        return null;
    }

    return (
        <div className="space-y-3">
            <label className="label flex items-center gap-2">
                <Package size={16} />
                Amenities to Issue
            </label>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {amenityItems.map(item => {
                    const qty = selections[item.id] || 0;
                    const isLowStock = item.current_stock <= item.min_stock_level;
                    const isOutOfStock = item.current_stock === 0;

                    return (
                        <div
                            key={item.id}
                            className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${qty > 0
                                ? 'border-primary-500/50 bg-primary-500/10'
                                : 'border-slate-600 bg-slate-700/30'
                                } ${isOutOfStock ? 'opacity-50' : ''}`}
                        >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className={`p-1.5 rounded ${item.behavior === 'returnable'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-slate-600/50 text-slate-400'
                                    }`}>
                                    {item.behavior === 'returnable'
                                        ? <RotateCcw size={14} />
                                        : <Package size={14} />
                                    }
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">
                                        {item.name}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        Stock: {item.current_stock} {item.unit_type}
                                        {isLowStock && !isOutOfStock && (
                                            <span className="text-yellow-400 ml-1">
                                                <AlertTriangle size={10} className="inline" /> Low
                                            </span>
                                        )}
                                        {isOutOfStock && (
                                            <span className="text-red-400 ml-1">Out of stock</span>
                                        )}
                                    </p>
                                </div>
                            </div>

                            {/* Quantity controls */}
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => updateQuantity(item.id, -1)}
                                    disabled={qty === 0}
                                    className="p-1 rounded bg-slate-600 hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Minus size={14} />
                                </button>
                                <input
                                    type="number"
                                    value={qty}
                                    onChange={(e) => setQuantity(item.id, parseInt(e.target.value) || 0)}
                                    disabled={isOutOfStock}
                                    className="w-12 text-center bg-slate-700 border-none rounded text-sm text-white py-1"
                                    min="0"
                                    max={item.current_stock}
                                />
                                <button
                                    type="button"
                                    onClick={() => updateQuantity(item.id, 1)}
                                    disabled={isOutOfStock || qty >= item.current_stock}
                                    className="p-1 rounded bg-slate-600 hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {Object.values(selections).some(q => q > 0) && (
                <p className="text-xs text-slate-400">
                    {Object.values(selections).filter(q => q > 0).length} item(s) will be issued
                </p>
            )}
        </div>
    );
}
