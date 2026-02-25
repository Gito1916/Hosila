import { useQuery } from '@tanstack/react-query';
import { getTodayArrivals, getTodayDepartures } from '@/db/dashboard';
import { differenceInDays } from 'date-fns';

interface TodayActivityProps {
    onCheckIn?: (reservationId: string) => void;
    onCheckOut?: (bookingId: string) => void;
}

export function TodayActivity({ onCheckIn, onCheckOut }: TodayActivityProps) {
    const { data: arrivals } = useQuery({ queryKey: ['dashboard', 'arrivals'], queryFn: getTodayArrivals });
    const { data: departures } = useQuery({ queryKey: ['dashboard', 'departures'], queryFn: getTodayDepartures });

    // Combine and format for the table
    const activities = [
        ...(arrivals || []).map(a => {
            const nights = differenceInDays(new Date(a.reservation.checkout_date), new Date(a.reservation.check_in_date));
            return {
                id: a.reservation.id,
                type: 'arrival',
                guestName: a.guestName,
                ref: a.reservation.id.slice(0, 6).toUpperCase(),
                room: a.roomNumber || 'Unassigned',
                duration: `${nights} Night${nights !== 1 ? 's' : ''}`,
                status: 'ARRIVAL',
                statusColor: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
                amount: `₦${a.reservation.total_price.toLocaleString()}`,
                action: () => onCheckIn?.(a.reservation.id)
            };
        }),
        ...(departures || []).map(d => {
            const nights = differenceInDays(new Date(d.booking.planned_checkout), new Date(d.booking.check_in_time));
            return {
                id: d.booking.id,
                type: 'departure',
                guestName: d.guestName,
                ref: d.booking.id.slice(0, 6).toUpperCase(),
                room: d.roomNumber,
                duration: `${nights} Night${nights !== 1 ? 's' : ''}`,
                status: d.isOverdue ? 'OVERDUE' : 'CHECKING OUT',
                statusColor: d.isOverdue
                    ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                    : 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20',
                amount: `₦${d.booking.total_price.toLocaleString()}`,
                action: () => onCheckOut?.(d.booking.id)
            };
        })
    ].sort((a, b) => a.guestName.localeCompare(b.guestName)); // Simple sort by name for consistent layout

    const getAvatarColor = (index: number) => {
        const colors = [
            'bg-primary-400 text-heading',
            'bg-purple-500 text-heading',
            'bg-blue-500 text-heading',
            'bg-amber-500 text-heading',
            'bg-rose-500 text-heading',
        ];
        return colors[index % colors.length];
    };

    if (activities.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted">
                <p>No activity expected today.</p>
            </div>
        );
    }

    return (
        <div className="w-full">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-border
                        <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted
                        <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted hidden sm:table-cell">Room</th>
                        <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted hidden md:table-cell">Duration</th>
                        <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted
                        <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted text-right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {activities.map((act, idx) => (
                        <tr key={act.id + act.type} className="border-b last:border-0 border-border-subtle hover:bg-surface-inset transition-colors group cursor-pointer" onClick={act.action}>
                            <td className="py-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-medium text-sm shrink-0 shadow-sm ${getAvatarColor(idx)}`}>
                                        {act.guestName.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-heading
                                        <p className="text-xs text-muted
                                    </div>
                                </div>
                            </td>
                            <td className="py-3 text-sm text-muted hidden sm:table-cell font-medium">
                                {act.room}
                            </td>
                            <td className="py-3 text-sm text-muted hidden md:table-cell">
                                {act.duration}
                            </td>
                            <td className="py-3">
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${act.statusColor}`}>
                                    {act.status}
                                </span>
                            </td>
                            <td className="py-3 text-sm font-medium text-heading text-right">
                                {act.amount}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
