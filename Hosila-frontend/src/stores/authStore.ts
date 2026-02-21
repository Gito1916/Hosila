import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import bcrypt from 'bcryptjs';
import { supabase, isCloudAvailable } from '@/lib/supabase';
import { getHotelId } from '@/lib/api';
import type { User, UserRole } from '@/types';

// ============================================================================
// Types
// ============================================================================

interface CloudAccount {
    id: string;
    email: string;
    isLinked: boolean; // Whether hotel tenant_id is set
}

interface AuthState {
    // Auth state
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    // Cloud auth (Supabase)
    cloudAccount: CloudAccount | null;
    isCloudLinked: boolean;
    cloudError: string | null;
    pendingConfirmation: boolean;

    // Actions
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    checkSession: () => Promise<void>;

    // Cloud actions
    autoLoginAsAdmin: () => Promise<boolean>;
    registerCloud: (email: string, password: string) => Promise<boolean>;
    loginCloud: (email: string, password: string) => Promise<boolean>;
    logoutCloud: () => Promise<void>;
    linkHotelToCloud: () => Promise<boolean>;
    checkCloudSession: () => Promise<void>;
    updateCloudEmail: (newEmail: string) => Promise<boolean>;
    updateCloudPassword: (newPassword: string) => Promise<boolean>;
    resetCloudPassword: (email: string) => Promise<boolean>;
    clearPendingConfirmation: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            // State
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,

            // Cloud state
            cloudAccount: null,
            isCloudLinked: false,
            cloudError: null,
            pendingConfirmation: false,

            // =================================================================
            // Login — authenticates against Supabase `users` table
            // =================================================================
            login: async (username: string, password: string) => {
                set({ isLoading: true, error: null });

                try {
                    if (!supabase) {
                        set({ error: 'Cloud not configured', isLoading: false });
                        return false;
                    }

                    // Fetch user from Supabase
                    const { data: user, error } = await supabase
                        .from('users')
                        .select('*')
                        .eq('username', username)
                        .single();

                    if (error || !user) {
                        set({ error: 'Invalid username or password', isLoading: false });
                        return false;
                    }

                    if (!user.is_active) {
                        set({ error: 'Account is deactivated', isLoading: false });
                        return false;
                    }

                    const isValid = await bcrypt.compare(password, user.password_hash);

                    if (!isValid) {
                        set({ error: 'Invalid username or password', isLoading: false });
                        return false;
                    }

                    // Update last login
                    await supabase
                        .from('users')
                        .update({ last_login: new Date().toISOString() })
                        .eq('id', user.id);

                    set({ user: user as User, isAuthenticated: true, isLoading: false });

                    // Check cloud session
                    if (isCloudAvailable() && navigator.onLine) {
                        get().checkCloudSession().catch(console.error);
                    }

                    return true;
                } catch (err) {
                    console.error('Login error:', err);
                    set({ error: 'An error occurred during login', isLoading: false });
                    return false;
                }
            },

            // =================================================================
            // Auto-login as admin (used during new hotel onboarding only)
            // =================================================================
            autoLoginAsAdmin: async () => {
                try {
                    if (!supabase) return false;

                    const hotelId = await getHotelId();
                    if (!hotelId) return false;

                    const { data: admin } = await supabase
                        .from('users')
                        .select('*')
                        .eq('hotel_id', hotelId)
                        .eq('role', 'admin')
                        .eq('is_active', true)
                        .limit(1)
                        .single();

                    if (!admin) return false;

                    await supabase
                        .from('users')
                        .update({ last_login: new Date().toISOString() })
                        .eq('id', admin.id);

                    set({ user: admin as User, isAuthenticated: true, isLoading: false, error: null });
                    return true;
                } catch (err) {
                    console.error('Auto-login error:', err);
                    return false;
                }
            },

            // =================================================================
            // Logout
            // =================================================================
            logout: () => {
                if (supabase) {
                    supabase.auth.signOut().catch(console.error);
                }
                set({
                    user: null,
                    isAuthenticated: false,
                    error: null,
                    cloudAccount: null,
                    isCloudLinked: false,
                    cloudError: null,
                });
            },

