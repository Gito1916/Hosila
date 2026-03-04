import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/stores/authStore';
import { createReservation, updateReservation, checkConflicts } from '@/db/reservations';
import { useQuery } from '@tanstack/react-query';
import type { Reservation, ReservationSource } from '@/types';
import { format, addDays, differenceInDays } from 'date-fns';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { requireSupabase, getHotelId } from '@/lib/api';

// Optional guest data for prefilling from Guest Directory
interface PrefilledGuest {
    id: string;
    name: string;
    phone?: string;
    email?: string;
}

interface ReservationFormProps {
    reservation?: Reservation; // If editing
    onClose: () => void;
    onSuccess: () => void;
    prefilledGuest?: PrefilledGuest; // For returning guests from Guest Directory
}

interface FormData {
    guestName: string;
    guestPhone: string;
    guestEmail: string;
    roomId: string;
    checkInDate: string;
    checkOutDate: string;
    source: ReservationSource;
    depositPaid: number;
    notes: string;
}

const sourceOptions: { value: ReservationSource; label: string }[] = [
    { value: 'walk-in', label: 'Walk-in' },
    { value: 'phone', label: 'Phone' },
    { value: 'booking.com', label: 'Booking.com' },
    { value: 'airbnb', label: 'Airbnb' },
    { value: 'direct', label: 'Direct (Website)' },
];

