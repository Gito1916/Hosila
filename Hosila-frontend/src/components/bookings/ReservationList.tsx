import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { updateReservation, markReservationCheckedIn } from '@/db/reservations';
import { checkIn } from '@/db/bookings';
import { ModifyReservationModal } from '@/components/reservations/ModifyReservationModal';
import { ReservationDetailsModal } from '@/components/reservations/ReservationDetailsModal';
import type { Reservation, ReservationStatus } from '@/types';
import { format, isPast, isToday } from 'date-fns';
import { requireSupabase, getHotelId } from '@/lib/api';
import { toast } from '@/lib/errorMessages';
import {
    LogIn,
    Calendar,
    X,
    Filter,
    Loader2,
    User,
    Edit3,
    Phone,
    Mail,
    CheckCircle,
} from 'lucide-react';

interface ReservationListProps {
    onCheckIn?: (reservation: Reservation) => void; // Made optional - we handle internally now
}

export function ReservationList({ onCheckIn: _onCheckIn }: ReservationListProps) {
    const user = useAuthStore((state) => state.user);
    const [filterStatus, setFilterStatus] = useState<ReservationStatus | 'all'>('all');
    const [isLoading, setIsLoading] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [editReservation, setEditReservation] = useState<Reservation | null>(null);
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

    const handleCancel = async (reservation: Reservation) => {
        if (!user || !confirm('Are you sure you want to cancel this reservation?')) return;
        setIsLoading(true);
        try {
            await updateReservation(reservation.id, { status: 'cancelled' }, user.id);
        } catch (err) {
            console.error('Error cancelling reservation:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirm = async (reservation: Reservation) => {
        if (!user) return;
        setProcessingId(reservation.id);
        try {
            const sb = requireSupabase();
            await sb.from('reservations').update({
                status: 'confirmed',
                updated_at: new Date().toISOString(),
            }).eq('id', reservation.id);
            toast.success('Reservation confirmed', `Reservation has been confirmed.`);
        } catch (err) {
            toast.error('Failed to confirm', err);
        } finally {
            setProcessingId(null);
        }
    };

    // Auto check-in handler - creates booking immediately
    const handleAutoCheckIn = async (reservation: Reservation) => {
        if (!user) return;

        if (!confirm(`Check in ${(reservation as any).guestName ?? 'guest'} to Room ${(reservation as any).roomNumber ?? '?'}? This will create a booking immediately.`)) {
            return;
        }

        setProcessingId(reservation.id);
        try {
            // Get the guest and room
            const guest = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('guests').select('*').eq('id', reservation.guest_id).single(); return data; })();

            if (!reservation.room_id) {
                toast.warn('Cannot check in', 'This reservation has no room assigned. Please assign a room first using the edit button.');
                return;
            }

            const room = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('rooms').select('*').eq('id', reservation.room_id).single(); return data; })();

            if (!room) {
                toast.error('Check-in failed', 'Room not found.');
                return;
            }
            if (room.status !== 'available') {
                toast.warn('Cannot check in', `Room ${room.room_number} is currently ${room.status}. It must be available.`);
                return;
            }

            // Create booking with reservation data
            await checkIn({
                roomId: reservation.room_id,
                guestName: guest?.name ?? 'Guest',
                guestPhone: guest?.phone,
                guestEmail: guest?.email,
                existingGuestId: guest?.id,
                bookingType: 'night',
                numGuests: 1,
                numNights: reservation.nights,
                rate: reservation.total_amount,
                paymentMethod: 'cash',
                amountPaid: reservation.deposit_paid,
                createdBy: user.id,
            });

            // Mark reservation as checked in
            await markReservationCheckedIn(reservation.id);
        } catch (err) {
            toast.error('Check-in failed', err);
        } finally {
            setProcessingId(null);
        }
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
                    const canCheckIn = reservation.status === 'confirmed' &&
                        !reservation.needs_attention &&
                        !!reservation.room_id &&
                        (isToday(new Date(reservation.check_in_date)) ||
                            isPast(new Date(reservation.check_in_date)));

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

                            {/* Action Buttons */}
                            <div className="flex gap-2 mt-3 pt-3 border-t border-border-strong">
                                {reservation.status === 'pending' && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleConfirm(reservation); }}
                                        disabled={processingId === reservation.id}
                                        className="btn bg-emerald-600 hover:bg-emerald-700 text-white py-1 px-3 text-sm flex items-center gap-1"
                                    >
                                        {processingId === reservation.id ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <CheckCircle size={14} />
                                        )}
                                        {processingId === reservation.id ? 'Confirming...' : 'Confirm'}
                                    </button>
                                )}
                                {(reservation.status === 'confirmed' || reservation.status === 'pending') && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEditReservation(reservation); }}
                                        className="btn btn-ghost py-1 px-2 text-muted hover:text-heading hover:bg-surface-raised"
                                        title="Edit Reservation"
                                    >
                                        <Edit3 size={14} />
                                    </button>
                                )}
                                {canCheckIn && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleAutoCheckIn(reservation); }}
                                        disabled={processingId === reservation.id}
                                        className="btn btn-primary py-1 px-3 text-sm flex items-center gap-1"
                                    >
                                        {processingId === reservation.id ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <LogIn size={14} />
                                        )}
                                        {processingId === reservation.id ? 'Processing' : 'Check In'}
                                    </button>
                                )}
                                {(reservation.status === 'confirmed' || reservation.status === 'pending') && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleCancel(reservation); }}
                                        disabled={isLoading}
                                        className="btn btn-ghost py-1 px-2 text-red-400 hover:bg-red-500/20"
                                    >
                                        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                                    </button>
                                )}
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

            {/* Edit Reservation Modal */}
            {editReservation && (
                <ModifyReservationModal
                    reservation={editReservation}
                    onClose={() => setEditReservation(null)}
                    onSuccess={() => setEditReservation(null)}
                />
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
