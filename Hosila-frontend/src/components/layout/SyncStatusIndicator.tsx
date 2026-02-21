import { useState, useEffect } from 'react';
import { Cloud, CloudOff, Radio } from 'lucide-react';
import { useConnectionStatusStore } from '@/stores/connectionStatusStore';

/**
 * Connection status indicator for the sidebar.
 * Shows: Online/Offline + Realtime WebSocket status.
 */
export function SyncStatusIndicator() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const isRealtimeConnected = useConnectionStatusStore((s) => s.isRealtimeConnected);

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

    const connected = isOnline && isRealtimeConnected;
    const reconnecting = isOnline && !isRealtimeConnected;

    return (
        <div className={`mx-3 mb-2 rounded-lg transition-colors ${connected
                ? 'bg-emerald-500/20'
                : reconnecting
                    ? 'bg-amber-500/20'
                    : 'bg-red-500/20'
            }`}>
            <div className="flex items-center gap-2 px-3 py-2">
                {/* Status dot */}
                <div className="relative">
                    <div className={`w-2 h-2 rounded-full ${connected
                            ? 'bg-emerald-400'
                            : reconnecting
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-red-400'
                        }`} />
                </div>

                {/* Icon + Text */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {connected
                        ? <Radio size={14} className="text-emerald-400" />
                        : reconnecting
                            ? <Cloud size={14} className="text-amber-400 animate-pulse" />
                            : <CloudOff size={14} className="text-red-400" />
                    }
                    <span className="text-xs text-slate-300 truncate">
                        {connected
                            ? 'Live'
                            : reconnecting
                                ? 'Reconnecting…'
                                : 'Offline'
                        }
                    </span>
                </div>
            </div>
        </div>
    );
}
