import { useState, useRef } from 'react';
import { exportData, downloadBackup } from '@/db/settings';
import { requireSupabase, getHotelId } from '@/lib/api';
import { toast } from '@/lib/errorMessages';
import { EmailImportPanel } from './EmailImportPanel';
import { ApiKeyPanel } from './ApiKeyPanel';
import { EmailSettingsPanel } from './EmailSettingsPanel';
import {
    Download,
    Upload,
    Database,
    Loader2,
    CheckCircle,
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Mail,
    Globe,
    Send,
} from 'lucide-react';

type Section = 'backup' | 'email_import' | 'website_api' | 'guest_emails';

export function AdvancedPanel() {
    const [expandedSection, setExpandedSection] = useState<Section | null>('backup');

    // Backup state
    const [isExporting, setIsExporting] = useState(false);
    const [lastBackup, setLastBackup] = useState<string | null>(null);
    const [isRestoring, setIsRestoring] = useState(false);
    const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [restoreError, setRestoreError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const toggleSection = (section: Section) => {
        setExpandedSection(prev => prev === section ? null : section);
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const data = await exportData();
            downloadBackup(data);
            setLastBackup(new Date().toLocaleString());
        } catch (err) {
            toast.error('Failed to export data', err);
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.endsWith('.json')) {
            setRestoreError('Please select a valid JSON backup file');
            return;
        }
        setRestoreFile(file);
        setRestoreError(null);
        setShowRestoreConfirm(true);
    };

    const handleRestore = async () => {
        if (!restoreFile) return;
        setIsRestoring(true);
        setRestoreError(null);

        try {
            const text = await restoreFile.text();
            const data = JSON.parse(text);

            if (!data.hotel || !data.exportDate) {
                throw new Error('Invalid backup file format');
            }

            const sb = requireSupabase();
            const hotelId = await getHotelId();

            const tablesToClear = [
                'payment_allocations', 'charges', 'payments', 'service_orders',
                'inventory_movements', 'inventory_items', 'expenses', 'other_income',
                'bookings', 'reservations', 'guests', 'services', 'rooms', 'room_types',
            ];

            for (const table of tablesToClear) {
                await sb.from(table).delete().eq('hotel_id', hotelId);
            }

            const restoreTable = async (tableName: string, records: any[] | undefined) => {
                if (!records?.length) return;
                const enriched = records.map(r => ({ ...r, hotel_id: hotelId }));
                for (let i = 0; i < enriched.length; i += 100) {
                    const batch = enriched.slice(i, i + 100);
                    await sb.from(tableName).insert(batch);
                }
            };

            await restoreTable('room_types', data.room_types);
            await restoreTable('rooms', data.rooms);
            await restoreTable('guests', data.guests);
            await restoreTable('services', data.services);
            await restoreTable('reservations', data.reservations);
            await restoreTable('bookings', data.bookings);
            await restoreTable('payments', data.payments);
            await restoreTable('service_orders', data.service_orders);
            await restoreTable('inventory_items', data.inventory_items);
            await restoreTable('inventory_movements', data.inventory_movements);
            await restoreTable('expenses', data.expenses);
            await restoreTable('other_income', data.other_income);

            if (data.hotel?.settings) {
                await sb.from('hotels').update({ settings: data.hotel.settings }).eq('id', hotelId);
            }

            setShowRestoreConfirm(false);
            setRestoreFile(null);
            toast.success('Data restored', 'The page will reload now.');
            window.location.reload();
        } catch (err) {
            toast.error('Failed to restore backup', err);
            setRestoreError(err instanceof Error ? err.message : 'Failed to restore backup');
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-white">Advanced</h3>
                <p className="text-sm text-slate-400">Backup, email import, guest emails, and API settings</p>
            </div>

            {/* Backup & Restore Section */}
            <div className="card overflow-hidden">
                <button
                    onClick={() => toggleSection('backup')}
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-700/30 transition-colors text-left"
                >
                    <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center shrink-0">
                        <Database className="text-amber-400" size={18} />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-white font-medium text-sm">Backup & Restore</h4>
                        <p className="text-xs text-slate-400">Export and import hotel data</p>
                    </div>
                    {expandedSection === 'backup'
                        ? <ChevronDown size={18} className="text-slate-400" />
                        : <ChevronRight size={18} className="text-slate-400" />
                    }
                </button>
                {expandedSection === 'backup' && (
                    <div className="px-4 pb-4 border-t border-slate-700/50 pt-4 space-y-4">
                        <div className="bg-slate-700/50 rounded-lg p-4">
                            <h4 className="text-white font-medium mb-2">Export Data</h4>
                            <p className="text-sm text-slate-400 mb-4">
                                Download a complete backup of your hotel data.
                            </p>
                            <button onClick={handleExport} disabled={isExporting} className="btn btn-primary">
                                {isExporting ? <><Loader2 size={18} className="animate-spin mr-2" />Exporting...</> : <><Download size={18} className="mr-2" />Download Backup</>}
                            </button>
                            {lastBackup && (
                                <p className="text-xs text-status-available mt-2 flex items-center gap-1">
                                    <CheckCircle size={12} />Last backup: {lastBackup}
                                </p>
                            )}
                        </div>

                        <div className="bg-slate-700/50 rounded-lg p-4">
                            <h4 className="text-white font-medium mb-2">Restore Data</h4>
                            <p className="text-sm text-slate-400 mb-4">
                                Restore from a backup file. <span className="text-amber-400">Warning: This will overwrite current data.</span>
                            </p>
                            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
                            <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary">
                                <Upload size={18} className="mr-2" />Upload Backup
                            </button>
                        </div>

                        <div className="text-xs text-slate-500">
                            <p>• Backups should be stored in cloud storage</p>
                            <p>• Recommended: Export data at least weekly</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Email Import Section */}
            <div className="card overflow-hidden">
                <button
                    onClick={() => toggleSection('email_import')}
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-700/30 transition-colors text-left"
                >
                    <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center shrink-0">
                        <Mail className="text-purple-400" size={18} />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-white font-medium text-sm">Email Import</h4>
                        <p className="text-xs text-slate-400">Auto-import OTA reservations from Gmail</p>
                    </div>
                    {expandedSection === 'email_import'
                        ? <ChevronDown size={18} className="text-slate-400" />
                        : <ChevronRight size={18} className="text-slate-400" />
                    }
                </button>
                {expandedSection === 'email_import' && (
                    <div className="px-4 pb-4 border-t border-slate-700/50 pt-4">
                        <EmailImportPanel />
                    </div>
                )}
            </div>

            {/* Website API Section */}
            <div className="card overflow-hidden">
                <button
                    onClick={() => toggleSection('website_api')}
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-700/30 transition-colors text-left"
                >
                    <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center shrink-0">
                        <Globe className="text-cyan-400" size={18} />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-white font-medium text-sm">Website API</h4>
                        <p className="text-xs text-slate-400">API keys & endpoints for your hotel website</p>
                    </div>
                    {expandedSection === 'website_api'
                        ? <ChevronDown size={18} className="text-slate-400" />
                        : <ChevronRight size={18} className="text-slate-400" />
                    }
                </button>
                {expandedSection === 'website_api' && (
                    <div className="px-4 pb-4 border-t border-slate-700/50 pt-4">
                        <ApiKeyPanel />
                    </div>
                )}
            </div>

            {/* Guest Email Automation Section */}
            <div className="card overflow-hidden">
                <button
                    onClick={() => toggleSection('guest_emails')}
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-700/30 transition-colors text-left"
                >
                    <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
                        <Send className="text-blue-400" size={18} />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-white font-medium text-sm">Guest Email Automation</h4>
                        <p className="text-xs text-slate-400">Auto-send confirmation, welcome & receipt emails</p>
                    </div>
                    {expandedSection === 'guest_emails'
                        ? <ChevronDown size={18} className="text-slate-400" />
                        : <ChevronRight size={18} className="text-slate-400" />
                    }
                </button>
                {expandedSection === 'guest_emails' && (
                    <div className="px-4 pb-4 border-t border-slate-700/50 pt-4">
                        <EmailSettingsPanel />
                    </div>
                )}
            </div>

            {/* Restore Confirmation Modal */}
            {showRestoreConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md p-6">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                                <AlertTriangle size={20} className="text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">Confirm Restore</h3>
                                <p className="text-sm text-slate-400 mt-1">
                                    This will <strong>permanently replace</strong> all current data.
                                </p>
                            </div>
                        </div>

                        {restoreFile && (
                            <div className="bg-slate-700/50 rounded-lg p-3 mb-4">
                                <p className="text-sm text-slate-300">File: <span className="font-mono">{restoreFile.name}</span></p>
                                <p className="text-xs text-slate-500">Size: {(restoreFile.size / 1024).toFixed(1)} KB</p>
                            </div>
                        )}

                        {restoreError && (
                            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm mb-4">
                                {restoreError}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowRestoreConfirm(false); setRestoreFile(null); setRestoreError(null); }}
                                className="btn btn-secondary flex-1"
                            >
                                Cancel
                            </button>
                            <button onClick={handleRestore} disabled={isRestoring} className="btn btn-danger flex-1">
                                {isRestoring ? <><Loader2 size={18} className="animate-spin mr-2" />Restoring...</> : 'Restore Data'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
