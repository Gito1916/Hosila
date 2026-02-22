import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookings, useGuests, useRooms } from '@/hooks/useSupabaseData';
import { GuestDirectory, GuestHistory } from '@/components/guests';
import { Users, History, BedDouble, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

type GuestsTab = 'in_house' | 'directory' | 'history';

export function GuestsPage() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<GuestsTab>('in_house');

    // Get in-house guests (active bookings) from Supabase via React Query
    const { data: allBookings } = useBookings();
    const { data: allGuests } = useGuests();
    const { data: allRooms } = useRooms();

    const inHouseGuests = useMemo(() => {
        if (!allBookings || !allGuests || !allRooms) return [];
        const activeBookings = allBookings.filter(b => b.status === 'active');
        return activeBookings.map(booking => {
            const guest = allGuests.find(g => g.id === booking.guest_id);
            const room = allRooms.find(r => r.id === booking.room_id);
            return { booking, guest, room };
        }).filter(item => item.guest);
    }, [allBookings, allGuests, allRooms]);

    const handleOpenLedger = (bookingId: string) => {
        navigate(`/bookings/${bookingId}/ledger`);
    };

    return (
        <div className="space-y-6">

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-slate-800 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab('in_house')}
                    className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${activeTab === 'in_house'
                        ? 'bg-primary-500 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                >
                    <BedDouble size={18} />
                    In-House ({inHouseGuests?.length ?? 0})
                </button>
                <button
                    onClick={() => setActiveTab('directory')}
                    className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${activeTab === 'directory'
                        ? 'bg-primary-500 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                >
                    <Users size={18} />
                    Directory
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${activeTab === 'history'
                        ? 'bg-primary-500 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                >
                    <History size={18} />
                    History
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'in_house' && (
                <div className="space-y-3">
                    {inHouseGuests?.map(({ booking, guest, room }) => (
                        <div
                            key={booking.id}
                            onClick={() => guest && handleOpenLedger(booking.id)}
                            className="card p-4 cursor-pointer hover:border-primary-500 transition-colors flex items-center justify-between"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center">
                                    <span className="text-lg font-bold text-white">
                                        {room?.room_number ?? '?'}
                                    </span>
                                </div>
                                <div>
                                    <p className="font-medium text-white">{guest?.name}</p>
                                    <div className="text-sm text-slate-400 space-x-2">
                                        <span>{room?.room_type}</span>
                                        {guest?.gender && (
                                            <>
                                                <span>•</span>
                                                <span className="capitalize">{guest.gender}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <p className="text-sm text-slate-400">Checkout</p>
                                    <p className="font-medium text-white">
                                        {format(new Date(booking.planned_checkout), 'MMM d, h:mm a')}
                                    </p>
                                </div>
                                <ChevronRight size={20} className="text-slate-400" />
                            </div>
                        </div>
                    ))}
                    {inHouseGuests?.length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                            <BedDouble size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No guests currently in-house</p>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'directory' && <GuestDirectory />}

            {activeTab === 'history' && <GuestHistory />}
        </div>
    );
}

