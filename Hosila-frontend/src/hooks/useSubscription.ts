/**
 * Subscription hooks — centralised entitlement checks for the UI.
 *
 * `useSubscription()` fetches the hotel's plan, status, features, and room limits.
 * `useHasFeature(key)` returns a boolean for a specific feature.
 * `useIsRestricted()` returns true when the hotel is in restricted mode.
 */

import { useQuery } from '@tanstack/react-query';
import { subscriptionApi, type SubscriptionContext } from '@/lib/apiClient';

/** Full subscription state */
export function useSubscription() {
    const query = useQuery<SubscriptionContext>({
        queryKey: ['hosila', 'subscription', 'current'],
        queryFn: () => subscriptionApi.getCurrent(),
        staleTime: 1000 * 60 * 5, // 5 min — plan rarely changes mid-session
        gcTime: 1000 * 60 * 30,
        retry: 1,
        throwOnError: false,
    });

    const data = query.data;

    return {
        ...query,
        plan: data?.plan_code ?? 'starter',
        effectiveStatus: data?.effective_status ?? 'inactive',
        writeMode: data?.write_mode ?? 'restricted',
        features: data?.feature_entitlements ?? {},
        roomsUsed: data?.rooms_used ?? 0,
        roomsLimit: data?.rooms_limit ?? 15,
        activeBookings: data?.active_bookings ?? 0,
    };
}

/** Check a single feature key */
export function useHasFeature(key: string): boolean {
    const { features, effectiveStatus } = useSubscription();
    if (effectiveStatus === 'inactive' || effectiveStatus === 'cancelled') return false;
    return features[key] === true;
}

/** Is hotel in restricted mode? */
export function useIsRestricted(): boolean {
    const { writeMode } = useSubscription();
    return writeMode === 'restricted';
}

/** Is hotel at room inventory limit? */
export function useIsAtRoomLimit(): boolean {
    const { roomsUsed, roomsLimit } = useSubscription();
    if (roomsLimit === null) return false; // unlimited
    return roomsUsed >= roomsLimit;
}
