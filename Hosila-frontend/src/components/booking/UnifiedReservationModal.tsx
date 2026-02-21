import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/stores/authStore';
import { createReservation, checkConflicts } from '@/db/reservations';
import { useQuery } from '@tanstack/react-query';
import type { ReservationSource } from '@/types';
import { format, addDays, differenceInDays } from 'date-fns';
import { X, Loader2, AlertTriangle, Car } from 'lucide-react';
import { getHotel } from '@/db/settings';
import { requireSupabase, getHotelId } from '@/lib/api';

interface PrefilledGuest {
    id?: string;
    name: string;
    phone?: string;
    email?: string;
    gender?: 'male' | 'female' | 'other';
}

interface UnifiedReservationModalProps {
    onClose: () => void;
    onSuccess: () => void;
    prefilledGuest?: PrefilledGuest;
    preselectedRoomId?: string;
    preselectedDate?: Date;
}

interface FormData {
    guestName: string;
    guestPhone: string;
    guestEmail: string;
    guestGender: 'male' | 'female' | 'other';
    guestIdType: string;
    guestIdNumber: string;
    vehicleNumber: string;
    vehicleModel: string;
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

export function UnifiedReservationModal({
    onClose,
    onSuccess,
    prefilledGuest,
    preselectedRoomId,
    preselectedDate
}: UnifiedReservationModalProps) {
    const user = useAuthStore((state) => state.user);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflictWarning, setConflictWarning] = useState<string | null>(null);
    const [showVehicle, setShowVehicle] = useState(false);

