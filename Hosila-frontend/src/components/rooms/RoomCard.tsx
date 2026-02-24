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

/** Status configuration with light-mode colors */
const statusConfig: Record<RoomStatus, {
    label: string;
    accentColor: string;
    badgeBg: string;
    badgeText: string;
}> = {
    available: {
        label: 'Available',
        accentColor: '#10b981',   // emerald-500
        badgeBg: '#ecfdf5',       // emerald-50
        badgeText: '#059669',     // emerald-600
    },
    occupied: {
        label: 'Occupied',
        accentColor: '#ef4444',   // red-500
        badgeBg: '#fef2f2',       // red-50
        badgeText: '#dc2626',     // red-600
    },
    short_rest: {
        label: 'Short Rest',
        accentColor: '#a855f7',   // purple-500
        badgeBg: '#faf5ff',       // purple-50
        badgeText: '#9333ea',     // purple-600
    },
    dirty: {
        label: 'Dirty',
        accentColor: '#f59e0b',   // amber-500
        badgeBg: '#fffbeb',       // amber-50
        badgeText: '#d97706',     // amber-600
    },
    maintenance: {
        label: 'Maintenance',
        accentColor: '#6b7280',   // gray-500
        badgeBg: '#f3f4f6',       // gray-100
        badgeText: '#4b5563',     // gray-600
    },
};

const reservedConfig = {
    label: 'Reserved',
    accentColor: '#3b82f6',   // blue-500
    badgeBg: '#eff6ff',       // blue-50
    badgeText: '#2563eb',     // blue-600
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

    // ── Render ──

    return (
        <div
            className="relative flex flex-col rounded-xl border bg-white shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group overflow-hidden"
            style={{ borderColor: '#e5e7eb', minHeight: 180 }}
            onClick={onClick}
        >
            {/* ── Left accent stripe ── */}
            <div
                className="absolute top-0 left-0 bottom-0 w-1 rounded-l-xl"
                style={{ backgroundColor: config.accentColor }}
            />

            {/* ── Header: Room Number + Badge ── */}
            <div className="flex items-start justify-between px-5 pt-4 pb-1 pl-6">
                <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight leading-none">
                    {room.room_number}
                </h3>
                <div
                    className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide shrink-0"
                    style={{
                        backgroundColor: config.badgeBg,
                        color: config.badgeText,
                    }}
                >
                    <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: config.accentColor }}
                    />
                    {config.label}
                </div>
            </div>

            {/* ── Room Type ── */}
            <div className="px-5 pl-6 pb-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{room.room_type}</p>
            </div>

            {/* ── Content (varies by status) ── */}
            <div className="px-5 pl-6 flex-grow flex flex-col justify-center">

                {/* Vacant / Available */}
                {room.status === 'available' && !isReserved && (
                    <div>
                        <p className="text-lg font-bold text-emerald-600">
                            ₦{Number(room.night_rate).toLocaleString()}
                            <span className="text-xs font-normal text-gray-400">/night</span>
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
                            <p className="text-sm font-semibold text-gray-800 truncate">
                                {room.reservationGuestName}
                            </p>
                            <p className="text-xs text-gray-400">Arriving today</p>
                        </div>
                    </div>
                )}

                {/* Occupied */}
                {room.status === 'occupied' && room.activeBooking && (
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                            {room.guestName
                                ? room.guestName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                                : <User size={14} />}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                                {room.guestName || 'Guest'}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                Out: {format(new Date(room.activeBooking.planned_checkout), 'MMM d, h:mm a')}
                            </p>
                        </div>
                    </div>
                )}

                {/* Short Rest */}
                {room.status === 'short_rest' && room.activeBooking && (
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center shrink-0">
                            <Clock size={16} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">
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
                    <p className="text-sm text-amber-600 font-medium">Needs cleaning</p>
                )}

                {/* Maintenance — minimal */}
                {room.status === 'maintenance' && (
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Under maintenance</p>
                        {room.maintenance_reason && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
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
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        title="Mark Clean"
                    >
                        <Sparkles size={13} />
                        Clean
                    </button>
                    <button
                        onClick={(e) => handleStatusChange(e, 'maintenance')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 transition-colors"
                        title="Maintenance"
                    >
                        <Wrench size={13} />
                        Maintenance
                    </button>
                </div>
            )}

            {/* Maintenance: complete button */}
            {room.status === 'maintenance' && (
                <div className="px-5 pl-6 pb-3 pt-2 mt-auto flex gap-2">
                    <button
                        onClick={(e) => handleStatusChange(e, 'available')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors"
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
