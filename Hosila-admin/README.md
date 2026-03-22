# Hosila Admin

Separate internal admin app for Hosila SaaS subscription management.

## Purpose

This app is intentionally separate from the hotel product UI. It logs in with a
normal Supabase user session, then calls `/internal-admin/*` routes on the
backend. The backend verifies `platform_admins` membership and performs
privileged subscription writes server-side.

## Screens

1. Login
2. Hotel search/list
3. Hotel detail
4. Record payment / assign plan modal
5. Audit + subscription history

## Local development

```bash
cd Hosila-admin
npm install
cp .env.example .env
npm run dev
```

Default local URL: `http://localhost:5174`

## Required env vars

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=https://api.hosila.com
```

## Backend requirements

- Run the new subscription/admin migration.
- Add allowed origin(s) for `http://localhost:5174` and `https://admin.hosila.com`.
- Seed `platform_admins` with the Supabase user IDs allowed to manage plans.

Example seed:

```sql
insert into public.platform_admins (user_id, email, full_name)
values ('YOUR-USER-UUID', 'admin@hosila.com', 'Hosila Admin');
```

## Pricing model

- Starter: `N20,000` monthly / `N225,000` yearly
- Pro: `N40,000` monthly / `N450,000` yearly
- Enterprise: `N80,000` monthly / `N900,000` yearly
- Yearly discount: `6.25%`
