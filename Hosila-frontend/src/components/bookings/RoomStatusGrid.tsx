import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getAllRooms } from '@/db/rooms';
import { requireSupabase, getHotelId } from '@/lib/api';
import { RoomCard } from '@/components/rooms/RoomCard';
import type { Room, RoomStatus, Booking, Reservation } from '@/types';
import {
    Filter,
    Layers,
    Building2,
    Grid3X3,
    List,
} from 'lucide-react';

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

type GroupMode = 'none' | 'floor';

const statusOptions: { value: RoomStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All Rooms' },
    { value: 'available', label: 'Available' },
    { value: 'occupied', label: 'Occupied' },
    { value: 'short_rest', label: 'Short Rest' },
    { value: 'dirty', label: 'Dirty' },
    { value: 'maintenance', label: 'Maintenance' },
];

const groupLabel: Record<GroupMode, string> = {
    none: 'No Grouping',
    floor: 'By Floor',
};

export function RoomStatusGrid({ onCheckIn, onOpenDetails }: RoomStatusGridProps) {
    const navigate = useNavigate();
    const [filterStatus, setFilterStatus] = useState<RoomStatus | 'all'>('all');
    const [filterType, setFilterType] = useState<string | 'all'>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [groupBy, setGroupBy] = useState<GroupMode>('none');

    // Get all rooms with active bookings + reservations
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

    // --- Derived data ---
    const filteredRooms = useMemo(() =>
        (rooms ?? []).filter(room => {
            if (filterStatus !== 'all' && room.status !== filterStatus) return false;
            if (filterType !== 'all' && room.room_type !== filterType) return false;
            return true;
        }),
        [rooms, filterStatus, filterType]);

    const roomTypes = useMemo(() =>
        Array.from(new Set((rooms ?? []).map(r => r.room_type))).sort(),
        [rooms]);

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
        } else if ((room.status === 'occupied' || room.status === 'short_rest') && room.activeBooking) {
            navigate(`/bookings/${room.activeBooking.id}/ledger`);
        } else if (onOpenDetails) {
            onOpenDetails(room);
        }
    };

    const cycleGroupBy = () => {
        if (groupBy === 'none') setGroupBy('floor');
        else setGroupBy('none');
    };

    const gridCls = viewMode === 'grid'
        ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
        : 'space-y-3';

    // ── Grouped rendering ──
    const renderGroupedRooms = () => {
        if (groupBy === 'floor') {
            const floorList = Array.from(new Set(filteredRooms.map(r => r.floor_number ?? 1))).sort((a, b) => a - b);
            return (
                <div className="space-y-6">
                    {floorList.map(floor => {
                        const ofFloor = filteredRooms.filter(r => (r.floor_number ?? 1) === floor);
                        if (ofFloor.length === 0) return null;
                        return (
                            <div key={floor}>
                                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Building2 size={14} />
                                    Floor {floor}
                                    <span className="text-xs font-normal text-muted normal-case">
                                        ({ofFloor.length} room{ofFloor.length !== 1 ? 's' : ''})
                                    </span>
                                </h3>
                                <div className={gridCls}>
                                    {ofFloor.map(room => (
                                        <RoomCard key={room.id} room={room} onClick={() => handleRoomClick(room)} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }

        // No grouping
        return (
            <div className={gridCls}>
                {filteredRooms.map(room => (
                    <RoomCard key={room.id} room={room} onClick={() => handleRoomClick(room)} />
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {/* Status Summary */}
            <div className="grid grid-cols-4 gap-3">
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-status-available">{statusCounts.available}</p>
                    <p className="text-xs text-muted">Vacant</p>
                </div>
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-status-occupied">{statusCounts.occupied}</p>
                    <p className="text-xs text-muted">Occupied</p>
                </div>
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-status-dirty">{statusCounts.dirty}</p>
                    <p className="text-xs text-muted">Dirty</p>
                </div>
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-status-maintenance">{statusCounts.maintenance}</p>
                    <p className="text-xs text-muted">Maintenance</p>
                </div>
            </div>

            {/* Toolbar: Filters + View/Group controls */}
            <div className="flex items-center gap-2 justify-between flex-wrap">
                {/* Filters — compact pill style */}
                <div className="flex items-center gap-2">
                    <Filter size={14} className="text-muted" />

                    {/* Status filter */}
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as RoomStatus | 'all')}
                        className="text-sm px-3 py-1.5 rounded-lg border border-border bg-surface-card text-body focus:outline-none focus:border-primary-400 cursor-pointer appearance-none pr-7"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
                    >
                        {statusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>

                    {/* Room type filter */}
                    {roomTypes.length > 1 && (
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-border bg-surface-card text-body focus:outline-none focus:border-primary-400 cursor-pointer appearance-none pr-7"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
                        >
                            <option value="all">All Types</option>
                            {roomTypes.map((type) => (
                                <option key={type} value={type}>
                                    {type}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* View toggle + grouping */}
                <div className="flex items-center gap-2">
                    {/* Group toggle */}
                    <button
                        onClick={cycleGroupBy}
                        className={`text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${groupBy !== 'none'
                            ? 'bg-primary-50 text-primary-600 border-primary-200'
                            : 'text-muted border-border hover:text-heading hover:border-border-strong'
                            }`}
                        title="Toggle grouping"
                    >
                        <Layers size={14} />
                        {groupLabel[groupBy]}
                    </button>

                    {/* Grid / List toggle */}
                    <div className="flex rounded-lg overflow-hidden border border-border">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 ${viewMode === 'grid'
                                ? 'bg-primary-500 text-white'
                                : 'bg-surface-card text-muted hover:text-heading'}`}
                        >
                            <Grid3X3 size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 ${viewMode === 'list'
                                ? 'bg-primary-500 text-white'
                                : 'bg-surface-card text-muted hover:text-heading'}`}
                        >
                            <List size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Room count */}
            <div className="text-sm text-muted">
                Showing {filteredRooms.length} of {rooms?.length ?? 0} rooms
            </div>

            {/* Room Grid */}
            {renderGroupedRooms()}

            {/* Empty State */}
            {filteredRooms.length === 0 && (
                <div className="text-center py-12 text-muted">
                    <p>No rooms match your filters</p>
                </div>
            )}
        </div>
    );
}
