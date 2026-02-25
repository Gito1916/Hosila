import { ReservationsList } from '@/components/reservations';

export function ReservationsPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-heading">Reservations</h2>
                    <p className="text-muted">Manage future bookings</p>
                </div>
            </div>

            <ReservationsList />
        </div>
    );
}
