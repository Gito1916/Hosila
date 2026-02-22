/**
 * NotificationToast — auto-dismissing slide-in toast for realtime notifications.
 *
 * Listens to the notification store for new unread notifications and shows them
 * as toasts in the top-right corner. Toasts auto-dismiss after 5 seconds.
 * Clicking a toast navigates to the notification's target page.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore, type Notification } from '@/stores/notificationStore';
import {
    AlertTriangle,
    Info,
    AlertCircle,
    CheckCircle,
    X,
} from 'lucide-react';

const TOAST_DURATION = 5000; // 5 seconds
const MAX_VISIBLE = 3;       // Max toasts visible at once

interface ToastItem {
    notification: Notification;
    isExiting: boolean;
}

export function NotificationToast() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const navigate = useNavigate();
    const markAsRead = useNotificationStore((s) => s.markAsRead);
    const notifications = useNotificationStore((s) => s.notifications);
    const lastSeenIdRef = useRef<string | null>(null);

    // Watch for NEW unread notifications
    useEffect(() => {
        if (notifications.length === 0) return;

        const newest = notifications[0]; // notifications are newest-first
        if (!newest || newest.read) return;
        if (newest.id === lastSeenIdRef.current) return;

        lastSeenIdRef.current = newest.id;

        setToasts((prev) => {
            // Don't add duplicates
            if (prev.some((t) => t.notification.id === newest.id)) return prev;
            const updated = [{ notification: newest, isExiting: false }, ...prev];
            return updated.slice(0, MAX_VISIBLE + 2); // buffer for exit animations
        });
    }, [notifications]);

    // Auto-dismiss timer
    useEffect(() => {
        if (toasts.length === 0) return;

        const timers: NodeJS.Timeout[] = [];

        toasts.forEach((toast) => {
            if (toast.isExiting) return;

            const timer = setTimeout(() => {
                dismissToast(toast.notification.id);
            }, TOAST_DURATION);

            timers.push(timer);
        });

        return () => timers.forEach(clearTimeout);
    }, [toasts]);

    const dismissToast = useCallback((id: string) => {
        // Start exit animation
        setToasts((prev) =>
            prev.map((t) =>
                t.notification.id === id ? { ...t, isExiting: true } : t,
            ),
        );

        // Remove after animation
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.notification.id !== id));
        }, 300);
    }, []);

    const handleClick = useCallback(
        (notification: Notification) => {
            markAsRead(notification.id);
            dismissToast(notification.id);
            if (notification.link) {
                navigate(notification.link);
            }
        },
        [markAsRead, navigate, dismissToast],
    );

    const getIcon = (type: string) => {
        switch (type) {
            case 'warning':
                return <AlertTriangle size={18} className="text-amber-400" />;
            case 'error':
                return <AlertCircle size={18} className="text-red-400" />;
            case 'success':
                return <CheckCircle size={18} className="text-emerald-400" />;
            default:
                return <Info size={18} className="text-blue-400" />;
        }
    };

    const getBorderColor = (type: string) => {
        switch (type) {
            case 'warning': return 'border-l-amber-500';
            case 'error': return 'border-l-red-500';
            case 'success': return 'border-l-emerald-500';
            default: return 'border-l-blue-500';
        }
    };

    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 380 }}>
            {toasts.slice(0, MAX_VISIBLE).map((toast) => (
                <div
                    key={toast.notification.id}
                    onClick={() => handleClick(toast.notification)}
                    className={`
                        pointer-events-auto cursor-pointer
                        bg-slate-800 border border-slate-700 border-l-4 ${getBorderColor(toast.notification.type)}
                        rounded-lg shadow-2xl p-3
                        transition-all duration-300 ease-out
                        ${toast.isExiting
                            ? 'opacity-0 translate-x-full'
                            : 'opacity-100 translate-x-0 animate-slide-in-right'
                        }
                        hover:bg-slate-750 hover:border-slate-600
                    `}
                >
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                            {getIcon(toast.notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white leading-tight">
                                {toast.notification.title}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                                {toast.notification.message}
                            </p>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                dismissToast(toast.notification.id);
                            }}
                            className="flex-shrink-0 p-1 text-slate-500 hover:text-slate-300 rounded transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
