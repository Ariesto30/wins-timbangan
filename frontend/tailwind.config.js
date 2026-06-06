/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d' },
        wins: { dark: '#0F172A', card: '#0F172A', hover: '#1E293B', border: '#334155', text: '#94A3B8', flame: '#F59E0B' }
      }
    }
  },
  plugins: []
}

