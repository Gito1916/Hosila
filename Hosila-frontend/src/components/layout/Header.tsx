import { useState, useEffect, useCallback } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { NotificationPanel } from './NotificationPanel';
import { format } from 'date-fns';
import { Menu, Sun, Moon, Cloud, CloudOff, RefreshCw } from 'lucide-react';


interface HeaderProps {
    onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const { theme, toggleTheme } = useThemeStore();
    const hotelName = useAuthStore((state) => state.activeHotelName);

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

    const queryClient = useQueryClient();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const handleReload = useCallback(async () => {
        setIsRefreshing(true);
        await queryClient.invalidateQueries();
        // Small delay so user sees the spin
        setTimeout(() => setIsRefreshing(false), 800);
    }, [queryClient]);

    return (
        <header className="h-16 bg-slate-800 light-mode:bg-white border-b border-slate-700 light-mode:border-slate-200 flex items-center justify-between px-4 lg:px-6">
            {/* Left side - Menu button and hotel name */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    aria-label="Toggle menu"
                >
                    <Menu size={24} />
                </button>
                <h1 className="text-xl font-semibold text-white light-mode:text-slate-900">{hotelName || 'Hosila'}</h1>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 lg:gap-4">
                {/* Current date/time */}
                <div className="hidden md:block text-sm text-slate-400 light-mode:text-slate-600">
                    {format(new Date(), 'EEEE, MMMM d, yyyy')}
                </div>

                {/* Connection Status */}
                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1 lg:gap-2 px-2 lg:px-3 py-1.5 rounded-full text-xs lg:text-sm ${isOnline ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                        {isOnline ? <Cloud size={14} /> : <CloudOff size={14} />}
                        <span className="hidden sm:inline">{isOnline ? 'Connected' : 'Offline'}</span>
                    </div>
                </div>

                {/* Reload / Refresh button (essential for PWA without browser chrome) */}
                <button
                    onClick={handleReload}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    aria-label="Refresh data"
                    title="Refresh data"
                >
                    <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                </button>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    aria-label="Toggle theme"
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>

                {/* Notifications */}
                <NotificationPanel />
            </div>
        </header>
    );
}
