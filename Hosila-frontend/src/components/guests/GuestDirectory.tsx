import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GuestCard } from './GuestCard';
import { GuestDetailsModal } from './GuestDetailsModal';
import { GuestForm } from './GuestForm';
import type { Guest, Booking } from '@/types';
import { getAllGuests } from '@/db/guests';
import { requireSupabase, getHotelId } from '@/lib/api';

import {
    Search,
    Plus,
    Users,
    Filter,
    Star,
} from 'lucide-react';

export function GuestDirectory() {
    const [searchQuery, setSearchQuery] = useState('');
    const [showInHouseOnly, setShowInHouseOnly] = useState(false);
    const [showVIPOnly, setShowVIPOnly] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);

    // Get all guests
    const { data: allGuests } = useQuery({ queryKey: ['guests'], queryFn: getAllGuests });

    // Get active bookings to identify in-house guests
    const { data: activeBookings } = useQuery({ queryKey: ['bookings', 'status', 'active'], queryFn: async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('bookings').select('*').eq('hotel_id', hotelId).eq('status', 'active'); return data ?? []; } });

    const inHouseGuestIds = new Set(activeBookings?.map((b: Booking) => b.guest_id) ?? []);

    // Filter guests
    const filteredGuests = allGuests?.filter(guest => {
        // Filter by in-house status
        if (showInHouseOnly && !inHouseGuestIds.has(guest.id)) return false;

        // Filter by VIP status
        if (showVIPOnly && !guest.is_vip) return false;

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return (
                guest.name.toLowerCase().includes(query) ||
                guest.phone?.includes(query) ||
                guest.email?.toLowerCase().includes(query)
            );
        }

        return true;
    }).sort((a, b) => {
        // VIPs first, then in-house, then alphabetical
        if (a.is_vip && !b.is_vip) return -1;
        if (!a.is_vip && b.is_vip) return 1;
        const aInHouse = inHouseGuestIds.has(a.id);
        const bInHouse = inHouseGuestIds.has(b.id);
        if (aInHouse && !bInHouse) return -1;
        if (!aInHouse && bInHouse) return 1;
        return a.name.localeCompare(b.name);
    }) ?? [];

    const inHouseCount = inHouseGuestIds.size;
    const totalCount = allGuests?.length ?? 0;

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card p-4">
                    <p className="text-sm text-muted">Currently In-House</p>
                    <p className="text-3xl font-bold text-primary-400">{inHouseCount}</p>
                </div>
                <div className="card p-4">
                    <p className="text-sm text-muted">Total Guests</p>
                    <p className="text-3xl font-bold text-heading">{totalCount}</p>
                </div>
                <div className="card p-4">
                    <p className="text-sm text-muted">VIP Guests</p>
                    <p className="text-3xl font-bold text-amber-400">
                        {allGuests?.filter(g => g.is_vip).length ?? 0}
                    </p>
                </div>
                <div className="card p-4 hidden md:block">
                    <p className="text-sm text-muted">Returning Guests</p>
                    <p className="text-3xl font-bold text-status-available">
                        {allGuests?.filter(g => inHouseGuestIds.has(g.id)).length ?? 0}
                    </p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
                {/* Search */}
                <div className="flex items-center gap-3 flex-1">
                    <div className="relative flex-1 max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name, phone, or email..."
                            className="input pl-10 w-full"
                        />
                    </div>

                    <button
                        onClick={() => setShowInHouseOnly(!showInHouseOnly)}
                        className={`btn ${showInHouseOnly ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        <Filter size={16} className="mr-1" />
                        In-House Only
                    </button>

                    <button
                        onClick={() => setShowVIPOnly(!showVIPOnly)}
                        className={`btn ${showVIPOnly ? 'bg-amber-500 text-heading hover:bg-amber-600' : 'btn-secondary'}`}
                    >
                        <Star size={16} className="mr-1" />
                        VIP Only
                    </button>
                </div>

                {/* Add Guest + Print */}
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowForm(true)} className="btn btn-primary">
                        <Plus size={18} className="mr-1" />
                        Add Guest
                    </button>
                </div>
            </div>

            {/* Results count */}
            <p className="text-sm text-muted">
                Showing {filteredGuests.length} of {totalCount} guests
                {showInHouseOnly && ` (In-House only)`}
            </p>

            {/* Guest List */}
            {filteredGuests.length === 0 ? (
                <div className="text-center py-12 text-muted">
                    <Users size={48} className="mx-auto mb-3 opacity-50" />
                    <p>No guests found</p>
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="btn btn-secondary mt-4"
                        >
                            Clear search
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredGuests.map((guest) => (
                        <GuestCard
                            key={guest.id}
                            guest={guest}
                            onClick={() => setSelectedGuest(guest)}
                        />
                    ))}
                </div>
            )}

            {/* Modals */}
            {showForm && (
                <GuestForm
                    onClose={() => setShowForm(false)}
                    onSuccess={() => setShowForm(false)}
                />
            )}

            {selectedGuest && (
                <GuestDetailsModal
                    guest={selectedGuest}
                    onClose={() => setSelectedGuest(null)}
                />
            )}

        </div>
    );
}
