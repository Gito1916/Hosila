import { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/stores/authStore';
import { useHotel } from '@/hooks/useSupabaseData';
import { checkIn } from '@/db/bookings';
import { issueAmenity } from '@/db/inventory';
import type { Room, BookingType, PaymentMethod } from '@/types';
import { addDays, format } from 'date-fns';
import { X, Loader2, Plus, Minus, AlertTriangle } from 'lucide-react';
import { AmenitiesSelection, type AmenitySelection } from './AmenitiesSelection';

// Optional guest data for prefilling from Guest Directory
interface PrefilledGuest {
    id: string;
    name: string;
    phone?: string;
    idType?: string;
    idNumber?: string;
}

interface CheckInModalProps {
    room: Room;
    onClose: () => void;
    onSuccess: () => void;
    prefilledGuest?: PrefilledGuest;
}

interface CheckInFormData {
    guestName: string;
    guestPhone: string;
    guestIdType: string;
    guestIdNumber: string;
    guestOccupation: string;
    guestReasonForVisit: 'business' | 'leisure' | 'medical' | 'family_event' | 'transit' | 'other';
    numGuests: number;
    bookingType: BookingType;
    numNights: number;
    durationHours: number;
    customRate: number;
    paymentMethod: PaymentMethod;
    amountPaid: number;
}

const shortRestPackages = [
    { hours: 1, label: '1 hour' },
    { hours: 2, label: '2 hours' },
    { hours: 3, label: '3 hours' },
    { hours: 6, label: '6 hours' },
    { hours: 12, label: '12 hours' },
];

export function CheckInModal({ room, onClose, onSuccess, prefilledGuest }: CheckInModalProps) {
    const user = useAuthStore((state) => state.user);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [amenitySelections, setAmenitySelections] = useState<AmenitySelection[]>([]);

    // Memoized callback for amenity selection changes
    const handleAmenityChange = useCallback((selections: AmenitySelection[]) => {
        setAmenitySelections(selections);
    }, []);

    // Get hotel settings for tax rate
    const { data: hotel } = useHotel();
    const taxRate = hotel?.settings?.accommodation_tax_rate ?? hotel?.settings?.tax_rate ?? 0;

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors },
    } = useForm<CheckInFormData>({
        defaultValues: {
            guestName: prefilledGuest?.name ?? '',
            guestPhone: prefilledGuest?.phone ?? '',
            guestIdType: prefilledGuest?.idType ?? 'national_id',
            guestIdNumber: prefilledGuest?.idNumber ?? '',
            guestOccupation: '',
            guestReasonForVisit: 'leisure',
            numGuests: 1,
            bookingType: 'night',
            numNights: 1,
            durationHours: 3,
            customRate: room.night_rate,
            paymentMethod: 'cash',
            amountPaid: room.night_rate,
        },
    });

    const bookingType = watch('bookingType');
    const numNights = watch('numNights');
    const durationHours = watch('durationHours');
    const customRate = watch('customRate');
    const amountPaid = watch('amountPaid');

    // Calculate checkout date for night stays
    const checkoutDate = addDays(new Date(), numNights);
    checkoutDate.setHours(12, 0, 0, 0); // Noon checkout

    // Update amountPaid to include VAT when tax rate is loaded
    useEffect(() => {
        if (taxRate > 0) {
            const baseRate = room.night_rate;
            const withTax = baseRate + Math.round(baseRate * (taxRate / 100));
            setValue('amountPaid', withTax);
        }
    }, [taxRate, room.night_rate, setValue]);

    // Calculate rate based on booking type
    const calculateRate = (nights?: number, hours?: number) => {
        if (bookingType === 'night') {
            return room.night_rate * (nights ?? numNights);
        } else {
            // Check for package rate
            const h = hours ?? durationHours;
            const pkg = room.short_rest_packages?.find((p) => p.duration === h);
            if (pkg) {
                return pkg.rate;
            }
            // Calculate hourly rate
            return (room.short_rest_hourly_rate ?? room.night_rate * 0.15) * h;
        }
    };

    // Calculate tax amount
    const subtotal = customRate;
    const taxAmount = Math.round(subtotal * (taxRate / 100));
    const totalWithTax = subtotal + taxAmount;
    const balance = totalWithTax - amountPaid;

    // Update rate when booking type or duration changes
    const suggestedRate = calculateRate();

    // Handle nights increment/decrement
    const incrementNights = () => {
        const newNights = Math.min(numNights + 1, 30);
        setValue('numNights', newNights);
        const rate = room.night_rate * newNights;
        setValue('customRate', rate);
        setValue('amountPaid', rate + Math.round(rate * (taxRate / 100)));
    };

    const decrementNights = () => {
        const newNights = Math.max(numNights - 1, 1);
        setValue('numNights', newNights);
        const rate = room.night_rate * newNights;
        setValue('customRate', rate);
        setValue('amountPaid', rate + Math.round(rate * (taxRate / 100)));
    };

    const onSubmit = async (data: CheckInFormData) => {
        if (!user) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const booking = await checkIn({
                roomId: room.id,
                guestName: data.guestName,
                guestPhone: data.guestPhone || undefined,
                guestIdType: data.guestIdType,
                guestIdNumber: data.guestIdNumber || undefined,
                guestOccupation: data.guestOccupation || undefined,
                guestReasonForVisit: data.guestReasonForVisit,
                bookingType: data.bookingType,
                numGuests: data.numGuests,
                numNights: data.bookingType === 'night' ? data.numNights : undefined,
                rate: data.customRate,
                totalWithTax: data.customRate + Math.round(data.customRate * (taxRate / 100)),
                durationHours: data.bookingType === 'short_rest' ? data.durationHours : undefined,
                paymentMethod: data.paymentMethod,
                amountPaid: data.amountPaid,
                createdBy: user.id,
                existingGuestId: prefilledGuest?.id,
            });

            // Issue amenities if any selected
            if (booking && amenitySelections.length > 0) {
                for (const amenity of amenitySelections) {
                    try {
                        await issueAmenity({
                            bookingId: booking.id,
                            roomId: room.id,
                            itemId: amenity.itemId,
                            quantity: amenity.quantity,
                            issuedBy: user.id,
                        });
                    } catch (amenityError) {
                        console.warn(`Failed to issue amenity ${amenity.itemName}:`, amenityError);
                        // Continue with other amenities even if one fails
                    }
                }
            }

            onSuccess();
        } catch (err) {
            console.error('Check-in error:', err);
            setError(err instanceof Error ? err.message : 'Failed to check in guest');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div>
                        <h2 className="text-xl font-bold text-heading">Check In</h2>
                        <p className="text-sm text-muted">
                            Room {room.room_number} • {room.room_type}
                        </p>
                    </div>
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

                    {/* Housekeeping Status Warning */}
                    {room.housekeeping_status && room.housekeeping_status !== 'inspected' && (
                        <div className="p-3 bg-amber-500/20 border border-amber-500/50 rounded-lg flex items-start gap-3">
                            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <p className="text-amber-400 font-semibold">Room Not Inspected</p>
                                <p className="text-amber-300/80">
                                    This room's housekeeping status is "{room.housekeeping_status}".
                                    Consider verifying the room is ready before check-in.
                                </p>
                            </div>
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

                    {/* Guest Phone */}
                    <div>
                        <label className="label">Phone Number</label>
                        <input
                            {...register('guestPhone')}
                            className="input"
                            placeholder="+234-xxx-xxx-xxxx"
                        />
                    </div>

                    {/* ID Type & Number */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">ID Type</label>
                            <select {...register('guestIdType')} className="input">
                                <option value="national_id">National ID</option>
                                <option value="passport">Passport</option>
                                <option value="drivers_license">Driver's License</option>
                                <option value="voters_card">Voter's Card</option>
                                <option value="other">Other</option>
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

                    {/* Occupation & Reason for Visit (for security compliance) */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Occupation</label>
                            <input
                                {...register('guestOccupation')}
                                className="input"
                                placeholder="e.g. Engineer, Teacher"
                            />
                        </div>
                        <div>
                            <label className="label">Reason for Visit</label>
                            <select {...register('guestReasonForVisit')} className="input">
                                <option value="leisure">Leisure/Tourism</option>
                                <option value="business">Business</option>
                                <option value="medical">Medical</option>
                                <option value="family_event">Family/Event</option>
                                <option value="transit">Transit/Stopover</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>

                    {/* Number of Guests */}
                    <div>
                        <label className="label">Number of Guests</label>
                        <select {...register('numGuests', { valueAsNumber: true })} className="input">
                            {Array.from({ length: room.max_occupancy }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>
                                    {n} {n === 1 ? 'guest' : 'guests'}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Booking Type */}
                    <div>
                        <label className="label">Booking Type</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setValue('bookingType', 'night');
                                    const nights = watch('numNights') || 1;
                                    const rate = room.night_rate * nights;
                                    setValue('customRate', rate);
                                    setValue('amountPaid', rate + Math.round(rate * (taxRate / 100)));
                                }}
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${bookingType === 'night'
                                    ? 'border-primary-500 bg-primary-500/20 text-primary-400'
                                    : 'border-border bg-surface-raised/50 text-muted hover:border-border-strong'
                                    }`}
                            >
                                Night Stay
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setValue('bookingType', 'short_rest');
                                    const rate = calculateRate();
                                    setValue('customRate', rate);
                                    setValue('amountPaid', rate + Math.round(rate * (taxRate / 100)));
                                }}
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${bookingType === 'short_rest'
                                    ? 'border-status-shortRest bg-status-shortRest/20 text-status-shortRest'
                                    : 'border-border bg-surface-raised/50 text-muted hover:border-border-strong'
                                    }`}
                            >
                                Short Rest
                            </button>
                        </div>
                    </div>

                    {/* Night Stay Duration + Rate - Combined Row */}
                    {bookingType === 'night' && (
                        <div className="grid grid-cols-2 gap-3">
                            {/* Nights */}
                            <div>
                                <label className="label">Nights</label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={decrementNights}
                                        disabled={numNights <= 1}
                                        className="w-10 h-10 rounded-lg border border-border bg-surface-raised/50 text-muted hover:bg-surface-card disabled:opacity-50 flex items-center justify-center"
                                    >
                                        <Minus size={16} />
                                    </button>
                                    <div className="flex-1 text-center">
                                        <span className="text-2xl font-bold text-heading">{numNights}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={incrementNights}
                                        disabled={numNights >= 30}
                                        className="w-10 h-10 rounded-lg border border-primary-500 bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 disabled:opacity-50 flex items-center justify-center"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                                <p className="text-xs text-muted mt-1">Checkout: {format(checkoutDate, 'MMM d')} 12pm</p>
                            </div>
                            {/* Rate */}
                            <div>
                                <label className="label">Rate (₦{room.night_rate.toLocaleString()}/night)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₦</span>
                                    <input
                                        type="number"
                                        {...register('customRate', { valueAsNumber: true, min: 0 })}
                                        className="input pl-8"
                                        onChange={(e) => {
                                            const rate = parseInt(e.target.value) || 0;
                                            setValue('customRate', rate);
                                            setValue('amountPaid', rate + Math.round(rate * (taxRate / 100)));
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Short Rest Duration */}
                    {bookingType === 'short_rest' && (
                        <div>
                            <label className="label">Duration</label>
                            <div className="flex flex-wrap gap-2">
                                {shortRestPackages.map((pkg) => (
                                    <button
                                        key={pkg.hours}
                                        type="button"
                                        onClick={() => {
                                            setValue('durationHours', pkg.hours);
                                            const pkgRate = room.short_rest_packages?.find(p => p.duration === pkg.hours)?.rate
                                                ?? (room.short_rest_hourly_rate ?? room.night_rate * 0.15) * pkg.hours;
                                            setValue('customRate', pkgRate);
                                            setValue('amountPaid', pkgRate + Math.round(pkgRate * (taxRate / 100)));
                                        }}
                                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${durationHours === pkg.hours
                                            ? 'border-status-shortRest bg-status-shortRest/20 text-status-shortRest'
                                            : 'border-border bg-surface-raised/50 text-muted hover:border-border-strong'
                                            }`}
                                    >
                                        {pkg.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Rate - Only show for short rest (night stays have inline rate) */}
                    {bookingType === 'short_rest' && (
                        <div>
                            <label className="label">Rate (Suggested: ₦{suggestedRate.toLocaleString()})</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₦</span>
                                <input
                                    {...register('customRate', { valueAsNumber: true, min: 0 })}
                                    type="number"
                                    className="input pl-8"
                                    onChange={(e) => {
                                        const rate = parseInt(e.target.value) || 0;
                                        setValue('customRate', rate);
                                        setValue('amountPaid', rate + Math.round(rate * (taxRate / 100)));
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Amenities to Issue */}
                    <AmenitiesSelection onSelectionChange={handleAmenityChange} />

                    {/* Total Breakdown with Tax */}
                    <div className="bg-surface-raised/50 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted">Subtotal:</span>
                            <span className="text-heading">₦{subtotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted">Tax ({taxRate}%):</span>
                            <span className="text-heading">₦{taxAmount.toLocaleString()}</span>
                        </div>
                        <div className="border-t border-border-strong pt-2 flex justify-between">
                            <span className="text-muted font-medium">Total Due:</span>
                            <span className="text-heading font-bold text-lg">₦{totalWithTax.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Payment */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Payment Method</label>
                            <select {...register('paymentMethod')} className="input">
                                <option value="cash">Cash</option>
                                <option value="transfer">Bank Transfer</option>
                                <option value="pos">POS</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">Amount Paid</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₦</span>
                                <input
                                    {...register('amountPaid', { valueAsNumber: true, min: 0 })}
                                    type="number"
                                    className="input pl-8"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Balance Display */}
                    <div className="bg-surface-raised/50 rounded-lg p-3 flex justify-between items-center">
                        <span className="text-muted">Balance:</span>
                        <span className={`font-bold text-lg ${balance > 0 ? 'text-status-dirty' : 'text-status-available'}`}>
                            ₦{balance.toLocaleString()}
                        </span>
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
                                    Checking in...
                                </>
                            ) : (
                                'Check In Guest'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
