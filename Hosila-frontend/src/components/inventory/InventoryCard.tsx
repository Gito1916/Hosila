import type { InventoryItem, InventoryCategory } from '@/types';
import {
    Package,
    Utensils,
    Wine,
    Sparkles,
    Wrench,
    Shirt,
    AlertTriangle,
    RotateCcw,
    CheckSquare,
    FileText,
} from 'lucide-react';

interface InventoryCardProps {
    item: InventoryItem;
    onClick: () => void;
}

const categoryIcons: Record<InventoryCategory, React.ReactNode> = {
    food: <Utensils size={20} />,
    housekeeping: <Sparkles size={20} />,
    maintenance: <Wrench size={20} />,
    front_office: <FileText size={20} />,
    beverages: <Wine size={20} />,
    laundry: <Shirt size={20} />,
    amenities: <Package size={20} />,
};

const categoryColors: Record<InventoryCategory, string> = {
    food: 'bg-orange-500/20 text-orange-400',
    housekeeping: 'bg-pink-500/20 text-pink-400',
    maintenance: 'bg-yellow-500/20 text-yellow-400',
    front_office: 'bg-surface-inset0/20 text-muted',
    beverages: 'bg-purple-500/20 text-purple-400',
    laundry: 'bg-blue-500/20 text-blue-400',
    amenities: 'bg-cyan-500/20 text-cyan-400',
};

export function InventoryCard({ item, onClick }: InventoryCardProps) {
    const isLowStock = item.current_stock <= item.min_stock_level;
    const isReturnable = item.behavior === 'returnable';

    return (
        <button
            onClick={onClick}
            className={`w-full text-left rounded-xl p-4 transition-all hover:scale-[1.01] ${isLowStock
                ? 'bg-red-500/10 border-2 border-red-500/30'
                : 'bg-surface-card border border-border hover:border-border-strong'
                }`}
        >
            <div className="flex items-start justify-between">
                {/* Icon and info */}
                <div className="flex gap-3 min-w-0 flex-1">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${categoryColors[item.category]}`}>
                        {categoryIcons[item.category]}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-heading font-medium">{item.name}</h3>
                            {isLowStock && (
                                <AlertTriangle size={16} className="text-red-400" />
                            )}
                        </div>
                        <p className="text-sm text-muted capitalize">{item.category.replace('_', ' ')}</p>
                        {/* Behavior & Amenity badges */}
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${isReturnable
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-surface-card/50 text-muted'
                                }`}>
                                {isReturnable ? <RotateCcw size={10} /> : <Package size={10} />}
                                {isReturnable ? 'Returnable' : 'Consumable'}
                            </span>
                            {item.is_amenity && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                                    <CheckSquare size={10} />
                                    Amenity
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Stock info */}
                <div className="text-right flex-shrink-0 ml-2">
                    <p className={`text-2xl font-bold ${isLowStock ? 'text-red-400' : 'text-heading'}`}>
                        {item.current_stock}
                    </p>
                    <p className="text-xs text-muted">{item.unit_type}</p>
                    {isLowStock && (
                        <p className="text-xs text-red-400 mt-1">
                            Below min ({item.min_stock_level})
                        </p>
                    )}
                </div>
            </div>

            {/* Value */}
            <div className="mt-3 pt-3 border-t border-border/50 flex justify-between text-sm">
                <span className="text-muted">Unit Cost</span>
                <span className="text-heading">₦{item.unit_cost.toLocaleString()}</span>
            </div>
        </button>
    );
}
