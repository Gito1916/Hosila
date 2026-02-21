import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, subDays } from 'date-fns';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    AlertCircle,
    Scale,
    Wallet,
    Receipt,
    PlusCircle,
} from 'lucide-react';
import { PendingCharges } from './PendingCharges';
import { getAllExpenses } from '@/db/finance';
import { getAllPayments } from '@/db/bookings';
import { getAllCharges } from '@/db/accounting';
import { requireSupabase, getHotelId } from '@/lib/api';
import { useExpenses } from '@/hooks/useSupabaseData';
import { useDashboardKPIs } from '@/hooks/useHosilaApi';
import type { ExpenseCategory } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────
type DateFilter = 'daily' | 'weekly' | 'monthly' | 'yearly';
type NavigateTarget = 'income' | 'expenses' | 'transactions';

interface FinanceDashboardProps {
    dateFilter?: DateFilter;
    onNavigate?: (target: NavigateTarget, section?: string) => void;
    onAddExpense?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function getDateRange(filter: DateFilter): { start: Date; end: Date; label: string } {
    const now = new Date();
    switch (filter) {
        case 'daily':
            return { start: startOfDay(now), end: endOfDay(now), label: "Today's" };
        case 'weekly':
            return { start: startOfWeek(now), end: endOfWeek(now), label: "This Week's" };
        case 'monthly':
            return { start: startOfMonth(now), end: endOfMonth(now), label: format(now, 'MMMM') };
        case 'yearly':
            return { start: startOfYear(now), end: endOfDay(now), label: format(now, 'yyyy') };
    }
}

function fmt(n: number): string {
    if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
    return `₦${n.toLocaleString()}`;
}

// ─── Mini Sparkline (pure SVG) ───────────────────────────────────────
function Sparkline({ data, color, width = 80, height = 28 }: {
    data: number[];
    color: string;
    width?: number;
    height?: number;
}) {
    if (!data.length || data.every(d => d === 0)) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * width;
        const y = height - ((v - min) / range) * (height - 4) - 2;
        return `${x},${y}`;
    });
    const gradId = `spark-${color.replace('#', '')}`;
    return (
        <svg width={width} height={height} className="mt-2">
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            <polygon
                points={`0,${height} ${pts.join(' ')} ${width},${height}`}
                fill={`url(#${gradId})`}
            />
            <polyline
                points={pts.join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// ─── KPI Card ────────────────────────────────────────────────────────
function KpiCard({ label, value, trend, trendLabel, icon: Icon, accentColor, sparkData, onClick }: {
    label: string;
    value: string;
    trend?: 'up' | 'down' | 'neutral';
    trendLabel?: string;
    icon: typeof TrendingUp;
    accentColor: string;
    sparkData?: number[];
    onClick?: () => void;
}) {
    const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null;
    const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-slate-500';
    return (
        <div
            onClick={onClick}
            className={`finance-card relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 p-5 transition-all hover:border-slate-600 ${onClick ? 'cursor-pointer hover:bg-slate-700' : ''}`}
        >
            {/* Gradient top accent */}
            <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
            />
            <div className="flex items-center gap-2 text-slate-400 mb-2">
                <Icon size={14} style={{ color: accentColor }} />
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <div className="flex items-center justify-between mt-1">
                {TrendIcon && trendLabel ? (
                    <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
                        <TrendIcon size={12} />
                        <span>{trendLabel}</span>
                    </div>
                ) : trendLabel ? (
                    <span className="text-xs text-slate-500">{trendLabel}</span>
                ) : <span />}
                {sparkData && <Sparkline data={sparkData} color={accentColor} />}
            </div>
        </div>
    );
}

// ─── Donut Chart with Center KPI ─────────────────────────────────────
function DonutCard({ title, centerValue, centerLabel, segments, legendBelow = true }: {
    title: string;
    centerValue: string;
    centerLabel: string;
    segments: { name: string; value: number; color: string; pct: string }[];
    legendBelow?: boolean;
}) {
    const hasData = segments.some(s => s.value > 0);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void legendBelow;
    return (
        <div className="finance-card rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
            <div className="flex items-center gap-6">
                <div className="relative w-[140px] h-[140px] flex-shrink-0">
                    {hasData ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={segments}
                                    dataKey="value"
                                    innerRadius={55}
                                    outerRadius={68}
                                    paddingAngle={4}
                                    cornerRadius={8}
                                    strokeWidth={0}
                                >
                                    {segments.map((s, i) => (
                                        <Cell key={i} fill={s.color} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="w-full h-full rounded-full border-4 border-slate-700 flex items-center justify-center">
                            <span className="text-slate-500 text-xs">No data</span>
                        </div>
                    )}
                    {/* Center KPI overlay */}
                    {hasData && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-sm font-bold text-white leading-none">{centerValue}</span>
                            <span className="text-[10px] text-slate-400 mt-0.5">{centerLabel}</span>
                        </div>
                    )}
                </div>
                {/* Legend */}
                {legendBelow && (
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                        {segments.map((s, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 truncate">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                                    <span className="text-slate-300 truncate">{s.name}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                    <span className="text-white font-medium">{s.pct}</span>
                                    <span className="text-slate-500 text-xs">{fmt(s.value)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Profit Margin Gauge (SVG semicircle) ────────────────────────────
function MarginGauge({ margin }: { margin: number }) {
    const clamped = Math.max(0, Math.min(100, margin));
    const r = 60;
    const cx = 75;
    const cy = 70;
    const circ = Math.PI * r; // half-circle circumference
    const filled = (clamped / 100) * circ;
    const gaugeColor = clamped >= 60 ? '#10b981' : clamped >= 30 ? '#f59e0b' : '#ef4444';
    return (
        <div className="finance-card rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Profit Margin</h3>
            <div className="flex flex-col items-center">
                <svg width={150} height={85} viewBox="0 0 150 85">
                    {/* Background arc */}
                    <path
                        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                        fill="none"
                        stroke="#334155"
                        strokeWidth={10}
                        strokeLinecap="round"
                    />
                    {/* Filled arc */}
                    <path
                        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                        fill="none"
                        stroke={gaugeColor}
                        strokeWidth={10}
                        strokeLinecap="round"
                        strokeDasharray={`${filled} ${circ}`}
                        style={{ filter: `drop-shadow(0 0 6px ${gaugeColor}66)` }}
                    />
                    {/* Center text */}
                    <text x={cx} y={cy - 10} textAnchor="middle" className="gauge-value-text" fill="currentColor" fontSize={24} fontWeight="bold">
                        {Math.round(clamped)}%
                    </text>
                    <text x={cx} y={cy + 6} textAnchor="middle" className="gauge-label-text" fill="#94a3b8" fontSize={10}>
                        margin
                    </text>
                </svg>
            </div>
        </div>
    );
}

// ─── Expense Category Colors & Labels ────────────────────────────────
const categoryLabels: Record<ExpenseCategory, string> = {
    utilities: 'Utilities', maintenance: 'Maintenance', supplies: 'Supplies',
    salaries: 'Salaries', marketing: 'Marketing', caution_refund: 'Caution Refund',
    cancellation_refund: 'Cancel Refund', caution_deposit_refund: 'Deposit Refund', other: 'Other',
};
const categoryColors: Record<ExpenseCategory, string> = {
    utilities: '#f59e0b', maintenance: '#f97316', supplies: '#10b981',
    salaries: '#3b82f6', marketing: '#a855f7', caution_refund: '#78716c',
    cancellation_refund: '#ef4444', caution_deposit_refund: '#ec4899', other: '#64748b',
};

// ─── Custom Recharts Tooltip ─────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="card px-3 py-2 shadow-xl">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="text-sm font-bold text-white">₦{payload[0].value.toLocaleString()}</p>
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export function FinanceDashboard({ dateFilter = 'daily', onNavigate, onAddExpense }: FinanceDashboardProps) {
    const { start, end, label } = getDateRange(dateFilter);

    // ── Backend KPIs (supplementary) ─────────────────────────────────
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    const { data: backendKPIs } = useDashboardKPIs(startStr, endStr);

    // ── Data fetching ────────────────────────────────────────────────
    const { data: expenses } = useQuery({ queryKey: ['expenses'], queryFn: getAllExpenses });
    const { data: payments } = useQuery({ queryKey: ['payments'], queryFn: getAllPayments });
    const { data: charges } = useQuery({ queryKey: ['charges'], queryFn: getAllCharges });
    const { data: paymentAllocations } = useQuery({
        queryKey: ['payment_allocations'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('payment_allocations').select('*').eq('hotel_id', hotelId);
            return data ?? [];
        },
    });
    const { data: allExpenses } = useExpenses();

    // ── Revenue calculations ─────────────────────────────────────────
    const filteredCharges = useMemo(() => (charges ?? []).filter(c => {
        const d = new Date(c.charge_date);
        return d >= start && d <= end && (c.status === 'active' || c.status === 'partially_refunded');
    }), [charges, start, end]);

    const accommodationRevenue = filteredCharges
        .filter(c => c.department === 'accommodation')
        .reduce((sum, c) => sum + (c.net_revenue ?? c.gross_amount), 0);

    const fnbRevenue = filteredCharges
        .filter(c => c.department === 'restaurant')
        .reduce((sum, c) => sum + (c.net_revenue ?? c.gross_amount), 0);

    const otherIncomeTotal = filteredCharges
        .filter(c => c.department === 'other_services' || c.department === 'other_income')
        .reduce((sum, c) => sum + (c.net_revenue ?? c.gross_amount), 0);

    const totalTaxCollected = filteredCharges
        .reduce((sum, c) => sum + (c.tax_amount ?? 0), 0);

    const totalRevenue = accommodationRevenue + fnbRevenue + otherIncomeTotal;

    // ── Expenses ─────────────────────────────────────────────────────
    const filteredExpenses = useMemo(() =>
        (expenses ?? []).filter(e => {
            const d = new Date(e.date);
            return d >= start && d <= end;
        }), [expenses, start, end]);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = totalRevenue - totalExpenses;

    // ExpensesByCategory data
    const expensesForCategory = useMemo(() => {
        if (!allExpenses) return [];
        return allExpenses.filter(e => {
            const d = new Date(e.date);
            return d >= start && d <= end;
        });
    }, [allExpenses, start, end]);

    const categoryTotals = expensesForCategory.reduce<Record<ExpenseCategory, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
    }, {} as Record<ExpenseCategory, number>);
    const totalCatExpenses = Object.values(categoryTotals).reduce((s, v) => s + v, 0);
    const sortedCategories = Object.entries(categoryTotals)
        .sort(([, a], [, b]) => (b as number) - (a as number)) as [ExpenseCategory, number][];

    // ── Payment method breakdown ─────────────────────────────────────
    const filteredPayments = (payments ?? []).filter(p => {
        const d = new Date(p.payment_time);
        return d >= start && d <= end;
    });
    const totalChargesGross = filteredCharges.reduce((sum, c) => sum + c.gross_amount, 0);
    const totalChargesNet = filteredCharges.reduce((sum, c) => sum + (c.net_revenue ?? c.gross_amount), 0);
    const taxRatio = totalChargesGross > 0 ? 1 - (totalChargesNet / totalChargesGross) : 0;

    const byMethod = filteredPayments.reduce((acc, p) => {
        const netAmount = Math.round(p.amount * (1 - taxRatio) * 100) / 100;
        acc[p.payment_method] = (acc[p.payment_method] || 0) + netAmount;
        return acc;
    }, { cash: 0, transfer: 0, pos: 0 } as Record<string, number>);
    const totalCollected = byMethod.cash + byMethod.transfer + byMethod.pos;

    // ── Outstanding ──────────────────────────────────────────────────
    const activeCharges = (charges ?? []).filter(c => c.status === 'active' || c.status === 'partially_refunded');
    const activeAllocations = (paymentAllocations ?? []).filter(a => a.status === 'active');
    const outstandingByBooking: Record<string, number> = {};
    for (const charge of activeCharges) {
        if (!charge.booking_id) continue;
        const paidOnCharge = activeAllocations
            .filter(a => a.charge_id === charge.id)
            .reduce((sum, a) => sum + a.allocated_amount, 0);
        const chargeBalance = charge.gross_amount - paidOnCharge;
        if (chargeBalance > 0) {
            outstandingByBooking[charge.booking_id] = (outstandingByBooking[charge.booking_id] || 0) + chargeBalance;
        }
    }
    const outstanding = {
        total: Object.values(outstandingByBooking).reduce((sum, v) => sum + v, 0),
        count: Object.keys(outstandingByBooking).length,
    };

    // ── Sparkline data (last 7 days) ─────────────────────────────────
    const sparklineData = useMemo(() => {
        const result: { revenue: number[]; expense: number[]; profit: number[] } = {
            revenue: [], expense: [], profit: [],
        };
        for (let i = 6; i >= 0; i--) {
            const d = subDays(new Date(), i);
            const ds = startOfDay(d);
            const de = endOfDay(d);
            const rev = (charges ?? [])
                .filter(c => { const cd = new Date(c.charge_date); return cd >= ds && cd <= de && (c.status === 'active' || c.status === 'partially_refunded'); })
                .reduce((s, c) => s + (c.net_revenue ?? c.gross_amount), 0);
            const exp = (expenses ?? [])
                .filter(e => { const ed = new Date(e.date); return ed >= ds && ed <= de; })
                .reduce((s, e) => s + e.amount, 0);
            result.revenue.push(rev);
            result.expense.push(exp);
            result.profit.push(rev - exp);
        }
        return result;
    }, [charges, expenses]);

    // ── Chart data (7 or 12 points) ──────────────────────────────────
    const chartDays = dateFilter === 'yearly' ? 12 : 7;
    const chartData = useMemo(() => {
        const data: Array<{ name: string; revenue: number }> = [];
        for (let i = chartDays - 1; i >= 0; i--) {
            const day = dateFilter === 'yearly'
                ? new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)
                : subDays(new Date(), i);
            const dayStart = startOfDay(day);
            const dayEnd = endOfDay(day);
            const dayRevenue = (charges ?? [])
                .filter(c => { const d = new Date(c.charge_date); return d >= dayStart && d <= dayEnd && (c.status === 'active' || c.status === 'partially_refunded'); })
                .reduce((s, c) => s + (c.net_revenue ?? c.gross_amount), 0);
            data.push({
                name: dateFilter === 'yearly' ? format(day, 'MMM') : format(day, 'EEE'),
                revenue: dayRevenue,
            });
        }
        return data;
    }, [charges, dateFilter, chartDays]);

    // ── Donut segments ───────────────────────────────────────────────
    const revSegments = [
        { name: 'Rooms', value: accommodationRevenue, color: '#10b981', pct: totalRevenue > 0 ? `${Math.round((accommodationRevenue / totalRevenue) * 100)}%` : '0%' },
        { name: 'Restaurant', value: fnbRevenue, color: '#06b6d4', pct: totalRevenue > 0 ? `${Math.round((fnbRevenue / totalRevenue) * 100)}%` : '0%' },
        { name: 'Other', value: otherIncomeTotal, color: '#a855f7', pct: totalRevenue > 0 ? `${Math.round((otherIncomeTotal / totalRevenue) * 100)}%` : '0%' },
    ];
    const paySegments = [
        { name: 'Cash', value: byMethod.cash, color: '#10b981', pct: totalCollected > 0 ? `${Math.round((byMethod.cash / totalCollected) * 100)}%` : '0%' },
        { name: 'Transfer', value: byMethod.transfer, color: '#3b82f6', pct: totalCollected > 0 ? `${Math.round((byMethod.transfer / totalCollected) * 100)}%` : '0%' },
        { name: 'POS', value: byMethod.pos, color: '#a855f7', pct: totalCollected > 0 ? `${Math.round((byMethod.pos / totalCollected) * 100)}%` : '0%' },
    ];

    // ── Profit margin ────────────────────────────────────────────────
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // ═════════════════════════════════════════════════════════════════
    // RENDER
    // ═════════════════════════════════════════════════════════════════
    return (
        <div className="space-y-6">
            {/* Pending Charges Alert */}
            <PendingCharges />

            {/* ─── ROW 1: KPI CARDS ────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <KpiCard
                    label="Total Revenue"
                    value={fmt(totalRevenue)}
                    trend={totalRevenue > 0 ? 'up' : 'neutral'}
                    trendLabel={totalRevenue > 0 ? 'Revenue' : 'No revenue'}
                    icon={TrendingUp}
                    accentColor="#10b981"
                    sparkData={sparklineData.revenue}
                    onClick={() => onNavigate?.('income')}
                />
                <KpiCard
                    label="Total Expenses"
                    value={fmt(totalExpenses)}
                    trend={totalExpenses > 0 ? 'down' : 'neutral'}
                    trendLabel={totalExpenses > 0 ? 'Spending' : 'No expenses'}
                    icon={TrendingDown}
                    accentColor="#ef4444"
                    sparkData={sparklineData.expense}
                    onClick={() => onNavigate?.('expenses')}
                />
                <KpiCard
                    label="Net Profit"
                    value={fmt(netProfit)}
                    trend={netProfit > 0 ? 'up' : netProfit < 0 ? 'down' : 'neutral'}
                    trendLabel={totalRevenue > 0 ? `${Math.round(profitMargin)}% margin` : 'N/A'}
                    icon={DollarSign}
                    accentColor="#3b82f6"
                    sparkData={sparklineData.profit}
                />
                <KpiCard
                    label="Outstanding"
                    value={fmt(outstanding.total)}
                    trendLabel={outstanding.count > 0 ? `${outstanding.count} guest${outstanding.count > 1 ? 's' : ''}` : 'All clear'}
                    icon={AlertCircle}
                    accentColor="#f59e0b"
                />
                <KpiCard
                    label={`${label} Tax`}
                    value={fmt(
                        backendKPIs
                            ? (backendKPIs.total_vat_collected + backendKPIs.total_tdl_collected + backendKPIs.total_service_charge)
                            : totalTaxCollected
                    )}
                    trendLabel={backendKPIs ? `VAT ${fmt(backendKPIs.total_vat_collected)} · TDL ${fmt(backendKPIs.total_tdl_collected)}` : 'Collected'}
                    icon={Scale}
                    accentColor="#f59e0b"
                />
            </div>

            {/* ─── ROW 2: DISTRIBUTION DONUTS ──────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DonutCard
                    title="Revenue Distribution"
                    centerValue={fmt(totalRevenue)}
                    centerLabel="Total Revenue"
                    segments={revSegments}
                />
                <DonutCard
                    title="Payment Methods"
                    centerValue={fmt(totalCollected)}
                    centerLabel="Collected"
                    segments={paySegments}
                />
            </div>

            {/* ─── ROW 3: REVENUE TREND AREA CHART ─────────────────── */}
            <div className="finance-card rounded-2xl border border-slate-700 bg-slate-800 p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <Wallet size={16} className="text-primary-400" />
                    Revenue Trend — {dateFilter === 'yearly' ? 'Monthly' : 'Last 7 Days'}
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                        <defs>
                            <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="chart-grid" stroke="#334155" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} className="chart-axis" axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} className="chart-axis" axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            fill="url(#revGradient)"
                            dot={{ r: 3, fill: '#3b82f6', stroke: '#1e293b', strokeWidth: 2 }}
                            activeDot={{ r: 5, fill: '#60a5fa', stroke: '#1e293b', strokeWidth: 2 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* ─── ROW 4: MARGIN GAUGE + EXPENSES BY CATEGORY ──────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MarginGauge margin={profitMargin} />

                {/* Expenses by Category */}
                <div className="finance-card rounded-2xl border border-slate-700 bg-slate-800 p-5">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <Receipt size={16} className="text-red-400" />
                        Expenses by Category
                    </h3>
                    {sortedCategories.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mb-3">
                                <Receipt size={20} className="text-slate-500" />
                            </div>
                            <p className="text-slate-400 text-sm mb-1">No expenses recorded</p>
                            <p className="text-slate-500 text-xs mb-4">Track spending by adding expenses</p>
                            {onAddExpense && (
                                <button onClick={onAddExpense} className="btn btn-secondary text-sm flex items-center gap-2">
                                    <PlusCircle size={14} />
                                    Add Expense
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {sortedCategories.map(([category, amount]) => {
                                const pct = totalCatExpenses > 0 ? (amount / totalCatExpenses) * 100 : 0;
                                return (
                                    <div key={category}>
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="text-slate-300">{categoryLabels[category]}</span>
                                            <span className="text-white font-medium">₦{amount.toLocaleString()}</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{
                                                    width: `${pct}%`,
                                                    backgroundColor: categoryColors[category],
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="pt-3 border-t border-slate-700 flex justify-between">
                                <span className="text-slate-400 text-sm">Total</span>
                                <span className="text-white font-bold">₦{totalCatExpenses.toLocaleString()}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
