import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore, Notification, NotificationType } from '@/stores/notificationStore';
import { formatDistanceToNow } from 'date-fns';
import {
    Bell,
    X,
    CheckCheck,
    Trash2,
    AlertTriangle,
    Info,
    AlertCircle,
    CheckCircle,
} from 'lucide-react';

const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
        case 'warning':
            return <AlertTriangle size={16} className="text-amber-400" />;
        case 'error':
            return <AlertCircle size={16} className="text-red-400" />;
        case 'success':
            return <CheckCircle size={16} className="text-green-400" />;
        default:
            return <Info size={16} className="text-blue-400" />;
    }
};

const getNotificationBg = (type: NotificationType) => {
    switch (type) {
        case 'warning':
            return 'bg-amber-500/10 border-amber-500/30';
        case 'error':
            return 'bg-red-500/10 border-red-500/30';
        case 'success':
            return 'bg-green-500/10 border-green-500/30';
        default:
            return 'bg-blue-500/10 border-blue-500/30';
    }
};

export function NotificationPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const {
        notifications,
        markAsRead,
        markAllAsRead,
        clearAll,
        removeNotification,
        unreadCount,
    } = useNotificationStore();

    const unread = unreadCount();

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleNotificationClick = (notification: Notification) => {
        markAsRead(notification.id);
        if (notification.link) {
            navigate(notification.link);
            setIsOpen(false);
        }
    };

    return (
        <div className="relative" ref={panelRef}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg transition-colors relative"
            >
                <Bell size={20} />
                {unread > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-heading text-xs font-bold rounded-full flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-surface-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between p-3 border-b border-border">
                        <h3 className="font-semibold text-heading">Notifications</h3>
                        <div className="flex items-center gap-2">
                            {notifications.length > 0 && (
                                <>
                                    <button
                                        onClick={markAllAsRead}
                                        className="p-1.5 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                                        title="Mark all as read"
                                    >
                                        <CheckCheck size={16} />
                                    </button>
                                    <button
                                        onClick={clearAll}
                                        className="p-1.5 text-muted hover:text-danger hover:bg-danger/20 rounded-lg"
                                        title="Clear all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Notifications List */}
                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-6 text-center text-muted">
                                <Bell size={32} className="mx-auto mb-2 opacity-50" />
                                <p>No notifications</p>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    onClick={() => handleNotificationClick(notification)}
                                    className={`p-3 border-b border-border cursor-pointer hover:bg-surface-raised transition-colors ${!notification.read ? 'bg-lime-500/10 border-l-2 border-l-lime-400' : ''
                                        }`}
                                >
                                    <div className="flex gap-3">
                                        <div className={`p-2 rounded-lg ${getNotificationBg(notification.type)} border`}>
                                            {getNotificationIcon(notification.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-sm font-medium ${notification.read ? 'text-muted' : 'text-heading'}`}>
                                                    {notification.title}
                                                </p>
                                                {!notification.read && (
                                                    <span className="w-2 h-2 bg-lime-400 rounded-full flex-shrink-0 mt-1.5" />
                                                )}
                                            </div>
                                            <p className="text-xs text-muted mt-0.5 line-clamp-2">
                                                {notification.message}
                                            </p>
                                            <p className="text-xs text-muted mt-1">
                                                {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeNotification(notification.id);
                                            }}
                                            className="p-1 text-muted hover:text-danger rounded"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
