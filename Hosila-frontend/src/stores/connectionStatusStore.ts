/**
 * Connection Status Store — tracks Supabase Realtime WebSocket state.
 * Used by SyncStatusIndicator and useRealtimeSync.
 */

import { create } from 'zustand';

interface ConnectionStatusStore {
    /** Whether the Realtime WebSocket is connected */
    isRealtimeConnected: boolean;
    /** Timestamp of last successful connection */
    connectedSince: Date | null;
    /** Number of reconnection attempts */
    reconnectCount: number;

    setConnected: () => void;
    setDisconnected: () => void;
}

export const useConnectionStatusStore = create<ConnectionStatusStore>()((set) => ({
    isRealtimeConnected: false,
    connectedSince: null,
    reconnectCount: 0,

    setConnected: () =>
        set((state) => ({
            isRealtimeConnected: true,
            connectedSince: new Date(),
            reconnectCount: state.connectedSince ? state.reconnectCount + 1 : 0,
        })),

    setDisconnected: () =>
        set({ isRealtimeConnected: false }),
}));