    // Get available rooms
    const { data: rooms } = useQuery({ queryKey: ['rooms'], queryFn: async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('rooms').select('*').eq('hotel_id', hotelId); return data ?? []; } });

    // Get hotel settings for tax
    const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: getHotel });
    const taxRate = hotel?.settings?.accommodation_tax_rate ?? hotel?.settings?.tax_rate ?? 0;

    const defaultDate = preselectedDate ?? addDays(new Date(), 1);
    const tomorrow = format(defaultDate, 'yyyy-MM-dd');
    const dayAfterTomorrow = format(addDays(defaultDate, 1), 'yyyy-MM-dd');

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<FormData>({
        defaultValues: {
            guestName: prefilledGuest?.name ?? '',
            guestPhone: prefilledGuest?.phone ?? '',
            guestEmail: prefilledGuest?.email ?? '',
            guestGender: prefilledGuest?.gender ?? 'male',
            guestIdType: 'national_id',
            guestIdNumber: '',
            vehicleNumber: '',
            vehicleModel: '',
            roomId: preselectedRoomId ?? '',
            checkInDate: tomorrow,
            checkOutDate: dayAfterTomorrow,
            source: 'phone',
            depositPaid: 0,
            notes: '',
        },
    });

    const roomId = watch('roomId');
    const checkInDate = watch('checkInDate');
    const checkOutDate = watch('checkOutDate');
    const depositPaid = watch('depositPaid');

    // Calculate nights
    const nights = checkInDate && checkOutDate
        ? Math.max(0, differenceInDays(new Date(checkOutDate), new Date(checkInDate)))
        : 0;

    // Get selected room rate
    const selectedRoom = rooms?.find(r => r.id === roomId);
    const subtotal = selectedRoom ? selectedRoom.night_rate * nights : 0;
    const taxAmount = Math.round(subtotal * (taxRate / 100));
    const totalAmount = subtotal + taxAmount;
    const balance = totalAmount - depositPaid;

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
                    new Date(checkOutDate)
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
    }, [roomId, checkInDate, checkOutDate]);

    // Date validation
    const validateCheckOutDate = (value: string) => {
        if (!checkInDate) return true;
        return new Date(value) > new Date(checkInDate) || 'Check-out must be after check-in';
    };

    const validateCheckInDate = (value: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return new Date(value) >= today || 'Check-in cannot be in the past';
    };

    const onSubmit = async (data: FormData) => {
        if (!user) return;

        setIsSubmitting(true);
        setError(null);

        try {
            await createReservation({
                guestName: data.guestName,
                guestPhone: data.guestPhone || undefined,
                guestEmail: data.guestEmail || undefined,
                guestGender: data.guestGender,
                guestIdType: data.guestIdType || undefined,
                guestIdNumber: data.guestIdNumber || undefined,
                vehicleNumber: data.vehicleNumber || undefined,
                vehicleModel: data.vehicleModel || undefined,
                roomId: data.roomId,
                checkInDate: new Date(data.checkInDate),
                checkOutDate: new Date(data.checkOutDate),
                source: data.source,
                depositPaid: data.depositPaid,
                notes: data.notes || undefined,
                createdBy: user.id,
                existingGuestId: prefilledGuest?.id,
            });

            onSuccess();
        } catch (err) {
            console.error('Reservation error:', err);
            setError(err instanceof Error ? err.message : 'Failed to create reservation');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
                    <h2 className="text-xl font-bold text-white">New Reservation</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
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

                    {/* Phone & Email */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Phone</label>
                            <input
                                {...register('guestPhone')}
                                className="input"
                                placeholder="+234..."
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

                    {/* Gender & ID */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="label">Gender</label>
                            <select {...register('guestGender')} className="input">
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">ID Type</label>
                            <select {...register('guestIdType')} className="input">
                                <option value="national_id">National ID</option>
                                <option value="passport">Passport</option>
                                <option value="drivers_license">Driver's License</option>
                                <option value="voters_card">Voter's Card</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">ID Number</label>
                            <input
                                {...register('guestIdNumber')}
                                className="input"
                                placeholder="Optional"
                            />
                        </div>
                    </div>

                    {/* Vehicle Section */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowVehicle(!showVehicle)}
                            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
                        >
                            <Car size={16} />
                            {showVehicle ? 'Hide' : 'Add'} Vehicle Info (Optional)
                        </button>
                        {showVehicle && (
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <div>
                                    <label className="label">Vehicle Number</label>
                                    <input {...register('vehicleNumber')} className="input" placeholder="ABC-123-XY" />
                                </div>
                                <div>
                                    <label className="label">Vehicle Model</label>
                                    <input {...register('vehicleModel')} className="input" placeholder="Toyota Camry" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Room Selection */}
                    <div>
                        <label className="label">Room *</label>
                        <select
                            {...register('roomId', { required: 'Room is required' })}
                            className={`input ${errors.roomId ? 'input-error' : ''}`}
                        >
                            <option value="">Select a room</option>
                            {rooms?.map(room => (
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
                                type="date"
                                {...register('checkInDate', {
                                    required: 'Required',
                                    validate: validateCheckInDate
                                })}
                                className={`input ${errors.checkInDate ? 'input-error' : ''}`}
                            />
                            {errors.checkInDate && (
                                <p className="text-xs text-error mt-1">{errors.checkInDate.message}</p>
                            )}
                        </div>
                        <div>
                            <label className="label">Check-out Date *</label>
                            <input
                                type="date"
                                {...register('checkOutDate', {
                                    required: 'Required',
                                    validate: validateCheckOutDate
                                })}
                                className={`input ${errors.checkOutDate ? 'input-error' : ''}`}
                            />
                            {errors.checkOutDate && (
                                <p className="text-xs text-error mt-1">{errors.checkOutDate.message}</p>
                            )}
                        </div>
                    </div>

                    {/* Source */}
                    <div>
                        <label className="label">Reservation Source</label>
                        <select {...register('source')} className="input">
                            {sourceOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Pricing Summary */}
                    {selectedRoom && nights > 0 && (
                        <div className="bg-slate-700/50 rounded-lg p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">
                                    ₦{selectedRoom.night_rate.toLocaleString()} × {nights} night{nights !== 1 ? 's' : ''}
                                </span>
                                <span className="text-white">₦{subtotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Tax ({taxRate}%)</span>
                                <span className="text-white">₦{taxAmount.toLocaleString()}</span>
                            </div>
                            <div className="border-t border-slate-600 pt-2 flex justify-between">
                                <span className="text-slate-300 font-medium">Total</span>
                                <span className="text-white font-bold">₦{totalAmount.toLocaleString()}</span>
                            </div>
                        </div>
                    )}

                    {/* Deposit */}
                    <div>
                        <label className="label">Deposit Paid (Free Entry)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₦</span>
                            <input
                                type="number"
                                {...register('depositPaid', { valueAsNumber: true, min: 0 })}
                                className="input pl-8"
                                placeholder="0"
                            />
                        </div>
                        {totalAmount > 0 && (
                            <p className="text-xs text-slate-500 mt-1">
                                Balance due at check-in: ₦{balance.toLocaleString()}
                            </p>
                        )}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="label">Notes</label>
                        <textarea
                            {...register('notes')}
                            className="input"
                            rows={2}
                            placeholder="Special requests, preferences..."
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={18} className="animate-spin mr-2" />
                                    Saving...
                                </>
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
