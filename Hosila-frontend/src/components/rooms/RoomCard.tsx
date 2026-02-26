import type { Room, Booking, Reservation, RoomStatus } from '@/types';
import { toast } from '@/lib/errorMessages';
import { useCountdown } from '@/hooks/useCountdown';
import { format } from 'date-fns';
import {
    Clock,
    Wrench,
    Sparkles,
    CheckCircle,
    CalendarCheck,
} from 'lucide-react';

interface RoomWithBooking extends Room {
    activeBooking?: Booking;
    guestName?: string;
    pendingReservation?: Reservation;
    reservationGuestName?: string;
}

interface RoomCardProps {
    room: RoomWithBooking;
    onClick: () => void;
}

/** Status configuration */
const statusConfig: Record<RoomStatus, {
    label: string;
    accent: string;
    dot: string;
    badgeCls: string;
}> = {
    available: {
        label: 'Available',
        accent: 'bg-emerald-500',
        dot: 'bg-emerald-500',
        badgeCls: 'bg-emerald-50 text-emerald-600',
    },
    occupied: {
        label: 'Occupied',
        accent: 'bg-red-500',
        dot: 'bg-red-500',
        badgeCls: 'bg-red-50 text-red-600',
    },
    short_rest: {
        label: 'Short Rest',
        accent: 'bg-purple-500',
        dot: 'bg-purple-500',
        badgeCls: 'bg-purple-50 text-purple-600',
    },
    dirty: {
        label: 'Dirty',
        accent: 'bg-amber-500',
        dot: 'bg-amber-500',
        badgeCls: 'bg-amber-50 text-amber-600',
    },
    maintenance: {
        label: 'Maintenance',
        accent: 'bg-slate-500',
        dot: 'bg-slate-400',
        badgeCls: 'bg-surface-raised text-muted',
    },
};

const reservedConfig = {
    label: 'Reserved',
    accent: 'bg-blue-500',
    dot: 'bg-blue-500',
    badgeCls: 'bg-blue-50 text-blue-600',
};

export function RoomCard({ room, onClick }: RoomCardProps) {
    const isReserved = room.status === 'available' && !!room.pendingReservation;
    const config = isReserved ? reservedConfig : statusConfig[room.status];

    const countdown = useCountdown(
        room.status === 'short_rest' && room.activeBooking
            ? new Date(room.activeBooking.planned_checkout)
            : null
    );

    const handleStatusChange = async (e: React.MouseEvent, newStatus: RoomStatus) => {
        e.stopPropagation();
        if (confirm(`Change room status to ${statusConfig[newStatus].label}?`)) {
            try {
                const { updateRoomStatus } = await import('@/db/rooms');
                await updateRoomStatus(room.id, newStatus);
            } catch (err) {
                toast.error('Failed to update room status', err);
            }
        }
    };

    return (
        <div
            className="relative flex flex-col rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group overflow-hidden bg-surface-card"
            style={{ minHeight: 180 }}
            onClick={onClick}
        >
            {/* ── Left accent stripe ── */}
            <div className={`absolute top-0 left-0 bottom-0 w-1 rounded-l-xl ${config.accent}`} />

            {/* ── Header: Room Number + Badge ── */}
            <div className="flex items-start justify-between px-5 pt-4 pb-1 pl-6">
                <h3 className="text-2xl font-extrabold tracking-tight leading-none text-heading">
                    {room.room_number}
                </h3>
                <div
                    className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide shrink-0 ${config.badgeCls}`}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                    {config.label}
                </div>
            </div>

            {/* ── Room Type ── */}
            <div className="px-5 pl-6 pb-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {room.room_type}
                </p>
            </div>

            {/* ── Content (varies by status) ── */}
            <div className="px-5 pl-6 flex-grow flex flex-col justify-center">

                {/* Vacant / Available */}
                {room.status === 'available' && !isReserved && (
                    <div>
                        <p className="text-lg font-bold text-emerald-600">
                            ₦{Number(room.night_rate).toLocaleString()}
                            <span className="text-xs font-normal text-muted">/night</span>
                        </p>
                    </div>
                )}

                {/* Reserved */}
                {isReserved && room.pendingReservation && (
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-50 text-blue-500 shrink-0">
                            <CalendarCheck size={16} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold truncate text-heading">
                                {room.reservationGuestName}
                            </p>
                            <p className="text-xs text-muted">Arriving today</p>
                        </div>
                    </div>
                )}

                {/* Occupied */}
                {room.status === 'occupied' && room.activeBooking && (
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-surface-raised text-body">
                            {room.guestName
                                ? room.guestName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                                : '?'}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold truncate text-heading">
                                {room.guestName || 'Guest'}
                            </p>
                            <p className="text-xs mt-0.5 text-muted">
                                Out: {format(new Date(room.activeBooking.planned_checkout), 'MMM d, h:mm a')}
                            </p>
                        </div>
                    </div>
                )}

                {/* Short Rest */}
                {room.status === 'short_rest' && room.activeBooking && (
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-purple-50 text-purple-500">
                            <Clock size={16} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold truncate text-heading">
                                {room.guestName || 'Guest'}
                            </p>
                            <div className={`text-sm font-mono font-bold mt-0.5 ${countdown.isExpiringSoon ? 'text-red-500' : 'text-purple-500'}`}>
                                {countdown.timeLeft}
                                {countdown.isExpired && <span className="ml-1 text-red-500 text-xs">Overtime</span>}
                            </div>
                        </div>
                    </div>
                )}

                {/* Dirty — minimal content, actions below */}
                {room.status === 'dirty' && (
                    <p className="text-sm font-medium text-amber-600">Needs cleaning</p>
                )}

                {/* Maintenance — minimal */}
                {room.status === 'maintenance' && (
                    <div>
                        <p className="text-sm font-medium text-muted">Under maintenance</p>
                        {room.maintenance_reason && (
                            <p className="text-xs mt-0.5 line-clamp-1 text-muted">
                                {room.maintenance_reason}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* ── Footer Actions ── */}
            {/* Available: maintenance btn */}
            {room.status === 'available' && !isReserved && (
                <div className="px-5 pl-6 pb-3 pt-2 mt-auto flex gap-2">
                    <button
                        onClick={(e) => handleStatusChange(e, 'maintenance')}
                        className="p-1.5 rounded-md transition-colors text-muted hover:text-body hover:bg-surface-raised"
                        title="Maintenance"
                    >
                        <Wrench size={14} />
                    </button>
                </div>
            )}

            {/* Dirty: clean + maintenance */}
            {room.status === 'dirty' && (
                <div className="px-5 pl-6 pb-3 pt-2 mt-auto flex gap-2">
                    <button
                        onClick={(e) => handleStatusChange(e, 'available')}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-colors bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 active:bg-emerald-200"
                        title="Mark Clean"
                    >
                        <Sparkles size={16} />
                        Clean
                    </button>
                    <button
                        onClick={(e) => handleStatusChange(e, 'maintenance')}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-colors bg-surface-inset text-muted border border-border hover:bg-surface-raised active:bg-surface-card"
                        title="Maintenance"
                    >
                        <Wrench size={16} />
                        Fix
                    </button>
                </div>
            )}

            {/* Maintenance: complete button */}
            {room.status === 'maintenance' && (
                <div className="px-5 pl-6 pb-3 pt-2 mt-auto flex gap-2">
                    <button
                        onClick={(e) => handleStatusChange(e, 'available')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
                        title="Complete Maintenance"
                    >
                        <CheckCircle size={13} />
                        Complete
                    </button>
                </div>
            )}
        </div>
    );
}
