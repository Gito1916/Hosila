import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { MainLayout } from '@/components/layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SessionTimeoutWarning } from '@/components/layout/SessionTimeoutWarning';
import { OnboardingWizard } from '@/components/onboarding';
import { useHotel } from '@/hooks/useSupabaseData';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { NotificationToast } from '@/components/notifications/NotificationToast';
import { UpdatePrompt } from '@/components/layout/UpdatePrompt';
import { warmUpBackend, onBackendStatusChange } from '@/lib/apiClient';
import { Loader2, WifiOff, Server } from 'lucide-react';

// Lazy load pages for code splitting (improved performance)
const LoginPage = lazy(() => import('@/pages/Login').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.DashboardPage })));
const BookingsPage = lazy(() => import('@/pages/Bookings').then(m => ({ default: m.BookingsPage })));
const GuestsPage = lazy(() => import('@/pages/Guests').then(m => ({ default: m.GuestsPage })));
const GuestLedgerPage = lazy(() => import('@/pages/GuestLedger').then(m => ({ default: m.GuestLedgerPage })));
const RestaurantPage = lazy(() => import('@/pages/Restaurant').then(m => ({ default: m.RestaurantPage })));
const InventoryPage = lazy(() => import('@/pages/Inventory').then(m => ({ default: m.InventoryPage })));
const FinancePage = lazy(() => import('@/pages/Finance').then(m => ({ default: m.FinancePage })));
const SettingsPage = lazy(() => import('@/pages/Settings').then(m => ({ default: m.SettingsPage })));
const OnboardingPage = lazy(() => import('@/pages/Onboarding').then(m => ({ default: m.OnboardingPage })));

// Loading fallback component
function PageLoader() {
    return (
        <div className="min-h-[50vh] flex items-center justify-center">
            <Loader2 className="text-primary-500 animate-spin" size={32} />
        </div>
    );
}

// Offline banner
function OfflineBanner() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (isOnline) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
            <WifiOff size={16} />
            You are offline. HotelFlow requires an internet connection to work.
        </div>
    );
}

// Protected route wrapper with onboarding check
function ProtectedRoute() {
    const { isAuthenticated, isLoading } = useAuthStore();

    // Use React Query to fetch hotel data — replaces useLiveQuery(db.hotel...)
    // IMPORTANT: Must be called before any early returns to satisfy React's rules of hooks.
    const { data: hotel, isLoading: hotelLoading, error: hotelError } = useHotel();

    // Auth check — if not authenticated, go straight to login.
    // This prevents session timeout from showing the onboarding wizard
    // (which happens when useHotel() errors due to missing Supabase session).
    if (!isLoading && !isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (isLoading || hotelLoading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <Loader2 className="text-primary-500 animate-spin" size={48} />
            </div>
        );
    }

    // No hotel at all = fresh install, show onboarding
    // Hotel exists but onboarding not complete = show onboarding
    // Error fetching hotel (e.g., RLS issue) = show onboarding
    const needsOnboarding = hotelError || !hotel || !hotel.settings?.onboarding_complete;
    if (needsOnboarding) {
        return <OnboardingWizard onComplete={() => {
            // Invalidate hotel query to refetch after onboarding
            queryClient.invalidateQueries({ queryKey: ['hotel'] });
        }} />;
    }

    return <Outlet />;
}

// App component
function AppInner() {
    const { checkSession } = useAuthStore();
    const [backendStatus, setBackendStatus] = useState<'awake' | 'waking' | 'unreachable'>('awake');

    // Subscribe to Supabase Realtime for critical tables
    useRealtimeSync();

    // Monitor connectivity and flush offline write queue on reconnect
    useOfflineSync();

    useEffect(() => {
        // Revalidate session in the background (doesn't block UI)
        checkSession().catch(console.error);

        // Warm up the backend (Render free tier may be sleeping)
        warmUpBackend();

        // Subscribe to backend status changes for UI feedback
        const unsub = onBackendStatusChange(setBackendStatus);
        return unsub;
    }, [checkSession]);

    // If we've never logged in (no persisted auth), show a brief loader
    // only while we check if there's a cloud session to auto-login with.
    // This is instant on subsequent visits since auth is persisted.

    return (
        <ErrorBoundary>
            <OfflineBanner />
            {backendStatus === 'waking' && (
                <div className="bg-blue-600/90 text-white text-center py-2 px-4 text-sm flex items-center justify-center gap-2 z-50">
                    <Server size={14} className="animate-pulse" />
                    Connecting to server… This may take up to 60 seconds on first visit.
                </div>
            )}
            <UpdatePrompt />
            <BrowserRouter>
                {/* Session timeout warning - shown when session is about to expire */}
                <SessionTimeoutWarning />
                {/* Realtime notification toasts */}
                <NotificationToast />

                <Suspense fallback={<PageLoader />}>
                    <Routes>
                        {/* Public routes */}
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/onboarding" element={<OnboardingPage />} />

                        {/* Protected routes */}
                        <Route element={<ProtectedRoute />}>
                            <Route element={<MainLayout />}>
                                <Route index element={<DashboardPage />} />
                            </Route>

                            <Route element={<MainLayout />}>
                                <Route path="/bookings" element={<BookingsPage />} />
                            </Route>

                            {/* Redirects from old routes */}
                            <Route path="/rooms" element={<Navigate to="/bookings" replace />} />
                            <Route path="/reservations" element={<Navigate to="/bookings" replace />} />

                            <Route element={<MainLayout />}>
                                <Route path="/guests" element={<GuestsPage />} />
                            </Route>

                            <Route element={<MainLayout />}>
                                <Route path="/bookings/:bookingId/ledger" element={<GuestLedgerPage />} />
                            </Route>

                            <Route element={<MainLayout />}>
                                <Route path="/restaurant" element={<RestaurantPage />} />
                            </Route>

                            <Route element={<MainLayout />}>
                                <Route path="/inventory" element={<InventoryPage />} />
                            </Route>

                            <Route element={<MainLayout />}>
                                <Route path="/finance" element={<FinancePage />} />
                            </Route>

                            <Route element={<MainLayout />}>
                                <Route path="/settings" element={<SettingsPage />} />
                            </Route>
                        </Route>

                        {/* Catch all - redirect to home */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Suspense>
            </BrowserRouter>
        </ErrorBoundary>
    );
}

// Root App — wraps with QueryClientProvider
export function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <AppInner />
        </QueryClientProvider>
    );
}
