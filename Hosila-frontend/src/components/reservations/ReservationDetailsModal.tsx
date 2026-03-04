import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { checkIn } from '@/db/bookings';
import { markReservationCheckedIn } from '@/db/reservations';
import { CancellationModal } from './CancellationModal';
import { ModifyReservationModal } from './ModifyReservationModal';
import type { Reservation } from '@/types';
import { format, isPast, isToday } from 'date-fns';
import { requireSupabase } from '@/lib/api';
import {
    X,
    User,
    Phone,
    Mail,
    Calendar,
    MapPin,
    CreditCard,
    MessageSquare,

    LogIn,
    XCircle,
    AlertTriangle,
    Edit3,
} from 'lucide-react';

interface ReservationDetailsModalProps {
    reservation: Reservation;
    onClose: () => void;
}

export function ReservationDetailsModal({ reservation, onClose }: ReservationDetailsModalProps) {
    const user = useAuthStore((state) => state.user);
    const [isLoading, setIsLoading] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showModifyModal, setShowModifyModal] = useState(false);

    // Get guest info
    const { data: guest } = useQuery({ queryKey: ['guests', reservation.guest_id], queryFn: async () => { const sb = requireSupabase(); const { data } = await sb.from('guests').select('*').eq('id', reservation.guest_id).single(); return data; }, enabled: !!reservation.guest_id });

    // Get room info
    const { data: room } = useQuery({ queryKey: ['rooms', reservation.room_id], queryFn: async () => { const sb = requireSupabase(); const { data } = await sb.from('rooms').select('*').eq('id', reservation.room_id).single(); return data; }, enabled: !!reservation.room_id });

    const checkInDate = new Date(reservation.check_in_date);
    const checkOutDate = new Date(reservation.check_out_date);
    const canCheckIn = reservation.status === 'confirmed' && (isToday(checkInDate) || isPast(checkInDate));
    const canCancel = reservation.status === 'confirmed' || reservation.status === 'pending';
    const canMarkNoShow = reservation.status === 'confirmed' && isPast(checkInDate) && !isToday(checkInDate);

    const handleCheckIn = async () => {
        if (!user || !room || !reservation.room_id) return;

        setIsLoading(true);
        try {
            // Create booking from reservation
            await checkIn({
                roomId: reservation.room_id,
                guestName: guest?.name ?? 'Guest',
                guestPhone: guest?.phone,
                guestOccupation: guest?.occupation,
                guestReasonForVisit: guest?.reason_for_visit,
                bookingType: 'night',
                numGuests: 1,
                rate: reservation.total_amount,
                paymentMethod: 'cash',
                amountPaid: reservation.deposit_paid,
                createdBy: user.id,
            });

            // Mark reservation as checked in
            await markReservationCheckedIn(reservation.id);

            onClose();
        } catch (err) {
            console.error('Error checking in:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleMarkNoShow = async () => {
        if (!user) return;

        setIsLoading(true);
        try {
            await (async () => {
                const sb = requireSupabase(); await sb.from('reservations').update({
                    status: 'no_show',
                    updated_at: new Date(),
                }).eq('id', reservation.id);
            })();
            onClose();
        } catch (err) {
            console.error('Error marking no-show:', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold text-heading">Reservation Details</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Status Badge */}
                    <div className="flex items-center justify-between">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${reservation.status === 'confirmed' ? 'bg-status-available/20 text-status-available' :
                            reservation.status === 'cancelled' ? 'bg-status-maintenance/20 text-status-maintenance' :
                                reservation.status === 'checked_in' ? 'bg-status-shortRest/20 text-status-shortRest' :
                                    reservation.status === 'no_show' ? 'bg-red-500/20 text-red-400' :
                                        'bg-status-dirty/20 text-status-dirty'
                            }`}>
                            {reservation.status.charAt(0).toUpperCase() + reservation.status.slice(1).replace('_', ' ')}
                        </span>
                        <span className="text-sm text-muted">
                            Source: {reservation.source}
                        </span>
                    </div>

                    {/* Guest Info */}
                    <div className="card p-4">
                        <h3 className="font-medium text-heading mb-3 flex items-center gap-2">
                            <User size={16} />
                            Guest Information
                        </h3>
                        <div className="space-y-2 text-sm">
                            <p className="text-heading">{guest?.name ?? 'Loading...'}</p>
                            {guest?.phone && (
                                <p className="text-muted flex items-center gap-2">
                                    <Phone size={14} /> {guest.phone}
                                </p>
                            )}
                            {guest?.email && (
                                <p className="text-muted flex items-center gap-2">
                                    <Mail size={14} /> {guest.email}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Stay Info */}
                    <div className="card p-4">
                        <h3 className="font-medium text-heading mb-3 flex items-center gap-2">
                            <Calendar size={16} />
                            Stay Details
                        </h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <MapPin size={14} className="text-muted" />
                                <span className="text-heading">
                                    Room {room?.room_number ?? '...'} - {room?.room_type ?? '...'}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mt-3">
                                <div>
                                    <p className="text-muted">Check-in</p>
                                    <p className="text-heading">{format(checkInDate, 'EEE, MMM d, yyyy')}</p>
                                </div>
                                <div>
                                    <p className="text-muted">Check-out</p>
                                    <p className="text-heading">{format(checkOutDate, 'EEE, MMM d, yyyy')}</p>
                                </div>
                            </div>
                            <p className="text-muted mt-2">
                                {reservation.nights} night{reservation.nights !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>

                    {/* Payment Info */}
                    <div className="card p-4">
                        <h3 className="font-medium text-heading mb-3 flex items-center gap-2">
                            <CreditCard size={16} />
                            Payment
                        </h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted">Total Amount</span>
                                <span className="text-heading">₦{reservation.total_amount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted">Deposit Paid</span>
                                <span className="text-status-available">₦{reservation.deposit_paid.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-t border-border pt-2">
                                <span className="text-muted">Balance Due</span>
                                <span className="text-heading font-medium">
                                    ₦{(reservation.total_amount - reservation.deposit_paid).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    {reservation.notes && (
                        <div className="card p-4">
                            <h3 className="font-medium text-heading mb-2 flex items-center gap-2">
                                <MessageSquare size={16} />
                                Notes
                            </h3>
                            <p className="text-sm text-muted whitespace-pre-wrap">{reservation.notes}</p>
                        </div>
                    )}

                    {/* Actions */}
                    {reservation.status !== 'cancelled' && reservation.status !== 'checked_in' && reservation.status !== 'no_show' && (
                        <div className="flex flex-wrap gap-2">
                            {canCancel && (
                                <>
                                    <button
                                        onClick={() => setShowModifyModal(true)}
                                        className="btn btn-secondary flex-1"
                                    >
                                        <Edit3 size={16} className="mr-1" />
                                        Modify
                                    </button>
                                    <button
                                        onClick={() => setShowCancelModal(true)}
                                        className="btn bg-red-500 hover:bg-red-600 flex-1"
                                    >
                                        <XCircle size={16} className="mr-1" />
                                        Cancel
                                    </button>
                                </>
                            )}
                            {canMarkNoShow && (
                                <button onClick={handleMarkNoShow} disabled={isLoading} className="btn btn-warning flex-1">
                                    <AlertTriangle size={16} className="mr-1" />
                                    {isLoading ? 'Processing...' : 'Mark No-Show'}
                                </button>
                            )}
                            {canCheckIn && room?.status === 'available' && (
                                <button onClick={handleCheckIn} disabled={isLoading} className="btn btn-primary flex-1">
                                    <LogIn size={16} className="mr-1" />
                                    {isLoading ? 'Processing...' : 'Check In Now'}
                                </button>
                            )}
                            {canCheckIn && room?.status !== 'available' && (
                                <p className="text-sm text-status-dirty flex-1 text-center py-2">
                                    Room not available (currently {room?.status})
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Cancellation Modal */}
            {showCancelModal && guest && (
                <CancellationModal
                    reservation={reservation}
                    guest={guest}
                    onClose={() => setShowCancelModal(false)}
                    onSuccess={onClose}
                    onModify={() => {
                        setShowCancelModal(false);
                        setShowModifyModal(true);
                    }}
                />
            )}

            {/* Modify Reservation Modal */}
            {showModifyModal && (
                <ModifyReservationModal
                    reservation={reservation}
                    onClose={() => setShowModifyModal(false)}
                    onSuccess={() => {
                        setShowModifyModal(false);
                        onClose();
                    }}
                />
            )}
        </div>
    );
}
