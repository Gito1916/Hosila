import { useState, useEffect, useCallback } from 'react';
import { differenceInSeconds, differenceInMinutes, differenceInHours } from 'date-fns';

interface CountdownResult {
    timeLeft: string;
    isExpired: boolean;
    isExpiringSoon: boolean; // Within 30 minutes
    totalMinutes: number;
}

export function useCountdown(targetDate: Date | null): CountdownResult {
    const [result, setResult] = useState<CountdownResult>({
        timeLeft: '',
        isExpired: false,
        isExpiringSoon: false,
        totalMinutes: 0,
    });

    const calculate = useCallback(() => {
        if (!targetDate) {
            return { timeLeft: '', isExpired: false, isExpiringSoon: false, totalMinutes: 0 };
        }

        const now = new Date();
        const diffSeconds = differenceInSeconds(targetDate, now);

        if (diffSeconds <= 0) {
            return { timeLeft: 'Expired', isExpired: true, isExpiringSoon: false, totalMinutes: 0 };
        }

        const hours = differenceInHours(targetDate, now);
        const minutes = differenceInMinutes(targetDate, now) % 60;
        const seconds = diffSeconds % 60;
        const totalMinutes = differenceInMinutes(targetDate, now);

        let timeLeft: string;
        if (hours > 0) {
            timeLeft = `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            timeLeft = `${minutes}m ${seconds}s`;
        } else {
            timeLeft = `${seconds}s`;
        }

        return {
            timeLeft,
            isExpired: false,
            isExpiringSoon: totalMinutes <= 30,
            totalMinutes,
        };
    }, [targetDate]);

    useEffect(() => {
        if (!targetDate) return;

        setResult(calculate());

        const interval = setInterval(() => {
            setResult(calculate());
        }, 1000);

        return () => clearInterval(interval);
    }, [targetDate, calculate]);

    return result;
}
