import { useState, useEffect } from 'react';

interface OnlineStatus {
    isOnline: boolean;
    pendingChanges: number;
}

export function useOnlineStatus(): OnlineStatus {
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

    // No local sync queue in online-only architecture
    return { isOnline, pendingChanges: 0 };
}
