import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import type { OtherIncome, IncomeCategory, Charge } from '@/types';
import {
    Building2,
    Utensils,
    MoreHorizontal,
    Plus,
    Receipt,
} from 'lucide-react';
import { OtherIncomeForm } from './OtherIncomeForm';
import { getAllBookings } from '@/db/bookings';
import { getAllRooms } from '@/db/rooms';
import { getAllGuests } from '@/db/guests';
import { requireSupabase, getHotelId } from '@/lib/api';

type DateFilter = 'daily' | 'weekly' | 'monthly' | 'yearly';
type IncomeSection = 'accommodation' | 'restaurant' | 'other';

interface IncomeTabProps {
    dateFilter?: DateFilter;
    activeSection?: IncomeSection;
    onSectionChange?: (section: IncomeSection) => void;
}

const categoryLabels: Record<IncomeCategory, string> = {
    venue_rental: 'Venue/Hall Rental',
    swimming_pool: 'Swimming Pool Fee',
    parking: 'Parking Fee',
    laundry_external: 'External Laundry',
    caution_fee: 'Caution/Deposit',
    other: 'Other',
};

function getDateRange(filter: DateFilter): { start: Date; end: Date } {
    const today = new Date();
    switch (filter) {
        case 'daily':
            return { start: startOfDay(today), end: endOfDay(today) };
        case 'weekly':
            return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
        case 'monthly':
            return { start: startOfMonth(today), end: endOfMonth(today) };
        case 'yearly':
            return { start: startOfYear(today), end: endOfYear(today) };
        default:
            return { start: startOfDay(today), end: endOfDay(today) };
    }
}

export function IncomeTab({ dateFilter = 'daily', activeSection: controlledSection, onSectionChange }: IncomeTabProps) {
    const [internalSection, setInternalSection] = useState<IncomeSection>('accommodation');

    // Use controlled or internal state
    const activeSection = controlledSection ?? internalSection;
    const setActiveSection = onSectionChange ?? setInternalSection;
    const [showOtherIncomeForm, setShowOtherIncomeForm] = useState(false);

    const { start, end } = getDateRange(dateFilter);

    // === ACCOUNTING v2: Revenue from charges table ===
    const { data: charges } = useQuery({
        queryKey: ['charges', dateFilter], queryFn: async () => {
            const all = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('charges').select('*').eq('hotel_id', hotelId); return data ?? []; })();
            return all.filter(c => {
                const d = new Date(c.charge_date);
                return d >= start && d <= end && (c.status === 'active' || c.status === 'partially_refunded');
            });
        }, enabled: !!dateFilter
    }) ?? [];

    // Split charges by department
    const accommodationCharges = (charges ?? []).filter((c: any) => c.department === 'accommodation');
    const restaurantCharges = (charges ?? []).filter((c: any) => c.department === 'restaurant');
    const otherServicesCharges = (charges ?? []).filter((c: any) => c.department === 'other_services' || c.department === 'other_income');

    // Fetch other income list (for display in OtherIncomeSection — shows category, customer, etc.)
    const { data: otherIncomeList } = useQuery({
        queryKey: ['otherIncomeList', dateFilter], queryFn: async () => {
            const income = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('other_income').select('*').eq('hotel_id', hotelId); return data ?? []; })();
            return income.filter(i => {
                const date = new Date(i.date);
                return date >= start && date <= end;
            });
        }, enabled: !!dateFilter
    }) ?? [];

    // Calculate totals from charges (NET revenue, excluding tax)
    const accommodationTotal = accommodationCharges.reduce((sum, c) => sum + (c.net_revenue ?? c.gross_amount), 0);
    const restaurantTotal = restaurantCharges.reduce((sum, c) => sum + (c.net_revenue ?? c.gross_amount), 0);
    // Other income: net revenue from charges with department 'other_services'
    const otherTotal = otherServicesCharges.reduce((sum, c) => sum + (c.net_revenue ?? c.gross_amount), 0);

    const sections: { key: IncomeSection; label: string; icon: typeof Building2; total: number; count: number }[] = [
        { key: 'accommodation', label: 'Accommodation', icon: Building2, total: accommodationTotal, count: accommodationCharges.length },
        { key: 'restaurant', label: 'Restaurant', icon: Utensils, total: restaurantTotal, count: restaurantCharges.length },
        { key: 'other', label: 'Other Income', icon: MoreHorizontal, total: otherTotal, count: (otherIncomeList ?? []).length },
    ];

    return (
        <div className="space-y-4">
            {/* Section Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {sections.map((section) => (
                    <button
                        key={section.key}
                        onClick={() => setActiveSection(section.key)}
                        className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all whitespace-nowrap ${activeSection === section.key
                            ? 'bg-primary-500 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                    >
                        <section.icon size={18} />
                        <span>{section.label}</span>
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeSection === section.key
                            ? 'bg-white/20'
                            : 'bg-slate-700'
                            }`}>
                            ₦{section.total.toLocaleString()}
                        </span>
                    </button>
                ))}
            </div>

            {/* Section Content */}
            <div className="bg-slate-800/50 rounded-lg border border-slate-700">
                {activeSection === 'accommodation' && (
                    <ChargeSection charges={accommodationCharges} department="accommodation" />
                )}
                {activeSection === 'restaurant' && (
                    <ChargeSection charges={restaurantCharges} department="restaurant" />
                )}
                {activeSection === 'other' && (
                    <OtherIncomeSection
                        incomeList={otherIncomeList ?? []}
                        onAddNew={() => setShowOtherIncomeForm(true)}
                    />
                )}
            </div>

            {/* Other Income Form Modal */}
            {showOtherIncomeForm && (
                <OtherIncomeForm
                    onClose={() => setShowOtherIncomeForm(false)}
                    onSuccess={() => setShowOtherIncomeForm(false)}
                />
            )}
        </div>
    );
}

