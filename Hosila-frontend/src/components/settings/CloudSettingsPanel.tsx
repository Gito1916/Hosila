import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { isCloudAvailable } from '@/lib/supabase';
import {
    Cloud,
    CloudOff,
    AlertCircle,
    Unlink,
    ShieldCheck,
    Link2,
    Loader2,
    CheckCircle2,
    Mail,
    Lock,
    Copy,
    Monitor,
    KeyRound,
    RefreshCw,
    MailCheck,
} from 'lucide-react';

/**
 * Cloud Settings Panel — manages hotel-level cloud account.
 * Uses a real email address for the Supabase cloud account.
 */
export function CloudSettingsPanel() {
    const {
        cloudAccount,
        isCloudLinked,
        cloudError,
        pendingConfirmation,
        registerCloud,
        loginCloud,
        logoutCloud,
        linkHotelToCloud,
        updateCloudEmail,
        updateCloudPassword,
        resetCloudPassword,
        clearPendingConfirmation,
    } = useAuthStore();

    const isOnline = navigator.onLine;
    const [deviceCount, setDeviceCount] = useState<number>(0);

    // Fetch device count when connected
    useEffect(() => {
        if (cloudAccount && isCloudLinked) {
            Promise.resolve(0).then(setDeviceCount);
        }
    }, [cloudAccount, isCloudLinked]);

    const [mode, setMode] = useState<'create' | 'connect'>('create');
    const [cloudEmail, setCloudEmail] = useState('');
    const [syncPassword, setSyncPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [copied, setCopied] = useState(false);

    // Account management state
    const [showChangeEmail, setShowChangeEmail] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [mgmtLoading, setMgmtLoading] = useState(false);
    const [mgmtSuccess, setMgmtSuccess] = useState('');

    const cloudAvailable = isCloudAvailable();

    if (!cloudAvailable) {
        return (
            <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                    <CloudOff className="text-slate-400" size={24} />
                    <h3 className="text-lg font-semibold text-white">Cloud Not Configured</h3>
                </div>
                <p className="text-slate-400 text-sm">
                    Cloud sync is not configured. Add your Supabase credentials to the{' '}
                    <code className="text-primary-400">.env</code> file to enable cloud features.
                </p>
                <div className="mt-4 p-3 bg-slate-700/50 rounded-lg text-xs font-mono text-slate-400">
                    VITE_SUPABASE_URL=your_url<br />
                    VITE_SUPABASE_ANON_KEY=your_key
                </div>
            </div>
        );
    }



    const handleCopyId = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccessMsg('');

        const success = mode === 'create'
            ? await registerCloud(cloudEmail, syncPassword)
            : await loginCloud(cloudEmail, syncPassword);

        if (success) {
            if (mode === 'create' && pendingConfirmation) {
                // Don't show generic success — the confirmation UI will appear
                setCloudEmail('');
                setSyncPassword('');
            } else {
                setSuccessMsg(mode === 'create'
                    ? 'Cloud account created & hotel linked!'
                    : 'Connected to cloud! Syncing data...');
                setCloudEmail('');
                setSyncPassword('');
            }
        }

        setLoading(false);
    };

    // Pending email confirmation screen
    if (pendingConfirmation && cloudAccount) {
        return (
            <div className="max-w-lg">
                <div className="card p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center">
                            <MailCheck className="text-amber-400" size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Check Your Email</h3>
                            <p className="text-sm text-slate-400">Confirm your account to continue</p>
                        </div>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
                        <p className="text-amber-300 text-sm font-medium mb-1">Confirmation link has been sent</p>
                        <p className="text-slate-400 text-sm">
                            We sent a confirmation link to <span className="text-white font-medium">{cloudAccount.email}</span>.
                            Check your email and click the link before proceeding.
                        </p>
                    </div>

                    {cloudError && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm mb-4">
                            {cloudError}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={async () => {
                                setLoading(true);
                                const success = await loginCloud(cloudAccount.email, syncPassword || '');
                                if (success) {
                                    clearPendingConfirmation();
                                }
                                setLoading(false);
                            }}
                            disabled={loading}
                            className="btn btn-primary flex-1"
                        >
                            {loading ? (
                                <><Loader2 size={16} className="animate-spin" /> Checking...</>
                            ) : (
                                <><CheckCircle2 size={16} /> I've Confirmed My Email</>
                            )}
                        </button>
                        <button
                            onClick={async () => {
                                setLoading(true);
                                await registerCloud(cloudAccount.email, syncPassword || '');
                                setLoading(false);
                            }}
                            disabled={loading}
                            className="btn btn-secondary"
                        >
                            <RefreshCw size={16} />
                            Resend
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            clearPendingConfirmation();
                            logoutCloud();
                        }}
                        className="w-full mt-3 text-sm text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        Cancel and start over
                    </button>
                </div>
            </div>
        );
    }

    // Already connected to cloud
    if (cloudAccount) {
        return (
            <div className="space-y-4">
                {/* Cloud Account Status */}
                <div className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                                <Cloud className="text-emerald-400" size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">Cloud Connected</h3>
                                <p className="text-sm text-slate-400">Hotel-level sync active</p>
                            </div>
                        </div>
                        <button
                            onClick={logoutCloud}
                            className="btn btn-secondary text-sm"
                        >
                            <Unlink size={16} />
                            Disconnect
                        </button>
                    </div>

                    {/* Cloud Account display */}
                    <div className="bg-slate-700/50 rounded-lg p-3 mb-4">
                        <p className="text-xs text-slate-400 mb-1">Cloud Account</p>
                        <div className="flex items-center gap-2">
                            <code className="text-primary-400 font-mono text-sm flex-1">{cloudAccount.email}</code>
                            <button
                                onClick={() => handleCopyId(cloudAccount.email)}
                                className="btn btn-secondary text-xs px-2 py-1"
                            >
                                <Copy size={14} />
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Use this email + sync password on other devices to connect.
                        </p>
                    </div>

                    {/* Status grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <StatusCard
                            icon={<ShieldCheck size={18} />}
                            label="Cloud"
                            value="Connected"
                            color="emerald"
                        />
                        <StatusCard
                            icon={<Link2 size={18} />}
                            label="Hotel Linked"
                            value={isCloudLinked ? 'Yes' : 'Not Linked'}
                            color={isCloudLinked ? 'emerald' : 'amber'}
                        />
                        <StatusCard
                            icon={isOnline ? <Cloud size={18} /> : <CloudOff size={18} />}
                            label="Connection"
                            value={isOnline ? 'Online' : 'Offline'}
                            color={isOnline ? 'emerald' : 'slate'}
                        />
                        <StatusCard
                            icon={<Monitor size={18} />}
                            label="Devices"
                            value={deviceCount > 0 ? `${deviceCount} connected` : '—'}
                            color={deviceCount > 1 ? 'blue' : 'slate'}
                        />
                    </div>
                </div>

                {/* Link Hotel (if not linked) */}
                {!isCloudLinked && (
                    <div className="card p-6 border-amber-500/30">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="text-amber-400 mt-1 shrink-0" size={20} />
                            <div className="flex-1">
                                <h4 className="text-white font-medium mb-1">Hotel Not Linked</h4>
                                <p className="text-sm text-slate-400 mb-3">
                                    Link your hotel to enable data syncing across devices.
                                </p>
                                <button
                                    onClick={async () => {
                                        setLoading(true);
                                        await linkHotelToCloud();
                                        setLoading(false);
                                    }}
                                    disabled={loading}
                                    className="btn btn-primary"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Linking...
                                        </>
                                    ) : (
                                        <>
                                            <Link2 size={16} />
                                            Link Hotel & Sync
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Sync info — app is now fully online, no manual sync needed */}
                {isCloudLinked && (
                    <div className="card p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <CheckCircle2 size={18} className="text-emerald-400" />
                            <h4 className="text-white font-medium">All data syncs automatically</h4>
                        </div>
                        <p className="text-sm text-slate-400">
                            This app operates fully online. All changes are saved directly to the cloud — no manual sync needed.
                        </p>
                    </div>
                )}

                {/* Account Management */}
                {isCloudLinked && (
                    <div className="card p-6">
                        <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                            <KeyRound size={18} className="text-slate-400" />
                            Account Management
                        </h4>

                        {mgmtSuccess && (
                            <div className="p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-lg text-emerald-400 text-sm mb-4">
                                {mgmtSuccess}
                            </div>
                        )}

                        {cloudError && (
                            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm mb-4">
                                {cloudError}
                            </div>
                        )}

                        <div className="space-y-3">
                            {/* Change Email */}
                            {!showChangeEmail ? (
                                <button
                                    onClick={() => { setShowChangeEmail(true); setShowChangePassword(false); setMgmtSuccess(''); }}
                                    className="w-full flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors text-left"
                                >
                                    <Mail size={18} className="text-slate-400" />
                                    <div>
                                        <p className="text-white text-sm font-medium">Change Email</p>
                                        <p className="text-xs text-slate-500">Update cloud account email address</p>
                                    </div>
                                </button>
                            ) : (
                                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white text-sm font-medium">Change Email</p>
                                        <button onClick={() => setShowChangeEmail(false)} className="text-slate-400 hover:text-white text-xs">Cancel</button>
                                    </div>
                                    <input
                                        type="email"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                        className="input w-full"
                                        placeholder="New email address"
                                    />
                                    <p className="text-xs text-slate-500">A confirmation link will be sent to the new email.</p>
                                    <button
                                        onClick={async () => {
                                            if (!newEmail) return;
                                            setMgmtLoading(true);
                                            setMgmtSuccess('');
                                            const ok = await updateCloudEmail(newEmail);
                                            if (ok) {
                                                setMgmtSuccess('Confirmation sent to ' + newEmail + '. Check your inbox.');
                                                setNewEmail('');
                                                setShowChangeEmail(false);
                                            }
                                            setMgmtLoading(false);
                                        }}
                                        disabled={mgmtLoading || !newEmail}
                                        className="btn btn-primary text-sm w-full"
                                    >
                                        {mgmtLoading ? <Loader2 size={16} className="animate-spin" /> : 'Update Email'}
                                    </button>
                                </div>
                            )}

                            {/* Change Password */}
                            {!showChangePassword ? (
                                <button
                                    onClick={() => { setShowChangePassword(true); setShowChangeEmail(false); setMgmtSuccess(''); }}
                                    className="w-full flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors text-left"
                                >
                                    <Lock size={18} className="text-slate-400" />
                                    <div>
                                        <p className="text-white text-sm font-medium">Change Sync Password</p>
                                        <p className="text-xs text-slate-500">Update the password used for cloud sync</p>
                                    </div>
                                </button>
                            ) : (
                                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white text-sm font-medium">Change Sync Password</p>
                                        <button onClick={() => setShowChangePassword(false)} className="text-slate-400 hover:text-white text-xs">Cancel</button>
                                    </div>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="input w-full"
                                        placeholder="New password (min 8 characters)"
                                        minLength={8}
                                    />
                                    <input
                                        type="password"
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        className="input w-full"
                                        placeholder="Confirm new password"
                                    />
                                    {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
                                        <p className="text-xs text-red-400">Passwords do not match</p>
                                    )}
                                    <button
                                        onClick={async () => {
                                            if (!newPassword || newPassword !== confirmNewPassword) return;
                                            if (newPassword.length < 8) return;
                                            setMgmtLoading(true);
                                            setMgmtSuccess('');
                                            const ok = await updateCloudPassword(newPassword);
                                            if (ok) {
                                                setMgmtSuccess('Sync password updated successfully.');
                                                setNewPassword('');
                                                setConfirmNewPassword('');
                                                setShowChangePassword(false);
                                            }
                                            setMgmtLoading(false);
                                        }}
                                        disabled={mgmtLoading || !newPassword || newPassword !== confirmNewPassword || newPassword.length < 8}
                                        className="btn btn-primary text-sm w-full"
                                    >
                                        {mgmtLoading ? <Loader2 size={16} className="animate-spin" /> : 'Update Password'}
                                    </button>
                                </div>
                            )}

                            {/* Reset Password via Email */}
                            <button
                                onClick={async () => {
                                    if (!cloudAccount) return;
                                    setMgmtLoading(true);
                                    setMgmtSuccess('');
                                    const ok = await resetCloudPassword(cloudAccount.email);
                                    if (ok) {
                                        setMgmtSuccess('Password reset link sent to ' + cloudAccount.email);
                                    }
                                    setMgmtLoading(false);
                                }}
                                disabled={mgmtLoading}
                                className="w-full flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors text-left"
                            >
                                <RefreshCw size={18} className="text-slate-400" />
                                <div>
                                    <p className="text-white text-sm font-medium">Reset Password via Email</p>
                                    <p className="text-xs text-slate-500">Send a password reset link to your cloud email</p>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {cloudError && !isCloudLinked && (
                    <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                        {cloudError}
                    </div>
                )}
            </div>
        );
    }

    // Not connected — show create/connect form
    return (
        <div className="max-w-lg">
            <div className="card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-primary-500/20 rounded-full flex items-center justify-center">
                        <Cloud className="text-primary-400" size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Cloud Sync</h3>
                        <p className="text-sm text-slate-400">Sync data across devices</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 bg-slate-700/50 p-1 rounded-lg">
                    <button
                        onClick={() => setMode('create')}
                        className={`flex - 1 py - 2 text - sm font - medium rounded - md transition - colors ${mode === 'create' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                            } `}
                    >
                        New Account
                    </button>
                    <button
                        onClick={() => setMode('connect')}
                        className={`flex - 1 py - 2 text - sm font - medium rounded - md transition - colors flex items - center justify - center gap - 1.5 ${mode === 'connect' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                            } `}
                    >
                        <Monitor size={14} />
                        Connect Device
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {cloudError && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {cloudError}
                        </div>
                    )}

                    {successMsg && (
                        <div className="p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-lg text-emerald-400 text-sm">
                            {successMsg}
                        </div>
                    )}

                    {mode === 'create' ? (
                        <>
                            {/* Create new cloud account */}
                            <div>
                                <label className="label">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="email"
                                        value={cloudEmail}
                                        onChange={(e) => setCloudEmail(e.target.value)}
                                        className="input pl-10"
                                        placeholder="hotel@gmail.com"
                                        required
                                        autoComplete="email"
                                    />
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    Used for cloud sync only — not for staff login.
                                </p>
                            </div>
                            <div>
                                <label className="label">Sync Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="password"
                                        value={syncPassword}
                                        onChange={(e) => setSyncPassword(e.target.value)}
                                        className="input pl-10"
                                        placeholder="Minimum 8 characters"
                                        required
                                        minLength={8}
                                        autoComplete="new-password"
                                    />
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    Share this with devices that need to sync.
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Connect to existing hotel */}
                            <div>
                                <label className="label">Cloud Account Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="email"
                                        value={cloudEmail}
                                        onChange={(e) => setCloudEmail(e.target.value)}
                                        className="input pl-10"
                                        placeholder="hotel@gmail.com"
                                        required
                                        autoComplete="email"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="label">Sync Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="password"
                                        value={syncPassword}
                                        onChange={(e) => setSyncPassword(e.target.value)}
                                        className="input pl-10"
                                        placeholder="Enter sync password"
                                        required
                                        autoComplete="current-password"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !cloudEmail || !syncPassword}
                        className="btn btn-primary w-full mt-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                {mode === 'create' ? 'Creating Account...' : 'Connecting...'}
                            </>
                        ) : (
                            <>
                                <Cloud size={18} />
                                {mode === 'create' ? 'Create Cloud Account' : 'Connect to Hotel'}
                            </>
                        )}
                    </button>
                </form>

                <p className="text-xs text-slate-500 mt-4 text-center">
                    {mode === 'create'
                        ? 'Creates a cloud account for this hotel. Share the email + password with other devices.'
                        : 'Enter the email from the device that created the cloud account.'}
                </p>
            </div>
        </div>
    );
}

// =============================================================================
// Helper Components
// =============================================================================

function StatusCard({
    icon,
    label,
    value,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    color: string;
}) {
    const colorMap: Record<string, string> = {
        emerald: 'bg-emerald-500/10 text-emerald-400',
        amber: 'bg-amber-500/10 text-amber-400',
        red: 'bg-red-500/10 text-red-400',
        blue: 'bg-blue-500/10 text-blue-400',
        slate: 'bg-slate-700/50 text-slate-400',
    };

    return (
        <div className={`p - 3 rounded - lg ${colorMap[color] || colorMap.slate} `}>
            <div className="flex items-center gap-2 mb-1 opacity-70 text-xs">
                {icon}
                {label}
            </div>
            <p className="font-medium text-sm capitalize">{value}</p>
        </div>
    );
}

