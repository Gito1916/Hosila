import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/stores/authStore';
import { createReservation, checkConflicts } from '@/db/reservations';
import { useQuery } from '@tanstack/react-query';
import type { ReservationSource } from '@/types';
import { format, addDays, differenceInDays } from 'date-fns';
import { X, Loader2, AlertTriangle, Car } from 'lucide-react';
import { getHotel } from '@/db/settings';
import { requireSupabase, getHotelId } from '@/lib/api';
import { taxApi } from '@/lib/apiClient';

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

// ────────────────────────────────────────────────────────────
// Availability helper – returns a map of room_id → status hint
// ────────────────────────────────────────────────────────────
interface RoomAvailHint {
    available: boolean;
    hint?: string;  // e.g. "Free from Mar 5" or "Booked"
}

async function fetchRoomAvailability(
    checkIn: string,
    checkOut: string
): Promise<Record<string, RoomAvailHint>> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    // Fetch reservations that overlap
    const { data: reservations } = await sb
        .from('reservations')
        .select('room_id, check_in_date, check_out_date')
        .eq('hotel_id', hotelId)
        .in('status', ['confirmed', 'pending'])
        .lt('check_in_date', checkOut)
        .gt('check_out_date', checkIn);

    // Fetch active bookings that overlap
    const { data: bookings } = await sb
        .from('bookings')
        .select('room_id, check_in_time, check_out_time')
        .eq('hotel_id', hotelId)
        .eq('status', 'active')
        .lt('check_in_time', checkOut)
        .gt('check_out_time', checkIn);

    const hints: Record<string, RoomAvailHint> = {};

    // Mark rooms with overlapping reservations
    for (const r of reservations ?? []) {
        const resCheckOut = new Date(r.check_out_date);
        const reqCheckIn = new Date(checkIn);
        // If the reservation ends during our range, room is free after that
        if (resCheckOut > reqCheckIn && resCheckOut < new Date(checkOut)) {
            hints[r.room_id] = {
                available: false,
                hint: `Free from ${format(resCheckOut, 'MMM d')}`,
            };
        } else {
            hints[r.room_id] = { available: false, hint: 'Booked' };
        }
    }

    // Mark rooms with active bookings
    for (const b of bookings ?? []) {
        if (!hints[b.room_id]) {
            const bookingOut = new Date(b.check_out_time);
            if (bookingOut < new Date(checkOut)) {
                hints[b.room_id] = {
                    available: false,
                    hint: `Free from ${format(bookingOut, 'MMM d')}`,
                };
            } else {
                hints[b.room_id] = { available: false, hint: 'Occupied' };
            }
        }
    }

    return hints;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

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

    // Tax breakdown state (SC + VAT + TDL)
    const [scAmount, setScAmount] = useState(0);
    const [vatAmount, setVatAmount] = useState(0);
    const [tdlAmount, setTdlAmount] = useState(0);
    const [totalWithTax, setTotalWithTax] = useState(0);

    // Room availability hints keyed by room_id
    const [availHints, setAvailHints] = useState<Record<string, RoomAvailHint>>({});
    const [loadingAvail, setLoadingAvail] = useState(false);

    // Get available rooms
    const { data: rooms } = useQuery({
        queryKey: ['rooms'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb
                .from('rooms')
                .select('*')
                .eq('hotel_id', hotelId)
                .in('status', ['available', 'occupied']); // exclude maintenance
            return data ?? [];
        }
    });

    // Get hotel settings for fallback tax rate
    const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: getHotel });
    const fallbackTaxRate = hotel?.settings?.accommodation_tax_rate ?? hotel?.settings?.tax_rate ?? 0;

    // Today's date for min attribute
    const today = format(new Date(), 'yyyy-MM-dd');
    const defaultDate = preselectedDate ?? addDays(new Date(), 1);
    const defaultCheckIn = format(defaultDate, 'yyyy-MM-dd');
    const defaultCheckOut = format(addDays(defaultDate, 1), 'yyyy-MM-dd');

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
            guestGender: prefilledGuest?.gender ?? 'male',
            guestIdType: 'national_id',
            guestIdNumber: '',
            vehicleNumber: '',
            vehicleModel: '',
            roomId: preselectedRoomId ?? '',
            checkInDate: defaultCheckIn,
            checkOutDate: defaultCheckOut,
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
    const balance = totalWithTax - (depositPaid || 0);

    // ── Fetch room availability when dates change ──

    useEffect(() => {
        if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) {
            setAvailHints({});
            return;
        }
        let cancelled = false;
        setLoadingAvail(true);
        fetchRoomAvailability(checkInDate, checkOutDate)
            .then(hints => { if (!cancelled) setAvailHints(hints); })
            .catch(() => { if (!cancelled) setAvailHints({}); })
            .finally(() => { if (!cancelled) setLoadingAvail(false); });
        return () => { cancelled = true; };
    }, [checkInDate, checkOutDate]);

    // ── Fetch tax breakdown when subtotal changes ──

    const fetchTaxBreakdown = useCallback(async (baseAmount: number) => {
        if (baseAmount <= 0) {
            setScAmount(0); setVatAmount(0); setTdlAmount(0);
            setTotalWithTax(0);
            return;
        }
        try {
            const breakdown = await taxApi.calculate(baseAmount, 'accommodation');
            setScAmount(Number(breakdown.service_charge.amount));
            setVatAmount(Number(breakdown.vat.amount));
            setTdlAmount(Number(breakdown.tdl.amount));
            setTotalWithTax(Number(breakdown.total));
        } catch {
            // Fallback to local single-rate calculation
            const tax = Math.round(baseAmount * (fallbackTaxRate / 100));
            setScAmount(0);
            setVatAmount(tax);
            setTdlAmount(0);
            setTotalWithTax(baseAmount + tax);
        }
    }, [fallbackTaxRate]);

    useEffect(() => {
        fetchTaxBreakdown(subtotal);
    }, [subtotal, fetchTaxBreakdown]);

    // ── Check for conflicts when room or dates change ──

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

    // ── Auto update check-out min date when check-in changes ──

    useEffect(() => {
        if (checkInDate && checkOutDate && checkOutDate <= checkInDate) {
            setValue('checkOutDate', format(addDays(new Date(checkInDate), 1), 'yyyy-MM-dd'));
        }
    }, [checkInDate, checkOutDate, setValue]);

    // ── Submit ──

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

    // Sort rooms: available first, then unavailable
    const sortedRooms = [...(rooms ?? [])].sort((a, b) => {
        const aAvail = !availHints[a.id] || availHints[a.id].available;
        const bAvail = !availHints[b.id] || availHints[b.id].available;
        if (aAvail && !bAvail) return -1;
        if (!aAvail && bAvail) return 1;
        return (a.room_number || '').localeCompare(b.room_number || '', undefined, { numeric: true });
    });

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface-card z-10">
                    <h2 className="text-xl font-bold text-heading">New Reservation</h2>
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
                            className="flex items-center gap-2 text-sm text-muted hover:text-heading"
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

                    {/* ── DATES (moved BEFORE room selection) ── */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Check-in Date *</label>
                            <input
                                type="date"
                                min={today}
                                {...register('checkInDate', {
                                    required: 'Required',
                                    validate: (value) => {
                                        const todayDate = new Date();
                                        todayDate.setHours(0, 0, 0, 0);
                                        return new Date(value) >= todayDate || 'Check-in cannot be in the past';
                                    }
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
                                min={checkInDate || today}
                                {...register('checkOutDate', {
                                    required: 'Required',
                                    validate: (value) => {
                                        if (!checkInDate) return true;
                                        return new Date(value) > new Date(checkInDate) || 'Check-out must be after check-in';
                                    }
                                })}
                                className={`input ${errors.checkOutDate ? 'input-error' : ''}`}
                            />
                            {errors.checkOutDate && (
                                <p className="text-xs text-error mt-1">{errors.checkOutDate.message}</p>
                            )}
                        </div>
                    </div>

                    {nights > 0 && (
                        <p className="text-xs text-muted -mt-2">{nights} night{nights !== 1 ? 's' : ''}</p>
                    )}

                    {/* ── ROOM SELECTION (after dates, filtered by availability) ── */}
                    <div>
                        <label className="label">
                            Room *
                            {loadingAvail && (
                                <span className="ml-2 text-xs text-muted">
                                    <Loader2 size={12} className="inline animate-spin mr-1" />
                                    Checking availability...
                                </span>
                            )}
                        </label>
                        <select
                            {...register('roomId', { required: 'Room is required' })}
                            className={`input ${errors.roomId ? 'input-error' : ''}`}
                        >
                            <option value="">Select a room</option>
                            {sortedRooms.map(room => {
                                const hint = availHints[room.id];
                                const isUnavailable = hint && !hint.available;
                                // Also mark maintenance rooms
                                const isMaintenance = room.status === 'maintenance';
                                const label = `Room ${room.room_number} – ${room.room_type} (₦${room.night_rate.toLocaleString()}/night)`;
                                const suffix = isMaintenance
                                    ? ' — Maintenance'
                                    : isUnavailable
                                        ? ` — ${hint.hint}`
                                        : '';

                                return (
                                    <option
                                        key={room.id}
                                        value={room.id}
                                        disabled={isUnavailable || isMaintenance}
                                    >
                                        {label}{suffix}
                                    </option>
                                );
                            })}
                        </select>
                        {errors.roomId && (
                            <p className="text-xs text-error mt-1">{errors.roomId.message}</p>
                        )}
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

                    {/* ── Pricing Summary (full tax breakdown) ── */}
                    {selectedRoom && nights > 0 && (
                        <div className="bg-surface-raised/50 rounded-lg p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted">
                                    ₦{selectedRoom.night_rate.toLocaleString()} × {nights} night{nights !== 1 ? 's' : ''}
                                </span>
                                <span className="text-heading">₦{subtotal.toLocaleString()}</span>
                            </div>

                            {scAmount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted">Service Charge (10%)</span>
                                    <span className="text-heading">₦{scAmount.toLocaleString()}</span>
                                </div>
                            )}
                            {vatAmount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted">VAT (7.5%)</span>
                                    <span className="text-heading">₦{vatAmount.toLocaleString()}</span>
                                </div>
                            )}
                            {tdlAmount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted">TDL (5%)</span>
                                    <span className="text-heading">₦{tdlAmount.toLocaleString()}</span>
                                </div>
                            )}

                            <div className="border-t border-border-strong pt-2 flex justify-between">
                                <span className="text-muted font-medium">Total</span>
                                <span className="text-heading font-bold text-lg">₦{totalWithTax.toLocaleString()}</span>
                            </div>
                        </div>
                    )}

                    {/* Deposit */}
                    <div>
                        <label className="label">Deposit Paid (Free Entry)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₦</span>
                            <input
                                type="number"
                                {...register('depositPaid', { valueAsNumber: true, min: 0 })}
                                className="input pl-8"
                                placeholder="0"
                            />
                        </div>
                        {totalWithTax > 0 && (
                            <p className="text-xs text-muted mt-1">
                                Balance due at check-in: ₦{Math.max(0, balance).toLocaleString()}
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
