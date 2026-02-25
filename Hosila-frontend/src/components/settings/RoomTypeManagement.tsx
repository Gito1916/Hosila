import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createRoomType, updateRoomType, deleteRoomType as apiDeleteRoomType } from '@/lib/api';
import { requireSupabase, getHotelId } from '@/lib/api';
import { useRoomTypes } from '@/hooks/useSupabaseData';
import { toast } from '@/lib/errorMessages';
import type { RoomType } from '@/types';
import {
    Plus,
    Edit2,
    Trash2,
    Tag,
    X,
    Loader2,
    Save,
} from 'lucide-react';

export function RoomTypeManagement() {
    const [showForm, setShowForm] = useState(false);
    const [editingType, setEditingType] = useState<RoomType | null>(null);

    const queryClient = useQueryClient();
    const { data: roomTypes } = useRoomTypes();

    const handleEdit = (roomType: RoomType) => {
        setEditingType(roomType);
        setShowForm(true);
    };

    const handleDelete = async (roomType: RoomType) => {
        // Check if any rooms use this type
        const sb = requireSupabase();
        const hotelId = await getHotelId();
        const { count } = await sb.from('rooms').select('id', { count: 'exact', head: true }).eq('hotel_id', hotelId).eq('room_type', roomType.name);
        if ((count ?? 0) > 0) {
            toast.warn('Cannot delete room type', `${count} room(s) are still using this type. Reassign them first.`);
            return;
        }

        if (confirm(`Delete room type "${roomType.name}"?`)) {
            try {
                await apiDeleteRoomType(roomType.id);
                queryClient.invalidateQueries({ queryKey: ['room-types'] });
            } catch (err) {
                toast.error('Failed to delete room type', err);
            }
        }
    };

    return (
        <div className="card">
            <div className="p-4 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-heading flex items-center gap-2">
                    <Tag size={18} />
                    Room Types
                </h3>
                <button
                    onClick={() => { setEditingType(null); setShowForm(true); }}
                    className="btn btn-primary text-sm"
                >
                    <Plus size={16} className="mr-1" />
                    Add Type
                </button>
            </div>

            <div className="p-4">
                {roomTypes && roomTypes.length > 0 ? (
                    <div className="grid gap-2">
                        {roomTypes.map((rt) => (
                            <div
                                key={rt.id}
                                className="flex items-center justify-between p-3 bg-surface-raised/30 rounded-lg"
                            >
                                <div>
                                    <div className="text-heading font-medium">{rt.name}</div>
                                    {rt.description && (
                                        <div className="text-xs text-muted">{rt.description}</div>
                                    )}
                                    <div className="text-sm text-status-available mt-1">
                                        Base Rate: ₦{rt.base_rate.toLocaleString()}
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleEdit(rt)}
                                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(rt)}
                                        className="p-2 text-muted hover:text-red-400 hover:bg-surface-raised rounded-lg"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted">
                        <Tag size={32} className="mx-auto mb-2 opacity-50" />
                        <p>No room types defined</p>
                        <p className="text-xs mt-1">Add room types like "Standard", "Deluxe", "Suite"</p>
                    </div>
                )}
            </div>

            {showForm && (
                <RoomTypeForm
                    roomType={editingType}
                    onClose={() => { setShowForm(false); setEditingType(null); }}
                    onSuccess={() => { setShowForm(false); setEditingType(null); }}
                />
            )}
        </div>
    );
}

// Room Type Form Modal
function RoomTypeForm({
    roomType,
    onClose,
    onSuccess,
}: {
    roomType: RoomType | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: roomType?.name ?? '',
        description: roomType?.description ?? '',
        base_rate: roomType?.base_rate ?? 0,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) return;

        setIsSubmitting(true);

        try {
            if (roomType) {
                // Update existing
                await updateRoomType(roomType.id, {
                    name: formData.name.trim(),
                    description: formData.description.trim() || undefined,
                    base_rate: Number(formData.base_rate),
                });
            } else {
                // Create new
                await createRoomType({
                    name: formData.name.trim(),
                    description: formData.description.trim() || undefined,
                    base_rate: Number(formData.base_rate),
                } as any);
            }
            onSuccess();
        } catch (err) {
            toast.error('Failed to save room type', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-md">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold text-heading">{roomType ? 'Edit Room Type' : 'Add Room Type'}</h2>
                    <button onClick={onClose} className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="label">Type Name *</label>
                        <input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="input"
                            placeholder="e.g., Standard, Deluxe, Suite"
                            required
                        />
                    </div>

                    <div>
                        <label className="label">Description</label>
                        <input
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="input"
                            placeholder="Brief description (optional)"
                        />
                    </div>

                    <div>
                        <label className="label">Base Rate (₦)</label>
                        <input
                            type="number"
                            value={formData.base_rate}
                            onChange={(e) => setFormData({ ...formData, base_rate: Number(e.target.value) })}
                            className="input"
                            min="0"
                            placeholder="Default rate for this type"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
                            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Save size={16} className="mr-2" />{roomType ? 'Save' : 'Create'}</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
