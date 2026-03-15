import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
        'Supabase credentials not found. Cloud sync will be disabled. ' +
        'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable.'
    );
}

// Custom fetch hook: injects staff access token, auto-refreshes on 401
let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    // Read current access token from store
    let accessToken: string | null = null;
    let refreshToken: string | null = null;
    try {
        const stored = localStorage.getItem('hotelflow-auth');
        if (stored) {
            const parsed = JSON.parse(stored);
            accessToken = parsed.state?.accessToken;
            refreshToken = parsed.state?.refreshToken;
        }
    } catch {
        // ignore
    }

    // Attach staff JWT to outgoing requests
    if (accessToken) {
        options = options || {};
        options.headers = new Headers(options.headers || {});
        (options.headers as Headers).set('Authorization', `Bearer ${accessToken}`);
    }

    const response = await fetch(url, options);

    // If 401 and we have a refresh token, try to refresh and retry once
    const urlStr = typeof url === 'string' ? url : url.toString();
    const isEdgeFunctionCall = urlStr.includes('/functions/v1/staff-auth/');
    if (response.status === 401 && refreshToken && !isEdgeFunctionCall) {
        // Deduplicate concurrent refresh requests
        if (!isRefreshing) {
            isRefreshing = true;
            refreshPromise = (async () => {
                try {
                    const refreshUrl = `${supabaseUrl}/functions/v1/staff-auth/refresh`;
                    const refreshRes = await fetch(refreshUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refresh_token: refreshToken }),
                    });
                    if (refreshRes.ok) {
                        const data = await refreshRes.json();
                        // Update localStorage directly (Zustand will pick it up)
                        const stored = localStorage.getItem('hotelflow-auth');
                        if (stored) {
                            const parsed = JSON.parse(stored);
                            parsed.state.accessToken = data.access_token;
                            parsed.state.refreshToken = data.refresh_token;
                            localStorage.setItem('hotelflow-auth', JSON.stringify(parsed));
                        }
                    }
                } catch (e) {
                    console.warn('Token refresh failed:', e);
                } finally {
                    isRefreshing = false;
                    refreshPromise = null;
                }
            })();
        }

        await refreshPromise;

        // Retry with new token
        const newStored = localStorage.getItem('hotelflow-auth');
        if (newStored) {
            const parsed = JSON.parse(newStored);
            const newToken = parsed.state?.accessToken;
            if (newToken && newToken !== accessToken) {
                options = options || {};
                options.headers = new Headers(options.headers || {});
                (options.headers as Headers).set('Authorization', `Bearer ${newToken}`);
                return fetch(url, options);
            }
        }
    }

    return response;
};

// Create Supabase client (safe even when credentials are missing - operations will fail gracefully)
export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
        },
        global: {
            fetch: customFetch
        },
        realtime: {
            params: {
                eventsPerSecond: 10,
            },
        },
    })
    : null;

/**
 * Check if Supabase is configured and available
 */
export function isCloudAvailable(): boolean {
    return supabase !== null;
}

/**
 * Check if this hotel is linked to a cloud account.
 * True only when Supabase is configured AND there's an active auth session.
 * This is the real guard for whether sync should run.
 */
export async function isCloudLinked(): Promise<boolean> {
    if (!supabase) return false;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return session !== null;
    } catch {
        return false;
    }
}

/**
 * Synchronous check — uses cached session from last auth call.
 * Use this in components/hooks where async isn't convenient.
 */
let _cachedLinked = false;
export function isCloudLinkedSync(): boolean {
    return _cachedLinked;
}

// Keep the cache updated whenever auth state changes
if (supabase) {
    supabase.auth.onAuthStateChange((_event, session) => {
        _cachedLinked = session !== null;
    });
    // Initialize from current session
    supabase.auth.getSession().then(({ data: { session } }) => {
        _cachedLinked = session !== null;
    });
}

/**
 * Check if the app is currently online and Supabase is reachable
 */
export async function isCloudReachable(): Promise<boolean> {
    if (!supabase) return false;
    if (!navigator.onLine) return false;

    try {
        // Quick health check with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const { error } = await supabase
            .from('hotels')
            .select('id')
            .limit(1)
            .abortSignal(controller.signal);

        clearTimeout(timeout);
        return !error;
    } catch {
        return false;
    }
}

// ============================================================================
// Hotel Logo Upload via Supabase Storage
// ============================================================================

const LOGO_BUCKET = 'hotel-assets';

/**
 * Upload a hotel logo to Supabase Storage.
 * Returns the public URL of the uploaded logo.
 *
 * Requires a Supabase Storage bucket named 'hotel-assets' with public access.
 * Create it in Supabase Dashboard → Storage → New Bucket → name: hotel-assets, public: true
 */
export async function uploadHotelLogo(
    hotelId: string,
    file: File
): Promise<string | null> {
    if (!supabase) return null;

    try {
        const ext = file.name.split('.').pop() || 'png';
        const filePath = `${hotelId}/logo.${ext}`;

        // Upload (overwrite if exists)
        const { error: uploadError } = await supabase.storage
            .from(LOGO_BUCKET)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true,
            });

        if (uploadError) {
            console.error('Logo upload failed:', uploadError);
            return null;
        }

        // Get public URL
        const { data } = supabase.storage
            .from(LOGO_BUCKET)
            .getPublicUrl(filePath);

        return data?.publicUrl || null;
    } catch (err) {
        console.error('Logo upload error:', err);
        return null;
    }
}

/**
 * Delete the hotel logo from Supabase Storage.
 */
export async function deleteHotelLogo(hotelId: string): Promise<void> {
    if (!supabase) return;

    try {
        // List files in the hotel folder to find any logo file
        const { data: files } = await supabase.storage
            .from(LOGO_BUCKET)
            .list(hotelId, { search: 'logo' });

        if (files && files.length > 0) {
            const paths = files.map(f => `${hotelId}/${f.name}`);
            await supabase.storage.from(LOGO_BUCKET).remove(paths);
        }
    } catch (err) {
        console.error('Logo delete error:', err);
    }
}

export default supabase;
