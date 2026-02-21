import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationType = 'info' | 'warning' | 'error' | 'success';

export interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    link?: string; // Optional link to navigate to
}

interface NotificationStore {
    notifications: Notification[];
    addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    clearAll: () => void;
    removeNotification: (id: string) => void;
    unreadCount: () => number;
}

export const useNotificationStore = create<NotificationStore>()(
    persist(
        (set, get) => ({
            notifications: [],

            addNotification: (notification) => {
                const newNotification: Notification = {
                    ...notification,
                    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    timestamp: new Date(),
                    read: false,
                };
                set((state) => ({
                    notifications: [newNotification, ...state.notifications].slice(0, 50), // Keep max 50
                }));
            },

            markAsRead: (id) => {
                set((state) => ({
                    notifications: state.notifications.map((n) =>
                        n.id === id ? { ...n, read: true } : n
                    ),
                }));
            },

            markAllAsRead: () => {
                set((state) => ({
                    notifications: state.notifications.map((n) => ({ ...n, read: true })),
                }));
            },

            clearAll: () => {
                set({ notifications: [] });
            },

            removeNotification: (id) => {
                set((state) => ({
                    notifications: state.notifications.filter((n) => n.id !== id),
                }));
            },

            unreadCount: () => {
                return get().notifications.filter((n) => !n.read).length;
            },
        }),
        {
            name: 'hotelflow-notifications',
            partialize: (state) => ({
                notifications: state.notifications.map((n) => ({
                    ...n,
                    timestamp: n.timestamp.toISOString(),
                })),
            }),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state.notifications = state.notifications.map((n: Notification & { timestamp: string | Date }) => ({
                        ...n,
                        timestamp: new Date(n.timestamp),
                    }));
                }
            },
        }
    )
);
