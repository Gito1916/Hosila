import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReservationDetailsModal } from '@/components/reservations/ReservationDetailsModal';
import type { Reservation, ReservationStatus } from '@/types';
import { format, isPast, isToday } from 'date-fns';
import { requireSupabase, getHotelId } from '@/lib/api';
import {
    Calendar,
    Filter,
    User,
    Phone,
    Mail,
} from 'lucide-react';

export function ReservationList() {
    const [filterStatus, setFilterStatus] = useState<ReservationStatus | 'all'>('all');
    const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

    // Get all reservations with guest and room info
    const { data: reservations } = useQuery({
        queryKey: ['reservations'], queryFn: async () => {
            const allReservations = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('reservations').select('*').eq('hotel_id', hotelId); return data ?? []; })();
            const guests = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('guests').select('*').eq('hotel_id', hotelId); return data ?? []; })();
            const rooms = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('rooms').select('*').eq('hotel_id', hotelId); return data ?? []; })();

            return allReservations
                .map(res => {
                    const guest = guests.find(g => g.id === res.guest_id);
                    return {
                        ...res,
                        guestName: guest?.name ?? 'Unknown',
                        guestPhone: guest?.phone ?? '',
                        guestEmail: guest?.email ?? '',
                        roomNumber: res.room_id ? (rooms.find(r => r.id === res.room_id)?.room_number ?? '?') : 'Unassigned',
                    };
                })
                .sort((a, b) => new Date(a.check_in_date).getTime() - new Date(b.check_in_date).getTime());
        }
    });

    // Filter reservations
    const filteredReservations = reservations?.filter(res =>
        filterStatus === 'all' || res.status === filterStatus
    ) ?? [];

    // Status counts
    const statusCounts = {
        confirmed: reservations?.filter(r => r.status === 'confirmed').length ?? 0,
        pending: reservations?.filter(r => r.status === 'pending').length ?? 0,
        cancelled: reservations?.filter(r => r.status === 'cancelled').length ?? 0,
    };



    const getStatusBadge = (status: ReservationStatus) => {
        switch (status) {
            case 'confirmed':
                return 'bg-green-500/20 text-green-400';
            case 'pending':
                return 'bg-amber-500/20 text-amber-400';
            case 'cancelled':
                return 'bg-red-500/20 text-red-400';
            case 'checked_in':
                return 'bg-blue-500/20 text-blue-400';
            default:
                return 'bg-surface-inset0/20 text-muted';
        }
    };

    const getArrivalStatus = (checkInDate: Date) => {
        if (isToday(checkInDate)) {
            return { label: 'Today', color: 'text-primary-400 font-semibold' };
        }
        if (isPast(checkInDate)) {
            return { label: 'Overdue', color: 'text-red-400' };
        }
        return { label: format(checkInDate, 'MMM d'), color: 'text-muted' };
    };

    return (
        <div className="space-y-4">
            {/* Status Summary */}
            <div className="grid grid-cols-3 gap-3">
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-green-400">{statusCounts.confirmed}</p>
                    <p className="text-xs text-muted">Confirmed</p>
                </div>
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-amber-400">{statusCounts.pending}</p>
                    <p className="text-xs text-muted">Pending</p>
                </div>
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">{statusCounts.cancelled}</p>
                    <p className="text-xs text-muted">Cancelled</p>
                </div>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
                <Filter size={16} className="text-muted" />
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as ReservationStatus | 'all')}
                    className="input w-auto"
                >
                    <option value="all">All Reservations ({reservations?.length ?? 0})</option>
                    <option value="confirmed">Confirmed ({statusCounts.confirmed})</option>
                    <option value="pending">Pending ({statusCounts.pending})</option>
                    <option value="cancelled">Cancelled ({statusCounts.cancelled})</option>
                </select>
            </div>

            {/* Reservation List */}
            <div className="space-y-2">
                {filteredReservations.map(reservation => {
                    const arrivalStatus = getArrivalStatus(new Date(reservation.check_in_date));

                    return (
                        <div
                            key={reservation.id}
                            onClick={() => setSelectedReservation(reservation)}
                            className="card p-4 cursor-pointer hover:border-primary-500/50 hover:bg-surface-raised/30 transition-colors"
                        >
                            <div className="flex items-center justify-between gap-4">
                                {/* Guest & Room Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <User size={14} className="text-muted" />
                                        <span className="font-medium text-heading truncate">
                                            {reservation.guestName}
                                        </span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(reservation.status)}`}>
                                            {reservation.status}
                                        </span>
                                        {reservation.source === 'direct' && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Website</span>
                                        )}
                                    </div>
                                    <div className="text-sm text-muted space-x-2">
                                        <span>Room {reservation.roomNumber}</span>
                                        <span>•</span>
                                        <span>{reservation.nights} night{reservation.nights !== 1 ? 's' : ''}</span>
                                        <span>•</span>
                                        <span>₦{(reservation.deposit_paid || 0).toLocaleString()} paid</span>
                                    </div>
                                    {/* Guest contact info */}
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                                        {(reservation as any).guestPhone && (
                                            <span className="flex items-center gap-1">
                                                <Phone size={10} />
                                                {(reservation as any).guestPhone}
                                            </span>
                                        )}
                                        {(reservation as any).guestEmail && (
                                            <span className="flex items-center gap-1">
                                                <Mail size={10} />
                                                {(reservation as any).guestEmail}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Dates */}
                                <div className="text-right shrink-0">
                                    <p className={arrivalStatus.color}>
                                        Arrives: {arrivalStatus.label}
                                    </p>
                                    <p className="text-xs text-muted">
                                        {format(new Date(reservation.check_in_date), 'MMM d')} - {format(new Date(reservation.check_out_date), 'MMM d')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Empty State */}
            {filteredReservations.length === 0 && (
                <div className="text-center py-12 text-muted">
                    <Calendar size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No reservations found</p>
                </div>
            )}



            {/* Reservation Details Modal */}
            {selectedReservation && (
                <ReservationDetailsModal
                    reservation={selectedReservation}
                    onClose={() => setSelectedReservation(null)}
                />
            )}
        </div>
    );
}