            // =================================================================
            // Session Check (on app load)
            // =================================================================
            checkSession: async () => {
                const { user } = get();

                if (user && supabase) {
                    // Verify user still exists and is active in Supabase
                    const { data: dbUser } = await supabase
                        .from('users')
                        .select('*')
                        .eq('id', user.id)
                        .single();

                    if (!dbUser || !dbUser.is_active) {
                        set({ user: null, isAuthenticated: false, isLoading: false });
                    } else {
                        // Update stored user with latest data
                        set({ user: dbUser as User, isLoading: false });
                    }
                } else {
                    set({ isLoading: false });
                }

                // Also check cloud session
                if (isCloudAvailable()) {
                    get().checkCloudSession().catch(console.error);
                }
            },

            // =================================================================
            // Cloud: Register a new Supabase account for this hotel
            // =================================================================
            registerCloud: async (email: string, password: string) => {
                if (!supabase) {
                    set({ cloudError: 'Cloud is not configured' });
                    return false;
                }

                set({ cloudError: null, pendingConfirmation: false });

                try {
                    const { data, error } = await supabase.auth.signUp({
                        email,
                        password,
                    });

                    if (error) {
                        set({ cloudError: error.message });
                        return false;
                    }

                    if (data.user) {
                        // Supabase returns empty identities when email confirmation is required
                        const needsConfirmation = !data.user.identities || data.user.identities.length === 0
                            || !data.user.email_confirmed_at;

                        if (needsConfirmation) {
                            set({
                                pendingConfirmation: true,
                                cloudAccount: {
                                    id: data.user.id,
                                    email: data.user.email || email,
                                    isLinked: false,
                                },
                            });
                            return true; // Signup succeeded, awaiting confirmation
                        }

                        // Email confirmation not required — proceed immediately
                        set({
                            cloudAccount: {
                                id: data.user.id,
                                email: data.user.email || email,
                                isLinked: false,
                            },
                        });

                        const linked = await get().linkHotelToCloud();
                        return linked;
                    }

                    return false;
                } catch (err) {
                    set({ cloudError: 'Failed to register cloud account' });
                    return false;
                }
            },

            // =================================================================
            // Cloud: Login to existing Supabase account
            // =================================================================
            loginCloud: async (email: string, password: string) => {
                if (!supabase) {
                    set({ cloudError: 'Cloud is not configured' });
                    return false;
                }

                set({ cloudError: null });

                try {
                    const { data, error } = await supabase.auth.signInWithPassword({
                        email,
                        password,
                    });

                    if (error) {
                        set({ cloudError: error.message });
                        return false;
                    }

                    if (data.user) {
                        set({
                            cloudAccount: {
                                id: data.user.id,
                                email: data.user.email || email,
                                isLinked: false,
                            },
                        });

                        // Check if hotel is already linked
                        const { data: hotel } = await supabase
                            .from('hotels')
                            .select('tenant_id')
                            .limit(1)
                            .single();

                        if (hotel) {
                            const isLinked = hotel.tenant_id === data.user.id;
                            set({ isCloudLinked: isLinked });

                            if (!isLinked) {
                                await get().linkHotelToCloud();
                            }
                        }

                        return true;
                    }

                    return false;
                } catch (err) {
                    set({ cloudError: 'Failed to login to cloud' });
                    return false;
                }
            },

            // =================================================================
            // Cloud: Sign out from Supabase (keep local auth)
            // =================================================================
            logoutCloud: async () => {
                if (supabase) {
                    await supabase.auth.signOut();
                }
                set({
                    cloudAccount: null,
                    isCloudLinked: false,
                    cloudError: null,
                    pendingConfirmation: false,
                });
            },

