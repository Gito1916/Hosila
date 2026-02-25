import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAllRooms } from '@/db/rooms';
import { requireSupabase, getHotelId } from '@/lib/api';
import { RoomCard } from '@/components/rooms/RoomCard';
import type { Room, RoomStatus, Booking, Reservation } from '@/types';
import { Filter } from 'lucide-react';

interface RoomWithBooking extends Room {
    activeBooking?: Booking;
    guestName?: string;
    pendingReservation?: Reservation;
    reservationGuestName?: string;
}

interface RoomStatusGridProps {
    onCheckIn?: (room: Room) => void;
    onOpenDetails?: (room: RoomWithBooking) => void;
}

export function RoomStatusGrid({ onCheckIn, onOpenDetails }: RoomStatusGridProps) {
    const [filterStatus, setFilterStatus] = useState<RoomStatus | 'all'>('all');

    // Get all rooms with active bookings
    const { data: rooms } = useQuery({
        queryKey: ['rooms-with-bookings'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const allRooms = await getAllRooms();
            const { data: activeBookings } = await sb.from('bookings').select('*').eq('hotel_id', hotelId).eq('status', 'active');
            const { data: guests } = await sb.from('guests').select('id, name').eq('hotel_id', hotelId);

            // Get today's confirmed reservations
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayEnd = new Date(today);
            todayEnd.setHours(23, 59, 59, 999);
            const { data: reservations } = await sb
                .from('reservations')
                .select('*')
                .eq('hotel_id', hotelId)
                .eq('status', 'confirmed')
                .gte('check_in_date', today.toISOString())
                .lte('check_in_date', todayEnd.toISOString());

            return allRooms.map(room => {
                const booking = (activeBookings ?? []).find((b: any) => b.room_id === room.id);
                const guest = booking ? (guests ?? []).find((g: any) => g.id === booking.guest_id) : undefined;
                const reservation = (reservations ?? []).find((r: any) => r.room_id === room.id);
                const reservationGuest = reservation ? (guests ?? []).find((g: any) => g.id === reservation.guest_id) : undefined;

                return {
                    ...room,
                    activeBooking: booking,
                    guestName: guest?.name,
                    pendingReservation: reservation,
                    reservationGuestName: reservationGuest?.name,
                } as RoomWithBooking;
            }).sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }));
        },
        refetchInterval: 5000,
    });

    // Filter rooms
    const filteredRooms = rooms?.filter(room =>
        filterStatus === 'all' || room.status === filterStatus
    ) ?? [];

    // Status counts
    const statusCounts = {
        available: rooms?.filter(r => r.status === 'available').length ?? 0,
        occupied: rooms?.filter(r => r.status === 'occupied' || r.status === 'short_rest').length ?? 0,
        dirty: rooms?.filter(r => r.status === 'dirty').length ?? 0,
        maintenance: rooms?.filter(r => r.status === 'maintenance').length ?? 0,
    };

    const handleRoomClick = (room: RoomWithBooking) => {
        if (room.status === 'available' && onCheckIn) {
            onCheckIn(room);
        } else if (onOpenDetails) {
            onOpenDetails(room);
        }
    };

    return (
        <div className="space-y-4">
            {/* Status Summary */}
            <div className="grid grid-cols-4 gap-3">
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-status-available">{statusCounts.available}</p>
                    <p className="text-xs text-slate-400">Vacant</p>
                </div>
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-status-occupied">{statusCounts.occupied}</p>
                    <p className="text-xs text-slate-400">Occupied</p>
                </div>
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-status-dirty">{statusCounts.dirty}</p>
                    <p className="text-xs text-slate-400">Dirty</p>
                </div>
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-status-maintenance">{statusCounts.maintenance}</p>
                    <p className="text-xs text-slate-400">Maintenance</p>
                </div>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
                <Filter size={16} className="text-slate-400" />
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as RoomStatus | 'all')}
                    className="input w-auto"
                >
                    <option value="all">All Rooms ({rooms?.length ?? 0})</option>
                    <option value="available">Vacant ({statusCounts.available})</option>
                    <option value="occupied">Occupied ({statusCounts.occupied})</option>
                    <option value="dirty">Dirty ({statusCounts.dirty})</option>
                    <option value="maintenance">Maintenance ({statusCounts.maintenance})</option>
                </select>
            </div>

            {/* Room Grid — now uses shared RoomCard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredRooms.map(room => (
                    <RoomCard
                        key={room.id}
                        room={room}
                        onClick={() => handleRoomClick(room)}
                    />
                ))}
            </div>

            {/* Empty State */}
            {filteredRooms.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                    <p>No rooms match the selected filter</p>
                </div>
            )}
        </div>
    );
}
