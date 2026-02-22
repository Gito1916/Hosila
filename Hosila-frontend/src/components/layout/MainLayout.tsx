import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PWAPrompt } from './PWAPrompt';
import { OfflineIndicator } from './OfflineIndicator';

export function MainLayout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const handleMenuClick = useCallback(() => {
        setIsSidebarOpen(true);
    }, []);

    const handleSidebarClose = useCallback(() => {
        setIsSidebarOpen(false);
    }, []);

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
            {/* Offline indicator */}
            <OfflineIndicator />

            {/* Sidebar - always visible on desktop, slide-in on mobile */}
            <Sidebar isOpen={isSidebarOpen} onClose={handleSidebarClose} />

            {/* Main content area - full width on mobile, offset on desktop */}
            <div className="lg:ml-64">
                <Header onMenuClick={handleMenuClick} />
                <main className="p-4 lg:p-6">
                    <Outlet />
                </main>
            </div>

            {/* PWA install prompt */}
            <PWAPrompt />
        </div>
    );
}
