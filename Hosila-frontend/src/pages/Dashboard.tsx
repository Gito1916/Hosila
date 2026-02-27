import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useReservations, useBookings } from '@/hooks/useSupabaseData';
import {
    getTodayRevenue,
    getOccupancyStats,
} from '@/db/dashboard';
import { requireSupabase, getHotelId } from '@/lib/api';
import { KPICard, TodayActivity } from '@/components/dashboard';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import {
    DollarSign,
    ArrowDownCircle,
    ArrowUpCircle,
    Calendar,
    Activity,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export function DashboardPage() {
    const navigate = useNavigate();

    // Live data queries via React Query
    const { data: occupancy } = useQuery({ queryKey: ['dashboard', 'occupancy'], queryFn: getOccupancyStats });
    const { data: todayRevenue } = useQuery({ queryKey: ['dashboard', 'todayRevenue'], queryFn: getTodayRevenue });

    // Yesterday's revenue for trend comparison
    const { data: yesterdayRevenue } = useQuery({
        queryKey: ['dashboard', 'yesterdayRevenue'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const yesterday = subDays(new Date(), 1);
            const dayStart = startOfDay(yesterday).toISOString();
            const dayEnd = endOfDay(yesterday).toISOString();

            const { data: payments } = await sb
                .from('payments')
                .select('amount')
                .eq('hotel_id', hotelId)
                .gte('payment_time', dayStart)
                .lte('payment_time', dayEnd);

            return (payments ?? []).reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
        },
    });

    // Last 7 days revenue for chart — real data
    const { data: last7DaysRevenue } = useQuery({
        queryKey: ['dashboard', 'last7DaysRevenue'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const result: { name: string; revenue: number }[] = [];

            for (let i = 6; i >= 0; i--) {
                const day = subDays(new Date(), i);
                const dayStart = startOfDay(day).toISOString();
                const dayEnd = endOfDay(day).toISOString();

                const { data: payments } = await sb
                    .from('payments')
                    .select('amount')
                    .eq('hotel_id', hotelId)
                    .gte('payment_time', dayStart)
                    .lte('payment_time', dayEnd);

                result.push({
                    name: format(day, 'EEE'),
                    revenue: (payments ?? []).reduce((sum: number, p: { amount: number }) => sum + p.amount, 0),
                });
            }

            return result;
        },
    });

    // Get arrivals and departures count
    const { data: allReservations } = useReservations();
    const { data: allBookings } = useBookings();

    const arrivals = useMemo(() => {
        if (!allReservations) return 0;
        const today = new Date();
        const start = startOfDay(today);
        const end = endOfDay(today);
        return allReservations.filter(r => {
            if (r.status !== 'confirmed') return false;
            const checkIn = new Date(r.check_in_date);
            return checkIn >= start && checkIn <= end;
        }).length;
    }, [allReservations]);

    const departures = useMemo(() => {
        if (!allBookings) return 0;
        const today = new Date();
        const start = startOfDay(today);
        const end = endOfDay(today);
        return allBookings.filter(b => {
            if (b.status !== 'active') return false;
            const checkout = new Date(b.planned_checkout);
            return checkout >= start && checkout <= end;
        }).length;
    }, [allBookings]);

    // Compute real revenue trend (today vs yesterday)
    const revenueTrend = useMemo(() => {
        const today = todayRevenue?.total ?? 0;
        const yesterday = yesterdayRevenue ?? 0;
        if (yesterday === 0 && today === 0) return { direction: undefined, value: undefined };
        if (yesterday === 0) return { direction: 'up' as const, value: '+100%' };
        const pctChange = ((today - yesterday) / yesterday) * 100;
        return {
            direction: pctChange >= 0 ? 'up' as const : 'down' as const,
            value: `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%`,
        };
    }, [todayRevenue, yesterdayRevenue]);

    // Chart data — use real data or show empty state
    const chartData = last7DaysRevenue ?? [];
    const hasChartData = chartData.some(d => d.revenue > 0);

    return (
        <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex justify-end">
                <button
                    onClick={() => navigate('/bookings')}
                    className="btn bg-primary-400 hover:bg-primary-500 text-heading rounded-full px-6 shadow-sm shadow-primary-400/20 transition-all font-medium"
                >
                    + New Booking
                </button>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Occupancy"
                    value={`${occupancy?.occupancyRate ?? 0}%`}
                    subtitle={occupancy ? `${occupancy.occupied}/${occupancy.total} rooms` : 'Loading...'}
                    icon={<Activity size={20} />}
                />
                <KPICard
                    title="Revenue Today"
                    value={`₦${(todayRevenue?.total ?? 0).toLocaleString()}`}
                    subtitle="vs yesterday"
                    icon={<DollarSign size={20} />}
                    trend={revenueTrend.direction}
                    trendValue={revenueTrend.value}
                />
                <KPICard
                    title="Arrivals"
                    value={arrivals ?? 0}
                    subtitle="Expected today"
                    icon={<ArrowDownCircle size={20} />}
                />
                <KPICard
                    title="Departures"
                    value={departures ?? 0}
                    subtitle="Checkout today"
                    icon={<ArrowUpCircle size={20} />}
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Revenue Analytics Chart (Takes up 2/3 width on xl screens) */}
                <div className="xl:col-span-2 bg-surface-card rounded-xl shadow-sm border border-border p-5">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-base font-semibold text-heading">Revenue Analytics</h3>
                        <span className="text-xs text-muted">Last 7 Days</span>
                    </div>
                    <div className="h-[300px] w-full">
                        {hasChartData ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                    <Line type="monotone" dataKey="revenue" stroke="#21C29C" strokeWidth={3} dot={{ r: 4, fill: '#21C29C', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                                    <CartesianGrid stroke="#334155" strokeDasharray="5 5" vertical={false} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => `₦${value / 1000}k`} dx={-10} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: '#1e293b', color: '#fff' }}
                                        formatter={(value) => [`₦${Number(value).toLocaleString()}`, 'Revenue']}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center">
                                <DollarSign size={40} className="text-muted mb-3" />
                                <p className="text-muted text-sm">No revenue data yet</p>
                                <p className="text-muted text-xs mt-1">Revenue will appear here as payments are recorded</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Today's Activity / Recent Activity */}
                <div className="xl:col-span-1 bg-surface-card rounded-xl shadow-sm border border-border p-0 overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-border flex items-center justify-between">
                        <h3 className="text-base font-semibold text-heading flex items-center gap-2">
                            <Calendar size={18} className="text-primary-400" />
                            Recent Activity
                        </h3>
                        <button className="text-sm font-medium text-primary-400 hover:text-primary-500 transition-colors">
                            View all &rarr;
                        </button>
                    </div>
                    <div className="flex-1 p-5 overflow-y-auto">
                        <TodayActivity
                            onCheckIn={(id) => navigate(`/reservations?checkin=${id}`)}
                            onCheckOut={(id) => navigate(`/rooms?checkout=${id}`)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
