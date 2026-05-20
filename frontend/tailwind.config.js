/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d' },
        wins: { dark: '#0f1923', card: '#1a2632', border: '#2a3a4a', text: '#94a3b8' }
      }
    }
  },
  plugins: []
}

