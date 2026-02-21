import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
        'Supabase credentials not found. Cloud sync will be disabled. ' +
        'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable.'
    );
}

// Create Supabase client (safe even when credentials are missing - operations will fail gracefully)
export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
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
