import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useReservations, useBookings } from '@/hooks/useSupabaseData';
import {
    getTodayRevenue,
    getOccupancyStats,
} from '@/db/dashboard';
import { KPICard, TodayActivity } from '@/components/dashboard';
import { startOfDay, endOfDay } from 'date-fns';
import {
    DollarSign,
    ArrowDownCircle,
    ArrowUpCircle,
    Calendar,
    Activity,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const dummyChartData = [
    { name: 'Mon', revenue: 4000 },
    { name: 'Tue', revenue: 3000 },
    { name: 'Wed', revenue: 2000 },
    { name: 'Thu', revenue: 2780 },
    { name: 'Fri', revenue: 1890 },
    { name: 'Sat', revenue: 2390 },
    { name: 'Sun', revenue: 3490 },
];

export function DashboardPage() {
    const navigate = useNavigate();

    // Modal states removed - check-in now navigates to /bookings

    // Live data queries via React Query
    const { data: occupancy } = useQuery({ queryKey: ['dashboard', 'occupancy'], queryFn: getOccupancyStats });
    const { data: todayRevenue } = useQuery({ queryKey: ['dashboard', 'todayRevenue'], queryFn: getTodayRevenue });


    // Get arrivals and departures count
    const { data: allReservations } = useReservations();
    const { data: allBookings } = useBookings();

    const arrivals = (() => {
        if (!allReservations) return 0;
        const today = new Date();
        const start = startOfDay(today);
        const end = endOfDay(today);
        return allReservations.filter(r => {
            if (r.status !== 'confirmed') return false;
            const checkIn = new Date(r.check_in_date);
            return checkIn >= start && checkIn <= end;
        }).length;
    })();

    const departures = (() => {
        if (!allBookings) return 0;
        const today = new Date();
        const start = startOfDay(today);
        const end = endOfDay(today);
        return allBookings.filter(b => {
            if (b.status !== 'active') return false;
            const checkout = new Date(b.planned_checkout);
            return checkout >= start && checkout <= end;
        }).length;
    })();



    return (
        <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex justify-end">
                <button
                    onClick={() => navigate('/bookings')}
                    className="btn bg-primary-400 hover:bg-primary-500 text-white rounded-full px-6 shadow-sm shadow-primary-400/20 transition-all font-medium"
                >
                    + New Booking
                </button>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Occupancy"
                    value={`${occupancy?.occupancyRate ?? 0}%`}
                    subtitle="vs last week"
                    icon={<Activity size={20} />}
                    trend="up"
                    trendValue="2.4%"
                />
                <KPICard
                    title="Revenue Today"
                    value={`₦${(todayRevenue?.total ?? 0).toLocaleString()}`}
                    subtitle="vs yesterday"
                    icon={<DollarSign size={20} />}
                    trend="up"
                    trendValue="12.5%"
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue Analytics Chart (Takes up 2/3 width on large screens) */}
                <div className="lg:col-span-2 bg-slate-800 rounded-xl shadow-sm border border-slate-700 p-5">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-base font-semibold text-white">Revenue Analytics</h3>
                        <select className="bg-slate-900 border border-slate-700 text-sm rounded-lg px-3 py-1.5 outline-none text-slate-300">
                            <option>Last 7 Days</option>
                            <option>This Month</option>
                        </select>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={dummyChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <Line type="monotone" dataKey="revenue" stroke="#21C29C" strokeWidth={3} dot={{ r: 4, fill: '#21C29C', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                                <CartesianGrid stroke="#e2e8f0" strokeDasharray="5 5" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => `₦${value / 1000}k`} dx={-10} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value) => [`₦${value}`, 'Revenue']}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Today's Activity / Recent Activity */}
                <div className="lg:col-span-1 bg-slate-800 rounded-xl shadow-sm border border-slate-700 p-0 overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-700 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-white flex items-center gap-2">
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


