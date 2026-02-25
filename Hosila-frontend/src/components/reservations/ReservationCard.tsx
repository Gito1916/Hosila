import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/api';
import { format, isPast, isToday, isTomorrow } from 'date-fns';
import type { Reservation, ReservationStatus } from '@/types';
import {
    Calendar,
    Phone,
    MapPin,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    ChevronRight,
    LogIn,
    Edit3,
    Loader2,
} from 'lucide-react';

interface ReservationWithDetails extends Reservation {
    guestName?: string;
    guestPhone?: string;
    roomNumber?: string;
    roomType?: string;
}

interface ReservationCardProps {
    reservation: ReservationWithDetails;
    onClick: () => void;
    onCheckIn?: (reservation: Reservation) => void;
    onEdit?: (reservation: Reservation) => void;
    isProcessing?: boolean;
}

const statusConfig: Record<ReservationStatus, { label: string; color: string; icon: React.ReactNode }> = {
    confirmed: {
        label: 'Confirmed',
        color: 'text-status-available bg-status-available/20',
        icon: <CheckCircle size={14} />,
    },
    pending: {
        label: 'Pending',
        color: 'text-status-dirty bg-status-dirty/20',
        icon: <Clock size={14} />,
    },
    cancelled: {
        label: 'Cancelled',
        color: 'text-status-maintenance bg-status-maintenance/20',
        icon: <XCircle size={14} />,
    },
    checked_in: {
        label: 'Checked In',
        color: 'text-status-shortRest bg-status-shortRest/20',
        icon: <CheckCircle size={14} />,
    },
    no_show: {
        label: 'No Show',
        color: 'text-red-400 bg-red-500/20',
        icon: <AlertCircle size={14} />,
    },
};

function getArrivalLabel(date: Date): { label: string; urgent: boolean } {
    if (isToday(date)) return { label: 'Today', urgent: true };
    if (isTomorrow(date)) return { label: 'Tomorrow', urgent: false };
    if (isPast(date)) return { label: 'Overdue', urgent: true };
    return { label: format(date, 'MMM d'), urgent: false };
}

export function ReservationCard({ reservation, onClick, onCheckIn, onEdit, isProcessing }: ReservationCardProps) {
    const config = statusConfig[reservation.status];
    const checkInDate = new Date(reservation.check_in_date);
    const checkOutDate = new Date(reservation.check_out_date);
    const arrival = getArrivalLabel(checkInDate);

    // Get guest and room info
    const { data: guest } = useQuery({ queryKey: ['guests', reservation.guest_id], queryFn: async () => { const sb = requireSupabase(); const { data } = await sb.from('guests').select('*').eq('id', reservation.guest_id).single(); return data; }, enabled: !!reservation.guest_id });
    const { data: room } = useQuery({ queryKey: ['rooms', reservation.room_id], queryFn: async () => { const sb = requireSupabase(); const { data } = await sb.from('rooms').select('*').eq('id', reservation.room_id).single(); return data; }, enabled: !!reservation.room_id });

    return (
        <button
            onClick={onClick}
            className="w-full text-left bg-surface-card border border-border rounded-xl p-4 hover:border-border-strong transition-all"
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h3 className="text-lg font-semibold text-heading">{guest?.name ?? 'Guest'}</h3>
                    {guest?.phone && (
                        <p className="text-sm text-muted flex items-center gap-1">
                            <Phone size={12} /> {guest.phone}
                        </p>
                    )}
                </div>
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                    {config.icon}
                    {config.label}
                </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-sm">
                {/* Room */}
                <div className="flex items-center gap-2 text-muted">
                    <MapPin size={14} className="text-muted" />
                    <span>Room {room?.room_number ?? '...'}</span>
                    <span className="text-muted">•</span>
                    <span className="text-muted">{room?.room_type ?? '...'}</span>
                </div>

                {/* Dates */}
                <div className="flex items-center gap-2 text-muted">
                    <Calendar size={14} className="text-muted" />
                    <span>{format(checkInDate, 'MMM d')} - {format(checkOutDate, 'MMM d, yyyy')}</span>
                    <span className="text-muted">•</span>
                    <span className="text-muted">{reservation.nights} night{reservation.nights !== 1 ? 's' : ''}</span>
                </div>

                {/* Arrival indicator */}
                {reservation.status === 'confirmed' && (
                    <div className={`flex items-center gap-2 ${arrival.urgent ? 'text-status-dirty' : 'text-muted'}`}>
                        {arrival.urgent && <AlertCircle size={14} />}
                        <span>Arrives: {arrival.label}</span>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <div className="text-sm">
                    <span className="text-muted">Total: </span>
                    <span className="text-heading font-medium">₦{reservation.total_amount.toLocaleString()}</span>
                    {reservation.deposit_paid > 0 && (
                        <span className="text-status-available ml-2">
                            (₦{reservation.deposit_paid.toLocaleString()} paid)
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Quick Actions */}
                    {(reservation.status === 'confirmed' || reservation.status === 'pending') && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit?.(reservation);
                            }}
                            className="p-1.5 text-muted hover:text-heading hover:bg-surface-raised rounded-lg transition-colors"
                            title="Edit Reservation"
                        >
                            <Edit3 size={16} />
                        </button>
                    )}

                    {reservation.status === 'confirmed' && (isToday(checkInDate) || isPast(checkInDate)) && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onCheckIn?.(reservation);
                            }}
                            disabled={isProcessing}
                            className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-heading text-xs font-bold rounded-lg transition-colors shadow-lg shadow-primary-900/20"
                        >
                            {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
                            {isProcessing ? 'Processing' : 'Check In'}
                        </button>
                    )}

                    {/* Chevron only if no buttons or as affordance? */}
                    {!(reservation.status === 'confirmed' && (isToday(checkInDate) || isPast(checkInDate))) && (
                        <ChevronRight size={16} className="text-muted" />
                    )}
                </div>
            </div>
        </button>
    );
}
