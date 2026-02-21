import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Room } from '@/types';
import { X, DoorOpen, Check, Users } from 'lucide-react';
import { requireSupabase, getHotelId } from '@/lib/api';

interface RoomPickerModalProps {
    onClose: () => void;
    onSelect: (room: Room) => void;
    title?: string;
    subtitle?: string;
}

export function RoomPickerModal({ onClose, onSelect, title = "Select Room", subtitle = "Choose an available room for check-in" }: RoomPickerModalProps) {
    const [selectedType, setSelectedType] = useState<string>('all');

    // Get all available rooms
    const { data: rooms } = useQuery({ queryKey: ['rooms', 'status', 'available'], queryFn: async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('rooms').select('*').eq('hotel_id', hotelId).eq('status', 'available'); return data ?? []; } });

    // Get unique room types
    const roomTypes = [...new Set(rooms?.map(r => r.room_type) ?? [])];

    // Filter rooms by type
    const filteredRooms = selectedType === 'all'
        ? rooms
        : rooms?.filter(r => r.room_type === selectedType);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div>
                        <h2 className="text-xl font-bold text-white">{title}</h2>
                        <p className="text-sm text-slate-400">{subtitle}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Room Type Filter */}
                <div className="p-4 border-b border-slate-700">
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setSelectedType('all')}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedType === 'all'
                                ? 'bg-primary-500 text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                }`}
                        >
                            All Rooms ({rooms?.length ?? 0})
                        </button>
                        {roomTypes.map(type => (
                            <button
                                key={type}
                                onClick={() => setSelectedType(type)}
                                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedType === type
                                    ? 'bg-primary-500 text-white'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                            >
                                {type} ({rooms?.filter(r => r.room_type === type).length ?? 0})
                            </button>
                        ))}
                    </div>
                </div>

                {/* Room List */}
                <div className="flex-1 overflow-y-auto p-4">
                    {!filteredRooms || filteredRooms.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <DoorOpen size={48} className="mx-auto mb-3 opacity-50" />
                            <p>No available rooms</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {filteredRooms.map((room) => (
                                <button
                                    key={room.id}
                                    onClick={() => onSelect(room)}
                                    className="p-4 bg-slate-700/50 hover:bg-primary-500/20 border border-slate-600 hover:border-primary-500 rounded-lg text-left transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-lg font-bold text-white">
                                            Room {room.room_number}
                                        </span>
                                        <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Check size={14} className="text-green-400" />
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-400">{room.room_type}</p>
                                    <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                                        <Users size={12} />
                                        <span>Max {room.max_occupancy}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-700">
                    <button onClick={onClose} className="btn btn-secondary w-full">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
