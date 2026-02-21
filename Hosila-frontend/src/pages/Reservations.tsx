import { ReservationsList } from '@/components/reservations';

export function ReservationsPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Reservations</h2>
                    <p className="text-slate-400">Manage future bookings</p>
                </div>
            </div>

            <ReservationsList />
        </div>
    );
}
