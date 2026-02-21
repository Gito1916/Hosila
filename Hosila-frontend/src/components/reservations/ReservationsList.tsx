import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReservationCard } from './ReservationCard';
import { ReservationForm } from './ReservationForm';
import { ReservationDetailsModal } from './ReservationDetailsModal';
import { ReservationCalendar } from './ReservationCalendar';
import { ReservationPipeline } from './ReservationPipeline';
import type { Reservation, ReservationStatus } from '@/types';
import {
    Plus,
    Filter,
    Calendar,
    List,
    Columns,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { ModifyReservationModal } from './ModifyReservationModal';
import { checkIn } from '@/db/bookings';
import { markReservationCheckedIn, getAllReservations } from '@/db/reservations';
import { requireSupabase } from '@/lib/api';
import { toast } from '@/lib/errorMessages';

const statusOptions: { value: ReservationStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All Reservations' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'pending', label: 'Pending' },
    { value: 'checked_in', label: 'Checked In' },
    { value: 'no_show', label: 'No Show' },
    { value: 'cancelled', label: 'Cancelled' },
];

export function ReservationsList() {
    const user = useAuthStore((state) => state.user);
    const [filterStatus, setFilterStatus] = useState<ReservationStatus | 'all'>('all');
    const [showForm, setShowForm] = useState(false);
    const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
    const [reservationToModify, setReservationToModify] = useState<Reservation | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'pipeline'>('pipeline');
    const [isProcessing, setIsProcessing] = useState<string | null>(null); // ID of reservation being processed

    // Get all reservations with live updates
    const { data: reservations } = useQuery({ queryKey: ['reservations'], queryFn: getAllReservations });

    // Filter reservations
    const filteredReservations = reservations?.filter(r => {
        if (filterStatus === 'all') return true;
        return r.status === filterStatus;
    }).sort((a, b) => {
        // Sort by check-in date, upcoming first
        return new Date(a.check_in_date).getTime() - new Date(b.check_in_date).getTime();
    }) ?? [];

    // Count by status
    const counts: Record<ReservationStatus | 'all', number> = {
        all: reservations?.length ?? 0,
        confirmed: reservations?.filter(r => r.status === 'confirmed').length ?? 0,
        pending: reservations?.filter(r => r.status === 'pending').length ?? 0,
        checked_in: reservations?.filter(r => r.status === 'checked_in').length ?? 0,
        no_show: reservations?.filter(r => r.status === 'no_show').length ?? 0,
        cancelled: reservations?.filter(r => r.status === 'cancelled').length ?? 0,
    };

    const handleFormSuccess = () => {
        setShowForm(false);
    };

    const handleDetailsClose = () => {
        setSelectedReservation(null);
    };

    const handleQuickCheckIn = async (reservation: Reservation) => {
        if (!user) return;

        // Confirm action
        if (!confirm(`Check in guest for Room? This will create a booking immediately.`)) {
            return;
        }

        setIsProcessing(reservation.id);
        try {
            // Fetch guest and room
            const guest = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('guests').select('*').eq('id', reservation.guest_id).single(); return data; })();
            const room = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('rooms').select('*').eq('id', reservation.room_id).single(); return data; })();

            if (!room) throw new Error('Room not found');
            if (room.status !== 'available') {
                toast.warn('Cannot check in', `Room ${room.room_number} is currently ${room.status}. It must be available.`);
                return;
            }

            // Create booking
            await checkIn({
                roomId: reservation.room_id,
                guestName: guest?.name ?? 'Guest',
                guestPhone: guest?.phone,
                bookingType: 'night',
                numGuests: 1, // Defaulting to 1 as it's not in reservation
                rate: reservation.total_amount, // Assuming total amount is rate if 1 night? Wait.
                // If reservation covers multiple nights, checkIn expects `rate` (nightly) or total?
                // checkIn function: `total_charged: data.totalWithTax ?? data.rate`
                // BUT if numNights > 1, checkIn function calculates checkout date based on numNights.
                // We should pass `numNights`.
                numNights: reservation.nights,
                // And we should pass the NIGHTLY rate if we want checkIn to calculate properly?
                // Or existing flow: ReservationDetailsModal passes `rate: reservation.total_amount`.
                // Let's check checkIn again.
                // checkIn: const nights = data.numNights ?? 1.
                // checkIn: total_charged = data.totalWithTax ?? data.rate.
                // If we pass total_amount as rate, `total_charged` becomes total_amount. Correct.
                // But booking rate usage elsewhere?
                // For now, mirroring ReservationDetailsModal logic.
                paymentMethod: 'cash', // Or leave unpaid? DetailsModal passes 'cash' and amountPaid=deposit.
                amountPaid: reservation.deposit_paid,
                createdBy: user.id,
            });

            await markReservationCheckedIn(reservation.id);
        } catch (err) {
            toast.error('Check-in failed', err);
        } finally {
            setIsProcessing(null);
        }
    };

    const handleEdit = (reservation: Reservation) => {
        setReservationToModify(reservation);
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
                {/* Filters */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Filter size={16} className="text-slate-400" />
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as ReservationStatus | 'all')}
                            className="input py-1.5 pr-8"
                        >
                            {statusOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label} ({counts[opt.value]})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg overflow-hidden border border-slate-700">
                        <button
                            onClick={() => setViewMode('pipeline')}
                            className={`p-2 ${viewMode === 'pipeline' ? 'bg-primary-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                            title="Pipeline view"
                        >
                            <Columns size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 ${viewMode === 'list' ? 'bg-primary-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                            title="List view"
                        >
                            <List size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('calendar')}
                            className={`p-2 ${viewMode === 'calendar' ? 'bg-primary-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                            title="Calendar view"
                        >
                            <Calendar size={18} />
                        </button>
                    </div>

                    <button onClick={() => setShowForm(true)} className="btn btn-primary">
                        <Plus size={18} className="mr-1" />
                        New Reservation
                    </button>
                </div>
            </div>

            {/* Status Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card p-3">
                    <p className="text-sm text-slate-400">Confirmed</p>
                    <p className="text-2xl font-bold text-status-available">{counts.confirmed}</p>
                </div>
                <div className="card p-3">
                    <p className="text-sm text-slate-400">Pending</p>
                    <p className="text-2xl font-bold text-status-dirty">{counts.pending}</p>
                </div>
                <div className="card p-3">
                    <p className="text-sm text-slate-400">Checked In</p>
                    <p className="text-2xl font-bold text-status-shortRest">{counts.checked_in}</p>
                </div>
                <div className="card p-3">
                    <p className="text-sm text-slate-400">Cancelled</p>
                    <p className="text-2xl font-bold text-status-maintenance">{counts.cancelled}</p>
                </div>
            </div>

            {/* List View */}
            {viewMode === 'list' && (
                <div className="space-y-3">
                    {filteredReservations.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <Calendar size={48} className="mx-auto mb-3 opacity-50" />
                            <p>No reservations found</p>
                            <button onClick={() => setShowForm(true)} className="btn btn-primary mt-4">
                                <Plus size={16} className="mr-1" /> Create First Reservation
                            </button>
                        </div>
                    ) : (
                        filteredReservations.map((reservation) => (
                            <ReservationCard
                                key={reservation.id}
                                reservation={reservation}
                                onClick={() => setSelectedReservation(reservation)}
                                onCheckIn={handleQuickCheckIn}
                                onEdit={handleEdit}
                                isProcessing={isProcessing === reservation.id}
                            />
                        ))
                    )}
                </div>
            )}

            {/* Pipeline View */}
            {viewMode === 'pipeline' && (
                <ReservationPipeline
                    onReservationClick={(reservation) => setSelectedReservation(reservation)}
                    onCheckIn={handleQuickCheckIn}
                    onEdit={handleEdit}
                    processingId={isProcessing}
                />
            )}

            {/* Calendar View */}
            {viewMode === 'calendar' && (
                <ReservationCalendar
                    onReservationClick={(reservation) => setSelectedReservation(reservation)}
                />
            )}

            {/* Modals */}
            {showForm && (
                <ReservationForm
                    onClose={() => setShowForm(false)}
                    onSuccess={handleFormSuccess}
                />
            )}

            {selectedReservation && (
                <ReservationDetailsModal
                    reservation={selectedReservation}
                    onClose={handleDetailsClose}
                />
            )}

            {reservationToModify && (
                <ModifyReservationModal
                    reservation={reservationToModify}
                    onClose={() => setReservationToModify(null)}
                    onSuccess={() => setReservationToModify(null)}
                />
            )}
        </div>
    );
}
