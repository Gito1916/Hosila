import { Clock, LogOut } from 'lucide-react';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useHotel } from '@/hooks/useSupabaseData';

export function SessionTimeoutWarning() {
    const { data: hotel } = useHotel();
    const timeoutMinutes = hotel?.settings?.session_timeout_minutes;
    const { showWarning, formattedTime, extendSession, logout } = useSessionTimeout(timeoutMinutes);

    if (!showWarning) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-sm p-6 text-center">
                <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock size={32} className="text-amber-400" />
                </div>
                <h2 className="text-xl font-bold text-heading mb-2">Session Expiring</h2>
                <p className="text-muted mb-4">
                    Your session will expire in <span className="text-amber-400 font-mono font-bold">{formattedTime}</span>
                </p>
                <p className="text-sm text-muted mb-6">
                    Click any button or interact with the page to stay logged in.
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={logout}
                        className="btn btn-secondary flex-1 flex items-center justify-center gap-2"
                    >
                        <LogOut size={18} />
                        Logout Now
                    </button>
                    <button
                        onClick={extendSession}
                        className="btn btn-primary flex-1"
                    >
                        Stay Logged In
                    </button>
                </div>
            </div>
        </div>
    );
}
