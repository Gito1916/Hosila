/**
 * UpdatePrompt — Shows a "New update available" toast at the bottom corner
 * when a new service worker is ready to activate.
 *
 * Uses the virtual:pwa-register/react module provided by vite-plugin-pwa.
 * When the user clicks "Reload", the new service worker activates and the page reloads.
 */

import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export function UpdatePrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(swUrl, registration) {
            // Check for updates every 60 seconds
            if (registration) {
                setInterval(() => {
                    registration.update();
                }, 60 * 1000);
            }
            console.log('[PWA] Service worker registered:', swUrl);
        },
        onRegisterError(error) {
            console.error('[PWA] Service worker registration error:', error);
        },
    });

    if (!needRefresh) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl shadow-black/50 p-4 max-w-sm flex items-start gap-3">
                {/* Icon */}
                <div className="shrink-0 w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
                    <RefreshCw size={20} className="text-primary-400" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">New update available</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                        A new version of Hosila is ready. Reload to get the latest features and fixes.
                    </p>

                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={() => updateServiceWorker(true)}
                            className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                            Reload now
                        </button>
                        <button
                            onClick={() => setNeedRefresh(false)}
                            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors"
                        >
                            Later
                        </button>
                    </div>
                </div>

                {/* Close */}
                <button
                    onClick={() => setNeedRefresh(false)}
                    className="shrink-0 p-1 text-slate-500 hover:text-slate-300 rounded"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
