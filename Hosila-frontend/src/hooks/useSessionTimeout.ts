import { useEffect, useCallback, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

const WARNING_TIME = 5 * 60 * 1000; // Show warning 5 minutes before timeout
const DEFAULT_TIMEOUT = 30 * 60 * 1000; // 30 minutes default

export function useSessionTimeout(timeoutMinutes?: number) {
    const { isAuthenticated, logout } = useAuthStore();
    const [showWarning, setShowWarning] = useState(false);
    const [remainingTime, setRemainingTime] = useState(WARNING_TIME);
    const lastActivityRef = useRef(Date.now());
    const warningTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
    const logoutTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
    const countdownRef = useRef<ReturnType<typeof setInterval>>();

    const sessionTimeout = timeoutMinutes ? timeoutMinutes * 60 * 1000 : DEFAULT_TIMEOUT;

    const resetTimers = useCallback(() => {
        lastActivityRef.current = Date.now();
        setShowWarning(false);

        // Clear existing timers
        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
        if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);

        if (!isAuthenticated) return;

        // Set warning timer
        warningTimeoutRef.current = setTimeout(() => {
            setShowWarning(true);
            setRemainingTime(WARNING_TIME);

            // Start countdown
            countdownRef.current = setInterval(() => {
                setRemainingTime((prev) => {
                    if (prev <= 1000) {
                        clearInterval(countdownRef.current);
                        return 0;
                    }
                    return prev - 1000;
                });
            }, 1000);
        }, sessionTimeout - WARNING_TIME);

        // Set logout timer
        logoutTimeoutRef.current = setTimeout(() => {
            logout();
            setShowWarning(false);
        }, sessionTimeout);
    }, [isAuthenticated, logout, sessionTimeout]);

    // Track user activity
    useEffect(() => {
        if (!isAuthenticated) return;

        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];

        const handleActivity = () => {
            if (showWarning) {
                // If warning is showing, any activity dismisses it and resets
                resetTimers();
            } else {
                // Just update last activity time
                lastActivityRef.current = Date.now();
            }
        };

        events.forEach((event) => {
            window.addEventListener(event, handleActivity);
        });

        // Initial timer setup
        resetTimers();

        return () => {
            events.forEach((event) => {
                window.removeEventListener(event, handleActivity);
            });
            if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
            if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [isAuthenticated, resetTimers, showWarning]);

    const extendSession = useCallback(() => {
        resetTimers();
    }, [resetTimers]);

    const formatTime = (ms: number) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return {
        showWarning,
        remainingTime,
        formattedTime: formatTime(remainingTime),
        extendSession,
        logout,
    };
}
