/**
 * OfflineGate — wraps action buttons/forms that should be disabled while offline.
 *
 * Usage:
 *   <OfflineGate action="check_out">
 *     <Button onClick={handleCheckout}>Check Out</Button>
 *   </OfflineGate>
 *
 * When offline and the action is blocked, renders a disabled version with a tooltip.
 * When online (or action is allowed offline), renders children normally.
 */

import { useState, useEffect, type ReactNode } from 'react';
import { isActionAllowed, getBlockReason, type OfflineAction } from '@/lib/offlinePolicy';
import { WifiOff } from 'lucide-react';

interface OfflineGateProps {
    /** The action being gated */
    action: OfflineAction;
    /** Normal content to render when action is allowed */
    children: ReactNode;
    /** Optional custom fallback when action is blocked */
    fallback?: ReactNode;
    /** If true, hide children entirely instead of disabling */
    hideWhenBlocked?: boolean;
}

export function OfflineGate({ action, children, fallback, hideWhenBlocked }: OfflineGateProps) {
    const [online, setOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // If online, always allow
    if (online) return <>{children}</>;

    // Check policy
    const allowed = isActionAllowed(action);
    if (allowed) return <>{children}</>;

    // Action is blocked
    if (hideWhenBlocked) return null;

    const reason = getBlockReason(action);

    if (fallback) return <>{fallback}</>;

    // Default: wrap children in a disabled overlay with tooltip
    return (
        <div className="relative group">
            <div className="opacity-50 pointer-events-none select-none">
                {children}
            </div>
            <div className="absolute inset-0 cursor-not-allowed" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                <div className="bg-surface-800 text-heading text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg flex items-center gap-1.5 max-w-xs">
                    <WifiOff size={12} className="text-amber-400 shrink-0" />
                    <span>{reason || 'Requires internet connection'}</span>
                </div>
            </div>
        </div>
    );
}

/**
 * Hook version for programmatic checks.
 */
export function useOfflineGate(action: OfflineAction): {
    isAllowed: boolean;
    reason: string;
    isOnline: boolean;
} {
    const [online, setOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return {
        isAllowed: online || isActionAllowed(action),
        reason: online ? '' : getBlockReason(action),
        isOnline: online,
    };
}
