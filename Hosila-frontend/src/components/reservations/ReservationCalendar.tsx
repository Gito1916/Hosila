import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Reservation } from '@/types';
import {
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    addDays,
    format,
    isSameMonth,
    isSameDay,
    isWithinInterval,
    addMonths,
    subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getAllRooms } from '@/db/rooms';
import { requireSupabase, getHotelId } from '@/lib/api';

interface ReservationCalendarProps {
    onReservationClick: (reservation: Reservation) => void;
}

export function ReservationCalendar({ onReservationClick }: ReservationCalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Get reservations
    const { data: reservations } = useQuery({
        queryKey: ['reservations', 'not-cancelled'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('reservations').select('*').eq('hotel_id', hotelId).neq('status', 'cancelled');
            return data ?? [];
        },
    });

    // Get rooms for display
    const { data: rooms } = useQuery({ queryKey: ['rooms'], queryFn: getAllRooms });

    // Generate calendar days
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
        const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

        const days: Date[] = [];
        let day = startDate;
        while (day <= endDate) {
            days.push(day);
            day = addDays(day, 1);
        }
        return days;
    }, [currentMonth]);

    // Get reservations for a specific day
    const getReservationsForDay = (day: Date) => {
        if (!reservations) return [];

        return reservations.filter(r => {
            const checkIn = new Date(r.check_in_date);
            const checkOut = new Date(r.check_out_date);

            // Show if this day is within the stay period
            return isWithinInterval(day, { start: checkIn, end: addDays(checkOut, -1) }) ||
                isSameDay(day, checkIn);
        });
    };

    // Get room by ID
    const getRoomNumber = (roomId: string): string => {
        const room = rooms?.find(r => r.id === roomId);
        return room?.room_number ?? '?';
    };

    // Navigation
    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const goToToday = () => setCurrentMonth(new Date());

    // Weekday headers
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <div className="card overflow-hidden">
            {/* Calendar Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button onClick={prevMonth} className="btn btn-ghost p-2">
                        <ChevronLeft size={20} />
                    </button>
                    <h3 className="text-lg font-semibold text-heading min-w-[160px] text-center">
                        {format(currentMonth, 'MMMM yyyy')}
                    </h3>
                    <button onClick={nextMonth} className="btn btn-ghost p-2">
                        <ChevronRight size={20} />
                    </button>
                </div>
                <button onClick={goToToday} className="btn btn-secondary text-sm">
                    Today
                </button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 bg-surface-raised/50">
                {weekdays.map(day => (
                    <div key={day} className="p-2 text-center text-sm font-medium text-muted">
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7">
                {calendarDays.map((day, idx) => {
                    const dayReservations = getReservationsForDay(day);
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isToday = isSameDay(day, new Date());

                    return (
                        <div
                            key={idx}
                            className={`min-h-[100px] p-1 border-r border-b border-border last:border-r-0 ${!isCurrentMonth ? 'bg-surface-inset' : 'bg-surface-card/50'
                                }`}
                        >
                            {/* Day number */}
                            <div className={`text-sm mb-1 ${isToday
                                ? 'w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center text-heading font-bold'
                                : isCurrentMonth ? 'text-muted' : 'text-muted'
                                }`}>
                                {format(day, 'd')}
                            </div>

                            {/* Reservations */}
                            <div className="space-y-1">
                                {dayReservations.slice(0, 3).map((res) => {
                                    const isCheckIn = isSameDay(day, new Date(res.check_in_date));
                                    const isCheckOut = isSameDay(day, new Date(res.check_out_date));

                                    return (
                                        <button
                                            key={res.id}
                                            onClick={() => onReservationClick(res)}
                                            className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate transition-colors ${isCheckIn
                                                ? 'bg-status-available/30 text-status-available hover:bg-status-available/50'
                                                : isCheckOut
                                                    ? 'bg-status-occupied/30 text-status-occupied hover:bg-status-occupied/50'
                                                    : 'bg-primary-500/30 text-primary-400 hover:bg-primary-500/50'
                                                }`}
                                            title={`Room ${getRoomNumber(res.room_id)} - ${res.nights} nights`}
                                        >
                                            {isCheckIn && '→ '}
                                            R{getRoomNumber(res.room_id)}
                                            {isCheckOut && ' →'}
                                        </button>
                                    );
                                })}
                                {dayReservations.length > 3 && (
                                    <div className="text-xs text-muted px-1">
                                        +{dayReservations.length - 3} more
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="p-3 border-t border-border flex items-center gap-4 text-xs text-muted">
                <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-status-available/30 rounded"></span>
                    <span>Check-in</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-primary-500/30 rounded"></span>
                    <span>Staying</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-status-occupied/30 rounded"></span>
                    <span>Check-out</span>
                </div>
            </div>
        </div>
    );
}
