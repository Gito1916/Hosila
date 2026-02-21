import { useState, useEffect } from 'react';
import { getHotelSettings, updateHotelSettings } from '@/db/settings';
import { toast } from '@/lib/errorMessages';
import type { HotelSettings, ServiceChargeConfig } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import {
    Save,
    Loader2,
    Plus,
    Trash2,
    ToggleLeft,
    ToggleRight,
    Percent,
    DollarSign,
    Globe,
    Clock,
} from 'lucide-react';

export function TaxSettingsPanel() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [settings, setSettings] = useState<HotelSettings | null>(null);
    const [serviceChargesEnabled, setServiceChargesEnabled] = useState(false);
    const [showAddCharge, setShowAddCharge] = useState(false);
    const [newCharge, setNewCharge] = useState<Partial<ServiceChargeConfig>>({
        name: '',
        type: 'mandatory',
        rate_type: 'percentage',
        rate: 5,
        applies_to: ['rooms', 'restaurant'],
        is_taxable: true,
        is_active: true,
    });

    useEffect(() => {
        async function load() {
            const settingsData = await getHotelSettings();
            setSettings(settingsData ?? null);
            // Check if service charges are enabled (at least one exists)
            setServiceChargesEnabled((settingsData?.service_charges?.length ?? 0) > 0);
            setIsLoading(false);
        }
        load();
    }, []);

    const handleSave = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            await updateHotelSettings(settings);
            toast.success('Settings saved');
        } catch (err) {
            toast.error('Failed to save settings', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddCharge = () => {
        if (!settings || !newCharge.name) return;

        const charge: ServiceChargeConfig = {
            id: uuidv4(),
            name: newCharge.name || 'New Charge',
            type: newCharge.type || 'mandatory',
            rate_type: newCharge.rate_type || 'percentage',
            rate: newCharge.rate || 5,
            applies_to: newCharge.applies_to || ['rooms', 'restaurant'],
            is_taxable: newCharge.is_taxable ?? true,
            is_active: true,
        };

        setSettings({
            ...settings,
            service_charges: [...(settings.service_charges || []), charge],
        });

        setNewCharge({
            name: '',
            type: 'mandatory',
            rate_type: 'percentage',
            rate: 5,
            applies_to: ['rooms', 'restaurant'],
            is_taxable: true,
            is_active: true,
        });
        setShowAddCharge(false);
    };

    const handleRemoveCharge = (id: string) => {
        if (!settings) return;
        setSettings({
            ...settings,
            service_charges: settings.service_charges?.filter(c => c.id !== id) || [],
        });
    };

    const handleToggleChargeActive = (id: string) => {
        if (!settings) return;
        setSettings({
            ...settings,
            service_charges: settings.service_charges?.map(c =>
                c.id === id ? { ...c, is_active: !c.is_active } : c
            ) || [],
        });
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
            {/* Currency Settings */}
            <div className="card p-6 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <Globe size={20} className="text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Currency</h3>
                        <p className="text-sm text-slate-400">Select your hotel's operating currency</p>
                    </div>
                </div>

                <div>
                    <label className="label">Currency</label>
                    <select
                        value={settings?.currency ?? 'NGN'}
                        onChange={(e) => setSettings(s => s ? { ...s, currency: e.target.value } : null)}
                        className="input w-64"
                    >
                        <option value="NGN">Nigerian Naira (₦)</option>
                        <option value="USD">US Dollar ($)</option>
                        <option value="GBP">British Pound (£)</option>
                        <option value="EUR">Euro (€)</option>
                    </select>
                </div>

                <button onClick={handleSave} disabled={isSaving} className="btn btn-primary">
                    <Save size={16} className="mr-2" />
                    Save Currency
                </button>
            </div>

            {/* Late Checkout Fee */}
            <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                            <Clock size={20} className="text-orange-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Auto Late Checkout Fee</h3>
                            <p className="text-sm text-slate-400">Automatically apply fee when guests checkout late</p>
                        </div>
                    </div>

                    <button
                        onClick={() => setSettings(s => s ? { ...s, auto_late_checkout_enabled: !s.auto_late_checkout_enabled } : null)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${settings?.auto_late_checkout_enabled
                            ? 'bg-primary-500/20 text-primary-400'
                            : 'bg-slate-700 text-slate-400'
                            }`}
                    >
                        {settings?.auto_late_checkout_enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        {settings?.auto_late_checkout_enabled ? 'Enabled' : 'Disabled'}
                    </button>
                </div>

                {settings?.auto_late_checkout_enabled && (
                    <div className="flex items-center gap-3 pl-12">
                        <label className="text-sm text-slate-300">Fee per hour:</label>
                        <div className="relative w-40">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₦</span>
                            <input
                                type="number"
                                value={settings?.late_checkout_fee ?? 0}
                                onChange={(e) => setSettings(s => s ? { ...s, late_checkout_fee: Number(e.target.value) } : null)}
                                className="input pl-8"
                                min="0"
                            />
                        </div>
                    </div>
                )}

                <button onClick={handleSave} disabled={isSaving} className="btn btn-primary">
                    <Save size={16} className="mr-2" />
                    Save Late Checkout Settings
                </button>
            </div>

            {/* Tax Rates Section */}
            <div className="card p-6 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-primary-500/20 rounded-lg flex items-center justify-center">
                        <Percent size={20} className="text-primary-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Tax Rates</h3>
                        <p className="text-sm text-slate-400">Configure tax rates for different services</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="label">Default Tax Rate (%)</label>
                        <input
                            type="number"
                            value={settings?.tax_rate ?? 7.5}
                            onChange={(e) => setSettings(s => s ? { ...s, tax_rate: Number(e.target.value) } : null)}
                            className="input"
                            min="0"
                            max="100"
                            step="0.5"
                        />
                        <p className="text-xs text-slate-500 mt-1">Fallback rate if specific rates not set</p>
                    </div>
                    <div>
                        <label className="label">Accommodation Tax (%)</label>
                        <input
                            type="number"
                            value={settings?.accommodation_tax_rate ?? settings?.tax_rate ?? 7.5}
                            onChange={(e) => setSettings(s => s ? { ...s, accommodation_tax_rate: Number(e.target.value) } : null)}
                            className="input"
                            min="0"
                            max="100"
                            step="0.5"
                        />
                        <p className="text-xs text-slate-500 mt-1">Applied to room charges</p>
                    </div>
                    <div>
                        <label className="label">Restaurant Tax (%)</label>
                        <input
                            type="number"
                            value={settings?.services_tax_rate ?? settings?.tax_rate ?? 7.5}
                            onChange={(e) => setSettings(s => s ? { ...s, services_tax_rate: Number(e.target.value) } : null)}
                            className="input"
                            min="0"
                            max="100"
                            step="0.5"
                        />
                        <p className="text-xs text-slate-500 mt-1">Applied to food & beverage</p>
                    </div>
                </div>

                <button onClick={handleSave} disabled={isSaving} className="btn btn-primary">
                    <Save size={16} className="mr-2" />
                    Save Tax Rates
                </button>
            </div>

            {/* Service Charges Section */}
            <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                            <DollarSign size={20} className="text-amber-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Service Charges</h3>
                            <p className="text-sm text-slate-400">Optional charges added to bills</p>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            setServiceChargesEnabled(!serviceChargesEnabled);
                            if (serviceChargesEnabled) {
                                // Disable all charges when toggling off
                                setSettings(s => s ? { ...s, service_charges: [] } : null);
                            }
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${serviceChargesEnabled
                            ? 'bg-primary-500/20 text-primary-400'
                            : 'bg-slate-700 text-slate-400'
                            }`}
                    >
                        {serviceChargesEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        {serviceChargesEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                </div>

                {serviceChargesEnabled && (
                    <>
                        {/* Existing Charges List */}
                        {(settings?.service_charges?.length ?? 0) > 0 && (
                            <div className="space-y-2">
                                {settings?.service_charges?.map((charge) => (
                                    <div
                                        key={charge.id}
                                        className={`p-4 rounded-lg border ${charge.is_active
                                            ? 'bg-slate-700/50 border-slate-600'
                                            : 'bg-slate-800/50 border-slate-700 opacity-60'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="font-medium text-white">{charge.name}</h4>
                                                <p className="text-sm text-slate-400">
                                                    {charge.rate_type === 'percentage' ? `${charge.rate}%` : `₦${charge.rate.toLocaleString()}`}
                                                    {' • '}
                                                    {charge.type === 'mandatory' ? 'Mandatory' : 'Optional'}
                                                    {' • '}
                                                    {charge.applies_to.join(', ')}
                                                    {charge.is_taxable && ' • Taxable'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleToggleChargeActive(charge.id)}
                                                    className={`p-2 rounded-lg transition-colors ${charge.is_active
                                                        ? 'text-primary-400 hover:bg-primary-500/20'
                                                        : 'text-slate-400 hover:bg-slate-600'
                                                        }`}
                                                    title={charge.is_active ? 'Disable' : 'Enable'}
                                                >
                                                    {charge.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                                </button>
                                                <button
                                                    onClick={() => handleRemoveCharge(charge.id)}
                                                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                                    title="Remove"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add New Charge Form */}
                        {showAddCharge ? (
                            <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600 space-y-4">
                                <h4 className="font-medium text-white">Add Service Charge</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="label">Name</label>
                                        <input
                                            type="text"
                                            value={newCharge.name}
                                            onChange={(e) => setNewCharge({ ...newCharge, name: e.target.value })}
                                            placeholder="e.g., Accommodation Service Charge"
                                            className="input"
                                        />
                                    </div>
                                    <div>
                                        <label className="label">Rate</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                value={newCharge.rate}
                                                onChange={(e) => setNewCharge({ ...newCharge, rate: Number(e.target.value) })}
                                                className="input flex-1"
                                                min="0"
                                            />
                                            <select
                                                value={newCharge.rate_type}
                                                onChange={(e) => setNewCharge({ ...newCharge, rate_type: e.target.value as 'percentage' | 'flat' })}
                                                className="input w-24"
                                            >
                                                <option value="percentage">%</option>
                                                <option value="flat">₦</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="label">Type</label>
                                        <select
                                            value={newCharge.type}
                                            onChange={(e) => setNewCharge({ ...newCharge, type: e.target.value as 'mandatory' | 'optional' })}
                                            className="input"
                                        >
                                            <option value="mandatory">Mandatory</option>
                                            <option value="optional">Optional</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="label">Applies To</label>
                                        <div className="flex gap-4 pt-2">
                                            <label className="flex items-center gap-2 text-sm text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={newCharge.applies_to?.includes('rooms')}
                                                    onChange={(e) => {
                                                        const applies = newCharge.applies_to || [];
                                                        setNewCharge({
                                                            ...newCharge,
                                                            applies_to: e.target.checked
                                                                ? [...applies, 'rooms']
                                                                : applies.filter(a => a !== 'rooms'),
                                                        });
                                                    }}
                                                    className="accent-primary-500"
                                                />
                                                Rooms
                                            </label>
                                            <label className="flex items-center gap-2 text-sm text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={newCharge.applies_to?.includes('restaurant')}
                                                    onChange={(e) => {
                                                        const applies = newCharge.applies_to || [];
                                                        setNewCharge({
                                                            ...newCharge,
                                                            applies_to: e.target.checked
                                                                ? [...applies, 'restaurant']
                                                                : applies.filter(a => a !== 'restaurant'),
                                                        });
                                                    }}
                                                    className="accent-primary-500"
                                                />
                                                Restaurant
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 text-sm text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={newCharge.is_taxable}
                                        onChange={(e) => setNewCharge({ ...newCharge, is_taxable: e.target.checked })}
                                        className="accent-primary-500"
                                    />
                                    This charge is taxable
                                </label>
                                <div className="flex gap-2">
                                    <button onClick={handleAddCharge} className="btn btn-primary">
                                        <Plus size={16} className="mr-2" />
                                        Add Charge
                                    </button>
                                    <button onClick={() => setShowAddCharge(false)} className="btn btn-secondary">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowAddCharge(true)}
                                className="btn btn-secondary"
                            >
                                <Plus size={16} className="mr-2" />
                                Add Service Charge
                            </button>
                        )}

                        <button onClick={handleSave} disabled={isSaving} className="btn btn-primary">
                            <Save size={16} className="mr-2" />
                            Save Service Charges
                        </button>
                    </>
                )}

                {!serviceChargesEnabled && (
                    <p className="text-sm text-slate-500 italic">
                        Service charges are currently disabled. Enable them to add and configure service charges.
                    </p>
                )}
            </div>
        </div>
    );
}
