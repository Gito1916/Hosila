import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useUsers } from '@/hooks/useSupabaseData';
import { createUser, updateUser, deleteUser, updateUserPassword } from '@/db/settings';
import { toast } from '@/lib/errorMessages';
import type { User, UserRole } from '@/types';
import {
    Plus,
    Edit2,
    Trash2,
    User as UserIcon,
    Shield,
    ShieldCheck,
    ShieldAlert,
    Loader2,
    X,
    KeyRound,
} from 'lucide-react';

const roleConfig: Record<UserRole, { label: string; color: string; icon: React.ReactNode }> = {
    admin: { label: 'Admin', color: 'bg-red-500/20 text-red-400', icon: <ShieldAlert size={14} /> },
    manager: { label: 'Manager', color: 'bg-purple-500/20 text-purple-400', icon: <ShieldCheck size={14} /> },
    reception: { label: 'Reception', color: 'bg-primary-500/20 text-primary-400', icon: <Shield size={14} /> },
    housekeeping: { label: 'Housekeeping', color: 'bg-cyan-500/20 text-cyan-400', icon: <Shield size={14} /> },
    accountant: { label: 'Accountant', color: 'bg-status-available/20 text-status-available', icon: <Shield size={14} /> },
    back_desk: { label: 'Back Desk', color: 'bg-amber-500/20 text-amber-400', icon: <Shield size={14} /> },
};

