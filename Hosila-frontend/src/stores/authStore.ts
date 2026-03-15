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

    // Staff auth tokens
    accessToken: string | null;
    refreshToken: string | null;
    hotelCode: string | null;

    // Actions
    login: (username: string, password: string, hotelCode?: string) => Promise<boolean>;
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

            // Staff auth tokens
            accessToken: null,
            refreshToken: null,
            hotelCode: null,

            // Cloud state
            cloudAccount: null,
            isCloudLinked: false,
            cloudError: null,
            pendingConfirmation: false,

            // =================================================================
            // Login — authenticates against Edge Function
            // =================================================================
            login: async (username: string, password: string, hotelCode?: string) => {
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

                // ─── ONLINE LOGIN PATH (via Edge Function) ────────
                try {
                    if (!supabase) {
                        set({ error: 'Cloud not configured', isLoading: false });
                        return false;
                    }

                    const codeToUse = hotelCode || get().hotelCode;
                    if (!codeToUse) {
                        set({ error: 'Hotel code is required for first-time login', isLoading: false });
                        return false;
                    }

                    const { data, error: invokeErr } = await supabase.functions.invoke('staff-auth/login', {
                        body: { username, password, hotel_code: codeToUse }
                    });

                    if (invokeErr || data?.error) {
                        set({ error: data?.error || 'Invalid username, password, or hotel code', isLoading: false });
                        return false;
                    }

                    const { access_token, refresh_token, user } = data;

                    // Cache password hash locally for offline login
                    const offlineHash = hashSync(password, 10);

                    set({
                        user: user as User,
                        isAuthenticated: true,
                        isLoading: false,
                        isOfflineSession: false,
                        lastLoginTime: new Date().toISOString(),
                        offlinePasswordHash: offlineHash,
                        accessToken: access_token,
                        refreshToken: refresh_token,
                        hotelCode: codeToUse,
                    });

                    // Fetch hotel name for display
                    try {
                        const { data: hotel } = await supabase
                            .from('hotels')
                            .select('name')
                            .eq('id', user.hotel_id)
                            .single();
                        if (hotel) {
                            set({ activeHotelName: hotel.name });
                        }
                    } catch (e) {
                        console.warn('Could not fetch hotel name:', e);
                    }

                    // Check cloud session
                    if (isCloudAvailable() && navigator.onLine) {
                        get().checkCloudSession().catch(console.error);
                    }

                    return true;
                } catch (err: any) {
                    console.error('Login error:', err);
                    set({ error: err.message || 'An error occurred during login', isLoading: false });
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
                        .select('id, hotel_id, username, name, role, is_active, must_change_password, last_login, created_at, updated_at')
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
                const { refreshToken } = get();

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

                if (supabase && refreshToken && navigator.onLine) {
                    supabase.functions.invoke('staff-auth/logout', {
                        body: { refresh_token: refreshToken }
                    }).catch(console.warn);
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
                    accessToken: null,
                    refreshToken: null,
                });
            },

            // =================================================================
            // Session Check (on app load)
            // =================================================================
            checkSession: async () => {
                const { isOfflineSession, refreshToken } = get();

                // If offline session, handled by login expiration
                if (isOfflineSession) {
                    set({ isLoading: false });
                    return;
                }

                if (!supabase || !navigator.onLine) {
                    set({ isLoading: false });
                    return;
                }

                // ─── PATH A: Staff session (has refresh token) ────────
                if (refreshToken) {
                    try {
                        const { data, error: invokeErr } = await supabase.functions.invoke('staff-auth/refresh', {
                            body: { refresh_token: refreshToken }
                        });

                        if (!invokeErr && data && !data.error) {
                            set({
                                accessToken: data.access_token,
                                refreshToken: data.refresh_token,
                                user: data.user as User,
                                isAuthenticated: true,
                                lastLoginTime: new Date().toISOString(),
                                isLoading: false
                            });

                            // Load hotel name
                            try {
                                const { data: hotel } = await supabase
                                    .from('hotels')
                                    .select('name')
                                    .eq('id', data.user.hotel_id)
                                    .single();
                                if (hotel) set({ activeHotelName: hotel.name });
                            } catch { }

                        } else {
                            // Invalid refresh token — clear staff session
                            set({
                                user: null,
                                isAuthenticated: false,
                                accessToken: null,
                                refreshToken: null,
                                isLoading: false
                            });
                        }
                    } catch (err) {
                        console.warn('Refresh error (offline?):', err);
                        set({ isLoading: false });
                    }
                } else {
                    // ─── PATH B: Owner/Admin (Supabase Auth session) ──────
                    // No staff token — check if there's a Supabase Auth session
                    // and auto-login as admin (for hotel owners)
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (session) {
                            const didAutoLogin = await get().autoLoginAsAdmin();
                            if (!didAutoLogin) {
                                set({ isLoading: false });
                            }
                        } else {
                            set({ isLoading: false });
                        }
                    } catch {
                        set({ isLoading: false });
                    }
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
                accessToken: state.accessToken,
                refreshToken: state.refreshToken,
                hotelCode: state.hotelCode,
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
