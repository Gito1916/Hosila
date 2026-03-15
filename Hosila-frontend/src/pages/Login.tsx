import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useHotel } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff, Loader2, Wifi, WifiOff, UserCircle } from 'lucide-react';
import { ChangePasswordModal } from '@/components/settings/ChangePasswordModal';

export function LoginPage() {
    const navigate = useNavigate();
    const { login, isAuthenticated, isLoading, error, hotelCode } = useAuthStore();

    const [inputHotelCode, setInputHotelCode] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [sessionChecked, setSessionChecked] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);

    // If the owner has a Supabase Auth session, auto-login them.
    // Staff users (no Supabase session) always see the login form.
    useEffect(() => {
        async function checkOwnerSession() {
            if (!supabase) {
                setSessionChecked(true);
                return;
            }

            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                // Owner/admin has a Supabase Auth session — auto-login
                const { autoLoginAsAdmin } = useAuthStore.getState();
                const didAutoLogin = await autoLoginAsAdmin();
                if (didAutoLogin) {
                    const { queryClient } = await import('@/lib/queryClient');
                    await queryClient.invalidateQueries();
                    navigate('/', { replace: true });
                    return;
                }
            }

            // No owner session or auto-login failed — show the login form
            setSessionChecked(true);
        }
        checkOwnerSession();
    }, [navigate]);

    // Get hotel info for branding (from Supabase)
    const { data: hotel } = useHotel();

    // Track online status
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

    // Redirect if already authenticated
    if (isAuthenticated && !isLoading) {
        return <Navigate to="/" replace />;
    }

    // Don't render login form until session check completes
    if (!sessionChecked) {
        return (
            <div className="min-h-screen bg-surface-base flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-primary-400" />
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;
        if (!hotelCode && !inputHotelCode.trim()) return;

        setIsSubmitting(true);

        const success = await login(username.trim(), password, inputHotelCode.trim() || undefined);

        if (success) {
            // Check if user needs to change password
            const user = useAuthStore.getState().user;
            if (user?.must_change_password) {
                setIsSubmitting(false);
                setShowChangePassword(true);
                return;
            }

            // Invalidate all queries so they refetch with the new auth session.
            // This is critical: without this, useHotel() serves stale pre-auth
            // data (hotel=undefined) which causes ProtectedRoute to show onboarding.
            const { queryClient } = await import('@/lib/queryClient');
            await queryClient.invalidateQueries();
            navigate('/');
        }

        setIsSubmitting(false);
    };

    const handlePasswordChanged = async () => {
        setShowChangePassword(false);
        // After password change, proceed to dashboard
        const { queryClient } = await import('@/lib/queryClient');
        await queryClient.invalidateQueries();
        navigate('/');
    };

    // Check if hotel branding exists
    const hasHotelBranding = hotel && hotel.name && hotel.name !== 'My Hotel';

    return (
        <div className="min-h-screen bg-surface-base flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                {/* Hotel Identity */}
                <div className="text-center mb-8">
                    {hotel?.logo_url ? (
                        <img
                            src={hotel.logo_url}
                            alt={hotel.name}
                            className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 border-2 border-border"
                        />
                    ) : (
                        <img src="/Hosila-icon-logo.png" alt="Hosila" className="w-20 h-20 rounded-2xl mx-auto mb-4 border-2 border-border bg-surface-card p-2" />
                    )}
                    <h2 className="text-2xl font-bold text-heading">
                        {hasHotelBranding ? hotel.name : 'Hosila'}
                    </h2>
                    {!hasHotelBranding && (
                        <p className="text-muted mt-1">Sign in to your hotel</p>
                    )}

                    {/* Connection indicator */}
                    <div className="flex items-center justify-center gap-1.5 mt-2">
                        {isOnline ? (
                            <>
                                <Wifi size={12} className="text-emerald-400" />
                                <span className="text-xs text-emerald-400">Online</span>
                            </>
                        ) : (
                            <>
                                <WifiOff size={12} className="text-muted" />
                                <span className="text-xs text-muted">Offline Mode</span>
                            </>
                        )}
                    </div>
                </div>


                {/* Login Form */}
                <div className="bg-surface-card rounded-2xl border border-border p-6">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Error message */}
                        {error && (
                            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Hotel Code (only if device is not paired) */}
                        {!hotelCode && (
                            <div>
                                <label htmlFor="hotelCode" className="label">
                                    Hotel Code
                                </label>
                                <input
                                    id="hotelCode"
                                    type="text"
                                    value={inputHotelCode}
                                    onChange={(e) => setInputHotelCode(e.target.value)}
                                    className="input font-mono"
                                    placeholder="Enter hotel pairing code"
                                    required
                                    autoComplete="off"
                                    autoFocus
                                />
                                <p className="text-xs text-muted mt-1.5 leading-relaxed">
                                    Required for the first sign-in on a new device.
                                </p>
                            </div>
                        )}

                        {/* Username */}
                        <div>
                            <label htmlFor="username" className="label">
                                Username
                            </label>
                            <div className="relative">
                                <UserCircle
                                    size={18}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                                />
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="input pl-10"
                                    placeholder="Enter your username"
                                    required
                                    autoComplete="username"
                                    autoFocus={!!hotelCode}
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="password" className="label">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input pr-10"
                                    placeholder="Enter your password"
                                    required
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-heading"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isSubmitting || !username.trim()}
                            className="btn btn-primary w-full mt-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={18} className="animate-spin mr-2" />
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p className="text-center text-muted text-xs mt-6">
                    New hotel?{' '}
                    <button
                        type="button"
                        onClick={() => navigate('/onboarding')}
                        className="text-primary-400 hover:text-primary-300 underline"
                    >
                        Create an account
                    </button>
                </p>
            </div>

            {/* Force password change modal */}
            {showChangePassword && (
                <ChangePasswordModal
                    onClose={handlePasswordChanged}
                    forced
                />
            )}
        </div>
    );
}
