/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#0D1715',
                    100: '#13211D',
                    200: '#183028',
                    300: '#20473B',
                    400: '#2E6E59',
                    500: '#0F7A5A',
                    600: '#15A06C',
                    700: '#39C78F',
                    800: '#9EF3C8',
                    900: '#D6FCEB',
                    950: '#F2FFF9',
                },
                surface: {
                    base: '#0D1117',
                    card: 'rgba(255, 255, 255, 0.05)',
                    raised: 'rgba(255, 255, 255, 0.08)',
                    inset: '#111822',
                },
                textColor: {
                    heading: '#FFFFFF',
                    body: 'rgba(255, 255, 255, 0.72)',
                    muted: 'rgba(255, 255, 255, 0.5)',
                    accent: '#9EF3C8',
                },
                border: {
                    DEFAULT: 'rgba(255, 255, 255, 0.12)',
                    strong: 'rgba(255, 255, 255, 0.16)',
                    subtle: 'rgba(255, 255, 255, 0.08)',
                },
                gold: {
                    400: '#D5B56A',
                    500: '#B69141',
                    600: '#8D6B2D',
                },
            },
            fontFamily: {
                sans: ['Manrope', 'sans-serif'],
                display: ['Instrument Serif', 'serif'],
            },
            boxShadow: {
                panel: '0 24px 60px rgba(21, 22, 27, 0.32)',
            },
        },
    },
    plugins: [],
}