export function UserManagement() {
    const currentUser = useAuthStore((state) => state.user);
    const [showForm, setShowForm] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);

    const { data: users } = useUsers();

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setShowForm(true);
    };

    const handleDelete = async (user: User) => {
        if (user.id === currentUser?.id) {
            toast.warn('Cannot delete account', 'You cannot delete your own account.');
            return;
        }
        if (confirm(`Delete user "${user.name}"?`)) {
            await deleteUser(user.id);
        }
    };

    return (
        <div className="space-y-6">
            {/* Role Permissions Info */}
            <div className="card p-4">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Shield size={18} />
                    Role Permissions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="bg-slate-700/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <ShieldAlert size={16} className="text-red-400" />
                            <span className="text-white font-medium">Admin</span>
                        </div>
                        <p className="text-xs text-slate-400">Full access: All settings, user management, reports, data backup</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <ShieldCheck size={16} className="text-purple-400" />
                            <span className="text-white font-medium">Manager</span>
                        </div>
                        <p className="text-xs text-slate-400">Settings access, reports, staff management (no data backup)</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield size={16} className="text-primary-400" />
                            <span className="text-white font-medium">Reception</span>
                        </div>
                        <p className="text-xs text-slate-400">Check-in/out, reservations, guest management, payments</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield size={16} className="text-cyan-400" />
                            <span className="text-white font-medium">Housekeeping</span>
                        </div>
                        <p className="text-xs text-slate-400">Room status updates, cleaning schedules</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield size={16} className="text-status-available" />
                            <span className="text-white font-medium">Accountant</span>
                        </div>
                        <p className="text-xs text-slate-400">Finance reports, expenses, income tracking (read-only operations)</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield size={16} className="text-amber-400" />
                            <span className="text-white font-medium">Back Desk</span>
                        </div>
                        <p className="text-xs text-slate-400">Restaurant/Kitchen only - order status, menu availability</p>
                    </div>
                </div>
            </div>

            {/* User List */}
            <div className="card">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                        <UserIcon size={18} />
                        User Management
                    </h3>
                    <button
                        onClick={() => { setEditingUser(null); setShowForm(true); }}
                        className="btn btn-primary text-sm"
                    >
                        <Plus size={16} className="mr-1" />
                        Add User
                    </button>
                </div>

                <div className="divide-y divide-slate-700/50">
                    {users?.map((user) => {
                        const config = roleConfig[user.role];
                        const isCurrentUser = user.id === currentUser?.id;

                        return (
                            <div key={user.id} className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-semibold">
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-white font-medium">{user.name}</p>
                                            {isCurrentUser && (
                                                <span className="text-xs bg-primary-500/30 text-primary-300 px-2 py-0.5 rounded-full">You</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-400">@{user.username}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                                        {config.icon}
                                        {config.label}
                                    </span>

                                    <span className={`text-sm ${user.is_active ? 'text-status-available' : 'text-slate-500'}`}>
                                        {user.is_active ? 'Active' : 'Inactive'}
                                    </span>

                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => handleEdit(user)}
                                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                                            title="Edit user"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => setResetPasswordUser(user)}
                                            className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-700 rounded-lg"
                                            title="Reset password"
                                        >
                                            <KeyRound size={16} />
                                        </button>
                                        {!isCurrentUser && (
                                            <button
                                                onClick={() => handleDelete(user)}
                                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg"
                                                title="Delete user"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {showForm && (
                <UserForm
                    user={editingUser}
                    onClose={() => { setShowForm(false); setEditingUser(null); }}
                    onSuccess={() => { setShowForm(false); setEditingUser(null); }}
                />
            )}

            {resetPasswordUser && (
                <PasswordResetModal
                    user={resetPasswordUser}
                    onClose={() => setResetPasswordUser(null)}
                />
            )}
        </div>
    );
}

// User Form Modal
function UserForm({
    user,
    onClose,
    onSuccess,
}: {
    user: User | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        username: user?.username ?? '',
        name: user?.name ?? '',
        role: user?.role ?? 'reception' as UserRole,
        password: '',
        is_active: user?.is_active ?? true,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            if (user) {
                // Update existing user
                await updateUser(user.id, {
                    name: formData.name,
                    role: formData.role,
                    is_active: formData.is_active,
                });
            } else {
                // Create new user
                if (!formData.password) throw new Error('Password is required');
                await createUser({
                    username: formData.username,
                    password: formData.password,
                    name: formData.name,
                    role: formData.role,
                });
            }
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save user');
            toast.error('Failed to save user', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md">
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-white">
                        {user ? 'Edit User' : 'Add New User'}
                    </h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="label">Username</label>
                        <input
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            className="input"
                            disabled={!!user}
                            required
                            autoComplete="username"
                        />
                    </div>

                    <div>
                        <label className="label">Full Name</label>
                        <input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="input"
                            required
                            autoComplete="name"
                        />
                    </div>

                    <div>
                        <label className="label">Role</label>
                        <select
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                            className="input"
                        >
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="reception">Reception</option>
                            <option value="housekeeping">Housekeeping</option>
                            <option value="accountant">Accountant</option>
                            <option value="back_desk">Back Desk (Kitchen)</option>
                        </select>
                    </div>

                    {!user && (
                        <div>
                            <label className="label">Password</label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="input"
                                required
                                autoComplete="new-password"
                            />
                        </div>
                    )}

                    {user && (
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_active"
                                checked={formData.is_active}
                                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                className="w-4 h-4"
                            />
                            <label htmlFor="is_active" className="text-slate-400">Active</label>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
                            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : (user ? 'Save' : 'Create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// Password Reset Modal
function PasswordResetModal({
    user,
    onClose,
}: {
    user: User;
    onClose: () => void;
}) {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (newPassword.length < 4) {
            setError('Password must be at least 4 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsSubmitting(true);
        try {
            await updateUserPassword(user.id, newPassword);
            toast.success('Password reset', `Password for ${user.name} has been updated.`);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reset password');
            toast.error('Failed to reset password', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-sm">
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <KeyRound size={20} className="text-amber-400" />
                        <h2 className="text-lg font-bold text-white">Reset Password</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-sm text-slate-400">Resetting password for:</p>
                        <p className="text-white font-medium">{user.name} <span className="text-slate-400">(@{user.username})</span></p>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="label">New Password</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="input"
                            required
                            autoComplete="new-password"
                            placeholder="Enter new password"
                        />
                    </div>

                    <div>
                        <label className="label">Confirm Password</label>
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
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
                            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Reset Password'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
