/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dde6ff',
          200: '#c3d0ff',
          300: '#9db1ff',
          400: '#7487ff',
          500: '#4e5eff',
          600: '#3a40f5',
          700: '#2e31d8',
          800: '#272cae',
          900: '#252b89',
          950: '#161750',
        }
      }
    },
  },
  plugins: [],
}
