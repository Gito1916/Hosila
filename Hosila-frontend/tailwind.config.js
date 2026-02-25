/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            boxShadow: {
                'premium': '0 2px 8px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.08)',
                'premium-sm': '0 4px 20px rgba(0, 0, 0, 0.03)',
                'premium-r': '4px 0 24px rgba(0, 0, 0, 0.02)',
            },
            colors: {
                /* ── Brand Scale (built around #21C29C) ────────── */
                brand: {
                    50: '#F4FDFC',
                    100: '#E8FAF6',
                    200: '#D1F3EC',
                    300: '#9DDDD0',
                    400: '#4ADEB6',
                    500: '#21C29C',
                    600: '#1BAA88',
                    700: '#168E72',
                    800: '#0F766E',
                    900: '#0C2622',
                    950: '#071A17',
                },

                /* ── Semantic Surface Tokens (CSS var-driven) ─── */
                surface: {
                    base: 'var(--surface-base)',
                    card: 'var(--surface-card)',
                    raised: 'var(--surface-raised)',
                    inset: 'var(--surface-inset)',
                    sidebar: 'var(--surface-sidebar)',
                    'sidebar-hover': 'var(--surface-sidebar-hover)',
                    'sidebar-active': 'var(--surface-sidebar-active)',
                },

                /* ── Semantic Text Tokens ─────────────────────── */
                heading: 'var(--text-heading)',
                body: 'var(--text-body)',
                muted: 'var(--text-muted)',
                accent: 'var(--text-accent)',
                'sidebar-text': 'var(--text-sidebar)',
                'sidebar-active': 'var(--text-sidebar-active)',

                /* ── Semantic Border Tokens ───────────────────── */
                border: {
                    DEFAULT: 'var(--border-default)',
                    strong: 'var(--border-strong)',
                    subtle: 'var(--border-subtle)',
                    sidebar: 'var(--border-sidebar)',
                },

                /* ── Primary CTA ──────────────────────────────── */
                primary: {
                    DEFAULT: 'var(--primary)',
                    hover: 'var(--primary-hover)',
                    active: 'var(--primary-active)',
                    disabled: 'var(--primary-disabled)',
                    50: '#F4FDFC',
                    100: '#E8FAF6',
                    200: '#D1F3EC',
                    300: '#9DDDD0',
                    400: '#4ADEB6',
                    500: '#21C29C',
                    600: '#1BAA88',
                    700: '#168E72',
                },

                /* ── Room Status Colors ───────────────────────── */
                status: {
                    available: '#10B981',
                    occupied: '#E5484D',
                    shortRest: '#3B82F6',
                    dirty: '#F59E0B',
                    maintenance: '#64748B',
                },

                /* ── Feedback / Alert Tokens ──────────────────── */
                ok: '#10B981',
                warn: '#F59E0B',
                danger: '#E5484D',
                info: '#3B82F6',

                /* ── Legacy compat ────────────────────────────── */
                success: '#10B981',
                error: '#E5484D',
                warning: '#F59E0B',
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
