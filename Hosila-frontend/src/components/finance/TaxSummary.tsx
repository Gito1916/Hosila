import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { Calendar, Receipt, TrendingUp, Filter, DollarSign, Percent } from 'lucide-react';
// import { getHotel } from '@/db/settings';
import { requireSupabase, getHotelId } from '@/lib/api';
import { useTaxSettings } from '@/hooks/useHosilaApi';

type DateFilter = 'today' | 'week' | 'month' | 'custom';

export function TaxSummary() {
    const [dateFilter, setDateFilter] = useState<DateFilter>('month');
    const [customStartDate, setCustomStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    const [customEndDate, setCustomEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    // Get backend tax settings
    // const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: getHotel });
    const { data: taxSettingsData } = useTaxSettings();
    const settings = taxSettingsData?.settings ?? [];

    // Find per-department settings from the API
    const accSettings = settings.find(s => s.department === 'accommodation') ?? settings.find(s => s.department === 'all');
    // restSettings available for future per-department display

    // Calculate date range based on filter
    const dateRange = useMemo(() => {
        const now = new Date();
        switch (dateFilter) {
            case 'today':
                return { start: startOfDay(now), end: endOfDay(now) };
            case 'week':
                return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
            case 'month':
                return { start: startOfMonth(now), end: endOfMonth(now) };
            case 'custom':
                return {
                    start: startOfDay(new Date(customStartDate)),
                    end: endOfDay(new Date(customEndDate)),
                };
        }
    }, [dateFilter, customStartDate, customEndDate]);

    // Fetch charges with v2 tax breakdown columns
    const { data: charges } = useQuery({
        queryKey: ['charges', dateRange], queryFn: async () => {
            const all = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('charges').select('*').eq('hotel_id', hotelId); return data ?? []; })();
            return all.filter((c: any) => {
                const d = new Date(c.charge_date);
                return d >= dateRange.start && d <= dateRange.end &&
                    (c.status === 'active' || c.status === 'partially_refunded');
            });
        }, enabled: !!dateRange
    });

    // ═══ v2 Tax Summary — uses backfilled SC / VAT / TDL columns ═══
    const taxSummary = useMemo(() => {
        const all = charges ?? [];

        const byDept = (dept: string) => {
            const rows = all.filter((c: any) => c.department === dept);
            return {
                revenue: rows.reduce((s: number, c: any) => s + (c.base_amount ?? c.net_revenue ?? c.gross_amount), 0),
                sc: rows.reduce((s: number, c: any) => s + (c.service_charge_amount ?? 0), 0),
                vat: rows.reduce((s: number, c: any) => s + (c.vat_amount_v2 ?? c.tax_amount ?? 0), 0),
                tdl: rows.reduce((s: number, c: any) => s + (c.tdl_amount ?? 0), 0),
            };
        };

        const accommodation = byDept('accommodation');
        const restaurant = byDept('restaurant');

        const otherRows = all.filter((c: any) => c.department === 'other_services' || c.department === 'other_income');
        const otherIncome = {
            revenue: otherRows.reduce((s: number, c: any) => s + (c.base_amount ?? c.net_revenue ?? c.gross_amount), 0),
            sc: otherRows.reduce((s: number, c: any) => s + (c.service_charge_amount ?? 0), 0),
            vat: otherRows.reduce((s: number, c: any) => s + (c.vat_amount_v2 ?? c.tax_amount ?? 0), 0),
            tdl: otherRows.reduce((s: number, c: any) => s + (c.tdl_amount ?? 0), 0),
        };

        const totalSC = accommodation.sc + restaurant.sc + otherIncome.sc;
        const totalVAT = accommodation.vat + restaurant.vat + otherIncome.vat;
        const totalTDL = accommodation.tdl + restaurant.tdl + otherIncome.tdl;
        const totalTax = totalSC + totalVAT + totalTDL;

        return { accommodation, restaurant, otherIncome, totalSC, totalVAT, totalTDL, totalTax };
    }, [charges]);

    const f = (n: number) => `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="space-y-6">
            {/* Header with Date Filters */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Receipt size={24} className="text-primary-400" />
                    <h2 className="text-xl font-bold text-white">Tax Summary</h2>
                </div>

                <div className="flex items-center gap-2">
                    <Filter size={16} className="text-slate-400" />
                    <div className="flex rounded-lg overflow-hidden border border-slate-700">
                        {(['today', 'week', 'month', 'custom'] as DateFilter[]).map((filter) => (
                            <button
                                key={filter}
                                onClick={() => setDateFilter(filter)}
                                className={`px-3 py-1.5 text-sm font-medium transition-colors ${dateFilter === filter
                                    ? 'bg-primary-500 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                                    }`}
                            >
                                {filter === 'today' ? 'Today' :
                                    filter === 'week' ? 'This Week' :
                                        filter === 'month' ? 'This Month' : 'Custom'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Custom Date Range */}
            {dateFilter === 'custom' && (
                <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <Calendar size={18} className="text-slate-400" />
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="input py-1.5"
                        />
                        <span className="text-slate-400">to</span>
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="input py-1.5"
                        />
                    </div>
                </div>
            )}

            {/* Date Range Label */}
            <p className="text-sm text-slate-400">
                Showing data from {format(dateRange.start, 'MMM d, yyyy')} to {format(dateRange.end, 'MMM d, yyyy')}
            </p>

            {/* ═══ Top KPI Cards — SC / VAT / TDL / Total ═══ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                    <div className="flex items-center gap-2 mb-1.5">
                        <Percent size={16} className="text-blue-400" />
                        <span className="text-slate-400 text-sm">Service Charge</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{f(taxSummary.totalSC)}</p>
                    <p className="text-xs text-slate-500 mt-1">{accSettings?.service_charge_rate ?? 10}% rate</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                    <div className="flex items-center gap-2 mb-1.5">
                        <Receipt size={16} className="text-green-400" />
                        <span className="text-slate-400 text-sm">VAT Collected</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{f(taxSummary.totalVAT)}</p>
                    <p className="text-xs text-slate-500 mt-1">{accSettings?.vat_rate ?? 7.5}% rate</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                    <div className="flex items-center gap-2 mb-1.5">
                        <TrendingUp size={16} className="text-amber-400" />
                        <span className="text-slate-400 text-sm">Tourism Levy</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{f(taxSummary.totalTDL)}</p>
                    <p className="text-xs text-slate-500 mt-1">{accSettings?.tdl_enabled ? `${accSettings.tdl_rate}%` : 'Disabled'}</p>
                </div>
                <div className="bg-gradient-to-r from-primary-500/20 to-purple-500/20 rounded-xl p-5 border border-primary-500/30">
                    <div className="flex items-center gap-2 mb-1.5">
                        <DollarSign size={16} className="text-primary-400" />
                        <span className="text-slate-300 text-sm font-medium">Total Tax</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{f(taxSummary.totalTax)}</p>
                </div>
            </div>

            {/* ═══ Detailed Breakdown Table ═══ */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={20} className="text-primary-400" />
                    <h3 className="text-lg font-semibold text-white">Tax Breakdown by Department</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-700">
                                <th className="text-left text-slate-400 text-sm font-medium py-3 pr-4">Department</th>
                                <th className="text-right text-slate-400 text-sm font-medium py-3 px-4">Base Revenue</th>
                                <th className="text-right text-blue-400 text-sm font-medium py-3 px-4">SC</th>
                                <th className="text-right text-green-400 text-sm font-medium py-3 px-4">VAT</th>
                                <th className="text-right text-amber-400 text-sm font-medium py-3 px-4">TDL</th>
                                <th className="text-right text-slate-400 text-sm font-medium py-3 pl-4">Total Tax</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { name: 'Accommodation', ...taxSummary.accommodation },
                                { name: 'Restaurant', ...taxSummary.restaurant },
                                { name: 'Other Income', ...taxSummary.otherIncome },
                            ].map((row) => (
                                <tr key={row.name} className="border-b border-slate-700/50">
                                    <td className="py-3 pr-4"><span className="text-white font-medium">{row.name}</span></td>
                                    <td className="text-right py-3 px-4 text-slate-300">{f(row.revenue)}</td>
                                    <td className="text-right py-3 px-4 text-blue-300">{f(row.sc)}</td>
                                    <td className="text-right py-3 px-4 text-green-300">{f(row.vat)}</td>
                                    <td className="text-right py-3 px-4 text-amber-300">{f(row.tdl)}</td>
                                    <td className="text-right py-3 pl-4 text-white font-medium">{f(row.sc + row.vat + row.tdl)}</td>
                                </tr>
                            ))}
                            <tr className="bg-slate-700/30">
                                <td className="py-3 pr-4"><span className="text-white font-bold">Total</span></td>
                                <td className="text-right py-3 px-4 text-white font-bold">
                                    {f(taxSummary.accommodation.revenue + taxSummary.restaurant.revenue + taxSummary.otherIncome.revenue)}
                                </td>
                                <td className="text-right py-3 px-4 text-blue-300 font-bold">{f(taxSummary.totalSC)}</td>
                                <td className="text-right py-3 px-4 text-green-300 font-bold">{f(taxSummary.totalVAT)}</td>
                                <td className="text-right py-3 px-4 text-amber-300 font-bold">{f(taxSummary.totalTDL)}</td>
                                <td className="text-right py-3 pl-4 text-primary-400 font-bold text-lg">{f(taxSummary.totalTax)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Info Note */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-300">
                    <strong>Note:</strong> Tax breakdown now shows Service Charge (SC), VAT, and Tourism Development Levy (TDL) separately.
                    Rates are configured per-department in the Hosila API.
                    {accSettings && <> VAT: {accSettings.vat_rate}%, SC: {accSettings.service_charge_rate}%, TDL: {accSettings.tdl_enabled ? `${accSettings.tdl_rate}%` : 'Disabled'}.</>}
                </p>
            </div>
        </div>
    );
}
