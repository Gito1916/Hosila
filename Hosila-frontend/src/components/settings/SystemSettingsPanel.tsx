import { useState, useEffect } from 'react';
import { getHotelSettings, updateHotelSettings } from '@/db/settings';
import { toast } from '@/lib/errorMessages';
import type { HotelSettings } from '@/types';
import {
    Save,
    Loader2,
    Clock,
    Timer,
} from 'lucide-react';

const SESSION_TIMEOUT_OPTIONS = [
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' },
    { value: 120, label: '2 hours' },
    { value: 240, label: '4 hours' },
];

export function SystemSettingsPanel() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [settings, setSettings] = useState<HotelSettings | null>(null);

    useEffect(() => {
        async function load() {
            const settingsData = await getHotelSettings();
            setSettings(settingsData ?? null);
            setIsLoading(false);
        }
        load();
    }, []);

    const handleSave = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            await updateHotelSettings(settings);
            toast.success('System settings saved');
        } catch (err) {
            toast.error('Failed to save settings', err);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="card p-8 text-center">
                <Loader2 className="animate-spin mx-auto text-primary-400" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Operations */}
            <div className="card p-4">
                <h3 className="font-semibold text-heading mb-4 flex items-center gap-2">
                    <Clock size={18} />
                    Operations
                </h3>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Default Checkout Time</label>
                            <input
                                type="time"
                                value={settings?.checkout_time ?? '12:00'}
                                onChange={(e) => setSettings(s => s ? { ...s, checkout_time: e.target.value } : null)}
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="label">Night Audit Time</label>
                            <input
                                type="time"
                                value={settings?.night_audit_time ?? '03:00'}
                                onChange={(e) => setSettings(s => s ? { ...s, night_audit_time: e.target.value } : null)}
                                className="input"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="short_rest_enabled"
                            checked={settings?.short_rest_enabled ?? true}
                            onChange={(e) => setSettings(s => s ? { ...s, short_rest_enabled: e.target.checked } : null)}
                            className="w-4 h-4"
                        />
                        <label htmlFor="short_rest_enabled" className="text-muted">Enable Short Rest bookings</label>
                    </div>

                    {settings?.short_rest_enabled && (
                        <div className="grid grid-cols-2 gap-4 pl-7">
                            <div>
                                <label className="label">Min Hours</label>
                                <input
                                    type="number"
                                    value={settings?.short_rest_min_hours ?? 2}
                                    onChange={(e) => setSettings(s => s ? { ...s, short_rest_min_hours: Number(e.target.value) } : null)}
                                    className="input"
                                    min="1"
                                    max="12"
                                />
                            </div>
                            <div>
                                <label className="label">Max Hours</label>
                                <input
                                    type="number"
                                    value={settings?.short_rest_max_hours ?? 6}
                                    onChange={(e) => setSettings(s => s ? { ...s, short_rest_max_hours: Number(e.target.value) } : null)}
                                    className="input"
                                    min="1"
                                    max="12"
                                />
                            </div>
                        </div>
                    )}

                    {/* Credit Limit Settings */}
                    <div className="border-t border-border pt-4 mt-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="credit_limit_enabled"
                                checked={settings?.credit_limit_enabled ?? false}
                                onChange={(e) => setSettings(s => s ? { ...s, credit_limit_enabled: e.target.checked } : null)}
                                className="w-4 h-4"
                            />
                            <label htmlFor="credit_limit_enabled" className="text-muted">Enable Credit Limit Warnings</label>
                        </div>
                        <p className="text-xs text-muted mt-1 ml-7">
                            Warn staff when guest balance exceeds the limit
                        </p>

                        {settings?.credit_limit_enabled && (
                            <div className="mt-3 pl-7">
                                <label className="label">Credit Limit Amount</label>
                                <div className="relative max-w-xs">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₦</span>
                                    <input
                                        type="number"
                                        value={settings?.credit_limit_amount ?? 50000}
                                        onChange={(e) => setSettings(s => s ? { ...s, credit_limit_amount: Number(e.target.value) } : null)}
                                        className="input pl-8"
                                        min="0"
                                        step="1000"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Session Timeout */}
            <div className="card p-4">
                <h3 className="font-semibold text-heading mb-4 flex items-center gap-2">
                    <Timer size={18} />
                    Session Timeout
                </h3>

                <div className="space-y-3">
                    <p className="text-sm text-muted">
                        Automatically log out inactive users after the selected duration. This helps keep the system secure on shared devices.
                    </p>

                    <div className="max-w-xs">
                        <label className="label">Timeout Duration</label>
                        <select
                            value={settings?.session_timeout_minutes ?? 30}
                            onChange={(e) => setSettings(s => s ? { ...s, session_timeout_minutes: Number(e.target.value) } : null)}
                            className="input"
                        >
                            {SESSION_TIMEOUT_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <p className="text-xs text-muted">
                        A warning will appear 5 minutes before the session expires.
                    </p>
                </div>
            </div>

            {/* Save Button */}
            <button onClick={handleSave} disabled={isSaving} className="btn btn-primary">
                <Save size={16} className="mr-2" />
                Save System Settings
            </button>
        </div>
    );
}
