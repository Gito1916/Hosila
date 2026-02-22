import { useState, useEffect } from 'react';
import { Cloud, CloudOff, Radio, AlertCircle } from 'lucide-react';
import { useConnectionStatusStore } from '@/stores/connectionStatusStore';
import { supabase } from '@/lib/supabase';
import { getPendingCount, getDeadLetterCount } from '@/lib/offlineQueue';

/**
 * Connection status indicator for the sidebar.
 * Shows: Online/Offline + Realtime WebSocket status + pending offline writes.
 */
export function SyncStatusIndicator() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const isRealtimeConnected = useConnectionStatusStore((s) => s.isRealtimeConnected);
    const [pending, setPending] = useState(0);
    const [deadLetters, setDeadLetters] = useState(0);

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

    // Poll pending count
    useEffect(() => {
        const refreshCounts = async () => {
            setPending(await getPendingCount());
            setDeadLetters(await getDeadLetterCount());
        };
        refreshCounts();
        const interval = setInterval(refreshCounts, 3000);
        return () => clearInterval(interval);
    }, []);

    const hasSupabase = !!supabase;
    const connected = isOnline && (!hasSupabase || isRealtimeConnected);
    const reconnecting = isOnline && hasSupabase && !isRealtimeConnected;

    // Build status text
    let statusText = 'Offline';
    if (connected) {
        statusText = pending > 0 ? `Syncing… (${pending})` : 'Live';
    } else if (reconnecting) {
        statusText = pending > 0 ? `Reconnecting… (${pending} pending)` : 'Reconnecting…';
    } else {
        statusText = pending > 0 ? `Offline (${pending} pending)` : 'Offline';
    }

    return (
        <div className="mx-3 mb-2 space-y-1">
            <div className={`rounded-lg transition-colors ${connected && pending === 0
                ? 'bg-emerald-500/20'
                : pending > 0
                    ? 'bg-amber-500/20'
                    : reconnecting
                        ? 'bg-amber-500/20'
                        : 'bg-red-500/20'
                }`}>
                <div className="flex items-center gap-2 px-3 py-2">
                    {/* Status dot */}
                    <div className="relative">
                        <div className={`w-2 h-2 rounded-full ${connected && pending === 0
                            ? 'bg-emerald-400'
                            : pending > 0
                                ? 'bg-amber-400 animate-pulse'
                                : reconnecting
                                    ? 'bg-amber-400 animate-pulse'
                                    : 'bg-red-400'
                            }`} />
                    </div>

                    {/* Icon + Text */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {connected && pending === 0
                            ? <Radio size={14} className="text-emerald-400" />
                            : pending > 0
                                ? <Cloud size={14} className="text-amber-400 animate-pulse" />
                                : reconnecting
                                    ? <Cloud size={14} className="text-amber-400 animate-pulse" />
                                    : <CloudOff size={14} className="text-red-400" />
                        }
                        <span className="text-xs text-slate-300 truncate">
                            {statusText}
                        </span>
                    </div>
                </div>
            </div>

            {/* Dead letter warning */}
            {deadLetters > 0 && (
                <div className="rounded-lg bg-red-500/20 px-3 py-1.5 flex items-center gap-1.5">
                    <AlertCircle size={12} className="text-red-400 shrink-0" />
                    <span className="text-xs text-red-400">
                        {deadLetters} failed write{deadLetters > 1 ? 's' : ''}
                    </span>
                </div>
            )}
        </div>
    );
}
