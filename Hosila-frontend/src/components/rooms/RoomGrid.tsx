import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRooms, useActiveBookings, useReservations, useGuests } from '@/hooks/useSupabaseData';
import { queryKeys } from '@/hooks/useSupabaseData';
import { RoomCard } from './RoomCard';
import { CheckInModal } from './CheckInModal';
import { RoomDetailsModal } from './RoomDetailsModal';
import { RoomActionMenu } from './RoomActionMenu';
import { StatusLegend } from './StatusLegend';
import { updateRoomStatus } from '@/db/rooms';
import type { Room, Booking, RoomStatus, Reservation } from '@/types';
import {
    Grid3X3,
    List,
    Filter,
    RefreshCw,
    Layers,
    Building2,
} from 'lucide-react';

interface RoomWithBooking extends Room {
    activeBooking?: Booking;
    guestName?: string;
    pendingReservation?: Reservation;
}

const statusOptions: { value: RoomStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All Rooms' },
    { value: 'available', label: 'Available' },
    { value: 'occupied', label: 'Occupied' },
    { value: 'short_rest', label: 'Short Rest' },
    { value: 'dirty', label: 'Dirty' },
    { value: 'maintenance', label: 'Maintenance' },
];

type GroupMode = 'none' | 'type' | 'floor';

