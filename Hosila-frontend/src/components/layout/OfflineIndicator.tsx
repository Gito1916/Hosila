import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineIndicator() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [showReconnected, setShowReconnected] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setShowReconnected(true);
            // Hide reconnected message after 3 seconds
            setTimeout(() => setShowReconnected(false), 3000);
        };

        const handleOffline = () => {
            setIsOnline(false);
            setShowReconnected(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Show offline banner
    if (!isOnline) {
        return (
            <div className="fixed top-0 left-0 right-0 bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 z-[60] text-sm font-medium">
                <WifiOff size={16} />
                <span>You're offline — Changes are saved locally</span>
            </div>
        );
    }

    // Show reconnected message briefly
    if (showReconnected) {
        return (
            <div className="fixed top-0 left-0 right-0 bg-status-available text-heading px-4 py-2 flex items-center justify-center gap-2 z-[60] text-sm font-medium animate-fade-in">
                <Wifi size={16} />
                <span>Back online</span>
            </div>
        );
    }

    return null;
}
