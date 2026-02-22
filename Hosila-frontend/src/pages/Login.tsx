import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useHotel, useUsers } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff, Loader2, ChevronDown, Wifi, WifiOff } from 'lucide-react';

export function LoginPage() {
    const navigate = useNavigate();
    const { login, isAuthenticated, isLoading, error } = useAuthStore();

    const [selectedUserId, setSelectedUserId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [sessionChecked, setSessionChecked] = useState(false);

    // Check for an active Supabase session.
    useEffect(() => {
        async function checkSessionAndRedirect() {
            if (!supabase) {
                setSessionChecked(true);
                return;
            }
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/onboarding', { replace: true });
                return;
            }
            setSessionChecked(true);
        }
        checkSessionAndRedirect();
    }, [navigate]);

    // Get hotel info for branding (from Supabase)
    const { data: hotel } = useHotel();

    // Get all active users for the role dropdown
    const { data: allUsers } = useUsers();
    const users = allUsers?.filter(u => u.is_active);

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
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-primary-400" />
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUserId) return;

        setIsSubmitting(true);

        const selectedUser = users?.find(u => u.id === selectedUserId);
        if (!selectedUser) {
            setIsSubmitting(false);
            return;
        }

        const success = await login(selectedUser.username, password);

        if (success) {
            // Invalidate all queries so they refetch with the new auth session.
            // This is critical: without this, useHotel() serves stale pre-auth
            // data (hotel=undefined) which causes ProtectedRoute to show onboarding.
            const { queryClient } = await import('@/lib/queryClient');
            await queryClient.invalidateQueries();
            navigate('/');
        }

        setIsSubmitting(false);
    };

    // Check if hotel branding exists
    const hasHotelBranding = hotel && hotel.name && hotel.name !== 'My Hotel';

    return (
        <div className="min-h-screen bg-slate-900 flex">
            {/* Left Side — Hosila Branding */}
            <div className="hidden lg:flex flex-col justify-center items-center w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900/30 p-12 relative overflow-hidden">
                {/* Background decorations */}
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                    <div className="absolute top-20 left-10 w-72 h-72 bg-primary-500/5 rounded-full blur-3xl" />
                    <div className="absolute bottom-20 right-10 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
                </div>

                <div className="relative z-10 max-w-md text-center">
                    <img src="/Hosila-icon-logo.png" alt="Hosila" className="w-20 h-20 rounded-2xl mx-auto mb-6 shadow-lg shadow-primary-500/25" />
                    <h1 className="text-4xl font-bold text-white mb-3">Hosila</h1>
                    <p className="text-lg text-slate-400 mb-8">
                        Property Management System
                    </p>

                    <div className="space-y-4 text-left">
                        {[
                            { emoji: '🏨', text: 'Complete front desk & booking management' },
                            { emoji: '🍽️', text: 'Restaurant POS with guest charging' },
                            { emoji: '📊', text: 'Financial reports & analytics' },
                            { emoji: '☁️', text: 'Cloud-powered across multiple devices' },
                            { emoji: '🔒', text: 'Real-time data with Supabase backend' },
                        ].map((feature) => (
                            <div key={feature.text} className="flex items-center gap-3 text-slate-300">
                                <span className="text-lg">{feature.emoji}</span>
                                <span className="text-sm">{feature.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="absolute bottom-6 text-slate-600 text-xs">
                    © 2026 Hosila. All rights reserved.
                </p>
            </div>

            {/* Right Side — Hotel Login */}
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-md">
                    {/* Hotel Identity */}
                    <div className="text-center mb-8">
                        {hotel?.logo_url ? (
                            <img
                                src={hotel.logo_url}
                                alt={hotel.name}
                                className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 border-2 border-slate-700"
                            />
                        ) : (
                            <img src="/Hosila-icon-logo.png" alt="Hosila" className="w-20 h-20 rounded-2xl mx-auto mb-4 border-2 border-slate-700 bg-slate-800 p-2" />
                        )}
                        <h2 className="text-2xl font-bold text-white">
                            {hasHotelBranding ? hotel.name : 'Hosila'}
                        </h2>
                        {!hasHotelBranding && (
                            <p className="text-slate-400 mt-1">Sign in to your hotel</p>
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
                                    <WifiOff size={12} className="text-slate-500" />
                                    <span className="text-xs text-slate-500">Offline Mode</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Mobile Hosila logo (shown only on small screens) */}
                    <div className="lg:hidden text-center mb-6">
                        <div className="inline-flex items-center gap-2 text-slate-500 text-sm">
                            <img src="/Hosila-icon-logo.png" alt="Hosila" className="w-4 h-4" />
                            Powered by Hosila
                        </div>
                    </div>

                    {/* Login Form */}
                    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Error message */}
                            {error && (
                                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Role Dropdown */}
                            <div>
                                <label htmlFor="user-select" className="label">
                                    Sign in as
                                </label>
                                <div className="relative">
                                    <select
                                        id="user-select"
                                        value={selectedUserId}
                                        onChange={(e) => setSelectedUserId(e.target.value)}
                                        className="input appearance-none pr-10 cursor-pointer"
                                        required
                                    >
                                        <option value="" disabled>Select your account...</option>
                                        {users?.map(u => (
                                            <option key={u.id} value={u.id}>
                                                {u.name} ({u.role})
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown
                                        size={18}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
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
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isSubmitting || !selectedUserId}
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

                    {/* Status footer */}
                    <p className="text-center text-slate-600 text-xs mt-6">
                        Powered by Supabase • Real-time cloud data
                    </p>
                </div>
            </div>
        </div>
    );
}
