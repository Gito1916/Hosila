import type { Room, Booking, Reservation, RoomStatus } from '@/types';
import { toast } from '@/lib/errorMessages';
import { useCountdown } from '@/hooks/useCountdown';
import { format } from 'date-fns';
import {
    User,
    Clock,
    Wrench,
    Sparkles,
    CheckCircle,
    CalendarCheck,
    AlertCircle,
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

/** Use inline styles for dynamic colors so Tailwind doesn't purge them */
const statusConfig: Record<RoomStatus, {
    label: string;
    borderColor: string;
    dotColor: string;
    badgeBg: string;
    badgeText: string;
}> = {
    available: {
        label: 'Vacant',
        borderColor: '#34d399',   // emerald-400
        dotColor: '#34d399',
        badgeBg: '#ecfdf5',       // emerald-50
        badgeText: '#059669',     // emerald-600
    },
    occupied: {
        label: 'Occupied',
        borderColor: '#f87171',   // red-400
        dotColor: '#f87171',
        badgeBg: '#fef2f2',       // red-50
        badgeText: '#dc2626',     // red-600
    },
    short_rest: {
        label: 'Short Rest',
        borderColor: '#c084fc',   // purple-400
        dotColor: '#c084fc',
        badgeBg: '#faf5ff',       // purple-50
        badgeText: '#9333ea',     // purple-600
    },
    dirty: {
        label: 'Dirty',
        borderColor: '#fbbf24',   // amber-400
        dotColor: '#fbbf24',
        badgeBg: '#fffbeb',       // amber-50
        badgeText: '#d97706',     // amber-600
    },
    maintenance: {
        label: 'Maintenance',
        borderColor: '#94a3b8',   // slate-400
        dotColor: '#94a3b8',
        badgeBg: '#f1f5f9',       // slate-100
        badgeText: '#475569',     // slate-600
    },
};

const reservedConfig = {
    label: 'Reserved',
    borderColor: '#60a5fa',   // blue-400
    dotColor: '#60a5fa',
    badgeBg: '#eff6ff',       // blue-50
    badgeText: '#2563eb',     // blue-600
};

function getInitials(name: string): string {
    return name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

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

    // Show actions ONLY if not occupied or short_rest (per user feedback)
    const showActions = !['occupied', 'short_rest'].includes(room.status);

    return (
        <div
            className="relative flex flex-col h-full rounded-xl border-2 transition-all duration-200 cursor-pointer group bg-slate-800/80 hover:bg-slate-800 hover:shadow-xl hover:-translate-y-1"
            style={{
                borderColor: `${config.borderColor}40`, // 25% opacity
            }}
            onClick={onClick}
        >
            {/* ── Status Indicator Line ── */}
            <div
                className="absolute top-0 left-0 bottom-0 w-1.5 rounded-l-xl"
                style={{ backgroundColor: config.borderColor }}
            />

            {/* ── Header: Room Number + Status Badge ── */}
            <div className="flex items-start justify-between p-5 pb-2 pl-7">
                <h3 className="text-3xl font-bold text-white tracking-tight">
                    {room.room_number}
                </h3>
                <div
                    className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm"
                    style={{
                        backgroundColor: config.badgeBg,
                        color: config.badgeText,
                    }}
                >
                    <span
                        className="w-2 h-2 rounded-full inline-block shadow-sm"
                        style={{ backgroundColor: config.dotColor }}
                    />
                    {config.label}
                </div>
            </div>

            {/* ── Room Type ── */}
            <div className="px-5 pb-4 pl-7">
                <p className="text-sm font-medium text-slate-400">{room.room_type}</p>
            </div>

            {/* ── Content Body ── */}
            <div className="px-5 pb-5 pl-7 flex-grow flex flex-col justify-center min-h-[80px]">

                {/* Vacant */}
                {room.status === 'available' && !isReserved && (
                    <div className="flex flex-col gap-2">
                        {room.housekeeping_status === 'inspected' ? (
                            <div className="text-emerald-400 text-sm font-medium flex items-center gap-2">
                                <CheckCircle size={16} />
                                <span>Ready for check-in</span>
                            </div>
                        ) : room.housekeeping_status === 'clean' ? (
                            <div className="text-blue-400 text-sm font-medium flex items-center gap-2">
                                <Sparkles size={16} />
                                <span>Cleaned (Needs Inspect)</span>
                            </div>
                        ) : room.housekeeping_status === 'in_progress' ? (
                            <div className="text-amber-400 text-sm font-medium flex items-center gap-2">
                                <Clock size={16} />
                                <span>Cleaning in progress</span>
                            </div>
                        ) : (
                            <span className="text-slate-500 italic">Ready for check-in</span>
                        )}
                        <p className="text-xs text-slate-500">
                            Last status: {room.housekeeping_status || 'Unknown'}
                        </p>
                    </div>
                )}

                {/* Reserved */}
                {isReserved && room.pendingReservation && (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500 shrink-0">
                            <CalendarCheck size={20} />
                        </div>
                        <div>
                            <p className="text-white font-medium">
                                {room.reservationGuestName}
                            </p>
                            <p className="text-xs text-slate-400">Arriving today</p>
                        </div>
                    </div>
                )}

                {/* Occupied */}
                {room.status === 'occupied' && room.activeBooking && (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-700 text-white flex items-center justify-center text-sm font-bold shrink-0">
                            {room.guestName ? getInitials(room.guestName) : <User size={18} />}
                        </div>
                        <div className="min-w-0">
                            <p className="text-white font-medium truncate text-lg">
                                {room.guestName || 'Guest'}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Out: {format(new Date(room.activeBooking.planned_checkout), 'MMM d, h:mm a')}
                            </p>
                        </div>
                    </div>
                )}

                {/* Short Rest */}
                {room.status === 'short_rest' && room.activeBooking && (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                            <Clock size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-white font-medium truncate">
                                {room.guestName || 'Guest'}
                            </p>
                            <div className={`text-sm font-mono font-bold mt-0.5 ${countdown.isExpiringSoon ? 'text-red-400' : 'text-purple-400'}`}>
                                {countdown.timeLeft}
                                {countdown.isExpired && <span className="ml-1 text-red-500 block text-xs">Overtime</span>}
                            </div>
                        </div>
                    </div>
                )}

                {/* Dirty */}
                {room.status === 'dirty' && (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-amber-400 font-medium">
                            <AlertCircle size={18} />
                            <span>Needs Cleaning</span>
                        </div>
                        <p className="text-xs text-slate-500 pl-6">
                            Priority: High
                        </p>
                    </div>
                )}

                {/* Maintenance */}
                {room.status === 'maintenance' && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-slate-400 font-medium">
                            <Wrench size={18} />
                            <span>Under Maintenance</span>
                        </div>
                        {room.maintenance_reason && (
                            <p className="text-xs text-slate-500 pl-6 line-clamp-2">
                                "{room.maintenance_reason}"
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* ── Footer Actions ── */}
            {showActions && (
                <div className="p-4 pl-7 border-t border-slate-700/50 flex gap-3 mt-auto bg-slate-900/30">

                    {/* Maintenance Button - Always visible if enabled */}
                    {room.status === 'maintenance' ? (
                        <button
                            onClick={(e) => handleStatusChange(e, 'available')}
                            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20"
                        >
                            <CheckCircle size={14} />
                            Complete Maintenance
                        </button>
                    ) : (
                        <>
                            {/* Dirty / Clean Toggle */}
                            {room.status === 'dirty' ? (
                                <button
                                    onClick={(e) => handleStatusChange(e, 'available')}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                                >
                                    <Sparkles size={14} />
                                    Mark Clean
                                </button>
                            ) : (
                                <button
                                    onClick={(e) => handleStatusChange(e, 'dirty')}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 bg-slate-700/50 text-slate-300 border border-slate-600 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/30"
                                >
                                    <AlertCircle size={14} />
                                    Mark Dirty
                                </button>
                            )}

                            {/* Maintenance Trigger */}
                            <button
                                onClick={(e) => handleStatusChange(e, 'maintenance')}
                                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 bg-slate-700/50 text-slate-300 border border-slate-600 hover:bg-slate-600 hover:text-white"
                            >
                                <Wrench size={14} />
                                Maintenance
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