export function ReservationForm({ reservation, onClose, onSuccess, prefilledGuest }: ReservationFormProps) {
    const user = useAuthStore((state) => state.user);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflictWarning, setConflictWarning] = useState<string | null>(null);

    // Get available rooms
    const { data: rooms } = useQuery({ queryKey: ['rooms'], queryFn: async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('rooms').select('*').eq('hotel_id', hotelId); return data ?? []; } });

    // Get guest info if editing
    const { data: existingGuest } = useQuery({ queryKey: ['guests', reservation?.guest_id], queryFn: async () => { const sb = requireSupabase(); const { data } = await sb.from('guests').select('*').eq('id', reservation?.guest_id).single(); return data; }, enabled: !!reservation });

    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const dayAfterTomorrow = format(addDays(new Date(), 2), 'yyyy-MM-dd');

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors },
    } = useForm<FormData>({
        defaultValues: {
            guestName: prefilledGuest?.name ?? '',
            guestPhone: prefilledGuest?.phone ?? '',
            guestEmail: prefilledGuest?.email ?? '',
            roomId: '',
            checkInDate: tomorrow,
            checkOutDate: dayAfterTomorrow,
            source: 'phone',
            depositPaid: 0,
            notes: '',
        },
    });

    // Populate form when editing
    useEffect(() => {
        if (reservation && existingGuest) {
            setValue('guestName', existingGuest.name);
            setValue('guestPhone', existingGuest.phone ?? '');
            setValue('guestEmail', existingGuest.email ?? '');
            setValue('roomId', reservation.room_id ?? '');
            setValue('checkInDate', format(new Date(reservation.check_in_date), 'yyyy-MM-dd'));
            setValue('checkOutDate', format(new Date(reservation.check_out_date), 'yyyy-MM-dd'));
            setValue('source', reservation.source);
            setValue('depositPaid', reservation.deposit_paid);
            setValue('notes', reservation.notes ?? '');
        }
    }, [reservation, existingGuest, setValue]);

    const roomId = watch('roomId');
    const checkInDate = watch('checkInDate');
    const checkOutDate = watch('checkOutDate');

    // Calculate nights
    const nights = checkInDate && checkOutDate
        ? differenceInDays(new Date(checkOutDate), new Date(checkInDate))
        : 0;

    // Get selected room rate
    const selectedRoom = rooms?.find(r => r.id === roomId);
    const totalAmount = selectedRoom ? selectedRoom.night_rate * nights : 0;

    // Check for conflicts when room or dates change
    useEffect(() => {
        async function checkForConflicts() {
            if (!roomId || !checkInDate || !checkOutDate) {
                setConflictWarning(null);
                return;
            }

            try {
                const conflicts = await checkConflicts(
                    roomId,
                    new Date(checkInDate),
                    new Date(checkOutDate),
                    reservation?.id
                );

                if (conflicts.length > 0) {
                    setConflictWarning(`This room has ${conflicts.length} conflicting reservation(s) for selected dates`);
                } else {
                    setConflictWarning(null);
                }
            } catch {
                setConflictWarning(null);
            }
        }

        checkForConflicts();
    }, [roomId, checkInDate, checkOutDate, reservation?.id]);

    const onSubmit = async (data: FormData) => {
        if (!user) return;

        setIsSubmitting(true);
        setError(null);

        try {
            if (reservation) {
                // Update existing
                await updateReservation(
                    reservation.id,
                    {
                        roomId: data.roomId,
                        checkInDate: new Date(data.checkInDate),
                        checkOutDate: new Date(data.checkOutDate),
                        depositPaid: data.depositPaid,
                        notes: data.notes,
                    },
                    user.id
                );
            } else {
                // Create new
                await createReservation({
                    guestName: data.guestName,
                    guestPhone: data.guestPhone || undefined,
                    guestEmail: data.guestEmail || undefined,
                    roomId: data.roomId,
                    checkInDate: new Date(data.checkInDate),
                    checkOutDate: new Date(data.checkOutDate),
                    source: data.source,
                    depositPaid: data.depositPaid,
                    notes: data.notes || undefined,
                    createdBy: user.id,
                });
            }

            onSuccess();
        } catch (err) {
            console.error('Reservation error:', err);
            setError(err instanceof Error ? err.message : 'Failed to save reservation');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold text-heading">
                        {reservation ? 'Edit Reservation' : 'New Reservation'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {conflictWarning && (
                        <div className="p-3 bg-amber-500/20 border border-amber-500/50 rounded-lg text-amber-400 text-sm flex items-center gap-2">
                            <AlertTriangle size={16} />
                            {conflictWarning}
                        </div>
                    )}

                    {/* Guest Name */}
                    <div>
                        <label className="label">Guest Name *</label>
                        <input
                            {...register('guestName', { required: 'Guest name is required' })}
                            className={`input ${errors.guestName ? 'input-error' : ''}`}
                            placeholder="Enter guest name"
                        />
                        {errors.guestName && (
                            <p className="text-xs text-error mt-1">{errors.guestName.message}</p>
                        )}
                    </div>

                    {/* Guest Contact */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Phone</label>
                            <input
                                {...register('guestPhone')}
                                className="input"
                                placeholder="+234-xxx-xxx"
                            />
                        </div>
                        <div>
                            <label className="label">Email</label>
                            <input
                                {...register('guestEmail')}
                                type="email"
                                className="input"
                                placeholder="guest@email.com"
                            />
                        </div>
                    </div>

                    {/* Room Selection */}
                    <div>
                        <label className="label">Room *</label>
                        <select
                            {...register('roomId', { required: 'Please select a room' })}
                            className={`input ${errors.roomId ? 'input-error' : ''}`}
                        >
                            <option value="">Select a room</option>
                            {rooms?.map((room) => (
                                <option key={room.id} value={room.id}>
                                    Room {room.room_number} - {room.room_type} (₦{room.night_rate.toLocaleString()}/night)
                                </option>
                            ))}
                        </select>
                        {errors.roomId && (
                            <p className="text-xs text-error mt-1">{errors.roomId.message}</p>
                        )}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Check-in Date *</label>
                            <input
                                {...register('checkInDate', {
                                    required: 'Check-in date is required',
                                    validate: (value) => {
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        const checkInDate = new Date(value);
                                        if (checkInDate < today) {
                                            return 'Check-in date cannot be in the past';
                                        }
                                        return true;
                                    }
                                })}
                                type="date"
                                min={format(new Date(), 'yyyy-MM-dd')}
                                className={`input ${errors.checkInDate ? 'input-error' : ''}`}
                            />
                            {errors.checkInDate && (
                                <p className="text-xs text-error mt-1">{errors.checkInDate.message}</p>
                            )}
                        </div>
                        <div>
                            <label className="label">Check-out Date *</label>
                            <input
                                {...register('checkOutDate', {
                                    required: 'Check-out date is required',
                                    validate: (value) => {
                                        const checkIn = new Date(watch('checkInDate'));
                                        const checkOut = new Date(value);
                                        if (checkOut <= checkIn) {
                                            return 'Check-out must be after check-in';
                                        }
                                        return true;
                                    }
                                })}
                                type="date"
                                min={checkInDate ? format(addDays(new Date(checkInDate), 1), 'yyyy-MM-dd') : format(addDays(new Date(), 1), 'yyyy-MM-dd')}
                                className={`input ${errors.checkOutDate ? 'input-error' : ''}`}
                            />
                            {errors.checkOutDate && (
                                <p className="text-xs text-error mt-1">{errors.checkOutDate.message}</p>
                            )}
                        </div>
                    </div>

                    {/* Nights summary */}
                    {nights > 0 && selectedRoom && (
                        <div className="bg-surface-raised/50 rounded-lg p-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted">{nights} night{nights !== 1 ? 's' : ''} × ₦{selectedRoom.night_rate.toLocaleString()}</span>
                                <span className="text-heading font-medium">₦{totalAmount.toLocaleString()}</span>
                            </div>
                        </div>
                    )}

                    {/* Source */}
                    <div>
                        <label className="label">Booking Source</label>
                        <select {...register('source')} className="input">
                            {sourceOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Deposit */}
                    <div>
                        <label className="label">Deposit Paid</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₦</span>
                            <input
                                {...register('depositPaid', { valueAsNumber: true, min: 0 })}
                                type="number"
                                className="input pl-8"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="label">Notes</label>
                        <textarea
                            {...register('notes')}
                            className="input"
                            rows={2}
                            placeholder="Special requests, arrival time, etc."
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !!conflictWarning}
                            className="btn btn-primary flex-1"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={18} className="animate-spin mr-2" />
                                    Saving...
                                </>
                            ) : reservation ? (
                                'Update Reservation'
                            ) : (
                                'Create Reservation'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
