/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#15161B',
        stone: '#F6F2E9',
        moss: '#0F7A5A',
        ember: '#B65032',
        plum: '#5E486A',
        gold: '#B69141',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        display: ['Instrument Serif', 'serif'],
      },
      boxShadow: {
        panel: '0 24px 60px rgba(21, 22, 27, 0.10)',
      },
    },
  },
  plugins: [],
};
