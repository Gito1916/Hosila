import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchById } from '@/lib/api';
import { GuestLedgerView } from '@/components/guests/GuestLedgerView';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { Booking, Guest, Room } from '@/types';

export function GuestLedgerPage() {
    const { bookingId } = useParams<{ bookingId: string }>();
    const navigate = useNavigate();

    // Get booking data from Supabase
    const { data: booking, isLoading: bookingLoading } = useQuery({
        queryKey: ['booking', bookingId],
        queryFn: () => fetchById<Booking>('bookings', bookingId!),
        enabled: !!bookingId,
    });

    // Get guest info
    const { data: guest } = useQuery({
        queryKey: ['guest', booking?.guest_id],
        queryFn: () => fetchById<Guest>('guests', booking!.guest_id),
        enabled: !!booking?.guest_id,
    });

    // Get room info
    const { data: room } = useQuery({
        queryKey: ['room', booking?.room_id],
        queryFn: () => fetchById<Room>('rooms', booking!.room_id),
        enabled: !!booking?.room_id,
    });

    // Loading state
    if (bookingLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={32} className="animate-spin text-primary-500" />
            </div>
        );
    }

    // Booking not found
    if (!booking) {
        return (
            <div className="text-center py-12">
                <h2 className="text-xl font-bold text-white mb-2">Booking Not Found</h2>
                <p className="text-slate-400 mb-4">The booking you're looking for doesn't exist.</p>
                <button
                    onClick={() => navigate('/bookings')}
                    className="btn btn-primary"
                >
                    Back to Bookings
                </button>
            </div>
        );
    }

    // Guest not found (shouldn't happen with valid booking)
    if (!guest) {
        return (
            <div className="text-center py-12">
                <h2 className="text-xl font-bold text-white mb-2">Guest Not Found</h2>
                <p className="text-slate-400 mb-4">The guest associated with this booking was not found.</p>
                <button
                    onClick={() => navigate('/guests')}
                    className="btn btn-primary"
                >
                    Back to Guests
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Back Button */}
            <button
                onClick={() => navigate('/booking')}
                className="flex items-center gap-2 text-slate-400 hover:text-white"
            >
                <ArrowLeft size={20} />
                Back to Bookings
            </button>

            {/* Guest Ledger Content */}
            <GuestLedgerView
                guest={guest}
                booking={booking}
                room={room ?? undefined}
            />
        </div>
    );
}
