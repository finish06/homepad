import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  // v3 theme mode: the resolved theme is driven by a `dark` class on <html>
  // (toggled by ThemeProvider from the user's pref + OS), not the raw OS media
  // query — so Light/Dark/System can override what the OS prefers.
  darkMode: 'class',
  plugins: [],
} satisfies Config;
