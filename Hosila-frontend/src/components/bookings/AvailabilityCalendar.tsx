import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Room, Booking, Reservation } from '@/types';
import { format, addDays, startOfDay, isSameDay, isWithinInterval } from 'date-fns';
import { ChevronLeft, ChevronRight, User, Calendar } from 'lucide-react';
import { getAllGuests } from '@/db/guests';
import { requireSupabase, getHotelId } from '@/lib/api';

interface AvailabilityCalendarProps {
    onReserve: (room: Room, date: Date) => void;
    onOpenGuestLedger: (bookingId: string) => void;
}

type CellState = 'vacant' | 'reserved' | 'occupied';

interface CellData {
    state: CellState;
    booking?: Booking;
    reservation?: Reservation;
    guestName?: string;
    bookingId?: string;
}

export function AvailabilityCalendar({ onReserve, onOpenGuestLedger }: AvailabilityCalendarProps) {
    const [startDate, setStartDate] = useState(() => startOfDay(new Date()));
    const daysToShow = 14; // Show 2 weeks

    // Get all rooms, active bookings, and confirmed reservations
    const { data: rooms } = useQuery({
        queryKey: ['rooms', 'sorted'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('rooms').select('*').eq('hotel_id', hotelId).order('room_number');
            return data ?? [];
        },
    });

    const { data: bookings } = useQuery({ queryKey: ['bookings', 'status', 'active'], queryFn: async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('bookings').select('*').eq('hotel_id', hotelId).eq('status', 'active'); return data ?? []; } });

    const { data: reservations } = useQuery({
        queryKey: ['reservations', 'confirmed-pending'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('reservations').select('*').eq('hotel_id', hotelId).in('status', ['confirmed', 'pending']);
            return data ?? [];
        },
    });

    const { data: guests } = useQuery({ queryKey: ['guests'], queryFn: getAllGuests });

    // Generate date array
    const dates = useMemo(() => {
        return Array.from({ length: daysToShow }, (_, i) => addDays(startDate, i));
    }, [startDate, daysToShow]);

    // Check if a room is booked on a specific date
    const getCellData = (roomId: string, date: Date): CellData => {
        const dayStart = startOfDay(date);

        // Check active bookings (occupied)
        const booking = bookings?.find(b => {
            if (b.room_id !== roomId) return false;
            const checkIn = startOfDay(new Date(b.check_in_time));
            const checkOut = startOfDay(new Date(b.planned_checkout));
            return isWithinInterval(dayStart, { start: checkIn, end: checkOut }) ||
                isSameDay(dayStart, checkIn);
        });

        if (booking) {
            const guest = guests?.find(g => g.id === booking.guest_id);
            return {
                state: 'occupied',
                booking,
                guestName: guest?.name,
                bookingId: booking.id,
            };
        }

        // Check reservations
        const reservation = reservations?.find(r => {
            if (r.room_id !== roomId || r.status === 'cancelled') return false;
            const checkIn = startOfDay(new Date(r.check_in_date));
            const checkOut = startOfDay(new Date(r.check_out_date));
            return isWithinInterval(dayStart, { start: checkIn, end: checkOut }) ||
                isSameDay(dayStart, checkIn);
        });

        if (reservation) {
            const guest = guests?.find(g => g.id === reservation.guest_id);
            return {
                state: 'reserved',
                reservation,
                guestName: guest?.name,
            };
        }

        return { state: 'vacant' };
    };

    const handleCellClick = (room: Room, date: Date, cellData: CellData) => {
        if (cellData.state === 'vacant') {
            onReserve(room, date);
        } else if (cellData.state === 'occupied' && cellData.bookingId) {
            onOpenGuestLedger(cellData.bookingId);
        } else if (cellData.state === 'reserved' && cellData.reservation) {
            // Reserved cell click — no action (reservation details shown via Reservations tab)
        }
    };

    const navigateDays = (direction: number) => {
        setStartDate(prev => addDays(prev, direction * 7));
    };

    const getCellStyle = (state: CellState) => {
        switch (state) {
            case 'occupied':
                return 'bg-status-occupied/60 hover:bg-status-occupied/80 border-status-occupied';
            case 'reserved':
                return 'bg-blue-500/40 hover:bg-blue-500/60 border-blue-500';
            default:
                return 'bg-surface-raised/30 hover:bg-green-500/30 border-border-strong hover:border-green-500';
        }
    };

    if (!rooms) {
        return <div className="text-muted text-center py-8">Loading...</div>;
    }

    return (
        <div className="space-y-4">
            {/* Navigation */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigateDays(-1)}
                    className="btn btn-ghost p-2"
                >
                    <ChevronLeft size={20} />
                </button>
                <span className="text-heading font-medium">
                    {format(dates[0], 'MMM d')} - {format(dates[dates.length - 1], 'MMM d, yyyy')}
                </span>
                <button
                    onClick={() => navigateDays(1)}
                    className="btn btn-ghost p-2"
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* Legend */}
            <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-surface-raised/50 border border-border-strong"></div>
                    <span className="text-muted">Vacant</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-blue-500/40 border border-blue-500"></div>
                    <span className="text-muted">Reserved</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-status-occupied/60 border border-status-occupied"></div>
                    <span className="text-muted">Occupied</span>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-max">
                    <thead>
                        <tr>
                            <th className="sticky left-0 bg-surface-card z-10 p-2 text-left text-sm text-muted border-b border-border min-w-[100px]">
                                Room
                            </th>
                            {dates.map(date => (
                                <th
                                    key={date.toISOString()}
                                    className={`p-2 text-center text-xs border-b border-border min-w-[50px] ${isSameDay(date, new Date())
                                        ? 'bg-primary-500/20 text-primary-400'
                                        : 'text-muted'
                                        }`}
                                >
                                    <div>{format(date, 'EEE')}</div>
                                    <div className="font-bold">{format(date, 'd')}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rooms.map(room => (
                            <tr key={room.id} className="hover:bg-surface-card/50">
                                <td className="sticky left-0 bg-surface-card z-10 p-2 border-b border-border">
                                    <div className="font-medium text-heading">{room.room_number}</div>
                                    <div className="text-xs text-muted">{room.room_type}</div>
                                </td>
                                {dates.map(date => {
                                    const cellData = getCellData(room.id, date);
                                    return (
                                        <td
                                            key={date.toISOString()}
                                            className="p-1 border-b border-border"
                                        >
                                            <button
                                                onClick={() => handleCellClick(room, date, cellData)}
                                                className={`w-full h-10 rounded border transition-all ${getCellStyle(cellData.state)}`}
                                                title={
                                                    cellData.state === 'vacant'
                                                        ? 'Click to reserve'
                                                        : cellData.guestName ?? ''
                                                }
                                            >
                                                {cellData.state !== 'vacant' && (
                                                    <div className="flex items-center justify-center">
                                                        {cellData.state === 'occupied' ? (
                                                            <User size={14} className="text-heading" />
                                                        ) : (
                                                            <Calendar size={14} className="text-heading" />
                                                        )}
                                                    </div>
                                                )}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Empty state */}
            {rooms.length === 0 && (
                <div className="text-center py-12 text-muted">
                    <p>No rooms configured</p>
                </div>
            )}
        </div>
    );
}
