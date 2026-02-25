import { useState, useEffect } from 'react';
import { getHotelSettings, updateHotelSettings } from '@/db/settings';
import {
    Zap,
    Clock,
    Percent,
    Save,
    Loader2,
    ToggleLeft,
    ToggleRight,
} from 'lucide-react';

export function AutomationPanel() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Form state
    const [lateCheckoutEnabled, setLateCheckoutEnabled] = useState(false);
    const [lateCheckoutFee, setLateCheckoutFee] = useState(0);
    const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
    const [serviceChargePercent, setServiceChargePercent] = useState(0);


    useEffect(() => {
        async function load() {
            const s = await getHotelSettings();
            if (s) {
                setLateCheckoutEnabled(s.auto_late_checkout_enabled ?? false);
                setLateCheckoutFee(s.late_checkout_fee ?? 0);
                setServiceChargeEnabled(s.auto_service_charge_enabled ?? false);
                setServiceChargePercent(s.auto_service_charge ?? 0);

            }
            setIsLoading(false);
        }
        load();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateHotelSettings({
                auto_late_checkout_enabled: lateCheckoutEnabled,
                late_checkout_fee: lateCheckoutFee,
                auto_service_charge_enabled: serviceChargeEnabled,
                auto_service_charge: serviceChargePercent,

            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            console.error('Error saving settings:', err);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-32">
                <Loader2 className="animate-spin text-primary-400" size={24} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="card p-4">
                <h3 className="font-semibold text-heading mb-4 flex items-center gap-2">
                    <Zap size={18} />
                    Automation Rules
                </h3>

                <div className="space-y-6">
                    {/* Late Checkout Fee */}
                    <div className="bg-surface-raised/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Clock size={18} className="text-primary-400" />
                                <h4 className="text-heading font-medium">Auto Late Checkout Fee</h4>
                            </div>
                            <button
                                onClick={() => setLateCheckoutEnabled(!lateCheckoutEnabled)}
                                className={`transition-colors ${lateCheckoutEnabled ? 'text-status-available' : 'text-muted'}`}
                            >
                                {lateCheckoutEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                            </button>
                        </div>
                        <p className="text-sm text-muted mb-3">
                            Automatically add a fee when guests checkout after the standard checkout time.
                        </p>
                        {lateCheckoutEnabled && (
                            <div className="flex items-center gap-3">
                                <label className="text-sm text-muted">Fee per hour:</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₦</span>
                                    <input
                                        type="number"
                                        value={lateCheckoutFee}
                                        onChange={(e) => setLateCheckoutFee(Number(e.target.value))}
                                        className="input pl-8 w-32"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Service Charge */}
                    <div className="bg-surface-raised/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Percent size={18} className="text-primary-400" />
                                <h4 className="text-heading font-medium">Auto Service Charge</h4>
                            </div>
                            <button
                                onClick={() => setServiceChargeEnabled(!serviceChargeEnabled)}
                                className={`transition-colors ${serviceChargeEnabled ? 'text-status-available' : 'text-muted'}`}
                            >
                                {serviceChargeEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                            </button>
                        </div>
                        <p className="text-sm text-muted mb-3">
                            Automatically add a service charge percentage to restaurant/bar orders.
                        </p>
                        {serviceChargeEnabled && (
                            <div className="flex items-center gap-3">
                                <label className="text-sm text-muted">Service charge:</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={serviceChargePercent}
                                        onChange={(e) => setServiceChargePercent(Number(e.target.value))}
                                        className="input pr-8 w-24"
                                        min={0}
                                        max={100}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">%</span>
                                </div>
                            </div>
                        )}
                    </div>


                </div>

                {/* Save Button */}
                <div className="mt-6 flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="btn btn-primary"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 size={16} className="animate-spin mr-2" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save size={16} className="mr-2" />
                                Save Settings
                            </>
                        )}
                    </button>
                    {saved && (
                        <span className="text-status-available text-sm">Settings saved!</span>
                    )}
                </div>
            </div>
        </div>
    );
}
