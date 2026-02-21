import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
    UserManagement,
    ServiceManagement,
    TaxSettingsPanel,
} from '@/components/settings';
import { SystemSettingsPanel } from '@/components/settings/SystemSettingsPanel';
import { AccountPanel } from '@/components/settings/AccountPanel';
import { AdvancedPanel } from '@/components/settings/AdvancedPanel';
import { RoomsPanel } from '@/components/settings/RoomsPanel';
import {
    Users,
    Settings2,
    User,
    DoorOpen,
    UtensilsCrossed,
    DollarSign,
    Wrench,
} from 'lucide-react';

type SettingsTab = 'users' | 'system' | 'account' | 'rooms' | 'restaurant' | 'finance' | 'advanced';

const tabs: { value: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { value: 'users', label: 'Users', icon: <Users size={18} /> },
    { value: 'system', label: 'System', icon: <Settings2 size={18} /> },
    { value: 'account', label: 'Account', icon: <User size={18} /> },
    { value: 'rooms', label: 'Rooms', icon: <DoorOpen size={18} /> },
    { value: 'restaurant', label: 'Restaurant', icon: <UtensilsCrossed size={18} /> },
    { value: 'finance', label: 'Finance', icon: <DollarSign size={18} /> },
    { value: 'advanced', label: 'Advanced', icon: <Wrench size={18} /> },
];

export function SettingsPage() {
    const user = useAuthStore((state) => state.user);
    const [activeTab, setActiveTab] = useState<SettingsTab>('users');

    // Only admins and managers can access settings
    const canAccess = user?.role === 'admin' || user?.role === 'manager';

    if (!canAccess) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center text-slate-400">
                    <p className="text-xl mb-2">🔒 Access Denied</p>
                    <p>You don't have permission to access settings.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-white">Settings</h2>
                <p className="text-slate-400">Manage users, system, account, rooms, services, and data</p>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.value}
                        onClick={() => setActiveTab(tab.value)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === tab.value
                            ? 'bg-primary-500 text-white'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'system' && <SystemSettingsPanel />}
            {activeTab === 'account' && <AccountPanel />}
            {activeTab === 'rooms' && <RoomsPanel />}
            {activeTab === 'restaurant' && <ServiceManagement />}
            {activeTab === 'finance' && <TaxSettingsPanel />}
            {activeTab === 'advanced' && <AdvancedPanel />}
        </div>
    );
}
