/**
 * RestrictedBanner — persistent banner shown when the hotel is in restricted mode.
 * Placed in the app layout, visible on every page.
 */

import { useIsRestricted, useSubscription } from '@/hooks/useSubscription';

export function RestrictedBanner() {
    const isRestricted = useIsRestricted();
    const { activeBookings } = useSubscription();

    if (!isRestricted) return null;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '0.625rem 1.25rem',
                background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
                color: '#1c1917',
                fontSize: '0.875rem',
                fontWeight: 500,
                zIndex: 1000,
            }}
        >
            <span>
                ⚠️ Your subscription is inactive. You're in restricted mode
                ({activeBookings}/5 active rooms).
                Only checkout operations are available.
            </span>
            <a
                href="/settings"
                style={{
                    flexShrink: 0,
                    padding: '0.375rem 1rem',
                    borderRadius: '6px',
                    background: '#1c1917',
                    color: '#f59e0b',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: '0.8125rem',
                }}
            >
                Renew Now
            </a>
        </div>
    );
}

export default RestrictedBanner;
