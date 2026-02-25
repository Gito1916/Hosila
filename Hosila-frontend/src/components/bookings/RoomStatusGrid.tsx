import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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

type GroupMode = 'none' | 'type' | 'floor';

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
    type: 'By Type',
    floor: 'By Floor',
};

export function RoomStatusGrid({ onCheckIn, onOpenDetails }: RoomStatusGridProps) {
    const [filterStatus, setFilterStatus] = useState<RoomStatus | 'all'>('all');
    const [filterFloor, setFilterFloor] = useState<number | 'all'>('all');
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
            if (filterFloor !== 'all' && room.floor_number !== filterFloor) return false;
            if (filterType !== 'all' && room.room_type !== filterType) return false;
            return true;
        }),
        [rooms, filterStatus, filterFloor, filterType]);

    const floors = useMemo(() =>
        Array.from(new Set((rooms ?? []).map(r => r.floor_number ?? 1))).sort((a, b) => a - b),
        [rooms]);

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
        } else if (onOpenDetails) {
            onOpenDetails(room);
        }
    };

    const cycleGroupBy = () => {
        if (groupBy === 'none') setGroupBy('type');
        else if (groupBy === 'type') setGroupBy('floor');
        else setGroupBy('none');
    };

    const gridCls = viewMode === 'grid'
        ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
        : 'space-y-3';

    // ── Grouped rendering ──
    const renderGroupedRooms = () => {
        if (groupBy === 'type') {
            const types = Array.from(new Set(filteredRooms.map(r => r.room_type))).sort();
            return (
                <div className="space-y-6">
                    {types.map(type => {
                        const ofType = filteredRooms.filter(r => r.room_type === type);
                        if (ofType.length === 0) return null;
                        return (
                            <div key={type}>
                                <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    {type}
                                    <span className="text-xs font-normal text-gray-400 dark:text-slate-500 normal-case">
                                        ({ofType.length} room{ofType.length !== 1 ? 's' : ''})
                                    </span>
                                </h3>
                                <div className={gridCls}>
                                    {ofType.map(room => (
                                        <RoomCard key={room.id} room={room} onClick={() => handleRoomClick(room)} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }

        if (groupBy === 'floor') {
            const floorList = Array.from(new Set(filteredRooms.map(r => r.floor_number ?? 1))).sort((a, b) => a - b);
            return (
                <div className="space-y-6">
                    {floorList.map(floor => {
                        const ofFloor = filteredRooms.filter(r => (r.floor_number ?? 1) === floor);
                        if (ofFloor.length === 0) return null;
                        return (
                            <div key={floor}>
                                <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Building2 size={14} />
                                    Floor {floor}
                                    <span className="text-xs font-normal text-gray-400 dark:text-slate-500 normal-case">
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

            {/* Toolbar: Filters + View/Group controls */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter size={16} className="text-gray-400 dark:text-slate-500" />

                    {/* Status filter */}
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as RoomStatus | 'all')}
                        className="input py-1.5 pr-8 text-sm"
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
                            className="input py-1.5 text-sm"
                        >
                            <option value="all">All Types</option>
                            {roomTypes.map((type) => (
                                <option key={type} value={type}>
                                    {type}
                                </option>
                            ))}
                        </select>
                    )}

                    {/* Floor filter */}
                    {floors.length > 1 && (
                        <select
                            value={filterFloor === 'all' ? 'all' : filterFloor}
                            onChange={(e) => setFilterFloor(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                            className="input py-1.5 text-sm"
                        >
                            <option value="all">All Floors</option>
                            {floors.map((floor) => (
                                <option key={floor} value={floor}>
                                    Floor {floor}
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
                            ? 'bg-primary-50 text-primary-600 border-primary-200 dark:bg-primary-500/10 dark:text-primary-400 dark:border-primary-500/20'
                            : 'text-gray-400 border-gray-200 hover:text-gray-600 hover:border-gray-300 dark:text-slate-500 dark:border-navy-600 dark:hover:text-slate-300 dark:hover:border-navy-500'
                            }`}
                        title="Toggle grouping"
                    >
                        <Layers size={14} />
                        {groupLabel[groupBy]}
                    </button>

                    {/* Grid / List toggle */}
                    <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-navy-600">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 ${viewMode === 'grid'
                                ? 'bg-primary-500 text-white'
                                : 'bg-white text-gray-400 hover:text-gray-600 dark:bg-navy-800 dark:text-slate-500 dark:hover:text-slate-300'}`}
                        >
                            <Grid3X3 size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 ${viewMode === 'list'
                                ? 'bg-primary-500 text-white'
                                : 'bg-white text-gray-400 hover:text-gray-600 dark:bg-navy-800 dark:text-slate-500 dark:hover:text-slate-300'}`}
                        >
                            <List size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Room count */}
            <div className="text-sm text-gray-400 dark:text-slate-500">
                Showing {filteredRooms.length} of {rooms?.length ?? 0} rooms
            </div>

            {/* Room Grid */}
            {renderGroupedRooms()}

            {/* Empty State */}
            {filteredRooms.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                    <p>No rooms match your filters</p>
                </div>
            )}
        </div>
    );
}
