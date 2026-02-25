import { useNavigate } from 'react-router-dom';
import {
    BedDouble,
    CalendarPlus,
    UtensilsCrossed,
} from 'lucide-react';

interface QuickActionsProps {
    onNewCheckIn?: () => void;
    onNewReservation?: () => void;
    onOrderMeals?: () => void;
}

export function QuickActions({
    onNewCheckIn,
    onNewReservation,
    onOrderMeals,
}: QuickActionsProps) {
    const navigate = useNavigate();

    const actions = [
        {
            icon: <BedDouble size={20} />,
            label: 'New Check-in',
            description: 'Walk-in guest',
            color: 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
            onClick: onNewCheckIn ?? (() => navigate('/bookings')),
        },
        {
            icon: <CalendarPlus size={20} />,
            label: 'New Reservation',
            description: 'Future booking',
            color: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
            onClick: onNewReservation ?? (() => navigate('/bookings')),
        },
        {
            icon: <UtensilsCrossed size={20} />,
            label: 'Order Meals',
            description: 'Restaurant & drinks',
            color: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30',
            onClick: onOrderMeals ?? (() => navigate('/restaurant')),
        },
    ];

    return (
        <div className="grid grid-cols-3 gap-3">
            {actions.map((action) => (
                <button
                    key={action.label}
                    onClick={action.onClick}
                    className={`p-4 rounded-xl border border-border transition-all ${action.color} flex flex-col items-center gap-2 text-center`}
                >
                    <div className="p-2 rounded-lg bg-surface-card/50">
                        {action.icon}
                    </div>
                    <div>
                        <p className="font-medium text-heading text-sm">{action.label}</p>
                        <p className="text-xs text-muted">{action.description}</p>
                    </div>
                </button>
            ))}
        </div>
    );
}

