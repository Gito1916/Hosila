import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { Printer, X, Calendar, Users } from 'lucide-react';
import { getAllGuests } from '@/db/guests';
import { getAllRooms } from '@/db/rooms';
import { getHotel } from '@/db/settings';
import { requireSupabase, getHotelId } from '@/lib/api';

type DateFilter = 'today' | 'this_week' | 'this_month' | 'custom';

const reasonLabels: Record<string, string> = {
    business: 'Business',
    leisure: 'Leisure/Tourism',
    medical: 'Medical',
    family_event: 'Family/Event',
    transit: 'Transit/Stopover',
    other: 'Other',
};

interface GuestListPrintProps {
    onClose: () => void;
}

export function GuestListPrint({ onClose }: GuestListPrintProps) {
    const [dateFilter, setDateFilter] = useState<DateFilter>('today');
    const [customStart, setCustomStart] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [customEnd, setCustomEnd] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

    // Get date range based on filter
    const getDateRange = (): { start: Date; end: Date } => {
        const now = new Date();
        switch (dateFilter) {
            case 'today':
                return { start: startOfDay(now), end: endOfDay(now) };
            case 'this_week':
                return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
            case 'this_month':
                return { start: startOfMonth(now), end: endOfMonth(now) };
            case 'custom':
                return {
                    start: startOfDay(new Date(customStart)),
                    end: endOfDay(new Date(customEnd))
                };
        }
    };

    const { start, end } = getDateRange();

    // Fetch bookings in date range
    const { data: bookings } = useQuery({
        queryKey: ['bookings', dateFilter, customStart, customEnd], queryFn: async () => {
            const all = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('bookings').select('*').eq('hotel_id', hotelId); return data ?? []; })();
            return all.filter(b => {
                const checkInTime = new Date(b.check_in_time);
                return checkInTime >= start && checkInTime <= end;
            });
        }, enabled: !!dateFilter
    }) ?? [];

    // Fetch related data
    const { data: guests } = useQuery({ queryKey: ['guests'], queryFn: getAllGuests });
    const { data: rooms } = useQuery({ queryKey: ['rooms'], queryFn: getAllRooms });
    const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: getHotel });

    // Enrich bookings with guest and room data
    const guestList = (bookings ?? []).map(booking => {
        const guest = guests?.find(g => g.id === booking.guest_id);
        const room = rooms?.find(r => r.id === booking.room_id);
        return {
            id: booking.id,
            guestName: guest?.name ?? 'Unknown',
            phone: guest?.phone ?? '-',
            occupation: guest?.occupation ?? '-',
            reasonForVisit: guest?.reason_for_visit ? reasonLabels[guest.reason_for_visit] ?? guest.reason_for_visit : '-',
            roomNumber: room?.room_number ?? '?',
            checkInTime: booking.check_in_time,
            checkOutTime: booking.check_out_time,
        };
    });

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header - hidden when printing */}
                <div className="flex items-center justify-between p-4 border-b border-border print:hidden">
                    <h2 className="text-xl font-bold text-heading flex items-center gap-2">
                        <Users size={24} />
                        Guest List Report
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Filters - hidden when printing */}
                <div className="p-4 border-b border-border print:hidden">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-muted" />
                            <select
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                                className="input text-sm py-2"
                            >
                                <option value="today">Today</option>
                                <option value="this_week">This Week</option>
                                <option value="this_month">This Month</option>
                                <option value="custom">Custom Range</option>
                            </select>
                        </div>

                        {dateFilter === 'custom' && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={(e) => setCustomStart(e.target.value)}
                                    className="input text-sm py-2"
                                />
                                <span className="text-muted">to</span>
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    className="input text-sm py-2"
                                />
                            </div>
                        )}

                        <button onClick={handlePrint} className="btn btn-primary ml-auto">
                            <Printer size={16} className="mr-2" />
                            Print
                        </button>
                    </div>
                </div>

                {/* Print Header - only visible when printing */}
                <div className="hidden print:block p-4 text-center border-b border-border">
                    <h1 className="text-2xl font-bold text-black">{hotel?.name ?? 'Hotel'}</h1>
                    <p className="text-sm text-body">{hotel?.address}</p>
                    <h2 className="text-lg font-semibold mt-4 text-black">Guest List Report</h2>
                    <p className="text-sm text-body">
                        {format(start, 'dd MMM yyyy')} - {format(end, 'dd MMM yyyy')}
                    </p>
                </div>

                {/* Guest Table */}
                <div className="flex-1 overflow-auto p-4">
                    {guestList.length === 0 ? (
                        <div className="text-center py-12 text-muted print:text-body">
                            <Users size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No guests checked in during this period</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="bg-surface-base/50 text-muted text-left print:bg-surface-raised print:text-heading">
                                    <th className="px-3 py-2 font-medium border print:border-border-strong">#</th>
                                    <th className="px-3 py-2 font-medium border print:border-border-strong">Guest Name</th>
                                    <th className="px-3 py-2 font-medium border print:border-border-strong">Phone</th>
                                    <th className="px-3 py-2 font-medium border print:border-border-strong">Occupation</th>
                                    <th className="px-3 py-2 font-medium border print:border-border-strong">Reason for Visit</th>
                                    <th className="px-3 py-2 font-medium border print:border-border-strong">Room</th>
                                    <th className="px-3 py-2 font-medium border print:border-border-strong">Check-in</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50 print:divide-gray-300">
                                {guestList.map((guest, index) => (
                                    <tr key={guest.id} className="hover:bg-surface-raised/30 print:hover:bg-transparent">
                                        <td className="px-3 py-2 text-muted print:text-body border print:border-border-strong">
                                            {index + 1}
                                        </td>
                                        <td className="px-3 py-2 text-heading print:text-black font-medium border print:border-border-strong">
                                            {guest.guestName}
                                        </td>
                                        <td className="px-3 py-2 text-muted print:text-heading border print:border-border-strong">
                                            {guest.phone}
                                        </td>
                                        <td className="px-3 py-2 text-muted print:text-heading border print:border-border-strong">
                                            {guest.occupation}
                                        </td>
                                        <td className="px-3 py-2 text-muted print:text-heading border print:border-border-strong">
                                            {guest.reasonForVisit}
                                        </td>
                                        <td className="px-3 py-2 text-muted print:text-heading border print:border-border-strong">
                                            {guest.roomNumber}
                                        </td>
                                        <td className="px-3 py-2 text-muted print:text-heading border print:border-border-strong">
                                            {format(new Date(guest.checkInTime), 'dd MMM yyyy HH:mm')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer with count */}
                <div className="p-4 border-t border-border text-sm text-muted print:text-body print:border-border-strong">
                    Total: {guestList.length} guest{guestList.length !== 1 ? 's' : ''}
                </div>
            </div>
        </div>
    );
}
