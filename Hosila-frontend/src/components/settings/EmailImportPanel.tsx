import { useState, useEffect, useRef } from 'react';
import {
    Mail, Loader2, Check, AlertCircle, RefreshCw,
    Unplug, Clock, FileText, MailCheck, MailX
} from 'lucide-react';
import {
    signInWithGoogle, disconnectGmail, isGmailConnected, getStoredToken,
    isGISLoaded, type GmailTokenInfo
} from '@/lib/gmail';
import {
    scanForNewReservations, getLastScanDate, getImportLogs,
    type ImportSummary
} from '@/services/emailImportService';

export function EmailImportPanel() {
    const [connected, setConnected] = useState(isGmailConnected());
    const [tokenInfo, setTokenInfo] = useState<GmailTokenInfo | null>(getStoredToken());
    const [isConnecting, setIsConnecting] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState('');
    const [lastScan, setLastScan] = useState(getLastScanDate());
    const [importLog, setImportLog] = useState<ImportSummary[]>([]);
    const [lastResult, setLastResult] = useState<ImportSummary | null>(null);
    const [gisLoaded, setGisLoaded] = useState(isGISLoaded());
    const autoScanRef = useRef<NodeJS.Timeout | null>(null);

    // Load import logs on mount
    useEffect(() => {
        getImportLogs().then(logs => setImportLog(logs as any));
    }, []);
    const [autoScanEnabled, setAutoScanEnabled] = useState(
        localStorage.getItem('hotelflow_auto_scan') === 'true'
    );
    const [autoScanInterval, setAutoScanInterval] = useState(
        parseInt(localStorage.getItem('hotelflow_auto_scan_interval') || '15', 10)
    );

    // Check if GIS is loaded (might take a moment)
    useEffect(() => {
        if (gisLoaded) return;
        const check = setInterval(() => {
            if (isGISLoaded()) {
                setGisLoaded(true);
                clearInterval(check);
            }
        }, 500);
        return () => clearInterval(check);
    }, [gisLoaded]);

    // Auto-scan timer
    useEffect(() => {
        if (autoScanRef.current) {
            clearInterval(autoScanRef.current);
            autoScanRef.current = null;
        }

        if (autoScanEnabled && connected) {
            autoScanRef.current = setInterval(() => {
                handleScan();
            }, autoScanInterval * 60 * 1000);
        }

        return () => {
            if (autoScanRef.current) clearInterval(autoScanRef.current);
        };
    }, [autoScanEnabled, autoScanInterval, connected]);

    const handleConnect = async () => {
        setIsConnecting(true);
        setError('');
        try {
            const token = await signInWithGoogle();
            setTokenInfo(token);
            setConnected(true);
        } catch (err: any) {
            setError(err.message || 'Failed to connect Gmail');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnect = () => {
        disconnectGmail();
        setConnected(false);
        setTokenInfo(null);
        setAutoScanEnabled(false);
        localStorage.setItem('hotelflow_auto_scan', 'false');
    };

    const handleScan = async () => {
        setIsScanning(true);
        setError('');
        try {
            const result = await scanForNewReservations();
            setLastResult(result);
            setLastScan(new Date());
            setImportLog(await getImportLogs() as any);
        } catch (err: any) {
            setError(err.message || 'Scan failed');
            if (err.message?.includes('expired') || err.message?.includes('Not connected')) {
                setConnected(false);
                setTokenInfo(null);
            }
        } finally {
            setIsScanning(false);
        }
    };

    const toggleAutoScan = () => {
        const newVal = !autoScanEnabled;
        setAutoScanEnabled(newVal);
        localStorage.setItem('hotelflow_auto_scan', String(newVal));
    };

    const handleIntervalChange = (val: number) => {
        setAutoScanInterval(val);
        localStorage.setItem('hotelflow_auto_scan_interval', String(val));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h3 className="text-lg font-semibold text-heading flex items-center gap-2">
                    <Mail size={20} className="text-primary-400" />
                    Email Import
                </h3>
                <p className="text-sm text-muted mt-1">
                    Automatically import reservations from Booking.com and Airbnb confirmation emails.
                </p>
            </div>

            {/* Connection Status */}
            <div className="bg-surface-raised/50 rounded-xl p-5 border border-border-strong/50">
                {!connected ? (
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 bg-surface-card/50 rounded-full flex items-center justify-center mx-auto">
                            <Mail size={32} className="text-muted" />
                        </div>
                        <div>
                            <h4 className="text-heading font-medium">Connect Gmail</h4>
                            <p className="text-sm text-muted mt-1">
                                Connect the Gmail account where you receive OTA booking confirmation emails.
                            </p>
                        </div>

                        {!gisLoaded && (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                                ⏳ Loading Google Sign-in... Make sure you're connected to the internet.
                            </div>
                        )}

                        {error && (
                            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-start gap-2">
                                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleConnect}
                            disabled={isConnecting || !gisLoaded}
                            className="btn btn-primary inline-flex items-center gap-2"
                        >
                            {isConnecting ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Connecting...
                                </>
                            ) : (
                                <>
                                    <svg width="18" height="18" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    </svg>
                                    Connect with Google
                                </>
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                                    <MailCheck size={20} className="text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-heading font-medium">Gmail Connected</p>
                                    <p className="text-sm text-muted">{tokenInfo?.email}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleDisconnect}
                                className="btn btn-secondary text-sm flex items-center gap-1.5"
                            >
                                <Unplug size={14} />
                                Disconnect
                            </button>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-start gap-2">
                                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                {error}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Scan Controls */}
            {connected && (
                <>
                    <div className="bg-surface-raised/50 rounded-xl p-5 border border-border-strong/50 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-heading font-medium">Scan for Reservations</h4>
                                <p className="text-xs text-muted mt-1">
                                    {lastScan
                                        ? `Last scanned: ${lastScan.toLocaleString()}`
                                        : 'Never scanned'}
                                </p>
                            </div>
                            <button
                                onClick={handleScan}
                                disabled={isScanning}
                                className="btn btn-primary flex items-center gap-2"
                            >
                                {isScanning ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Scanning...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw size={16} />
                                        Scan Now
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Auto-scan toggle */}
                        <div className="border-t border-border-strong/50 pt-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-heading text-sm font-medium">Auto-Scan</p>
                                    <p className="text-xs text-muted">Periodically check for new booking emails</p>
                                </div>
                                <button
                                    onClick={toggleAutoScan}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${autoScanEnabled ? 'bg-primary-500' : 'bg-surface-card'
                                        }`}
                                >
                                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-surface-card transition-transform ${autoScanEnabled ? 'translate-x-5' : 'translate-x-0.5'
                                        }`} />
                                </button>
                            </div>

                            {autoScanEnabled && (
                                <div className="mt-3 flex items-center gap-2">
                                    <span className="text-sm text-muted">Check every</span>
                                    <select
                                        value={autoScanInterval}
                                        onChange={e => handleIntervalChange(parseInt(e.target.value))}
                                        className="input w-auto text-sm py-1 px-2"
                                    >
                                        <option value={5}>5 minutes</option>
                                        <option value={15}>15 minutes</option>
                                        <option value={30}>30 minutes</option>
                                        <option value={60}>1 hour</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Last Scan Result */}
                    {lastResult && (
                        <div className="bg-surface-raised/50 rounded-xl p-5 border border-border-strong/50">
                            <h4 className="text-heading font-medium mb-3">Last Scan Results</h4>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <div className="bg-surface-card/50 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold text-heading">{lastResult.total}</p>
                                    <p className="text-xs text-muted">Emails Found</p>
                                </div>
                                <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold text-emerald-400">{lastResult.imported}</p>
                                    <p className="text-xs text-muted">Imported</p>
                                </div>
                                <div className="bg-amber-500/10 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold text-amber-400">{lastResult.duplicates}</p>
                                    <p className="text-xs text-muted">Duplicates</p>
                                </div>
                                <div className="bg-red-500/10 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold text-red-400">{lastResult.failed}</p>
                                    <p className="text-xs text-muted">Failed</p>
                                </div>
                            </div>

                            {/* Individual results */}
                            {lastResult.results.length > 0 && (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {lastResult.results.map((result, i) => (
                                        <div
                                            key={i}
                                            className={`flex items-center gap-3 p-3 rounded-lg text-sm ${result.status === 'imported' ? 'bg-emerald-500/10' :
                                                result.status === 'duplicate' ? 'bg-amber-500/10' :
                                                    result.status === 'failed' ? 'bg-red-500/10' :
                                                        'bg-surface-card/50'
                                                }`}
                                        >
                                            {result.status === 'imported' && <Check size={16} className="text-emerald-400 shrink-0" />}
                                            {result.status === 'duplicate' && <FileText size={16} className="text-amber-400 shrink-0" />}
                                            {result.status === 'failed' && <MailX size={16} className="text-red-400 shrink-0" />}
                                            {result.status === 'unrecognized' && <Mail size={16} className="text-muted shrink-0" />}

                                            <div className="flex-1 min-w-0">
                                                {result.reservation ? (
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-heading font-medium">{result.reservation.guestName}</span>
                                                        <span className="text-muted">•</span>
                                                        <span className="text-muted">{result.reservation.source}</span>
                                                        <span className="text-muted">•</span>
                                                        <span className="text-muted">
                                                            {result.reservation.checkIn.toLocaleDateString()} - {result.reservation.checkOut.toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted">
                                                        {result.status === 'unrecognized' ? 'Unknown OTA format' : result.error}
                                                    </span>
                                                )}
                                            </div>

                                            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${result.status === 'imported' ? 'bg-emerald-500/20 text-emerald-400' :
                                                result.status === 'duplicate' ? 'bg-amber-500/20 text-amber-400' :
                                                    result.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                                        'bg-surface-card/50 text-muted'
                                                }`}>
                                                {result.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {lastResult.total === 0 && (
                                <p className="text-sm text-muted text-center py-2">
                                    No new OTA booking emails found.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Import History */}
                    {importLog.length > 1 && (
                        <div className="bg-surface-raised/50 rounded-xl p-5 border border-border-strong/50">
                            <h4 className="text-heading font-medium mb-3 flex items-center gap-2">
                                <Clock size={16} className="text-muted" />
                                Import History
                            </h4>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {importLog.slice(1).map((summary, i) => (
                                    <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-surface-inset">
                                        <span className="text-muted">
                                            {new Date(summary.scannedAt).toLocaleString()}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-emerald-400">{summary.imported} imported</span>
                                            {summary.duplicates > 0 && (
                                                <span className="text-amber-400">{summary.duplicates} dupes</span>
                                            )}
                                            {summary.failed > 0 && (
                                                <span className="text-red-400">{summary.failed} failed</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Help info */}
            <div className="bg-surface-card/50 rounded-xl p-4 border border-border/50">
                <h4 className="text-heading text-sm font-medium mb-2">Supported OTA Platforms</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-muted">
                        <Check size={14} className="text-emerald-400" />
                        Booking.com
                    </div>
                    <div className="flex items-center gap-2 text-muted">
                        <Check size={14} className="text-emerald-400" />
                        Airbnb
                    </div>
                </div>
                <p className="text-xs text-muted mt-3">
                    The app reads booking confirmation emails from your Gmail inbox and automatically creates reservations.
                    Parsed emails are marked as read to avoid re-processing.
                </p>
            </div>
        </div>
    );
}
