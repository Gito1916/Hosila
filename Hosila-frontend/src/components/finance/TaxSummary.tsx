import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
    Receipt,
    TrendingUp,
    DollarSign,
    Percent,
    Download,
    CheckCircle,
    Loader2,
    FileText,
} from 'lucide-react';
import { requireSupabase, getHotelId } from '@/lib/api';
import { useHotel } from '@/hooks/useSupabaseData';
import { useTaxSettings, useTaxRemittanceReport, useMarkRemitted, useReportDownload } from '@/hooks/useHosilaApi';
import { toast } from '@/lib/errorMessages';

interface TaxSummaryProps {
    startDate: Date;
    endDate: Date;
}

export function TaxSummary({ startDate, endDate }: TaxSummaryProps) {
    // ── Backend tax settings ─────────────────────────────────
    const { data: taxSettingsData } = useTaxSettings();
    const { data: hotel } = useHotel();
    const tdlName = hotel?.settings?.tdl_name || 'TDL';
    const settings = taxSettingsData?.settings ?? [];
    const accSettings = settings.find(s => s.department === 'accommodation') ?? settings.find(s => s.department === 'all');

    // ── Charge data from Supabase ────────────────────────────
    const { data: charges } = useQuery({
        queryKey: ['charges', startDate.toISOString(), endDate.toISOString()],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('charges').select('*').eq('hotel_id', hotelId);
            return (data ?? []).filter((c: any) => {
                const d = new Date(c.charge_date);
                return d >= startDate && d <= endDate &&
                    (c.status === 'active' || c.status === 'partially_refunded');
            });
        },
    });

    // ── Tax summary calculations ─────────────────────────────
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

    // ── Remittance data ──────────────────────────────────────
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    const { data: remittanceData, isLoading: remittanceLoading } = useTaxRemittanceReport(startStr, endStr) as {
        data: { remittances?: Array<{ tax_type: string; status: string; amount: number }> } | undefined;
        isLoading: boolean;
    };
    const markRemitted = useMarkRemitted();
    const downloadMutation = useReportDownload();

    const [remitNotes, setRemitNotes] = useState('');

    const handleMarkRemitted = async (taxType: string) => {
        try {
            await markRemitted.mutateAsync({
                taxType,
                periodStart: startStr,
                periodEnd: endStr,
                notes: remitNotes || undefined,
            });
            toast.success(`${taxType.toUpperCase()} marked as remitted`);
            setRemitNotes('');
        } catch (err) {
            toast.error('Failed to mark as remitted', err);
        }
    };

    const handleExport = async (fmt: 'pdf' | 'excel') => {
        try {
            await downloadMutation.mutateAsync({
                type: 'tax-remittance',
                start: startStr,
                end: endStr,
                format: fmt,
            });
            toast.success(`Report downloaded as ${fmt.toUpperCase()}`);
        } catch (err) {
            toast.error('Failed to download report', err);
        }
    };

    const f = (n: number) => `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Receipt size={24} className="text-primary-400" />
                    <h2 className="text-xl font-bold text-white">Tax Summary</h2>
                </div>
                <p className="text-sm text-slate-400">
                    {format(startDate, 'MMM d, yyyy')} — {format(endDate, 'MMM d, yyyy')}
                </p>
            </div>

            {/* ═══ Top KPI Cards — SC / VAT / {tdlName} / Total ═══ */}
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
                        <span className="text-slate-400 text-sm">{tdlName}</span>
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
                                <th className="text-right text-amber-400 text-sm font-medium py-3 px-4">{tdlName}</th>
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

            {/* ═══ Tax Remittance Section ═══ */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FileText size={20} className="text-emerald-400" />
                        <h3 className="text-lg font-semibold text-white">Tax Remittance</h3>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleExport('excel')}
                            disabled={downloadMutation.isPending}
                            className="btn btn-secondary text-sm"
                        >
                            {downloadMutation.isPending ? (
                                <Loader2 size={14} className="mr-1.5 animate-spin" />
                            ) : (
                                <Download size={14} className="mr-1.5" />
                            )}
                            Excel
                        </button>
                        <button
                            onClick={() => handleExport('pdf')}
                            disabled={downloadMutation.isPending}
                            className="btn btn-secondary text-sm"
                        >
                            {downloadMutation.isPending ? (
                                <Loader2 size={14} className="mr-1.5 animate-spin" />
                            ) : (
                                <Download size={14} className="mr-1.5" />
                            )}
                            PDF
                        </button>
                    </div>
                </div>

                {remittanceLoading ? (
                    <div className="text-center py-6">
                        <Loader2 className="animate-spin mx-auto text-slate-400" size={24} />
                        <p className="text-slate-500 text-sm mt-2">Loading remittance data...</p>
                    </div>
                ) : (
                    <>
                        {/* Remittance status cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { type: 'vat', label: 'VAT', amount: taxSummary.totalVAT, color: 'green' },
                                { type: 'tdl', label: tdlName, amount: taxSummary.totalTDL, color: 'amber' },
                                { type: 'service_charge', label: 'Service Charge', amount: taxSummary.totalSC, color: 'blue' },
                            ].map((tax) => {
                                const remitted = remittanceData?.remittances?.find(
                                    (r: any) => r.tax_type === tax.type && r.status === 'remitted',
                                );
                                return (
                                    <div
                                        key={tax.type}
                                        className={`p-4 rounded-lg border ${remitted
                                            ? 'bg-emerald-500/10 border-emerald-500/30'
                                            : 'bg-slate-700/30 border-slate-700'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-slate-300">{tax.label}</span>
                                            {remitted && (
                                                <span className="flex items-center gap-1 text-xs text-emerald-400">
                                                    <CheckCircle size={12} />
                                                    Remitted
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-lg font-bold text-white mb-3">{f(tax.amount)}</p>
                                        {!remitted && tax.amount > 0 && (
                                            <button
                                                onClick={() => handleMarkRemitted(tax.type)}
                                                disabled={markRemitted.isPending}
                                                className="btn btn-primary text-xs w-full"
                                            >
                                                {markRemitted.isPending ? (
                                                    <Loader2 size={12} className="mr-1 animate-spin" />
                                                ) : (
                                                    <CheckCircle size={12} className="mr-1" />
                                                )}
                                                Mark as Remitted
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Optional notes for remittance */}
                        <div className="flex items-center gap-3">
                            <input
                                type="text"
                                value={remitNotes}
                                onChange={(e) => setRemitNotes(e.target.value)}
                                placeholder="Add notes (e.g. reference number, receipt ID)"
                                className="input flex-1 text-sm"
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Info Note */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-300">
                    <strong>Note:</strong> Tax breakdown shows Service Charge (SC), VAT, and {tdlName} separately.
                    Rates are configured per-department in Settings → Finance.
                    {accSettings && <> VAT: {accSettings.vat_rate}%, SC: {accSettings.service_charge_rate}%, {tdlName}: {accSettings.tdl_enabled ? `${accSettings.tdl_rate}%` : 'Disabled'}.</>}
                </p>
            </div>
        </div>
    );
}
