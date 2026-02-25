import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            // Show prompt after a short delay for better UX
            setTimeout(() => setShowPrompt(true), 3000);
        };

        const handleAppInstalled = () => {
            setIsInstalled(true);
            setShowPrompt(false);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstall);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;

        if (choice.outcome === 'accepted') {
            setShowPrompt(false);
        }
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        // Store dismissal in localStorage to not show again for a while
        localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
    };

    // Don't show if installed, no prompt available, or recently dismissed
    if (isInstalled || !showPrompt || !deferredPrompt) {
        return null;
    }

    // Check if dismissed recently (within 7 days)
    const dismissedAt = localStorage.getItem('pwa-prompt-dismissed');
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
        return null;
    }

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-surface-card border border-border rounded-xl shadow-2xl p-4 z-50 animate-slide-up">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Download size={20} className="text-heading" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-heading text-sm">Install Hosila</h3>
                    <p className="text-xs text-muted mt-1">
                        Install this app for quick access and offline use
                    </p>
                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={handleInstall}
                            className="btn btn-primary text-xs px-3 py-1.5"
                        >
                            Install
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="btn btn-secondary text-xs px-3 py-1.5"
                        >
                            Not Now
                        </button>
                    </div>
                </div>
                <button
                    onClick={handleDismiss}
                    className="text-muted hover:text-heading p-1"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
