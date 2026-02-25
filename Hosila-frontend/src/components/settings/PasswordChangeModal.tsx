import { useState } from 'react';
import { X, Loader2, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { changePassword } from '@/db/settings';
import { useAuthStore } from '@/stores/authStore';

interface PasswordChangeModalProps {
    onClose: () => void;
}

export function PasswordChangeModal({ onClose }: PasswordChangeModalProps) {
    const user = useAuthStore((state) => state.user);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setError(null);

        // Validate passwords match
        if (formData.newPassword !== formData.confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        // Validate password length
        if (formData.newPassword.length < 6) {
            setError('New password must be at least 6 characters');
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await changePassword(
                user.id,
                formData.currentPassword,
                formData.newPassword
            );

            if (result.success) {
                setSuccess(true);
                setTimeout(() => onClose(), 2000);
            } else {
                setError(result.error || 'Failed to change password');
            }
        } catch (err) {
            console.error('Error changing password:', err);
            setError('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-surface-card rounded-xl border border-border w-full max-w-md p-6 text-center">
                    <div className="w-16 h-16 bg-status-available/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} className="text-status-available" />
                    </div>
                    <h2 className="text-xl font-bold text-heading mb-2">Password Changed</h2>
                    <p className="text-muted">Your password has been updated successfully.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-md">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold text-heading flex items-center gap-2">
                        <Lock size={20} />
                        Change Password
                    </h2>
                    <button onClick={onClose} className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Current Password */}
                    <div>
                        <label className="label">Current Password</label>
                        <div className="relative">
                            <input
                                type={showCurrentPassword ? 'text' : 'password'}
                                value={formData.currentPassword}
                                onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                                className="input pr-10"
                                required
                                autoComplete="current-password"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-heading"
                            >
                                {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* New Password */}
                    <div>
                        <label className="label">New Password</label>
                        <div className="relative">
                            <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={formData.newPassword}
                                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                                className="input pr-10"
                                placeholder="Min 6 characters"
                                required
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-heading"
                            >
                                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Confirm New Password */}
                    <div>
                        <label className="label">Confirm New Password</label>
                        <input
                            type="password"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            className="input"
                            required
                            autoComplete="new-password"
                        />
                        {formData.confirmPassword && formData.newPassword !== formData.confirmPassword && (
                            <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                        )}
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || formData.newPassword !== formData.confirmPassword}
                            className="btn btn-primary flex-1"
                        >
                            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Change Password'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
