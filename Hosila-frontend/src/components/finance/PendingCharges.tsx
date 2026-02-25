import { useQuery } from '@tanstack/react-query';
import { Clock, ChevronDown, ChevronUp, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { getAllBookings } from '@/db/bookings';
import { getAllRooms } from '@/db/rooms';
import { getAllGuests } from '@/db/guests';
import { requireSupabase, getHotelId } from '@/lib/api';

export function PendingCharges() {
    const [isExpanded, setIsExpanded] = useState(false);

    // Get pending transactions (room tab orders not yet paid)
    const { data: pendingTransactions } = useQuery({
        queryKey: ['pendingTransactions'], queryFn: async () => {
            const sb = requireSupabase(); const hotelId = await getHotelId(); const { data: allTxns } = await sb.from('transactions').select('*').eq('hotel_id', hotelId);
            return (allTxns ?? []).filter(t =>
                t.status === 'pending' &&
                t.reference_type === 'room_tab_order'
            );
        }
    });

    // Get booking details for each pending transaction
    const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: getAllBookings });
    const { data: rooms } = useQuery({ queryKey: ['rooms'], queryFn: getAllRooms });
    const { data: guests } = useQuery({ queryKey: ['guests'], queryFn: getAllGuests });

    if (!pendingTransactions || pendingTransactions.length === 0) {
        return null; // Don't show if no pending charges
    }

    // Group by booking
    const groupedByBooking = pendingTransactions.reduce((acc, txn) => {
        const bookingId = txn.reversed_transaction_id ?? 'unknown';
        if (!acc[bookingId]) {
            acc[bookingId] = [];
        }
        acc[bookingId].push(txn);
        return acc;
    }, {} as Record<string, any[]>);

    const totalPending = pendingTransactions.reduce((sum, t) => sum + t.amount, 0);

    return (
        <div className="card border-amber-500/30 bg-amber-500/5">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-4 flex items-center justify-between"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/20 rounded-lg">
                        <Clock size={20} className="text-amber-400" />
                    </div>
                    <div className="text-left">
                        <h3 className="font-semibold text-amber-400">Pending Room Tab Charges</h3>
                        <p className="text-sm text-muted">
                            {pendingTransactions.length} order{pendingTransactions.length > 1 ? 's' : ''} awaiting payment
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-amber-400">
                        ₦{totalPending.toLocaleString()}
                    </span>
                    {isExpanded ? (
                        <ChevronUp size={20} className="text-muted" />
                    ) : (
                        <ChevronDown size={20} className="text-muted" />
                    )}
                </div>
            </button>

            {isExpanded && (
                <div className="px-4 pb-4 space-y-3">
                    {(Object.entries(groupedByBooking) as [string, any[]][]).map(([bookingId, txns]) => {
                        const booking = bookings?.find(b => b.id === bookingId);
                        const room = rooms?.find(r => r.id === booking?.room_id);
                        const guest = guests?.find(g => g.id === booking?.guest_id);
                        const bookingTotal = txns.reduce((sum, t) => sum + t.amount, 0);

                        return (
                            <div key={bookingId} className="bg-surface-raised/50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-heading">
                                            Room {room?.room_number ?? '?'}
                                        </span>
                                        <span className="text-muted">-</span>
                                        <span className="text-muted">{guest?.name ?? 'Unknown'}</span>
                                    </div>
                                    <span className="font-semibold text-amber-400">
                                        ₦{bookingTotal.toLocaleString()}
                                    </span>
                                </div>
                                <div className="space-y-1">
                                    {txns.map(txn => (
                                        <div key={txn.id} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2 text-muted">
                                                <UtensilsCrossed size={14} />
                                                <span className="truncate max-w-[200px]" title={txn.description}>
                                                    {txn.description.replace('Room Tab: ', '').replace(/Room \d+ Tab: /, '')}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-muted">
                                                <span>{format(new Date(txn.date), 'MMM d, HH:mm')}</span>
                                                <span className="text-muted">₦{txn.amount.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    <p className="text-xs text-muted text-center pt-2">
                        These charges will be added to restaurant revenue when payment is received
                    </p>
                </div>
            )}
        </div>
    );
}
