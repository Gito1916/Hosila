import { v4 as uuidv4 } from 'uuid';
// Password hashing is handled server-side via Supabase RPCs
import { requireSupabase } from '@/lib/api';
import type {
    Hotel,
} from '@/types';

// Seed data generator - creates only essential data for fresh install
// IMPORTANT: Must be called AFTER Supabase auth so RLS policies pass
export async function seedDatabase() {
    console.info('🌱 Initializing database...');

    const sb = requireSupabase();

    // Get the authenticated user's ID to set as tenant_id
    const { data: { user: authUser } } = await sb.auth.getUser();
    if (!authUser) throw new Error('Not authenticated. Please create an account first.');

    // Check if already seeded
    const { data: existingHotel } = await sb.from('hotels').select('id').limit(1).maybeSingle();
    if (existingHotel) {
        console.info('Database already initialized');
        return;
    }

    const hotelId = uuidv4();
    const now = new Date();

    // Create hotel with default settings, linked to the auth user
    const hotel: Partial<Hotel> & { tenant_id: string } = {
        id: hotelId,
        name: 'My Hotel',
        address: '',
        phone: '',
        email: '',
        tenant_id: authUser.id,
        settings: {
            checkout_time: '12:00',
            short_rest_enabled: true,
            short_rest_min_hours: 1,
            short_rest_max_hours: 12,
            night_audit_time: '03:00',
            currency: 'NGN',
            tax_rate: 7.5,
            onboarding_complete: false,
        },
        created_at: now,
        updated_at: now,
    };
    const { error: hotelError } = await sb.from('hotels').insert(hotel);
    if (hotelError) throw hotelError;


    // Create admin user
    // Hash the default admin password server-side
    // Password meets policy: 8+ chars, at least 1 digit
    const { data: passwordHash, error: hashError } = await sb.rpc('hash_password', {
        p_password: 'Change1Me!',
    });
    if (hashError || !passwordHash) {
        throw new Error(`Failed to hash password: ${hashError?.message || 'unknown'}`);
    }

    // The DB record includes password_hash (not on the frontend User type)
    const admin: Record<string, unknown> = {
        id: uuidv4(),
        hotel_id: hotelId,
        username: 'admin',
        password_hash: passwordHash,
        name: 'Admin',
        role: 'admin',
        is_active: true,
        must_change_password: true,
        created_at: now,
        updated_at: now,
    };

    const { error: userError } = await sb.from('users').insert(admin);
    if (userError) throw userError;

    console.info('✅ Database initialized successfully!');
    console.info('📋 Default login: admin / Change1Me!');
    console.info('💡 Go to Settings to add rooms, menu items, and configure your hotel.');
}
