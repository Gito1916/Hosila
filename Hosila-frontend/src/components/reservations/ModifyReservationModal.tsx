import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { updateReservation, checkConflicts } from '@/db/reservations';
import { useAuthStore } from '@/stores/authStore';
import type { Reservation } from '@/types';
import { X, Loader2, Calendar, DoorOpen, AlertCircle, Check } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { requireSupabase, getHotelId } from '@/lib/api';

interface ModifyReservationModalProps {
    reservation: Reservation;
    onClose: () => void;
    onSuccess: () => void;
}

export function ModifyReservationModal({ reservation, onClose, onSuccess }: ModifyReservationModalProps) {
    const user = useAuthStore((state) => state.user);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [checkInDate, setCheckInDate] = useState(format(new Date(reservation.check_in_date), 'yyyy-MM-dd'));
    const [checkOutDate, setCheckOutDate] = useState(format(new Date(reservation.check_out_date), 'yyyy-MM-dd'));
    const [selectedRoomId, setSelectedRoomId] = useState(reservation.room_id);
    const [error, setError] = useState<string | null>(null);
    const [conflicts, setConflicts] = useState<string[]>([]);
    const [isChecking, setIsChecking] = useState(false);

    // Get all rooms
    const { data: rooms } = useQuery({ queryKey: ['rooms'], queryFn: async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('rooms').select('*').eq('hotel_id', hotelId); return data ?? []; } });
    const currentRoom = rooms?.find(r => r.id === reservation.room_id);

    // Calculate nights
    const nights = differenceInDays(new Date(checkOutDate), new Date(checkInDate));
    const isValidDates = nights > 0;

    // Check for conflicts when dates or room changes
    useEffect(() => {
        const check = async () => {
            if (!isValidDates) {
                setConflicts([]);
                return;
            }

            setIsChecking(true);
            try {
                const conflictingReservations = await checkConflicts(
                    selectedRoomId,
                    new Date(checkInDate),
                    new Date(checkOutDate),
                    reservation.id // Exclude current reservation
                );

                if (conflictingReservations.length > 0) {
                    setConflicts([`Room has ${conflictingReservations.length} conflicting reservation(s) for these dates`]);
                } else {
                    setConflicts([]);
                }
            } catch (err) {
                console.error('Error checking conflicts:', err);
            } finally {
                setIsChecking(false);
            }
        };

        check();
    }, [checkInDate, checkOutDate, selectedRoomId, reservation.id, isValidDates]);

    // Check if anything changed
    const hasChanges =
        checkInDate !== format(new Date(reservation.check_in_date), 'yyyy-MM-dd') ||
        checkOutDate !== format(new Date(reservation.check_out_date), 'yyyy-MM-dd') ||
        selectedRoomId !== reservation.room_id;

    const handleSave = async () => {
        if (!isValidDates) {
            setError('Check-out date must be after check-in date');
            return;
        }

        if (conflicts.length > 0) {
            setError('Please resolve conflicts before saving');
            return;
        }

        if (!hasChanges) {
            setError('No changes made');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await updateReservation(
                reservation.id,
                {
                    roomId: selectedRoomId !== reservation.room_id ? selectedRoomId : undefined,
                    checkInDate: checkInDate !== format(new Date(reservation.check_in_date), 'yyyy-MM-dd')
                        ? new Date(checkInDate) : undefined,
                    checkOutDate: checkOutDate !== format(new Date(reservation.check_out_date), 'yyyy-MM-dd')
                        ? new Date(checkOutDate) : undefined,
                },
                user?.id || 'unknown'
            );

            onSuccess();
        } catch (err) {
            console.error('Error updating reservation:', err);
            setError(err instanceof Error ? err.message : 'Failed to update reservation');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Get available rooms for the selected dates
    const availableRooms = rooms?.filter(room => {
        // Always include current room
        if (room.id === reservation.room_id) return true;
        // Include rooms that are available
        return room.status === 'available';
    }) || [];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-lg">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Calendar size={20} className="text-primary-400" />
                        <h2 className="text-xl font-bold text-heading">Modify Reservation</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Current Info */}
                    <div className="bg-surface-raised/50 rounded-lg p-3 text-sm">
                        <p className="text-muted">Current: {currentRoom?.room_number} • {format(new Date(reservation.check_in_date), 'MMM d')} - {format(new Date(reservation.check_out_date), 'MMM d, yyyy')}</p>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-center gap-2">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    {/* Date Selection */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Check-in Date</label>
                            <input
                                type="date"
                                value={checkInDate}
                                onChange={(e) => setCheckInDate(e.target.value)}
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="label">Check-out Date</label>
                            <input
                                type="date"
                                value={checkOutDate}
                                onChange={(e) => setCheckOutDate(e.target.value)}
                                className="input"
                            />
                        </div>
                    </div>

                    {isValidDates && (
                        <p className="text-sm text-muted">
                            {nights} night{nights !== 1 ? 's' : ''}
                        </p>
                    )}

                    {!isValidDates && (
                        <p className="text-sm text-red-400">
                            Check-out must be after check-in
                        </p>
                    )}

                    {/* Room Selection */}
                    <div>
                        <label className="label flex items-center gap-2">
                            <DoorOpen size={16} />
                            Room
                        </label>
                        <select
                            value={selectedRoomId}
                            onChange={(e) => setSelectedRoomId(e.target.value)}
                            className="input"
                        >
                            {availableRooms.map((room) => (
                                <option key={room.id} value={room.id}>
                                    Room {room.room_number} - {room.room_type}
                                    {room.id === reservation.room_id ? ' (current)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Conflict Warning */}
                    {isChecking ? (
                        <div className="flex items-center gap-2 text-sm text-muted">
                            <Loader2 size={14} className="animate-spin" />
                            Checking availability...
                        </div>
                    ) : conflicts.length > 0 ? (
                        <div className="p-3 bg-amber-500/20 border border-amber-500/50 rounded-lg text-amber-400 text-sm flex items-center gap-2">
                            <AlertCircle size={16} />
                            {conflicts[0]}
                        </div>
                    ) : hasChanges && isValidDates ? (
                        <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400 text-sm flex items-center gap-2">
                            <Check size={16} />
                            Dates are available
                        </div>
                    ) : null}
                </div>

                {/* Actions */}
                <div className="flex gap-3 p-4 border-t border-border">
                    <button onClick={onClose} className="btn btn-secondary flex-1">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSubmitting || !hasChanges || conflicts.length > 0 || !isValidDates}
                        className="btn btn-primary flex-1"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={18} className="animate-spin mr-2" />
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
