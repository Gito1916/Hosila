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
                /* ── Brand Monochromatic Scale ─────────────────── */
                brand: {
                    950: '#061E19',
                    900: '#0A2F28',
                    800: '#115144',
                    700: '#1C826F',
                    600: '#26A991',
                    400: '#6CD1BF',
                    300: '#B5E8DF',
                    200: '#E6F8F5',
                },

                /* ── Semantic Surface Tokens (CSS var-driven) ─── */
                surface: {
                    base: 'var(--surface-base)',
                    card: 'var(--surface-card)',
                    raised: 'var(--surface-raised)',
                    inset: 'var(--surface-inset)',
                    sidebar: '#16243D',
                },

                /* ── Semantic Text Tokens ─────────────────────── */
                heading: 'var(--text-heading)',
                body: 'var(--text-body)',
                muted: 'var(--text-muted)',
                accent: 'var(--text-accent)',

                /* ── Semantic Border Tokens ───────────────────── */
                border: {
                    DEFAULT: 'var(--border-default)',
                    strong: 'var(--border-strong)',
                    subtle: 'var(--border-subtle)',
                },

                /* ── Primary CTA ──────────────────────────────── */
                primary: {
                    DEFAULT: '#1C826F',
                    hover: '#26A991',
                    light: '#6CD1BF',
                    50: '#E6F8F5',
                    100: '#B5E8DF',
                    200: '#6CD1BF',
                    300: '#26A991',
                    400: '#1C826F',
                    500: '#115144',
                    600: '#0A2F28',
                },

                /* ── Room Status Colors ───────────────────────── */
                status: {
                    available: '#10B981',
                    occupied: '#EF4444',
                    shortRest: '#3B82F6',
                    dirty: '#F59E0B',
                    maintenance: '#6B7280',
                },

                /* ── Feedback / Alert Tokens ──────────────────── */
                ok: '#10B981',
                warn: '#F59E0B',
                danger: '#EF4444',
                info: '#3B82F6',

                /* ── Legacy compat (will remove after full migration) */
                success: '#10B981',
                error: '#EF4444',
                warning: '#F59E0B',
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
