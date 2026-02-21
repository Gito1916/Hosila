import { useState, useEffect, useRef } from 'react';
import { exportData, downloadBackup, getHotelSettings, updateHotelSettings } from '@/db/settings';
import { requireSupabase, getHotelId } from '@/lib/api';
import { toast } from '@/lib/errorMessages';
import {
    Download,
    Upload,
    Database,
    Loader2,
    CheckCircle,
    ToggleLeft,
    ToggleRight,
    AlertTriangle,
} from 'lucide-react';

export function BackupPanel() {
    const [isExporting, setIsExporting] = useState(false);
    const [lastBackup, setLastBackup] = useState<string | null>(null);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [restoreError, setRestoreError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        async function load() {
            const settings = await getHotelSettings();
            setIsDemoMode(settings?.is_demo_mode ?? false);
        }
        load();
    }, []);

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

    const handleDemoModeToggle = async () => {
        const newMode = !isDemoMode;
        setIsDemoMode(newMode);
        await updateHotelSettings({ is_demo_mode: newMode });
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

            // Tables to restore (in order: clear child tables first, then parent tables)
            const tablesToClear = [
                'payment_allocations', 'charges', 'payments', 'service_orders',
                'inventory_movements', 'inventory_items', 'expenses', 'other_income',
                'bookings', 'reservations', 'guests', 'services', 'rooms', 'room_types',
            ];

            // Clear all tables for this hotel
            for (const table of tablesToClear) {
                await sb.from(table).delete().eq('hotel_id', hotelId);
            }

            // Restore data (in order: parent tables first)
            const restoreTable = async (tableName: string, records: any[] | undefined) => {
                if (!records?.length) return;
                // Ensure hotel_id is set correctly
                const enriched = records.map(r => ({ ...r, hotel_id: hotelId }));
                // Insert in batches of 100
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

            // Update hotel settings if present
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
        <div className="space-y-6">
            {/* Demo Mode & Data Reset */}
            <div className="card p-4">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Database size={18} />
                    Data Mode
                </h3>

                <div className="bg-slate-700/50 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h4 className="text-white font-medium">Demo Mode</h4>
                            <p className="text-sm text-slate-400">Enable demo mode for testing and training</p>
                        </div>
                        <button
                            onClick={handleDemoModeToggle}
                            className={`transition-colors ${isDemoMode ? 'text-status-available' : 'text-slate-500'}`}
                        >
                            {isDemoMode ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                        </button>
                    </div>

                    {isDemoMode && (
                        <div className="pt-3 border-t border-slate-600">
                            <p className="text-sm text-slate-400 mb-3">
                                Demo mode is active.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Backup Section */}
            <div className="card p-4">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Database size={18} />
                    Data Backup & Restore
                </h3>

                <div className="space-y-4">
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
            </div>

            {/* Restore Confirmation Modal */}
            {
                showRestoreConfirm && (
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
                )
            }
        </div >
    );
}
