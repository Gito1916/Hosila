import { RoomGrid } from '@/components/rooms';

export function RoomsPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Rooms</h2>
                    <p className="text-slate-400">Manage room status and bookings</p>
                </div>
            </div>

            <RoomGrid />
        </div>
    );
}
