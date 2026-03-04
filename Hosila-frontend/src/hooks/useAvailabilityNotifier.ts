/**
 * Availability Check Notifier
 * 
 * Subscribes to Supabase Realtime on the `availability_checks` table
 * and pushes notifications into the notification store when a website
 * visitor checks room availability via the public API.
 * 
 * Usage: Call `useAvailabilityNotifier()` once in a top-level component
 * (e.g. Header.tsx). It subscribes on mount and unsubscribes on unmount.
 */

import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { requireSupabase, getHotelId } from '@/lib/api';
import { useNotificationStore } from '@/stores/notificationStore';

interface AvailabilityCheckRecord {
    id: string;
    hotel_id: string;
    check_in: string;
    check_out: string;
    room_type_requested: string | null;
    rooms_found: number;
    requested_type_available: boolean;
    alternatives_shown: boolean;
    ip_address: string | null;
    created_at: string;
}

export function useAvailabilityNotifier() {
    const channelRef = useRef<ReturnType<ReturnType<typeof requireSupabase>['channel']> | null>(null);
    const addNotification = useNotificationStore((s) => s.addNotification);

    useEffect(() => {
        let cancelled = false;

        async function subscribe() {
            try {
                const sb = requireSupabase();
                const hotelId = await getHotelId();

                if (cancelled) return;

                const channel = sb
                    .channel('availability-checks')
                    .on(
                        'postgres_changes' as any,
                        {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'availability_checks',
                            filter: `hotel_id=eq.${hotelId}`,
                        },
                        (payload: { new: AvailabilityCheckRecord }) => {
                            const check = payload.new;
                            const dates = `${format(new Date(check.check_in), 'MMM d')}–${format(new Date(check.check_out), 'MMM d')}`;

                            let title: string;
                            let message: string;
                            let type: 'info' | 'warning' = 'info';

                            if (check.room_type_requested) {
                                if (check.requested_type_available) {
                                    title = 'Website Availability Check';
                                    message = `${check.room_type_requested} was checked for ${dates} — ${check.rooms_found} room(s) available`;
                                } else {
                                    title = 'Fully Booked Room Type Checked';
                                    message = `${check.room_type_requested} was checked for ${dates} — fully booked${check.alternatives_shown ? ', alternatives were shown' : ''}`;
                                    type = 'warning';
                                }
                            } else {
                                title = 'Website Availability Check';
                                message = `Room availability checked for ${dates} — ${check.rooms_found} room(s) available`;
                                if (check.rooms_found === 0) {
                                    type = 'warning';
                                    message = `Room availability checked for ${dates} — no rooms available`;
                                }
                            }

                            addNotification({ title, message, type });
                        }
                    )
                    .subscribe();

                channelRef.current = channel;
            } catch (err) {
                // Silently fail — notifications are non-critical
                console.warn('Failed to subscribe to availability checks:', err);
            }
        }

        subscribe();

        return () => {
            cancelled = true;
            if (channelRef.current) {
                const sb = requireSupabase();
                sb.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [addNotification]);
}