// Charge-based Income Section (for both Accommodation and Restaurant)
function ChargeSection({ charges, department }: { charges: Charge[]; department: 'accommodation' | 'restaurant' }) {
    // Fetch related data for enriching display
    const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: getAllBookings });
    const { data: rooms } = useQuery({ queryKey: ['rooms'], queryFn: getAllRooms });
    const { data: guests } = useQuery({ queryKey: ['guests'], queryFn: getAllGuests });

    const emptyIcon = department === 'accommodation' ? Building2 : Utensils;
    const EmptyIcon = emptyIcon;
    const emptyLabel = department === 'accommodation' ? 'accommodation' : 'restaurant';

    if (charges.length === 0) {
        return (
            <div className="text-center py-12 text-slate-400">
                <EmptyIcon size={32} className="mx-auto mb-2 opacity-50" />
                <p>No {emptyLabel} income in this period</p>
                <p className="text-sm mt-1">
                    {department === 'accommodation'
                        ? 'Charges are auto-recorded at check-in'
                        : 'Walk-in orders and room tab charges appear here'}
                </p>
            </div>
        );
    }

    // Enrich charges with booking, room, and guest info
    const enrichedCharges = charges.map(charge => {
        const booking = bookings?.find(b => b.id === charge.booking_id);
        const room = rooms?.find(r => r.id === booking?.room_id);
        const guest = guests?.find(g => g.id === charge.guest_id);
        return {
            ...charge,
            guestName: guest?.name ?? (charge.booking_id ? 'Unknown Guest' : 'Walk-in'),
            roomNumber: room?.room_number ?? '',
            roomType: room?.room_type ?? '',
        };
    });

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-900/50 text-slate-400 text-left">
                        <th className="px-4 py-3 font-medium">Date/Time</th>
                        <th className="px-4 py-3 font-medium">Description</th>
                        <th className="px-4 py-3 font-medium">Guest</th>
                        {department === 'accommodation' && <th className="px-4 py-3 font-medium">Room</th>}
                        <th className="px-4 py-3 font-medium text-right">Net</th>
                        <th className="px-4 py-3 font-medium text-right">Tax</th>
                        <th className="px-4 py-3 font-medium text-right">Gross</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                    {enrichedCharges.map((charge) => (
                        <tr key={charge.id} className="hover:bg-slate-700/30">
                            <td className="px-4 py-3 text-slate-300">
                                {format(new Date(charge.charge_date), 'dd MMM HH:mm')}
                            </td>
                            <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate" title={charge.description}>
                                {charge.description}
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                                {charge.guestName}
                            </td>
                            {department === 'accommodation' && (
                                <td className="px-4 py-3">
                                    {charge.roomNumber && (
                                        <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
                                            Room {charge.roomNumber}
                                        </span>
                                    )}
                                </td>
                            )}
                            <td className="px-4 py-3 text-right text-slate-400">
                                ₦{(charge.net_revenue ?? charge.gross_amount).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-amber-400 text-xs">
                                {charge.tax_amount ? `₦${charge.tax_amount.toLocaleString()}` : '–'}
                            </td>
                            <td className="px-4 py-3 text-right text-green-400 font-medium">
                                ₦{charge.gross_amount.toLocaleString()}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Other Income Section (Manual entry allowed)
function OtherIncomeSection({
    incomeList,
    onAddNew
}: {
    incomeList: OtherIncome[];
    onAddNew: () => void;
}) {
    return (
        <div>
            {/* Add Button */}
            <div className="p-4 border-b border-slate-700">
                <button onClick={onAddNew} className="btn btn-primary gap-2">
                    <Plus size={16} />
                    Record Other Income
                </button>
            </div>

            {incomeList.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <Receipt size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No other income recorded</p>
                    <p className="text-sm mt-1">Add venue rentals, pool fees, etc.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-900/50 text-slate-400 text-left">
                                <th className="px-4 py-3 font-medium">Date</th>
                                <th className="px-4 py-3 font-medium">Category</th>
                                <th className="px-4 py-3 font-medium">Description</th>
                                <th className="px-4 py-3 font-medium">Method</th>
                                <th className="px-4 py-3 font-medium text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {incomeList.map((income) => (
                                <tr key={income.id} className="hover:bg-slate-700/30">
                                    <td className="px-4 py-3 text-slate-300">
                                        {format(new Date(income.date), 'dd MMM HH:mm')}
                                    </td>
                                    <td className="px-4 py-3 text-slate-300">
                                        <span className="px-2 py-0.5 rounded bg-slate-700 text-xs">
                                            {categoryLabels[income.category]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate">
                                        {income.description}
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 capitalize">
                                        {income.payment_method}
                                    </td>
                                    <td className="px-4 py-3 text-right text-green-400 font-medium">
                                        ₦{income.amount.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
