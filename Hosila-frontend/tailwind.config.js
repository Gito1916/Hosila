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
                // Hosila Brand Colors
                primary: {
                    50: '#edfdf6',
                    100: '#d0f9e8',
                    200: '#a4f2d3',
                    300: '#6ae8bb',
                    400: '#21C29C', // ← Hosila Mint Green (main)
                    500: '#1aad8a',
                    600: '#138d70',
                    700: '#10725b',
                    800: '#0f5a49',
                    900: '#0d4a3d',
                },
                navy: {
                    50: '#f0f3f8',
                    100: '#d9e0ec',
                    200: '#b5c0d6',
                    300: '#8a9bba',
                    400: '#5f7599',
                    500: '#3d5578',
                    600: '#2b3f5e',
                    700: '#1e3050',
                    800: '#16243D', // ← Hosila Navy (main)
                    900: '#111c30',
                    950: '#0c1420',
                },
                // Room Status Colors
                status: {
                    available: '#10B981',
                    occupied: '#EF4444',
                    shortRest: '#3B82F6',
                    dirty: '#F59E0B',
                    maintenance: '#6B7280',
                },
                // Semantic Colors
                success: '#10B981',
                error: '#EF4444',
                warning: '#F59E0B',
                info: '#3B82F6',
                // Hosila special
                'hosila-offwhite': '#F2FFFC',
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
