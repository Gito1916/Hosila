import { useState, useEffect, useRef } from 'react';
import { getHotel, updateHotel } from '@/db/settings';
import { uploadHotelLogo, deleteHotelLogo, isCloudLinked } from '@/lib/supabase';
import { isCloudAvailable } from '@/lib/supabase';
import { getHotelId } from '@/lib/api';
import { toast } from '@/lib/errorMessages';
import { useAuthStore } from '@/stores/authStore';
import type { Hotel } from '@/types';
import {
    Building,
    Loader2,
    Upload,
    Image,
    X,
    Pencil,
    Check,
    XCircle,
    Cloud,
    ShieldCheck,
    Link2,
    CloudOff,
    KeyRound,
    Mail,
    Lock,
    RefreshCw,
    Copy,
} from 'lucide-react';

export function AccountPanel() {
    const [isLoading, setIsLoading] = useState(true);
    const [hotel, setHotel] = useState<Hotel | null>(null);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Inline edit state
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [isSavingField, setIsSavingField] = useState(false);

    // Cloud account state
    const {
        cloudAccount,
        isCloudLinked: cloudLinked,
        cloudError,
        updateCloudEmail,
        updateCloudPassword,
        resetCloudPassword,
    } = useAuthStore();

    const [showChangeEmail, setShowChangeEmail] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [mgmtLoading, setMgmtLoading] = useState(false);
    const [mgmtSuccess, setMgmtSuccess] = useState('');
    const [copied, setCopied] = useState(false);
    const isOnline = navigator.onLine;

    useEffect(() => {
        async function load() {
            const hotelData = await getHotel();
            setHotel(hotelData ?? null);
            setIsLoading(false);
        }
        load();
    }, []);

    // Start editing a field
    const startEdit = (field: string, currentValue: string) => {
        setEditingField(field);
        setEditValue(currentValue);
    };

    // Cancel editing
    const cancelEdit = () => {
        setEditingField(null);
        setEditValue('');
    };

    // Confirm and save a single field
    const confirmEdit = async (field: string) => {
        if (!hotel) return;
        setIsSavingField(true);
        try {
            const update: Partial<Hotel> = { [field]: editValue };
            await updateHotel(update);
            setHotel(h => h ? { ...h, [field]: editValue } : null);
            toast.success(`${field.charAt(0).toUpperCase() + field.slice(1)} updated`);
            setEditingField(null);
            setEditValue('');
        } catch (err) {
            toast.error(`Failed to update ${field}`, err);
        } finally {
            setIsSavingField(false);
        }
    };

    // Logo handlers
    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.warn('Invalid file', 'Please select an image file.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.warn('File too large', 'Image must be less than 2 MB.');
            return;
        }
        setLogoFile(file);
        const reader = new FileReader();
        reader.onload = () => setLogoPreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handleSaveLogo = async () => {
        if (!hotel || !logoFile) return;
        setIsSavingField(true);
        try {
            let logoUrl = hotel.logo_url;
            const linked = await isCloudLinked();
            if (linked) {
                const hotelId = await getHotelId();
                const publicUrl = await uploadHotelLogo(hotelId, logoFile);
                if (publicUrl) {
                    logoUrl = publicUrl;
                } else {
                    toast.warn('Logo upload failed', 'Logo saved locally only.');
                }
            }
            if (!logoUrl || logoUrl === hotel.logo_url) {
                logoUrl = logoPreview || hotel.logo_url;
            }
            await updateHotel({ logo_url: logoUrl });
            setHotel(h => h ? { ...h, logo_url: logoUrl } : null);
            setLogoFile(null);
            setLogoPreview(null);
            toast.success('Logo updated');
        } catch (err) {
            toast.error('Failed to update logo', err);
        } finally {
            setIsSavingField(false);
        }
    };

    const handleRemoveLogo = async () => {
        const linked = await isCloudLinked();
        if (linked) {
            const hotelId = await getHotelId();
            await deleteHotelLogo(hotelId);
        }
        await updateHotel({ logo_url: undefined });
        setHotel(h => h ? { ...h, logo_url: undefined } : null);
        setLogoFile(null);
        setLogoPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        toast.success('Logo removed');
    };

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

    if (isLoading) {
        return (
            <div className="card p-8 text-center">
                <Loader2 className="animate-spin mx-auto text-primary-400" size={32} />
            </div>
        );
    }

    // Editable display field component
    const EditableField = ({ field, label, value, multiline }: { field: string; label: string; value: string; multiline?: boolean }) => {
        const isEditing = editingField === field;

        return (
            <div className="flex items-start gap-2 group">
                <div className="flex-1">
                    <p className="text-xs text-muted mb-0.5">{label}</p>
                    {isEditing ? (
                        <div className="flex items-center gap-2">
                            {multiline ? (
                                <textarea
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="input text-sm flex-1"
                                    rows={2}
                                    autoFocus
                                />
                            ) : (
                                <input
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="input text-sm flex-1"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') confirmEdit(field);
                                        if (e.key === 'Escape') cancelEdit();
                                    }}
                                />
                            )}
                            <button
                                onClick={() => confirmEdit(field)}
                                disabled={isSavingField}
                                className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
                                title="Save"
                            >
                                {isSavingField ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            </button>
                            <button
                                onClick={cancelEdit}
                                className="p-1.5 bg-surface-raised text-muted rounded-lg hover:bg-surface-card transition-colors"
                                title="Cancel"
                            >
                                <XCircle size={14} />
                            </button>
                        </div>
                    ) : (
                        <p className="text-heading text-sm">{value || <span className="text-muted italic">Not set</span>}</p>
                    )}
                </div>
                {!isEditing && (
                    <button
                        onClick={() => startEdit(field, value || '')}
                        className="p-1.5 text-muted hover:text-primary-400 hover:bg-surface-raised rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title={`Edit ${label.toLowerCase()}`}
                    >
                        <Pencil size={13} />
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Hotel Information */}
            <div className="card p-4">
                <h3 className="font-semibold text-heading mb-4 flex items-center gap-2">
                    <Building size={18} />
                    Hotel Information
                </h3>

                <div className="space-y-4">
                    {/* Logo */}
                    <div>
                        <p className="text-xs text-muted mb-1 flex items-center gap-1">
                            <Image size={12} />
                            Hotel Logo
                        </p>
                        <div className="flex items-start gap-4">
                            {(logoPreview || hotel?.logo_url) ? (
                                <div className="relative">
                                    <img
                                        src={logoPreview || hotel?.logo_url}
                                        alt="Hotel Logo"
                                        className="w-20 h-20 object-contain bg-surface-raised rounded-lg border border-border-strong"
                                    />
                                    <button
                                        onClick={handleRemoveLogo}
                                        className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-heading hover:bg-red-600"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-20 h-20 flex flex-col items-center justify-center bg-surface-raised/50 rounded-lg border border-dashed border-border-subtle0 cursor-pointer hover:border-primary-400 transition-colors"
                                >
                                    <Upload size={18} className="text-muted" />
                                    <span className="text-xs text-muted mt-1">Upload</span>
                                </div>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                className="hidden"
                            />
                            {logoFile && (
                                <button onClick={handleSaveLogo} disabled={isSavingField} className="btn btn-primary text-sm">
                                    {isSavingField ? <Loader2 size={14} className="animate-spin mr-1" /> : <Check size={14} className="mr-1" />}
                                    Save Logo
                                </button>
                            )}
                            <div className="text-xs text-muted">
                                <p>Square image (e.g., 200×200px)</p>
                                <p>Max size: 2 MB</p>
                            </div>
                        </div>
                    </div>

                    {/* Editable Fields */}
                    <div className="space-y-3">
                        <EditableField field="name" label="Hotel Name" value={hotel?.name ?? ''} />
                        <EditableField field="address" label="Address" value={hotel?.address ?? ''} multiline />
                        <EditableField field="phone" label="Phone" value={hotel?.phone ?? ''} />
                        <EditableField field="email" label="Email" value={hotel?.email ?? ''} />
                    </div>
                </div>
            </div>

            {/* Cloud Account */}
            {isCloudAvailable() && cloudAccount && (
                <div className="card p-4">
                    <h3 className="font-semibold text-heading mb-4 flex items-center gap-2">
                        <Cloud size={18} />
                        Cloud Account
                    </h3>

                    {/* Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
                            <div className="flex items-center gap-2 mb-1 opacity-70 text-xs">
                                <ShieldCheck size={14} />
                                Cloud
                            </div>
                            <p className="font-medium text-sm">Connected</p>
                        </div>
                        <div className={`p-3 rounded-lg ${cloudLinked ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                            <div className="flex items-center gap-2 mb-1 opacity-70 text-xs">
                                <Link2 size={14} />
                                Hotel Linked
                            </div>
                            <p className="font-medium text-sm">{cloudLinked ? 'Yes' : 'Not Linked'}</p>
                        </div>
                        <div className={`p-3 rounded-lg ${isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-surface-raised/50 text-muted'}`}>
                            <div className="flex items-center gap-2 mb-1 opacity-70 text-xs">
                                {isOnline ? <Cloud size={14} /> : <CloudOff size={14} />}
                                Connection
                            </div>
                            <p className="font-medium text-sm">{isOnline ? 'Online' : 'Offline'}</p>
                        </div>
                    </div>

                    {/* Cloud email */}
                    <div className="bg-surface-raised/50 rounded-lg p-3 mb-4">
                        <p className="text-xs text-muted mb-1">Cloud Account Email</p>
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
                    </div>
                </div>
            )}

            {/* Account Management */}
            {isCloudAvailable() && cloudAccount && cloudLinked && (
                <div className="card p-4">
                    <h3 className="font-semibold text-heading mb-4 flex items-center gap-2">
                        <KeyRound size={18} />
                        Account Management
                    </h3>

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
                                className="w-full flex items-center gap-3 p-3 bg-surface-raised/50 rounded-lg hover:bg-surface-raised transition-colors text-left"
                            >
                                <Mail size={18} className="text-muted" />
                                <div>
                                    <p className="text-heading text-sm font-medium">Change Email</p>
                                    <p className="text-xs text-muted">Update cloud account email address</p>
                                </div>
                            </button>
                        ) : (
                            <div className="bg-surface-raised/50 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-heading text-sm font-medium">Change Email</p>
                                    <button onClick={() => setShowChangeEmail(false)} className="text-muted hover:text-heading text-xs">Cancel</button>
                                </div>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="input w-full"
                                    placeholder="New email address"
                                />
                                <p className="text-xs text-muted">A confirmation link will be sent to the new email.</p>
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
                                className="w-full flex items-center gap-3 p-3 bg-surface-raised/50 rounded-lg hover:bg-surface-raised transition-colors text-left"
                            >
                                <Lock size={18} className="text-muted" />
                                <div>
                                    <p className="text-heading text-sm font-medium">Change Sync Password</p>
                                    <p className="text-xs text-muted">Update the password used for cloud sync</p>
                                </div>
                            </button>
                        ) : (
                            <div className="bg-surface-raised/50 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-heading text-sm font-medium">Change Sync Password</p>
                                    <button onClick={() => setShowChangePassword(false)} className="text-muted hover:text-heading text-xs">Cancel</button>
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
                            className="w-full flex items-center gap-3 p-3 bg-surface-raised/50 rounded-lg hover:bg-surface-raised transition-colors text-left"
                        >
                            <RefreshCw size={18} className="text-muted" />
                            <div>
                                <p className="text-heading text-sm font-medium">Reset Password via Email</p>
                                <p className="text-xs text-muted">Send a password reset link to your cloud email</p>
                            </div>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
