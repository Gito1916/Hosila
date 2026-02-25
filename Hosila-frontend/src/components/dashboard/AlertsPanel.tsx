import { useQuery } from '@tanstack/react-query';
import {
    getOverdueCheckouts,
    getLowStockAlerts,
    getUnpaidDueToday
} from '@/db/dashboard';
import {

    Clock,
    Package,
    CreditCard,
    ChevronRight,
} from 'lucide-react';

interface AlertsPanelProps {
    onViewOverdue?: () => void;
    onViewLowStock?: () => void;
    onViewUnpaid?: () => void;
}

export function AlertsPanel({ onViewOverdue, onViewLowStock, onViewUnpaid }: AlertsPanelProps) {
    const { data: overdueCheckouts } = useQuery({ queryKey: ['alerts', 'overdue'], queryFn: getOverdueCheckouts });
    const { data: lowStockItems } = useQuery({ queryKey: ['alerts', 'lowStock'], queryFn: getLowStockAlerts });
    const { data: unpaidDueToday } = useQuery({ queryKey: ['alerts', 'unpaidDueToday'], queryFn: getUnpaidDueToday });

    const hasAlerts =
        (overdueCheckouts?.length ?? 0) > 0 ||
        (lowStockItems?.length ?? 0) > 0 ||
        (unpaidDueToday?.length ?? 0) > 0;

    if (!hasAlerts) {
        return (
            <div className="card p-4">
                <p className="text-muted text-sm flex items-center gap-2">
                    <span className="text-green-400">✓</span>
                    No alerts at this time
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Overdue Checkouts */}
            {overdueCheckouts && overdueCheckouts.length > 0 && (
                <div
                    className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-lg cursor-pointer hover:bg-red-500/20 transition-colors"
                    onClick={onViewOverdue}
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-500/20 rounded-lg">
                            <Clock size={18} className="text-red-400" />
                        </div>
                        <div>
                            <p className="text-red-400 font-medium">
                                {overdueCheckouts.length} Overdue Checkout{overdueCheckouts.length > 1 ? 's' : ''}
                            </p>
                            <p className="text-xs text-red-400/70">
                                {overdueCheckouts.slice(0, 2).map(o => `Room ${o.roomNumber}`).join(', ')}
                                {overdueCheckouts.length > 2 && ` +${overdueCheckouts.length - 2} more`}
                            </p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-red-400" />
                </div>
            )}

            {/* Unpaid Due Today */}
            {unpaidDueToday && unpaidDueToday.length > 0 && (
                <div
                    className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg cursor-pointer hover:bg-amber-500/20 transition-colors"
                    onClick={onViewUnpaid}
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 rounded-lg">
                            <CreditCard size={18} className="text-amber-400" />
                        </div>
                        <div>
                            <p className="text-amber-400 font-medium">
                                {unpaidDueToday.length} Unpaid Guest{unpaidDueToday.length > 1 ? 's' : ''} Due Today
                            </p>
                            <p className="text-xs text-amber-400/70">
                                Balance: ₦{unpaidDueToday.reduce((sum, u) => sum + u.booking.balance, 0).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-amber-400" />
                </div>
            )}

            {/* Low Stock */}
            {lowStockItems && lowStockItems.length > 0 && (
                <div
                    className="flex items-center justify-between p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg cursor-pointer hover:bg-orange-500/20 transition-colors"
                    onClick={onViewLowStock}
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/20 rounded-lg">
                            <Package size={18} className="text-orange-400" />
                        </div>
                        <div>
                            <p className="text-orange-400 font-medium">
                                {lowStockItems.length} Low Stock Item{lowStockItems.length > 1 ? 's' : ''}
                            </p>
                            <p className="text-xs text-orange-400/70">
                                {lowStockItems.slice(0, 2).map(i => i.name).join(', ')}
                                {lowStockItems.length > 2 && ` +${lowStockItems.length - 2} more`}
                            </p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-orange-400" />
                </div>
            )}
        </div>
    );
}
