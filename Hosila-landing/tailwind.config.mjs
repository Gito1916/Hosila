/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#F4FDFC',
                    100: '#E8FAF6',
                    200: '#D1F3EC',
                    300: '#9DDDD0',
                    400: '#4ADEB6',
                    500: '#21C29C', // Primary brand color
                    600: '#1BAA88',
                    700: '#168E72',
                    800: '#0F766E',
                    900: '#0C2622',
                    950: '#071A17',
                },
                surface: {
                    base: '#ffffff',
                    card: '#fcfffe',
                    raised: '#F0FDF9',
                    inset: '#E8FAF6',
                },
                textColor: {
                    heading: '#1E1E1E',
                    body: '#334155',
                    muted: '#6B7280',
                    accent: '#168E72',
                },
                border: {
                    DEFAULT: '#E2E8F0',
                    strong: '#CBD5E1',
                    subtle: '#F1F5F9',
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
