import type { Service, ServiceCategory } from '@/types';
import {
    Utensils,
    Wine,
    Shirt,
    Car,
    Sparkles,
    ConciergeBell,
    MoreHorizontal,
    AlertTriangle,
} from 'lucide-react';

interface RestaurantCardProps {
    service: Service;
    onOrder: () => void;
    cartQuantity?: number;
}

const categoryIcons: Record<ServiceCategory, React.ReactNode> = {
    food: <Utensils size={16} />,
    beverage: <Wine size={16} />,
    laundry: <Shirt size={16} />,
    transport: <Car size={16} />,
    cleaning: <Sparkles size={16} />,
    room_service: <ConciergeBell size={16} />,
    other: <MoreHorizontal size={16} />,
};

const categoryColors: Record<ServiceCategory, string> = {
    food: 'bg-orange-500/20 text-orange-400',
    beverage: 'bg-purple-500/20 text-purple-400',
    laundry: 'bg-cyan-500/20 text-cyan-400',
    transport: 'bg-green-500/20 text-green-400',
    cleaning: 'bg-pink-500/20 text-pink-400',
    room_service: 'bg-primary-500/20 text-primary-400',
    other: 'bg-slate-500/20 text-slate-400',
};

export function RestaurantCard({ service, onOrder, cartQuantity = 0 }: RestaurantCardProps) {
    const isInCart = cartQuantity > 0;
    const isUnavailable = service.is_available === false;

    return (
        <button
            onClick={onOrder}
            disabled={isUnavailable}
            className={`w-full text-left bg-slate-800 border rounded-lg p-3 transition-all relative ${isUnavailable
                    ? 'border-slate-700 opacity-60 cursor-not-allowed'
                    : isInCart
                        ? 'border-status-available ring-1 ring-status-available/50'
                        : 'border-slate-700 hover:border-primary-500 hover:bg-slate-750 active:scale-[0.98]'
                }`}
        >
            {/* Quantity Badge */}
            {isInCart && (
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-status-available rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg">
                    {cartQuantity}
                </div>
            )}

            <div className="flex items-center gap-3">
                {/* Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${categoryColors[service.category]}`}>
                    {categoryIcons[service.category]}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-white font-medium text-sm truncate">{service.name}</h3>
                        {isUnavailable && (
                            <AlertTriangle size={12} className="text-red-400 shrink-0" />
                        )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                        {isUnavailable ? 'Out of stock' : service.description || service.category.replace('_', ' ')}
                    </p>
                </div>

                {/* Price */}
                <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-white">₦{service.price.toLocaleString()}</p>
                    {isInCart && (
                        <p className="text-xs text-status-available font-medium">
                            ₦{(service.price * cartQuantity).toLocaleString()}
                        </p>
                    )}
                </div>
            </div>
        </button>
    );
}
