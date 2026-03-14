import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { hashSync, compareSync } from 'bcryptjs';
import { supabase, isCloudAvailable } from '@/lib/supabase';
import { getHotelId } from '@/lib/api';
import type { User, UserRole } from '@/types';

/** Max age for offline cached login (7 days) */
const OFFLINE_SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

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

    // Hotel context (single hotel)
    activeHotelName: string | null;

    // Offline auth
    lastLoginTime: string | null;
    offlinePasswordHash: string | null;  // bcrypt hash for offline login verification
    isOfflineSession: boolean;

    // Actions
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
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
            activeHotelName: null,

            // Offline auth
            lastLoginTime: null,
            offlinePasswordHash: null,
            isOfflineSession: false,

            // Cloud state
            cloudAccount: null,
            isCloudLinked: false,
            cloudError: null,
            pendingConfirmation: false,

            // =================================================================
            // Login — authenticates against Supabase `users` table
            // =================================================================
            login: async (username: string, password: string) => {
                set({ isLoading: true, error: null, isOfflineSession: false });

                // ─── OFFLINE LOGIN PATH ───────────────────────────
                if (!navigator.onLine) {
                    const { user: cachedUser, lastLoginTime, offlinePasswordHash } = get();

                    // Must have a previous successful login cached
                    if (!cachedUser || !offlinePasswordHash || !lastLoginTime) {
                        set({
                            error: 'You need an internet connection to sign in for the first time on this device',
                            isLoading: false,
                        });
                        return false;
                    }

                    // Check session age (7 days max)
                    const age = Date.now() - new Date(lastLoginTime).getTime();
                    if (age > OFFLINE_SESSION_MAX_AGE) {
                        set({
                            error: 'Your offline session has expired. Please connect to the internet to sign in.',
                            isLoading: false,
                        });
                        return false;
                    }

                    // Verify username matches
                    if (cachedUser.username?.toLowerCase() !== username.toLowerCase()) {
                        set({ error: 'Invalid username or password', isLoading: false });
                        return false;
                    }

                    // Verify password against cached hash
                    const isValid = compareSync(password, offlinePasswordHash);
                    if (!isValid) {
                        set({ error: 'Invalid username or password', isLoading: false });
                        return false;
                    }

                    // Offline login accepted
                    set({
                        isAuthenticated: true,
                        isLoading: false,
                        isOfflineSession: true,
                    });
                    return true;
                }

                // ─── ONLINE LOGIN PATH (original) ─────────────────
                try {
                    if (!supabase) {
                        set({ error: 'Cloud not configured', isLoading: false });
                        return false;
                    }

                    // Get hotel_id for scoped user lookup
                    const hotelId = await getHotelId();
                    if (!hotelId) {
                        set({ error: 'Hotel not configured', isLoading: false });
                        return false;
                    }

                    // Fetch user via server-side RPC (never exposes password_hash)
                    const { data: users, error } = await supabase
                        .rpc('authenticate_user', {
                            p_username: username,
                            p_hotel_id: hotelId,
                        });

                    if (error || !users || users.length === 0) {
                        set({ error: 'Invalid username or password', isLoading: false });
                        return false;
                    }

                    const user = users[0];

                    // Verify password server-side
                    const { data: isValid, error: verifyError } = await supabase
                        .rpc('verify_user_password', {
                            p_user_id: user.id,
                            p_password: password,
                        });

                    if (verifyError || !isValid) {
                        set({ error: 'Invalid username or password', isLoading: false });
                        return false;
                    }

                    // Update last login
                    await supabase
                        .from('users')
                        .update({ last_login: new Date().toISOString() })
                        .eq('id', user.id);

                    // Cache password hash locally for offline login
                    const offlineHash = hashSync(password, 10);

                    set({
                        user: user as User,
                        isAuthenticated: true,
                        isLoading: false,
                        isOfflineSession: false,
                        lastLoginTime: new Date().toISOString(),
                        offlinePasswordHash: offlineHash,
                    });

                    // Fetch hotel name for display
                    try {
                        const hotelId = await getHotelId();
                        if (hotelId && supabase) {
                            const { data: hotel } = await supabase
                                .from('hotels')
                                .select('name')
                                .eq('id', hotelId)
                                .single();
                            if (hotel) {
                                set({ activeHotelName: hotel.name });
                            }
                        }
                    } catch (e) {
                        console.warn('Could not fetch hotel name:', e);
                    }

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
            // Logout — with safe offline queue handling
            // =================================================================
            logout: async () => {
                // Attempt to flush pending offline writes before logout
                try {
                    const { getPendingCount, flushQueue, clearQueue } = await import('@/lib/offlineQueue');
                    const { flushCommands, clearCommandQueue } = await import('@/lib/commandQueue');
                    const { clearLocalStore } = await import('@/lib/localStore');

                    const pending = await getPendingCount();
                    if (pending > 0 && navigator.onLine) {
                        await flushQueue();
                    }
                    // Flush commands too
                    if (navigator.onLine) {
                        await flushCommands();
                    }
                    // Clear all queues and local cache
                    await clearQueue();
                    await clearCommandQueue();
                    await clearLocalStore();
                } catch (e) {
                    console.warn('Failed to flush queues on logout:', e);
                }

                if (supabase) {
                    supabase.auth.signOut().catch(console.error);
                }
                set({
                    user: null,
                    isAuthenticated: false,
                    error: null,
                    isOfflineSession: false,
                    offlinePasswordHash: null,
                    lastLoginTime: null,
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
                    try {
                        // Verify user still exists and is active in Supabase
                        const { data: dbUser, error } = await supabase
                            .from('users')
                            .select('*')
                            .eq('id', user.id)
                            .single();

                        if (error) {
                            // Network error or Supabase unreachable — keep current session
                            console.warn('Session check failed (network?):', error.message);
                            set({ isLoading: false });
                        } else if (!dbUser || !dbUser.is_active) {
                            // User was explicitly deactivated or deleted
                            set({ user: null, isAuthenticated: false, isLoading: false });
                        } else {
                            // Update stored user with latest data
                            set({ user: dbUser as User, isLoading: false });
                        }
                    } catch (err) {
                        // Network failure — silently keep current session
                        console.warn('Session check error (offline?):', err);
                        set({ isLoading: false });
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
                lastLoginTime: state.lastLoginTime,
                offlinePasswordHash: state.offlinePasswordHash,
                activeHotelName: state.activeHotelName,
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
