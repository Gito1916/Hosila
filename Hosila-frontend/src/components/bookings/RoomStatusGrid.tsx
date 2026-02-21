import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAllRooms, updateRoomStatus } from '@/db/rooms';
import { requireSupabase, getHotelId } from '@/lib/api';
import type { Room, RoomStatus, Booking } from '@/types';
import {
    Check,
    Wrench,
    Loader2,
    Filter,
} from 'lucide-react';

interface RoomWithBooking extends Room {
    activeBooking?: Booking;
    guestName?: string;
}

interface RoomStatusGridProps {
    onCheckIn?: (room: Room) => void;
    onOpenDetails?: (room: RoomWithBooking) => void;
}

const statusColors: Record<RoomStatus, string> = {
    available: 'bg-status-available/20 border-status-available text-status-available',
    occupied: 'bg-status-occupied/20 border-status-occupied text-status-occupied',
    short_rest: 'bg-status-shortRest/20 border-status-shortRest text-status-shortRest',
    dirty: 'bg-status-dirty/20 border-status-dirty text-status-dirty',
    maintenance: 'bg-status-maintenance/20 border-status-maintenance text-status-maintenance',
};

const statusLabels: Record<RoomStatus, string> = {
    available: 'Vacant',
    occupied: 'Occupied',
    short_rest: 'Short Rest',
    dirty: 'Dirty',
    maintenance: 'Maintenance',
};

export function RoomStatusGrid({ onCheckIn, onOpenDetails }: RoomStatusGridProps) {
    const [filterStatus, setFilterStatus] = useState<RoomStatus | 'all'>('all');
    const [isLoading, setIsLoading] = useState(false);

    // Get all rooms with active bookings — replaces useLiveQuery
    const { data: rooms } = useQuery({
        queryKey: ['rooms-with-bookings'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const allRooms = await getAllRooms();
            const { data: activeBookings } = await sb.from('bookings').select('*').eq('hotel_id', hotelId).eq('status', 'active');
            const { data: guests } = await sb.from('guests').select('id, name').eq('hotel_id', hotelId);

            return allRooms.map(room => {
                const booking = (activeBookings ?? []).find((b: any) => b.room_id === room.id);
                const guest = booking ? (guests ?? []).find((g: any) => g.id === booking.guest_id) : undefined;
                return {
                    ...room,
                    activeBooking: booking,
                    guestName: guest?.name,
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

    // Housekeeping status cycle: dirty -> available, or toggle maintenance
    const handleMarkClean = async (room: Room) => {
        setIsLoading(true);
        try {
            await updateRoomStatus(room.id, 'available');
        } catch (err) {
            console.error('Error updating room status:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleMarkMaintenance = async (room: Room) => {
        setIsLoading(true);
        try {
            const newStatus = room.status === 'maintenance' ? 'available' : 'maintenance';
            await updateRoomStatus(room.id, newStatus);
        } catch (err) {
            console.error('Error updating room status:', err);
        } finally {
            setIsLoading(false);
        }
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
                    <option value="dirty">Dirty ({statusCounts.dirty})</option>
                    <option value="maintenance">Maintenance ({statusCounts.maintenance})</option>
                </select>
            </div>

            {/* Room Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filteredRooms.map(room => (
                    <div
                        key={room.id}
                        className={`card p-3 border-2 cursor-pointer transition-all hover:scale-105 ${statusColors[room.status]}`}
                        onClick={() => handleRoomClick(room)}
                    >
                        {/* Room Number */}
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-lg font-bold">{room.room_number}</span>
                            <span className="text-xs opacity-75">{room.room_type}</span>
                        </div>

                        {/* Status */}
                        <p className="text-xs font-medium mb-2">{statusLabels[room.status]}</p>

                        {/* Guest Name for occupied rooms */}
                        {room.guestName && (
                            <p className="text-xs text-slate-300 truncate mb-2">{room.guestName}</p>
                        )}

                        {/* Housekeeping Actions */}
                        {(room.status === 'dirty' || room.status === 'maintenance') && (
                            <div className="flex gap-1 mt-2">
                                {room.status === 'dirty' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleMarkClean(room);
                                        }}
                                        disabled={isLoading}
                                        className="flex-1 py-1 px-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs rounded flex items-center justify-center gap-1"
                                    >
                                        {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                        Clean
                                    </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleMarkMaintenance(room);
                                    }}
                                    disabled={isLoading}
                                    className={`py-1 px-2 text-xs rounded flex items-center justify-center gap-1 ${room.status === 'maintenance'
                                        ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400 flex-1'
                                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400'
                                        }`}
                                >
                                    <Wrench size={12} />
                                    {room.status === 'maintenance' ? 'Done' : ''}
                                </button>
                            </div>
                        )}

                        {/* Available rooms show check-in hint */}
                        {room.status === 'available' && (
                            <p className="text-xs text-slate-400 mt-2">Click to Check-in</p>
                        )}
                    </div>
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
