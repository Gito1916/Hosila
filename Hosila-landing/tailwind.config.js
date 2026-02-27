/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
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
          950: '#071A17'
        },
        surface: {
          base: 'var(--surface-base)',
          card: 'var(--surface-card)',
          raised: 'var(--surface-raised)',
          inset: 'var(--surface-inset)',
          sidebar: 'var(--surface-sidebar)',
          'sidebar-hover': 'var(--surface-sidebar-hover)',
          'sidebar-active': 'var(--surface-sidebar-active)'
        },
        heading: 'var(--text-heading)',
        body: 'var(--text-body)',
        muted: 'var(--text-muted)',
        accent: 'var(--text-accent)',
        'sidebar-text': 'var(--text-sidebar)',
        'sidebar-active': 'var(--text-sidebar-active)',
        border: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          subtle: 'var(--border-subtle)',
          sidebar: 'var(--border-sidebar)'
        },
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
          700: '#168E72'
        }
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        premium: '0 10px 35px rgba(12, 38, 34, 0.12)',
        glow: '0 0 0 1px rgba(33, 194, 156, 0.22), 0 10px 30px rgba(33, 194, 156, 0.18)'
      }
    }
  },
  plugins: []
};