            // =================================================================
            // Link hotel's tenant_id to the Supabase user
            // =================================================================
            linkHotelToCloud: async () => {
                if (!supabase) return false;

                const { cloudAccount } = get();
                if (!cloudAccount) return false;

                try {
                    // Get hotel from Supabase
                    const { data: hotel } = await supabase
                        .from('hotels')
                        .select('*')
                        .limit(1)
                        .single();

                    if (!hotel) {
                        set({ cloudError: 'No hotel configured' });
                        return false;
                    }

                    // Update hotel's tenant_id in Supabase
                    const { error } = await supabase
                        .from('hotels')
                        .update({
                            tenant_id: cloudAccount.id,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', hotel.id);

                    if (error) {
                        set({ cloudError: `Failed to link hotel: ${error.message}` });
                        return false;
                    }

                    set({
                        isCloudLinked: true,
                        cloudAccount: { ...cloudAccount, isLinked: true },
                    });

                    return true;
                } catch (err) {
                    set({ cloudError: 'Failed to link hotel to cloud' });
                    return false;
                }
            },

            // =================================================================
            // Check Supabase session on app load
            // =================================================================
            checkCloudSession: async () => {
                if (!supabase) return;

                try {
                    const { data: { session } } = await supabase.auth.getSession();

                    if (session?.user) {
                        const { data: hotel } = await supabase
                            .from('hotels')
                            .select('tenant_id')
                            .limit(1)
                            .single();

                        set({
                            cloudAccount: {
                                id: session.user.id,
                                email: session.user.email || '',
                                isLinked: hotel?.tenant_id === session.user.id,
                            },
                            isCloudLinked: hotel?.tenant_id === session.user.id,
                        });
                    } else {
                        set({
                            cloudAccount: null,
                            isCloudLinked: false,
                        });
                    }
                } catch (err) {
                    // Silently fail — session check is best-effort
                }
            },

            // =================================================================
            // Cloud: Update email address
            // =================================================================
            updateCloudEmail: async (newEmail: string) => {
                if (!supabase) {
                    set({ cloudError: 'Cloud is not configured' });
                    return false;
                }

                set({ cloudError: null });

                try {
                    const { error } = await supabase.auth.updateUser({
                        email: newEmail,
                    });

                    if (error) {
                        set({ cloudError: error.message });
                        return false;
                    }

                    return true;
                } catch (err) {
                    set({ cloudError: 'Failed to update email' });
                    return false;
                }
            },

            // =================================================================
            // Cloud: Update password (already logged in)
            // =================================================================
            updateCloudPassword: async (newPassword: string) => {
                if (!supabase) {
                    set({ cloudError: 'Cloud is not configured' });
                    return false;
                }

                set({ cloudError: null });

                try {
                    const { error } = await supabase.auth.updateUser({
                        password: newPassword,
                    });

                    if (error) {
                        set({ cloudError: error.message });
                        return false;
                    }

                    return true;
                } catch (err) {
                    set({ cloudError: 'Failed to update password' });
                    return false;
                }
            },

            // =================================================================
            // Cloud: Send password reset email (when locked out)
            // =================================================================
            resetCloudPassword: async (email: string) => {
                if (!supabase) {
                    set({ cloudError: 'Cloud is not configured' });
                    return false;
                }

                set({ cloudError: null });

                try {
                    const { error } = await supabase.auth.resetPasswordForEmail(email);

                    if (error) {
                        set({ cloudError: error.message });
                        return false;
                    }

                    return true;
                } catch (err) {
                    set({ cloudError: 'Failed to send reset email' });
                    return false;
                }
            },

            // =================================================================
            // Clear pending confirmation state
            // =================================================================
            clearPendingConfirmation: () => {
                set({ pendingConfirmation: false, cloudError: null });
            },
        }),
        {
            name: 'hotelflow-auth',
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
                cloudAccount: state.cloudAccount,
                isCloudLinked: state.isCloudLinked,
                pendingConfirmation: state.pendingConfirmation,
            }),
        }
    )
);

// ============================================================================
// Permission helpers (unchanged)
// ============================================================================

const roleHierarchy: Record<UserRole, number> = {
    admin: 100,
    manager: 80,
    accountant: 60,
    reception: 40,
    housekeeping: 20,
    back_desk: 10,
};

export function hasPermission(user: User | null, allowedRoles: UserRole[]): boolean {
    if (!user) return false;
    return allowedRoles.includes(user.role);
}

export function hasMinimumRole(user: User | null, minimumRole: UserRole): boolean {
    if (!user) return false;
    return roleHierarchy[user.role] >= roleHierarchy[minimumRole];
}
