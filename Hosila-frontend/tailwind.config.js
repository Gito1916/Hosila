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
                'premium-sm': '0 4px 20px rgba(0, 0, 0, 0.03)', // For header
                'premium-r': '4px 0 24px rgba(0, 0, 0, 0.02)',  // For sidebar
            },
            colors: {
                // Brand Colors
                primary: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#2563EB', // Primary blue
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                },
                // Room Status Colors
                status: {
                    available: '#10B981',   // Green
                    occupied: '#EF4444',    // Red
                    shortRest: '#3B82F6',   // Blue
                    dirty: '#F59E0B',       // Orange
                    maintenance: '#6B7280', // Gray
                },
                // Semantic Colors
                success: '#10B981',
                error: '#EF4444',
                warning: '#F59E0B',
                info: '#3B82F6',
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
