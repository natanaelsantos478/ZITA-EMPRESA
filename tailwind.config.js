/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0d0f14',
          800: '#13161e',
          700: '#1a1e28',
          600: '#22263a',
          500: '#2a2f42',
        },
        accent: {
          DEFAULT: '#4a9eff',
          glow: 'rgba(74,158,255,0.25)',
        },
        zeus: {
          DEFAULT: '#f5c842',
          glow: 'rgba(245,200,66,0.3)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
