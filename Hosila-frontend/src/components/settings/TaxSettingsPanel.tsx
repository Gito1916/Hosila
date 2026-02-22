import { useState, useEffect } from 'react';
import { getHotelSettings, updateHotelSettings } from '@/db/settings';
import { toast } from '@/lib/errorMessages';
import type { HotelSettings } from '@/types';
import { requireSupabase, getHotelId } from '@/lib/api';
import type { TaxSettings } from '@/lib/apiClient';
import {
    Save,
    Loader2,
    ToggleLeft,
    ToggleRight,
    Percent,
    Globe,
    Clock,
    Building2,
    UtensilsCrossed,
    Boxes,
    Info,
} from 'lucide-react';

// ── Department display info ──────────────────────────────────
const DEPARTMENTS: { key: string; label: string; icon: typeof Building2; color: string }[] = [
    { key: 'accommodation', label: 'Accommodation', icon: Building2, color: 'emerald' },
    { key: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed, color: 'cyan' },
    { key: 'other_services', label: 'Other Services', icon: Boxes, color: 'purple' },
];

const CALC_BASE_OPTIONS = [
    { value: 'base_only', label: 'Base amount only' },
    { value: 'base_plus_sc', label: 'Base + Service Charge' },
];

// ── Department Card ──────────────────────────────────────────
function DepartmentTaxCard({
    dept,
    settings,
    onChange,
    onSave,
    isSaving,
    tdlName,
}: {
    dept: typeof DEPARTMENTS[number];
    settings: TaxSettings | null;
    onChange: (field: string, value: number | boolean | string) => void;
    onSave: () => void;
    isSaving: boolean;
    tdlName: string;
}) {
    const Icon = dept.icon;
    const colorMap: Record<string, string> = {
        emerald: 'bg-emerald-500/20 text-emerald-400',
        cyan: 'bg-cyan-500/20 text-cyan-400',
        purple: 'bg-purple-500/20 text-purple-400',
    };
    const accent = colorMap[dept.color] ?? 'bg-slate-500/20 text-slate-400';

    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent}`}>
                    <Icon size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{dept.label}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Tax configuration for {dept.label.toLowerCase()}</p>
                </div>
            </div>

            {/* Tax Rows */}
            <div className="space-y-4">
                {/* Service Charge */}
                <TaxRow
                    label="Service Charge"
                    rate={settings?.service_charge_rate ?? 10}
                    enabled={settings?.service_charge_enabled ?? true}
                    onRateChange={(v) => onChange('service_charge_rate', v)}
                    onToggle={() => onChange('service_charge_enabled', !(settings?.service_charge_enabled ?? true))}
                />

                {/* VAT */}
                <TaxRow
                    label="VAT"
                    rate={settings?.vat_rate ?? 7.5}
                    enabled={settings?.vat_enabled ?? true}
                    onRateChange={(v) => onChange('vat_rate', v)}
                    onToggle={() => onChange('vat_enabled', !(settings?.vat_enabled ?? true))}
                />

                {/* TDL / Custom Tax */}
                <TaxRow
                    label={tdlName}
                    rate={settings?.tdl_rate ?? 5}
                    enabled={settings?.tdl_enabled ?? true}
                    onRateChange={(v) => onChange('tdl_rate', v)}
                    onToggle={() => onChange('tdl_enabled', !(settings?.tdl_enabled ?? true))}
                />
            </div>

            {/* Calculation Base */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Info size={14} />
                    <span>Choose how VAT and {tdlName} are calculated</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="label text-xs">VAT calculated on</label>
                        <select
                            value={settings?.vat_calculation_base ?? 'base_plus_sc'}
                            onChange={(e) => onChange('vat_calculation_base', e.target.value)}
                            className="input text-sm"
                        >
                            {CALC_BASE_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label text-xs">{tdlName} calculated on</label>
                        <select
                            value={settings?.tdl_calculation_base ?? 'base_plus_sc'}
                            onChange={(e) => onChange('tdl_calculation_base', e.target.value)}
                            className="input text-sm"
                        >
                            {CALC_BASE_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Save */}
            <button onClick={onSave} disabled={isSaving} className="btn btn-primary w-full sm:w-auto">
                {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                Save {dept.label}
            </button>
        </div>
    );
}

// ── Tax Row (rate + toggle) ──────────────────────────────────
function TaxRow({
    label,
    rate,
    enabled,
    onRateChange,
    onToggle,
}: {
    label: string;
    rate: number;
    enabled: boolean;
    onRateChange: (v: number) => void;
    onToggle: () => void;
}) {
    return (
        <div className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${enabled ? 'bg-slate-50 dark:bg-slate-700/40' : 'bg-slate-100 dark:bg-slate-800/40 opacity-60'}`}>
            <button
                onClick={onToggle}
                className={`flex-shrink-0 transition-colors ${enabled ? 'text-primary-400' : 'text-slate-500'}`}
                title={enabled ? 'Disable' : 'Enable'}
            >
                {enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
            </button>

            <span className="text-sm text-slate-700 dark:text-slate-300 min-w-[140px]">{label}</span>

            <div className="relative w-24">
                <input
                    type="number"
                    value={rate}
                    onChange={(e) => onRateChange(Number(e.target.value))}
                    className="input text-sm pr-7"
                    min="0"
                    max="100"
                    step="0.5"
                    disabled={!enabled}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export function TaxSettingsPanel() {
    // ── Local settings (currency, late checkout) ─────────────
    const [isLoadingLocal, setIsLoadingLocal] = useState(true);
    const [isSavingLocal, setIsSavingLocal] = useState(false);
    const [localSettings, setLocalSettings] = useState<HotelSettings | null>(null);

    useEffect(() => {
        async function load() {
            const data = await getHotelSettings();
            setLocalSettings(data ?? null);
            setIsLoadingLocal(false);
        }
        load();
    }, []);

    const handleSaveLocal = async () => {
        if (!localSettings) return;
        setIsSavingLocal(true);
        try {
            await updateHotelSettings(localSettings);
            toast.success('Settings saved');
        } catch (err) {
            toast.error('Failed to save settings', err);
        } finally {
            setIsSavingLocal(false);
        }
    };

    // ── Backend tax settings (direct Supabase) ────────────────
    const [taxSettings, setTaxSettings] = useState<Record<string, Partial<TaxSettings>>>({});
    const [isLoadingTax, setIsLoadingTax] = useState(true);
    const [isSavingDept, setIsSavingDept] = useState(false);

    // Load tax settings directly from Supabase
    useEffect(() => {
        async function loadTax() {
            try {
                const sb = requireSupabase();
                const hotelId = await getHotelId();
                const { data, error } = await sb
                    .from('tax_settings')
                    .select('*')
                    .eq('hotel_id', hotelId);
                if (error) throw error;
                const map: Record<string, Partial<TaxSettings>> = {};
                for (const s of (data ?? [])) {
                    map[s.department] = { ...s };
                }
                setTaxSettings(map);
            } catch (err) {
                console.error('Failed to load tax settings:', err);
            } finally {
                setIsLoadingTax(false);
            }
        }
        loadTax();
    }, []);

    // Local draft state for each department
    const [drafts, setDrafts] = useState<Record<string, Partial<TaxSettings>>>({});

    // Populate drafts when data loads
    useEffect(() => {
        if (Object.keys(taxSettings).length > 0) {
            setDrafts({ ...taxSettings });
        }
    }, [taxSettings]);

    const getDeptSettings = (dept: string): TaxSettings | null => {
        const draft = drafts[dept];
        if (!draft) return null;
        return draft as TaxSettings;
    };

    const handleFieldChange = (dept: string, field: string, value: number | boolean | string) => {
        setDrafts(prev => ({
            ...prev,
            [dept]: { ...(prev[dept] || {}), [field]: value },
        }));
    };

    const handleSaveDept = async (dept: string) => {
        const data = drafts[dept];
        if (!data) return;
        setIsSavingDept(true);
        try {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const payload = {
                hotel_id: hotelId,
                department: dept,
                vat_rate: data.vat_rate ?? 7.5,
                tdl_rate: data.tdl_rate ?? 5,
                service_charge_rate: data.service_charge_rate ?? 10,
                service_charge_enabled: data.service_charge_enabled ?? true,
                vat_enabled: data.vat_enabled ?? true,
                tdl_enabled: data.tdl_enabled ?? false,
                vat_calculation_base: data.vat_calculation_base ?? 'base_only',
                tdl_calculation_base: data.tdl_calculation_base ?? 'base_only',
                updated_at: new Date().toISOString(),
            };

            // Upsert: insert or update if exists
            if (data.id) {
                const { error } = await sb.from('tax_settings').update(payload).eq('id', data.id);
                if (error) throw error;
            } else {
                const { data: inserted, error } = await sb.from('tax_settings').insert(payload).select().single();
                if (error) throw error;
                // Update local state with new id
                setDrafts(prev => ({ ...prev, [dept]: { ...prev[dept], id: inserted.id } }));
            }
            toast.success(`${dept} tax settings saved`);
        } catch (err) {
            toast.error('Failed to save tax settings', err);
        } finally {
            setIsSavingDept(false);
        }
    };

    // ── Loading ──────────────────────────────────────────────
    if (isLoadingLocal || isLoadingTax) {
        return (
            <div className="card p-8 text-center">
                <Loader2 className="animate-spin mx-auto text-primary-400" size={32} />
                <p className="text-slate-400 mt-3 text-sm">Loading tax settings...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Currency Settings */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <Globe size={20} className="text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Currency</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Select your hotel's operating currency</p>
                    </div>
                </div>

                <div>
                    <label className="label">Currency</label>
                    <select
                        value={localSettings?.currency ?? 'NGN'}
                        onChange={(e) => setLocalSettings(s => s ? { ...s, currency: e.target.value } : null)}
                        className="input w-64"
                    >
                        <option value="NGN">Nigerian Naira (₦)</option>
                        <option value="USD">US Dollar ($)</option>
                        <option value="GBP">British Pound (£)</option>
                        <option value="EUR">Euro (€)</option>
                    </select>
                </div>

                <div>
                    <label className="label">State/Local Tax Name</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        Customize the name of the third tax component (default: TDL). This applies to all departments, invoices, and reports.
                    </p>
                    <input
                        type="text"
                        value={localSettings?.tdl_name ?? 'TDL'}
                        onChange={(e) => setLocalSettings(s => s ? { ...s, tdl_name: e.target.value } : null)}
                        className="input w-64"
                        placeholder="e.g. TDL, Consumption Tax, Tourism Levy"
                    />
                </div>

                <button onClick={handleSaveLocal} disabled={isSavingLocal} className="btn btn-primary">
                    <Save size={16} className="mr-2" />
                    Save Currency & Tax Name
                </button>
            </div>

            {/* Late Checkout Fee */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                            <Clock size={20} className="text-orange-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Auto Late Checkout Fee</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Automatically apply fee when guests checkout late</p>
                        </div>
                    </div>

                    <button
                        onClick={() => setLocalSettings(s => s ? { ...s, auto_late_checkout_enabled: !s.auto_late_checkout_enabled } : null)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${localSettings?.auto_late_checkout_enabled
                            ? 'bg-primary-500/20 text-primary-400'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                            }`}
                    >
                        {localSettings?.auto_late_checkout_enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        {localSettings?.auto_late_checkout_enabled ? 'Enabled' : 'Disabled'}
                    </button>
                </div>

                {localSettings?.auto_late_checkout_enabled && (
                    <div className="flex items-center gap-3 pl-12">
                        <label className="text-sm text-slate-600 dark:text-slate-300">Fee per hour:</label>
                        <div className="relative w-40">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₦</span>
                            <input
                                type="number"
                                value={localSettings?.late_checkout_fee ?? 0}
                                onChange={(e) => setLocalSettings(s => s ? { ...s, late_checkout_fee: Number(e.target.value) } : null)}
                                className="input pl-8"
                                min="0"
                            />
                        </div>
                    </div>
                )}

                <button onClick={handleSaveLocal} disabled={isSavingLocal} className="btn btn-primary">
                    <Save size={16} className="mr-2" />
                    Save Late Checkout Settings
                </button>
            </div>

            {/* Per-Department Tax Settings (from Backend API) */}
            <div className="space-y-2">
                <div className="flex items-center gap-3 px-1">
                    <Percent size={20} className="text-primary-400" />
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Tax Rates by Department</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Configure Service Charge, VAT, and {localSettings?.tdl_name || 'TDL'} per department</p>
                    </div>
                </div>
            </div>

            {DEPARTMENTS.map(dept => (
                <DepartmentTaxCard
                    key={dept.key}
                    dept={dept}
                    settings={getDeptSettings(dept.key)}
                    onChange={(field, value) => handleFieldChange(dept.key, field, value)}
                    onSave={() => handleSaveDept(dept.key)}
                    isSaving={isSavingDept}
                    tdlName={localSettings?.tdl_name || 'TDL'}
                />
            ))}
        </div>
    );
}
