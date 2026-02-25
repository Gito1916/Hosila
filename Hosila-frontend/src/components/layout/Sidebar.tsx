import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import type { UserRole } from '@/types';
import {
    LayoutDashboard,
    BedDouble,
    Users,
    UtensilsCrossed,
    Package,
    DollarSign,
    Settings,
    LogOut,
    X,
} from 'lucide-react';

interface NavItem {
    path: string;
    label: string;
    icon: React.ReactNode;
    permission?: 'canViewFinances' | 'canManageSettings';
    allowedRoles?: UserRole[];
}

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

// Main nav items (Settings is separated to the bottom)
const mainNavItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/bookings', label: 'Bookings', icon: <BedDouble size={20} /> },
    { path: '/guests', label: 'Guests', icon: <Users size={20} /> },
    { path: '/restaurant', label: 'Restaurant', icon: <UtensilsCrossed size={20} /> },
    { path: '/inventory', label: 'Inventory', icon: <Package size={20} /> },
    { path: '/finance', label: 'Finance', icon: <DollarSign size={20} />, permission: 'canViewFinances' },
];

const settingsItem: NavItem = {
    path: '/settings', label: 'Settings', icon: <Settings size={20} />, permission: 'canManageSettings',
};

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const location = useLocation();
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const permissions = usePermissions();

    // Close sidebar when navigating on mobile
    useEffect(() => {
        onClose();
    }, [location.pathname, onClose]);

    const canSee = (item: NavItem) => {
        if (user?.role === 'back_desk') return item.path === '/restaurant';
        if (item.permission) return permissions[item.permission];
        return true;
    };

    const filteredMainNav = mainNavItems.filter(canSee);
    const showSettings = canSee(settingsItem);

    const navLinkClasses = (isActive: boolean) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive
            ? 'bg-surface-sidebar-active text-sidebar-active font-semibold'
            : 'text-sidebar-text hover:bg-surface-sidebar-hover hover:text-sidebar-active'
        }`;

    return (
        <>
            {/* Mobile overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed left-0 top-0 h-full w-64 bg-surface-sidebar border-r border-border-sidebar flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                    }`}
            >
                {/* Logo */}
                <div className="h-16 px-4 border-b border-border-sidebar flex flex-col items-center justify-center relative">
                    <Link to="/" className="flex items-center justify-center">
                        <img src="/Hosila-icon-logo.png" alt="Hosila" className="w-9 h-9 rounded" />
                    </Link>
                    {/* Close button - mobile only */}
                    <button
                        onClick={onClose}
                        className="lg:hidden absolute right-3 top-1/2 -translate-y-1/2 p-2 text-sidebar-text hover:bg-surface-sidebar-hover rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Main Navigation */}
                <nav className="flex-1 p-4 overflow-y-auto">
                    <ul className="space-y-1">
                        {filteredMainNav.map((item) => {
                            const isActive = location.pathname === item.path;
                            return (
                                <li key={item.path}>
                                    <Link to={item.path} className={navLinkClasses(isActive)}>
                                        {item.icon}
                                        <span className="font-medium">{item.label}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Bottom section: Settings + Sync + User */}
                <div className="border-t border-border-sidebar">
                    {/* Cloud Sync Status */}
                    <SyncStatusIndicator />

                    {/* Settings link - below sync indicator */}
                    {showSettings && (
                        <div className="px-4 pb-2">
                            <Link
                                to={settingsItem.path}
                                className={navLinkClasses(location.pathname === settingsItem.path)}
                            >
                                {settingsItem.icon}
                                <span className="font-medium">{settingsItem.label}</span>
                            </Link>
                        </div>
                    )}

                    {/* User section */}
                    <div className="p-4 border-t border-border-sidebar">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/20">
                                <span className="text-white font-bold text-lg">
                                    {user?.name.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-sidebar-text truncate">{user?.name}</p>
                                <p className="text-xs text-muted capitalize">{user?.role}</p>
                            </div>
                        </div>
                        <button
                            onClick={logout}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sidebar-text hover:bg-surface-sidebar-hover hover:text-sidebar-active rounded-lg transition-colors"
                        >
                            <LogOut size={18} />
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
