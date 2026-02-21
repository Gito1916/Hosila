import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { PasswordChangeModal } from '@/components/settings/PasswordChangeModal';
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
    Building2,
    X,
    Key,
} from 'lucide-react';

interface NavItem {
    path: string;
    label: string;
    icon: React.ReactNode;
    permission?: 'canViewFinances' | 'canManageSettings';
    allowedRoles?: UserRole[]; // If set, only these roles can see this item
}

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

const navItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/bookings', label: 'Bookings', icon: <BedDouble size={20} /> },
    { path: '/guests', label: 'Guests', icon: <Users size={20} /> },
    { path: '/restaurant', label: 'Restaurant', icon: <UtensilsCrossed size={20} /> },
    { path: '/inventory', label: 'Inventory', icon: <Package size={20} /> },
    { path: '/finance', label: 'Finance', icon: <DollarSign size={20} />, permission: 'canViewFinances' },
    { path: '/settings', label: 'Settings', icon: <Settings size={20} />, permission: 'canManageSettings' },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const location = useLocation();
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const permissions = usePermissions();
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    // Close sidebar when navigating on mobile
    useEffect(() => {
        onClose();
    }, [location.pathname, onClose]);

    // back_desk users only see Services
    const filteredNavItems = navItems.filter((item) => {
        // back_desk role can only access Services
        if (user?.role === 'back_desk') {
            return item.path === '/restaurant';
        }

        // Check permission-based access
        if (item.permission) {
            return permissions[item.permission];
        }

        return true;
    });

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
                className={`fixed left-0 top-0 h-full w-64 bg-slate-800 border-r border-slate-700 flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                    }`}
            >
                {/* Logo */}
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
                            <Building2 className="text-white" size={24} />
                        </div>
                        <span className="text-xl font-bold text-white">HotelFlow</span>
                    </Link>
                    {/* Close button - mobile only */}
                    <button
                        onClick={onClose}
                        className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 overflow-y-auto">
                    <ul className="space-y-1">
                        {filteredNavItems.map((item) => {
                            const isActive = location.pathname === item.path;
                            return (
                                <li key={item.path}>
                                    <Link
                                        to={item.path}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive
                                            ? 'bg-primary-500/20 text-primary-400'
                                            : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                                            }`}
                                    >
                                        {item.icon}
                                        <span className="font-medium">{item.label}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Cloud Sync Status */}
                <SyncStatusIndicator />

                {/* User section */}
                <div className="p-4 border-t border-slate-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center">
                            <span className="text-white font-medium">
                                {user?.name.charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                            <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <button
                            onClick={() => setShowPasswordModal(true)}
                            className="flex items-center gap-2 w-full px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            <Key size={18} />
                            <span>Change Password</span>
                        </button>
                        <button
                            onClick={logout}
                            className="flex items-center gap-2 w-full px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            <LogOut size={18} />
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Password Change Modal */}
            {showPasswordModal && (
                <PasswordChangeModal onClose={() => setShowPasswordModal(false)} />
            )}
        </>
    );
}