export function RoomGrid() {
    const queryClient = useQueryClient();

    // --- Data from centralized hooks (Realtime-tier, pushed via WebSocket) ---
    const { data: rooms, isLoading: roomsLoading } = useRooms();
    const { data: activeBookings } = useActiveBookings();
    const { data: allReservations } = useReservations();
    const { data: allGuests } = useGuests();

    // --- Local UI state ---
    const [filterStatus, setFilterStatus] = useState<RoomStatus | 'all'>('all');
    const [filterFloor, setFilterFloor] = useState<number | 'all'>('all');
    const [filterType, setFilterType] = useState<string | 'all'>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [checkInRoom, setCheckInRoom] = useState<RoomWithBooking | null>(null);
    const [detailsRoom, setDetailsRoom] = useState<RoomWithBooking | null>(null);
    const [actionRoom, setActionRoom] = useState<RoomWithBooking | null>(null);
    const [groupBy, setGroupBy] = useState<GroupMode>('none');

    // --- Join rooms with bookings, reservations, and guests ---
    const roomsWithBookings = useMemo<RoomWithBooking[]>(() => {
        if (!rooms) return [];

        const guestMap = new Map((allGuests ?? []).map(g => [g.id, g]));

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);

        const todayReservations = (allReservations ?? []).filter(r =>
            r.status === 'confirmed' &&
            new Date(r.check_in_date) >= today &&
            new Date(r.check_in_date) <= todayEnd
        );

        return rooms
            .map(room => {
                const booking = (activeBookings ?? []).find(b => b.room_id === room.id);
                const guest = booking ? guestMap.get(booking.guest_id) : undefined;
                const reservation = todayReservations.find(r => r.room_id === room.id);
                const reservationGuest = reservation ? guestMap.get(reservation.guest_id) : undefined;

                return {
                    ...room,
                    activeBooking: booking,
                    guestName: guest?.name,
                    pendingReservation: reservation,
                    reservationGuestName: reservationGuest?.name,
                } as RoomWithBooking;
            })
            .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }));
    }, [rooms, activeBookings, allReservations, allGuests]);

    // --- Derived data ---
    const filteredRooms = useMemo(() =>
        roomsWithBookings.filter(room => {
            if (filterStatus !== 'all' && room.status !== filterStatus) return false;
            if (filterFloor !== 'all' && room.floor_number !== filterFloor) return false;
            if (filterType !== 'all' && room.room_type !== filterType) return false;
            return true;
        }),
        [roomsWithBookings, filterStatus, filterFloor, filterType]);

    const floors = useMemo(() =>
        Array.from(new Set(roomsWithBookings.map(r => r.floor_number ?? 1))).sort((a, b) => a - b),
        [roomsWithBookings]);

    const roomTypes = useMemo(() =>
        Array.from(new Set(roomsWithBookings.map(r => r.room_type))).sort(),
        [roomsWithBookings]);

    const statusCounts: Record<RoomStatus, number> = {
        available: roomsWithBookings.filter(r => r.status === 'available').length,
        occupied: roomsWithBookings.filter(r => r.status === 'occupied').length,
        short_rest: roomsWithBookings.filter(r => r.status === 'short_rest').length,
        dirty: roomsWithBookings.filter(r => r.status === 'dirty').length,
        maintenance: roomsWithBookings.filter(r => r.status === 'maintenance').length,
    };

    // --- Handlers ---
    const refreshRooms = () => {
        queryClient.invalidateQueries({ queryKey: [...queryKeys.rooms] });
        queryClient.invalidateQueries({ queryKey: [...queryKeys.activeBookings] });
        queryClient.invalidateQueries({ queryKey: [...queryKeys.reservations] });
        queryClient.invalidateQueries({ queryKey: [...queryKeys.guests] });
    };

    const handleRoomClick = (room: RoomWithBooking) => {
        if (room.status === 'available') {
            if (room.pendingReservation) {
                setDetailsRoom(room);
            } else {
                setActionRoom(room);
            }
        } else {
            setDetailsRoom(room);
        }
    };

    const handleCheckInSuccess = () => {
        setCheckInRoom(null);
        setActionRoom(null);
        refreshRooms();
    };

    const handleDetailsClose = () => {
        setDetailsRoom(null);
        refreshRooms();
    };

    const handleMarkStatus = async (status: RoomStatus) => {
        if (!actionRoom) return;
        try {
            await updateRoomStatus(actionRoom.id, status);
            setActionRoom(null);
            refreshRooms();
        } catch (err) {
            console.error('Error updating room status:', err);
        }
    };

    const isLoading = roomsLoading && roomsWithBookings.length === 0;

    const gridCls = viewMode === 'grid'
        ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        : "space-y-3";

    // Cycle through grouping modes
    const cycleGroupBy = () => {
        if (groupBy === 'none') setGroupBy('type');
        else if (groupBy === 'type') setGroupBy('floor');
        else setGroupBy('none');
    };

    const groupLabel: Record<GroupMode, string> = {
        none: 'No Grouping',
        type: 'By Type',
        floor: 'By Floor',
    };

    // ── Render grouped rooms ──
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
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    {type}
                                    <span className="text-xs font-normal text-gray-400 normal-case">
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
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Building2 size={14} />
                                    Floor {floor}
                                    <span className="text-xs font-normal text-gray-400 normal-case">
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
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter size={16} className="text-gray-400" />

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

                {/* View toggle, grouping, & refresh */}
                <div className="flex items-center gap-2">
                    {/* Group toggle */}
                    <button
                        onClick={cycleGroupBy}
                        className={`text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${groupBy !== 'none'
                                ? 'bg-primary-50 text-primary-600 border-primary-200'
                                : 'text-gray-400 border-gray-200 hover:text-gray-600 hover:border-gray-300'
                            }`}
                        title="Toggle grouping"
                    >
                        <Layers size={14} />
                        {groupLabel[groupBy]}
                    </button>

                    <button
                        onClick={refreshRooms}
                        className="btn btn-ghost p-2"
                        title="Refresh"
                    >
                        <RefreshCw size={18} className={roomsLoading ? 'animate-spin' : ''} />
                    </button>

                    <div className="flex rounded-lg overflow-hidden border border-gray-200">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 ${viewMode === 'grid' ? 'bg-primary-500 text-white' : 'bg-white text-gray-400 hover:text-gray-600'}`}
                        >
                            <Grid3X3 size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 ${viewMode === 'list' ? 'bg-primary-500 text-white' : 'bg-white text-gray-400 hover:text-gray-600'}`}
                        >
                            <List size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Status Legend */}
            <StatusLegend
                stats={statusCounts}
                activeFilter={filterStatus}
                onFilterClick={setFilterStatus}
            />

            {/* Room count */}
            <div className="text-sm text-gray-400">
                Showing {filteredRooms.length} of {roomsWithBookings.length} rooms
            </div>

            {/* Loading state */}
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <RefreshCw size={32} className="animate-spin text-primary-500" />
                </div>
            )}

            {/* Room grid */}
            {!isLoading && renderGroupedRooms()}

            {/* Empty state */}
            {!isLoading && filteredRooms.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                    <p>No rooms match your filters</p>
                </div>
            )}

            {/* Modals */}
            {checkInRoom && (
                <CheckInModal
                    room={checkInRoom}
                    onClose={() => setCheckInRoom(null)}
                    onSuccess={handleCheckInSuccess}
                />
            )}

            {detailsRoom && (
                <RoomDetailsModal
                    room={detailsRoom}
                    onClose={handleDetailsClose}
                />
            )}

            {actionRoom && (
                <RoomActionMenu
                    room={actionRoom}
                    onCheckIn={() => {
                        setActionRoom(null);
                        setCheckInRoom(actionRoom);
                    }}
                    onMarkDirty={() => handleMarkStatus('dirty')}
                    onMarkMaintenance={() => handleMarkStatus('maintenance')}
                    onClose={() => setActionRoom(null)}
                />
            )}
        </div>
    );
}
