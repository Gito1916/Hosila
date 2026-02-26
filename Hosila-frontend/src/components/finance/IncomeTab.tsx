import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import type { OtherIncome, IncomeCategory, Charge } from '@/types';
import {
    Building2,
    Utensils,
    MoreHorizontal,
    Plus,
    Receipt,
    Loader2,
    TrendingUp,
    BarChart3,
    Users,
    BedDouble,
} from 'lucide-react';
import { OtherIncomeForm } from './OtherIncomeForm';
import { getAllBookings } from '@/db/bookings';
import { getAllRooms } from '@/db/rooms';
import { getAllGuests } from '@/db/guests';
import { requireSupabase, getHotelId } from '@/lib/api';
import { useAccommodationReport, useRestaurantReport } from '@/hooks/useHosilaApi';

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

const f = (n: number) => `₦${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function IncomeTab({ dateFilter = 'daily', activeSection: controlledSection, onSectionChange }: IncomeTabProps) {
    const [internalSection, setInternalSection] = useState<IncomeSection>('accommodation');

    // Use controlled or internal state
    const activeSection = controlledSection ?? internalSection;
    const setActiveSection = onSectionChange ?? setInternalSection;
    const [showOtherIncomeForm, setShowOtherIncomeForm] = useState(false);

    const { start, end } = getDateRange(dateFilter);
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

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
                            ? 'bg-primary-500 text-heading'
                            : 'bg-surface-card text-muted hover:bg-surface-raised'
                            }`}
                    >
                        <section.icon size={18} />
                        <span>{section.label}</span>
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeSection === section.key
                            ? 'bg-white/20'
                            : 'bg-surface-raised'
                            }`}>
                            ₦{section.total.toLocaleString()}
                        </span>
                    </button>
                ))}
            </div>

            {/* Section Content */}
            {activeSection === 'accommodation' && (
                <div className="space-y-4">
                    <AccommodationAnalytics start={startStr} end={endStr} />
                    <div className="bg-surface-card/50 rounded-lg border border-border">
                        <ChargeSection charges={accommodationCharges} department="accommodation" />
                    </div>
                </div>
            )}
            {activeSection === 'restaurant' && (
                <div className="space-y-4">
                    <RestaurantAnalytics start={startStr} end={endStr} />
                    <div className="bg-surface-card/50 rounded-lg border border-border">
                        <ChargeSection charges={restaurantCharges} department="restaurant" />
                    </div>
                </div>
            )}
            {activeSection === 'other' && (
                <div className="bg-surface-card/50 rounded-lg border border-border">
                    <OtherIncomeSection
                        incomeList={otherIncomeList ?? []}
                        onAddNew={() => setShowOtherIncomeForm(true)}
                    />
                </div>
            )}

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

// ── Accommodation Analytics Panel ──────────────
function AccommodationAnalytics({ start, end }: { start: string; end: string }) {
    const { data: report, isLoading } = useAccommodationReport(start, end) as {
        data: {
            total_revenue: number;
            total_rooms_available: number;
            total_room_nights: number;
            rooms_sold: number;
            occupancy_rate: number;
            adr: number;
            revpar: number;
            revenue_by_room_type: Array<{ room_type: string; total_revenue: number; nights_sold: number; average_rate: number }>;
            tax_collected: number;
            service_charge_collected: number;
        } | undefined;
        isLoading: boolean;
    };

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 p-4 text-muted text-sm">
                <Loader2 size={14} className="animate-spin" /> Loading analytics...
            </div>
        );
    }
    if (!report) return null;

    return (
        <div className="space-y-3">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface-card rounded-lg p-3 border border-border">
                    <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp size={14} className="text-green-400" />
                        <span className="text-xs text-muted">Revenue</span>
                    </div>
                    <p className="text-lg font-bold text-heading">{f(report.total_revenue)}</p>
                </div>
                <div className="bg-surface-card rounded-lg p-3 border border-border">
                    <div className="flex items-center gap-1.5 mb-1">
                        <BedDouble size={14} className="text-blue-400" />
                        <span className="text-xs text-muted">Occupancy</span>
                    </div>
                    <p className="text-lg font-bold text-heading">{Number(report.occupancy_rate).toFixed(1)}%</p>
                </div>
                <div className="bg-surface-card rounded-lg p-3 border border-border">
                    <div className="flex items-center gap-1.5 mb-1">
                        <BarChart3 size={14} className="text-purple-400" />
                        <span className="text-xs text-muted">ADR</span>
                    </div>
                    <p className="text-lg font-bold text-heading">{f(report.adr)}</p>
                </div>
                <div className="bg-surface-card rounded-lg p-3 border border-border">
                    <div className="flex items-center gap-1.5 mb-1">
                        <BarChart3 size={14} className="text-amber-400" />
                        <span className="text-xs text-muted">RevPAR</span>
                    </div>
                    <p className="text-lg font-bold text-heading">{f(report.revpar)}</p>
                </div>
            </div>

            {/* Revenue by Room Type */}
            {report.revenue_by_room_type?.length > 0 && (
                <div className="bg-surface-card rounded-lg border border-border overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border bg-surface-raised/30">
                        <h4 className="text-xs font-semibold text-muted uppercase">Revenue by Room Type</h4>
                    </div>
                    <div className="divide-y divide-border/50">
                        {report.revenue_by_room_type.map((rt) => (
                            <div key={rt.room_type} className="flex items-center justify-between px-4 py-2.5 text-sm">
                                <span className="text-heading font-medium capitalize">{rt.room_type.replace(/_/g, ' ')}</span>
                                <div className="flex items-center gap-4">
                                    <span className="text-muted text-xs">{rt.nights_sold} nights</span>
                                    <span className="text-muted text-xs">ADR {f(rt.average_rate)}</span>
                                    <span className="text-green-400 font-medium">{f(rt.total_revenue)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Restaurant Analytics Panel ──────────────
function RestaurantAnalytics({ start, end }: { start: string; end: string }) {
    const { data: report, isLoading } = useRestaurantReport(start, end) as {
        data: {
            total_revenue: number;
            total_orders: number;
            average_order_value: number;
            top_sellers: Array<{ item_name: string; category: string; quantity_sold: number; revenue: number; margin_percent: number | null }>;
            payment_split: Array<{ method: string; amount: number; count: number }>;
            tax_collected: number;
            service_charge_collected: number;
        } | undefined;
        isLoading: boolean;
    };

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 p-4 text-muted text-sm">
                <Loader2 size={14} className="animate-spin" /> Loading analytics...
            </div>
        );
    }
    if (!report) return null;

    return (
        <div className="space-y-3">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface-card rounded-lg p-3 border border-border">
                    <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp size={14} className="text-green-400" />
                        <span className="text-xs text-muted">Revenue</span>
                    </div>
                    <p className="text-lg font-bold text-heading">{f(report.total_revenue)}</p>
                </div>
                <div className="bg-surface-card rounded-lg p-3 border border-border">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Receipt size={14} className="text-blue-400" />
                        <span className="text-xs text-muted">Orders</span>
                    </div>
                    <p className="text-lg font-bold text-heading">{report.total_orders}</p>
                </div>
                <div className="bg-surface-card rounded-lg p-3 border border-border">
                    <div className="flex items-center gap-1.5 mb-1">
                        <BarChart3 size={14} className="text-purple-400" />
                        <span className="text-xs text-muted">Avg Order</span>
                    </div>
                    <p className="text-lg font-bold text-heading">{f(report.average_order_value)}</p>
                </div>
                <div className="bg-surface-card rounded-lg p-3 border border-border">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Users size={14} className="text-amber-400" />
                        <span className="text-xs text-muted">Tax Collected</span>
                    </div>
                    <p className="text-lg font-bold text-heading">{f(report.tax_collected)}</p>
                </div>
            </div>

            {/* Top Sellers */}
            {report.top_sellers?.length > 0 && (
                <div className="bg-surface-card rounded-lg border border-border overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border bg-surface-raised/30">
                        <h4 className="text-xs font-semibold text-muted uppercase">Top Sellers</h4>
                    </div>
                    <div className="divide-y divide-border/50">
                        {report.top_sellers.slice(0, 8).map((item, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                                <div className="flex items-center gap-3">
                                    <span className="text-muted text-xs w-5">#{i + 1}</span>
                                    <div>
                                        <span className="text-heading font-medium">{item.item_name}</span>
                                        <span className="text-muted text-xs ml-2 capitalize">{item.category}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-muted text-xs">{item.quantity_sold} sold</span>
                                    {item.margin_percent != null && (
                                        <span className="text-muted text-xs">{Number(item.margin_percent).toFixed(0)}% margin</span>
                                    )}
                                    <span className="text-green-400 font-medium">{f(item.revenue)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Payment Split */}
            {report.payment_split?.length > 0 && (
                <div className="bg-surface-card rounded-lg border border-border overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border bg-surface-raised/30">
                        <h4 className="text-xs font-semibold text-muted uppercase">Payment Methods</h4>
                    </div>
                    <div className="divide-y divide-border/50">
                        {report.payment_split.map((pm) => (
                            <div key={pm.method} className="flex items-center justify-between px-4 py-2.5 text-sm">
                                <span className="text-heading font-medium capitalize">{pm.method.replace(/_/g, ' ')}</span>
                                <div className="flex items-center gap-4">
                                    <span className="text-muted text-xs">{pm.count} txns</span>
                                    <span className="text-green-400 font-medium">{f(pm.amount)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
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
            <div className="text-center py-12 text-muted">
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
                    <tr className="bg-surface-base/50 text-muted text-left">
                        <th className="px-4 py-3 font-medium">Date/Time</th>
                        <th className="px-4 py-3 font-medium">Description</th>
                        <th className="px-4 py-3 font-medium">Guest</th>
                        {department === 'accommodation' && <th className="px-4 py-3 font-medium">Room</th>}
                        <th className="px-4 py-3 font-medium text-right">Net</th>
                        <th className="px-4 py-3 font-medium text-right">Tax</th>
                        <th className="px-4 py-3 font-medium text-right">Gross</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                    {enrichedCharges.map((charge) => (
                        <tr key={charge.id} className="hover:bg-surface-raised/30">
                            <td className="px-4 py-3 text-muted">
                                {format(new Date(charge.charge_date), 'dd MMM HH:mm')}
                            </td>
                            <td className="px-4 py-3 text-muted max-w-[200px] truncate" title={charge.description}>
                                {charge.description}
                            </td>
                            <td className="px-4 py-3 text-muted">
                                {charge.guestName}
                            </td>
                            {department === 'accommodation' && (
                                <td className="px-4 py-3">
                                    {charge.roomNumber && (
                                        <span className="px-2 py-0.5 bg-surface-raised rounded text-xs text-muted">
                                            Room {charge.roomNumber}
                                        </span>
                                    )}
                                </td>
                            )}
                            <td className="px-4 py-3 text-right text-muted">
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
            <div className="p-4 border-b border-border">
                <button onClick={onAddNew} className="btn btn-primary gap-2">
                    <Plus size={16} />
                    Record Other Income
                </button>
            </div>

            {incomeList.length === 0 ? (
                <div className="text-center py-12 text-muted">
                    <Receipt size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No other income recorded</p>
                    <p className="text-sm mt-1">Add venue rentals, pool fees, etc.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-surface-base/50 text-muted text-left">
                                <th className="px-4 py-3 font-medium">Date</th>
                                <th className="px-4 py-3 font-medium">Category</th>
                                <th className="px-4 py-3 font-medium">Description</th>
                                <th className="px-4 py-3 font-medium">Method</th>
                                <th className="px-4 py-3 font-medium text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {incomeList.map((income) => (
                                <tr key={income.id} className="hover:bg-surface-raised/30">
                                    <td className="px-4 py-3 text-muted">
                                        {format(new Date(income.date), 'dd MMM HH:mm')}
                                    </td>
                                    <td className="px-4 py-3 text-muted">
                                        <span className="px-2 py-0.5 rounded bg-surface-raised text-xs">
                                            {categoryLabels[income.category]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-muted max-w-[200px] truncate">
                                        {income.description}
                                    </td>
                                    <td className="px-4 py-3 text-muted capitalize">
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
