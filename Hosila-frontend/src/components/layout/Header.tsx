import { useState, useCallback } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { NotificationPanel } from './NotificationPanel';
import { EmailInboxPanel } from './EmailInboxPanel';
import { useAvailabilityNotifier } from '@/hooks/useAvailabilityNotifier';
import { format } from 'date-fns';
import { Menu, Sun, Moon, RefreshCw } from 'lucide-react';


interface HeaderProps {
    onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
    const { theme, toggleTheme } = useThemeStore();
    const hotelName = useAuthStore((state) => state.activeHotelName);

    // Subscribe to availability check notifications via Supabase Realtime
    useAvailabilityNotifier();

    const queryClient = useQueryClient();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const handleReload = useCallback(async () => {
        setIsRefreshing(true);
        await queryClient.invalidateQueries();
        // Small delay so user sees the spin
        setTimeout(() => setIsRefreshing(false), 800);
    }, [queryClient]);

    return (
        <header className="h-16 bg-surface-card border-b border-border flex items-center justify-between px-4 lg:px-6">
            {/* Left side - Menu button and hotel name */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg transition-colors"
                    aria-label="Toggle menu"
                >
                    <Menu size={24} />
                </button>
                <h1 className="text-xl font-semibold text-heading">{hotelName || 'Hosila'}</h1>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 lg:gap-4">
                {/* Current date/time */}
                <div className="hidden md:block text-sm text-muted">
                    {format(new Date(), 'EEEE, MMMM d, yyyy')}
                </div>


                {/* Reload / Refresh button (essential for PWA without browser chrome) */}
                <button
                    onClick={handleReload}
                    className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg transition-colors"
                    aria-label="Refresh data"
                    title="Refresh data"
                >
                    <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                </button>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg transition-colors"
                    aria-label="Toggle theme"
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>

                {/* Email Inbox */}
                <EmailInboxPanel />

                {/* Notifications */}
                <NotificationPanel />
            </div>
        </header>
    );
}
