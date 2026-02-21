import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useReservations, useBookings } from '@/hooks/useSupabaseData';
import {
    getTodayRevenue,
    getMonthRevenue,
    getOutstandingPayments,
    getOccupancyStats,
    getTodayServiceRevenue,
    getADR,
} from '@/db/dashboard';
import { KPICard, AlertsPanel, TodayActivity, QuickActions } from '@/components/dashboard';
import { format, startOfDay, endOfDay } from 'date-fns';
import {
    TrendingUp,
    BedDouble,
    DollarSign,
    Calendar,
    ArrowDownCircle,
    ArrowUpCircle,
    CreditCard,
    UtensilsCrossed,
    AlertTriangle,
    BarChart3,
} from 'lucide-react';

// Role-based dashboard sections
type UserRole = 'admin' | 'manager' | 'front_desk' | 'accountant';

export function DashboardPage() {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const userRole = (user?.role ?? 'front_desk') as UserRole;

    // Modal states removed - check-in now navigates to /bookings

    // Live data queries via React Query
    const { data: occupancy } = useQuery({ queryKey: ['dashboard', 'occupancy'], queryFn: getOccupancyStats });
    const { data: todayRevenue } = useQuery({ queryKey: ['dashboard', 'todayRevenue'], queryFn: getTodayRevenue });
    const { data: monthRevenue } = useQuery({ queryKey: ['dashboard', 'monthRevenue'], queryFn: getMonthRevenue });
    const { data: outstandingPayments } = useQuery({ queryKey: ['dashboard', 'outstanding'], queryFn: getOutstandingPayments });
    const { data: serviceRevenue } = useQuery({ queryKey: ['dashboard', 'serviceRevenue'], queryFn: getTodayServiceRevenue });
    const { data: adr } = useQuery({ queryKey: ['dashboard', 'adr'], queryFn: getADR });

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

    // Determine if user can see certain sections
    const showManagerKPIs = ['admin', 'manager'].includes(userRole);
    const showAccountantKPIs = ['admin', 'accountant', 'manager'].includes(userRole);
    const showFrontDeskSection = ['admin', 'front_desk', 'manager'].includes(userRole);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Control Center</h2>
                    <p className="text-slate-400">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
                </div>
                <div className="text-right">
                    <p className="text-sm text-slate-400">Logged in as</p>
                    <p className="text-white font-medium capitalize">{userRole.replace('_', ' ')}</p>
                </div>
            </div>

            {/* Quick Actions */}
            <QuickActions
                onNewCheckIn={() => navigate('/bookings')}
                onNewReservation={() => navigate('/bookings')}
                onOrderMeals={() => navigate('/restaurant')}
            />

            {/* Alerts Section */}
            <div>
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <AlertTriangle size={18} className="text-amber-400" />
                    Alerts & Warnings
                </h3>
                <AlertsPanel
                    onViewOverdue={() => navigate('/rooms')}
                    onViewLowStock={() => navigate('/inventory')}
                    onViewUnpaid={() => navigate('/rooms')}
                />
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Front Desk KPIs - Always visible */}
                <KPICard
                    title="Occupancy"
                    value={`${occupancy?.occupancyRate ?? 0}%`}
                    subtitle={`${occupancy?.occupied ?? 0} of ${occupancy?.total ?? 0} rooms`}
                    icon={<TrendingUp className="text-primary-400" size={24} />}
                    iconBg="bg-primary-500/20"
                />
                <KPICard
                    title="Available"
                    value={occupancy?.available ?? 0}
                    subtitle="Ready for check-in"
                    icon={<BedDouble className="text-green-400" size={24} />}
                    iconBg="bg-green-500/20"
                    onClick={() => navigate('/rooms?filter=available')}
                />
                <KPICard
                    title="Arrivals"
                    value={arrivals ?? 0}
                    subtitle="Expected today"
                    icon={<ArrowDownCircle className="text-green-400" size={24} />}
                    iconBg="bg-green-500/20"
                />
                <KPICard
                    title="Departures"
                    value={departures ?? 0}
                    subtitle="Checkout today"
                    icon={<ArrowUpCircle className="text-blue-400" size={24} />}
                    iconBg="bg-blue-500/20"
                />

                {/* Accountant/Manager KPIs */}
                {showAccountantKPIs && (
                    <>
                        <KPICard
                            title="Today's Revenue"
                            value={`₦${(todayRevenue?.total ?? 0).toLocaleString()}`}
                            subtitle={`${todayRevenue?.transactionCount ?? 0} transactions`}
                            icon={<DollarSign className="text-green-400" size={24} />}
                            iconBg="bg-green-500/20"
                        />
                        <KPICard
                            title="Outstanding"
                            value={`₦${(outstandingPayments?.total ?? 0).toLocaleString()}`}
                            subtitle={`${outstandingPayments?.count ?? 0} guests`}
                            icon={<CreditCard className="text-amber-400" size={24} />}
                            iconBg="bg-amber-500/20"
                            alert={(outstandingPayments?.count ?? 0) > 0}
                        />
                    </>
                )}

                {/* Manager KPIs */}
                {showManagerKPIs && (
                    <>
                        <KPICard
                            title="Month Revenue"
                            value={`₦${(monthRevenue ?? 0).toLocaleString()}`}
                            subtitle={format(new Date(), 'MMMM yyyy')}
                            icon={<BarChart3 className="text-purple-400" size={24} />}
                            iconBg="bg-purple-500/20"
                        />
                        <KPICard
                            title="ADR"
                            value={`₦${(adr ?? 0).toLocaleString()}`}
                            subtitle="Avg daily rate"
                            icon={<TrendingUp className="text-cyan-400" size={24} />}
                            iconBg="bg-cyan-500/20"
                        />
                        <KPICard
                            title="Restaurant"
                            value={`₦${(serviceRevenue?.total ?? 0).toLocaleString()}`}
                            subtitle={`${serviceRevenue?.orderCount ?? 0} orders`}
                            icon={<UtensilsCrossed className="text-orange-400" size={24} />}
                            iconBg="bg-orange-500/20"
                        />
                    </>
                )}
            </div>

            {/* Room Status Quick View */}
            {showFrontDeskSection && (
                <div className="card">
                    <div className="card-header flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-white">Room Status</h3>
                        <button
                            onClick={() => navigate('/rooms')}
                            className="text-sm text-primary-400 hover:text-primary-300"
                        >
                            View All →
                        </button>
                    </div>
                    <div className="card-body">
                        <div className="grid grid-cols-5 gap-2">
                            <StatusBox
                                label="Available"
                                count={occupancy?.available ?? 0}
                                color="bg-green-500"
                            />
                            <StatusBox
                                label="Occupied"
                                count={occupancy?.occupied ?? 0}
                                color="bg-red-500"
                            />
                            <StatusBox
                                label="Dirty"
                                count={occupancy?.dirty ?? 0}
                                color="bg-yellow-500"
                            />
                            <StatusBox
                                label="Maintenance"
                                count={occupancy?.maintenance ?? 0}
                                color="bg-slate-500"
                            />
                            <StatusBox
                                label="Total"
                                count={occupancy?.total ?? 0}
                                color="bg-primary-500"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Today's Activity */}
            {showFrontDeskSection && (
                <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <Calendar size={18} className="text-primary-400" />
                        Today's Activity
                    </h3>
                    <TodayActivity
                        onCheckIn={(id) => navigate(`/reservations?checkin=${id}`)}
                        onCheckOut={(id) => navigate(`/rooms?checkout=${id}`)}
                    />
                </div>
            )}

        </div>
    );
}

// Helper component for room status boxes
function StatusBox({ label, count, color }: { label: string; count: number; color: string }) {
    return (
        <div className="text-center p-3 bg-slate-700/30 rounded-lg">
            <div className={`w-4 h-4 ${color} rounded-full mx-auto mb-2`} />
            <p className="text-2xl font-bold text-white">{count}</p>
            <p className="text-xs text-slate-400">{label}</p>
        </div>
    );
}
