import { useQuery } from '@tanstack/react-query';
import type { Reservation, ReservationStatus } from '@/types';
import { format, isToday, isPast } from 'date-fns';
import { requireSupabase, getHotelId} from '@/lib/api';
import {
    Calendar,
    Clock,
    User,
    CheckCircle,
    XCircle,
    AlertTriangle,
    ChevronRight,
    LogIn,
    Edit3,
    Loader2,
} from 'lucide-react';

interface ReservationPipelineProps {
    onReservationClick: (reservation: Reservation) => void;
    onCheckIn?: (reservation: Reservation) => void;
    onEdit?: (reservation: Reservation) => void;
    processingId?: string | null;
}

type PipelineColumn = {
    status: ReservationStatus;
    label: string;
    color: string;
    bgColor: string;
    icon: React.ReactNode;
};

const pipelineColumns: PipelineColumn[] = [
    {
        status: 'pending',
        label: 'Pending',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10 border-amber-500/30',
        icon: <Clock size={16} />,
    },
    {
        status: 'confirmed',
        label: 'Confirmed',
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10 border-blue-500/30',
        icon: <CheckCircle size={16} />,
    },
    {
        status: 'checked_in',
        label: 'Checked In',
        color: 'text-green-400',
        bgColor: 'bg-green-500/10 border-green-500/30',
        icon: <User size={16} />,
    },
    {
        status: 'no_show',
        label: 'No Show',
        color: 'text-red-400',
        bgColor: 'bg-red-500/10 border-red-500/30',
        icon: <AlertTriangle size={16} />,
    },
    {
        status: 'cancelled',
        label: 'Cancelled',
        color: 'text-slate-400',
        bgColor: 'bg-slate-500/10 border-slate-500/30',
        icon: <XCircle size={16} />,
    },
];

export function ReservationPipeline({ onReservationClick, onCheckIn, onEdit, processingId }: ReservationPipelineProps) {
    // Get all reservations with guest info
    const { data: reservationsWithGuests } = useQuery({ queryKey: ['reservationsWithGuests'], queryFn: async () => {
        const reservations = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('reservations').select('*').eq('hotel_id', hotelId); return data ?? []; })();

        const withGuests = await Promise.all(
            reservations.map(async (res) => {
                const guest = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('guests').select('*').eq('id', res.guest_id).single(); return data; })();
                const room = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('rooms').select('*').eq('id', res.room_id).single(); return data; })();
                return {
                    ...res,
                    guestName: guest?.name ?? 'Unknown',
                    roomNumber: room?.room_number ?? 'TBD',
                };
            })
        );

        return withGuests;
    } });

    // Group by status
    const groupedReservations = pipelineColumns.map(column => ({
        ...column,
        reservations: (reservationsWithGuests ?? [])
            .filter(r => r.status === column.status)
            .sort((a, b) => new Date(a.check_in_date).getTime() - new Date(b.check_in_date).getTime()),
    }));

    return (
        <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-4">
                {groupedReservations.map(column => (
                    <div
                        key={column.status}
                        className="w-72 flex-shrink-0"
                    >
                        {/* Column Header */}
                        <div className={`p-3 rounded-t-lg border ${column.bgColor} flex items-center justify-between`}>
                            <div className="flex items-center gap-2">
                                <span className={column.color}>{column.icon}</span>
                                <h3 className={`font-medium ${column.color}`}>{column.label}</h3>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-sm font-bold ${column.color} ${column.bgColor}`}>
                                {column.reservations.length}
                            </span>
                        </div>

                        {/* Column Body */}
                        <div className="bg-slate-800/50 border-x border-b border-slate-700 rounded-b-lg p-2 min-h-[300px] max-h-[500px] overflow-y-auto space-y-2">
                            {column.reservations.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 text-sm">
                                    No reservations
                                </div>
                            ) : (
                                column.reservations.map(reservation => (
                                    <PipelineCard
                                        key={reservation.id}
                                        reservation={reservation}
                                        onClick={() => onReservationClick(reservation)}
                                        onCheckIn={onCheckIn}
                                        onEdit={onEdit}
                                        isProcessing={processingId === reservation.id}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Individual reservation card in pipeline
interface PipelineCardProps {
    reservation: Reservation & { guestName: string; roomNumber: string };
    onClick: () => void;
    onCheckIn?: (reservation: Reservation) => void;
    onEdit?: (reservation: Reservation) => void;
    isProcessing?: boolean;
}

function PipelineCard({ reservation, onClick, onCheckIn, onEdit, isProcessing }: PipelineCardProps) {
    const checkInDate = new Date(reservation.check_in_date);
    const isArrivalToday = isToday(checkInDate);
    const isPastDue = isPast(checkInDate) && reservation.status === 'confirmed';
    const balance = reservation.total_amount - reservation.deposit_paid;
    const paymentStatus = reservation.deposit_paid === 0
        ? 'unpaid'
        : balance <= 0
            ? 'paid'
            : 'partial';

    return (
        <button
            onClick={onClick}
            className={`w-full p-3 rounded-lg border text-left transition-all hover:bg-slate-700/50 ${isPastDue
                ? 'border-red-500/50 bg-red-500/5'
                : isArrivalToday
                    ? 'border-green-500/50 bg-green-500/5'
                    : 'border-slate-600 bg-slate-700/30'
                }`}
        >
            {/* Guest & Room */}
            <div className="flex items-start justify-between mb-2">
                <div>
                    <p className="font-medium text-white text-sm truncate" style={{ maxWidth: '180px' }}>
                        {reservation.guestName}
                    </p>
                    <p className="text-xs text-slate-400">Room {reservation.roomNumber}</p>
                </div>
                <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
            </div>

            {/* Date */}
            <div className="flex items-center gap-1 text-xs mb-2">
                <Calendar size={12} className={isArrivalToday ? 'text-green-400' : 'text-slate-400'} />
                <span className={isArrivalToday ? 'text-green-400 font-medium' : 'text-slate-400'}>
                    {isArrivalToday ? 'TODAY' : format(checkInDate, 'MMM d')}
                </span>
                <span className="text-slate-500">→</span>
                <span className="text-slate-400">
                    {format(new Date(reservation.check_out_date), 'MMM d')}
                </span>
            </div>

            {/* Payment Status */}
            <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full ${paymentStatus === 'paid'
                    ? 'bg-green-500/20 text-green-400'
                    : paymentStatus === 'partial'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                    {paymentStatus === 'paid' && '✓ Paid'}
                    {paymentStatus === 'partial' && `₦${reservation.deposit_paid.toLocaleString()} paid`}
                    {paymentStatus === 'unpaid' && 'No deposit'}
                </span>
                {balance > 0 && (
                    <span className="text-xs text-slate-400">
                        Due: ₦{balance.toLocaleString()}
                    </span>
                )}
            </div>

            {/* Alerts */}
            {isPastDue && (
                <div className="mt-2 text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle size={10} />
                    Past check-in date
                </div>
            )}

            {/* Quick Actions */}
            {(reservation.status === 'confirmed' || reservation.status === 'pending') && (
                <div className="mt-2 pt-2 border-t border-slate-600 flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit?.(reservation);
                        }}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-600 rounded transition-colors"
                        title="Edit Reservation"
                    >
                        <Edit3 size={14} />
                    </button>

                    {reservation.status === 'confirmed' && (isArrivalToday || isPastDue) && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onCheckIn?.(reservation);
                            }}
                            disabled={isProcessing}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-bold rounded transition-colors"
                        >
                            {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
                            {isProcessing ? 'Processing' : 'Check In'}
                        </button>
                    )}
                </div>
            )}
        </button>
    );
}
