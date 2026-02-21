import { useState } from 'react';
import { createRoom, updateRoom, deleteRoom } from '@/db/rooms';
import { useRooms, useRoomTypes } from '@/hooks/useSupabaseData';
import { toast } from '@/lib/errorMessages';
import type { Room } from '@/types';
import {
    Plus,
    Edit2,
    Trash2,
    DoorOpen,
    X,
    Loader2,
    Save,
} from 'lucide-react';

export function RoomManagement() {
    const [showForm, setShowForm] = useState(false);
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);

    const { data: rooms } = useRooms();

    const handleEdit = (room: Room) => {
        setEditingRoom(room);
        setShowForm(true);
    };

    const handleDelete = async (room: Room) => {
        if (room.status === 'occupied') {
            toast.warn('Cannot delete room', 'This room is currently occupied. Check out the guest first.');
            return;
        }
        if (confirm(`Delete room ${room.room_number}?`)) {
            try {
                await deleteRoom(room.id);
            } catch (err) {
                toast.error('Failed to delete room', err);
            }
        }
    };

    return (
        <div className="card">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-semibold text-white flex items-center gap-2">
                    <DoorOpen size={18} />
                    Room Management
                </h3>
                <button
                    onClick={() => { setEditingRoom(null); setShowForm(true); }}
                    className="btn btn-primary text-sm"
                >
                    <Plus size={16} className="mr-1" />
                    Add Room
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-slate-700/50">
                        <tr>
                            <th className="text-left p-3 text-slate-400 text-sm font-medium">Room</th>
                            <th className="text-left p-3 text-slate-400 text-sm font-medium">Type</th>
                            <th className="text-left p-3 text-slate-400 text-sm font-medium">Floor</th>
                            <th className="text-left p-3 text-slate-400 text-sm font-medium">Capacity</th>
                            <th className="text-left p-3 text-slate-400 text-sm font-medium">Night Rate</th>
                            <th className="text-left p-3 text-slate-400 text-sm font-medium">Status</th>
                            <th className="text-right p-3 text-slate-400 text-sm font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {rooms?.map((room) => (
                            <tr key={room.id} className="hover:bg-slate-700/30">
                                <td className="p-3 text-white font-medium">{room.room_number}</td>
                                <td className="p-3 text-slate-300">{room.room_type}</td>
                                <td className="p-3 text-slate-300">{room.floor_number ?? '-'}</td>
                                <td className="p-3 text-slate-300">{room.max_occupancy}</td>
                                <td className="p-3 text-status-available">₦{room.night_rate.toLocaleString()}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-1 rounded-full text-xs ${room.status === 'available' ? 'bg-status-available/20 text-status-available' :
                                        room.status === 'occupied' ? 'bg-status-occupied/20 text-status-occupied' :
                                            room.status === 'dirty' ? 'bg-status-dirty/20 text-status-dirty' :
                                                'bg-status-maintenance/20 text-status-maintenance'
                                        }`}>
                                        {room.status}
                                    </span>
                                </td>
                                <td className="p-3 text-right">
                                    <button
                                        onClick={() => handleEdit(room)}
                                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(room)}
                                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showForm && (
                <RoomForm
                    room={editingRoom}
                    onClose={() => { setShowForm(false); setEditingRoom(null); }}
                    onSuccess={() => { setShowForm(false); setEditingRoom(null); }}
                />
            )}
        </div>
    );
}

// Room Form Modal
function RoomForm({
    room,
    onClose,
    onSuccess,
}: {
    room: Room | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Get custom room types
    const { data: roomTypes } = useRoomTypes();

    const [formData, setFormData] = useState({
        room_number: room?.room_number ?? '',
        room_type: room?.room_type ?? '',
        floor_number: room?.floor_number ?? 1,
        max_occupancy: room?.max_occupancy ?? 2,
        night_rate: room?.night_rate ?? 0,
        short_rest_hourly_rate: room?.short_rest_hourly_rate ?? 0,
        amenities: room?.amenities?.join(', ') ?? '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const amenities = formData.amenities.split(',').map(a => a.trim()).filter(Boolean);

            if (room) {
                await updateRoom(room.id, {
                    room_number: formData.room_number,
                    room_type: formData.room_type,
                    floor_number: Number(formData.floor_number),
                    max_occupancy: Number(formData.max_occupancy),
                    night_rate: Number(formData.night_rate),
                    short_rest_hourly_rate: Number(formData.short_rest_hourly_rate),
                    amenities,
                });
            } else {
                await createRoom({
                    room_number: formData.room_number,
                    room_type: formData.room_type,
                    floor_number: Number(formData.floor_number),
                    max_occupancy: Number(formData.max_occupancy),
                    night_rate: Number(formData.night_rate),
                    short_rest_hourly_rate: Number(formData.short_rest_hourly_rate),
                    amenities,
                    status: 'available',
                });
            }
            onSuccess();
        } catch (err) {
            toast.error('Failed to save room', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md">
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-white">{room ? 'Edit Room' : 'Add New Room'}</h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Room Number *</label>
                            <input
                                value={formData.room_number}
                                onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
                                className="input"
                                required
                            />
                        </div>
                        <div>
                            <label className="label">Room Type *</label>
                            <select
                                value={formData.room_type}
                                onChange={(e) => setFormData({ ...formData, room_type: e.target.value })}
                                className="input"
                                required
                            >
                                <option value="">Select room type...</option>
                                {roomTypes?.map((rt) => (
                                    <option key={rt.id} value={rt.name}>{rt.name}</option>
                                ))}
                                {(!roomTypes || roomTypes.length === 0) && (
                                    <option disabled>No room types defined - add them in Settings → Room Types</option>
                                )}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Floor</label>
                            <input
                                type="number"
                                value={formData.floor_number}
                                onChange={(e) => setFormData({ ...formData, floor_number: Number(e.target.value) })}
                                className="input"
                                min="0"
                            />
                        </div>
                        <div>
                            <label className="label">Max Guests</label>
                            <input
                                type="number"
                                value={formData.max_occupancy}
                                onChange={(e) => setFormData({ ...formData, max_occupancy: Number(e.target.value) })}
                                className="input"
                                min="1"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Night Rate (₦)</label>
                            <input
                                type="number"
                                value={formData.night_rate}
                                onChange={(e) => setFormData({ ...formData, night_rate: Number(e.target.value) })}
                                className="input"
                                min="0"
                            />
                        </div>
                        <div>
                            <label className="label">Short Rest/hr (₦)</label>
                            <input
                                type="number"
                                value={formData.short_rest_hourly_rate}
                                onChange={(e) => setFormData({ ...formData, short_rest_hourly_rate: Number(e.target.value) })}
                                className="input"
                                min="0"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">Amenities (comma-separated)</label>
                        <input
                            value={formData.amenities}
                            onChange={(e) => setFormData({ ...formData, amenities: e.target.value })}
                            className="input"
                            placeholder="AC, TV, WiFi, Mini Bar"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
                            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Save size={16} className="mr-2" />{room ? 'Save' : 'Create'}</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
