import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { changePassword } from '@/db/settings';
import { toast } from '@/lib/errorMessages';
import { ShieldAlert, Loader2, X, Eye, EyeOff } from 'lucide-react';

interface ChangePasswordModalProps {
    onClose: () => void;
    /** When true, user cannot dismiss — must change password before proceeding */
    forced?: boolean;
}

export function ChangePasswordModal({ onClose, forced = false }: ChangePasswordModalProps) {
    const user = useAuthStore((state) => state.user);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!user) return;

        // Validate new password policy
        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (!/[0-9]/.test(newPassword)) {
            setError('Password must contain at least one number.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (currentPassword === newPassword) {
            setError('New password must be different from current password.');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await changePassword(user.id, currentPassword, newPassword);

            if (!result.success) {
                setError(result.error || 'Failed to change password.');
                return;
            }

            // Update local state to clear must_change_password
            useAuthStore.setState((state) => ({
                user: state.user ? { ...state.user, must_change_password: false } : null,
            }));

            toast.success('Password changed', 'Your password has been updated successfully.');
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to change password');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-sm">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <ShieldAlert size={20} className="text-amber-400" />
                        <h2 className="text-lg font-bold text-heading">
                            {forced ? 'Change Your Password' : 'Change Password'}
                        </h2>
                    </div>
                    {!forced && (
                        <button onClick={onClose} className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg">
                            <X size={20} />
                        </button>
                    )}
                </div>

                {forced && (
                    <div className="mx-4 mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <p className="text-amber-400 text-sm font-medium">Security Requirement</p>
                        <p className="text-muted text-xs mt-1">
                            You must change your default password before continuing.
                        </p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="label">Current Password</label>
                        <div className="relative">
                            <input
                                type={showCurrent ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="input pr-10"
                                required
                                autoComplete="current-password"
                                placeholder="Enter current password"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrent(!showCurrent)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-heading"
                            >
                                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="label">New Password</label>
                        <div className="relative">
                            <input
                                type={showNew ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="input pr-10"
                                required
                                autoComplete="new-password"
                                placeholder="Min 8 characters, at least 1 number"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNew(!showNew)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-heading"
                            >
                                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="label">Confirm New Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="input"
                            required
                            autoComplete="new-password"
                            placeholder="Re-enter new password"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        {!forced && (
                            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                                Cancel
                            </button>
                        )}
                        <button type="submit" disabled={isSubmitting} className={`btn btn-primary ${forced ? 'w-full' : 'flex-1'}`}>
                            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Change Password'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
