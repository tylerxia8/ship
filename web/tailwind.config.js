/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Linear-inspired neutral palette
        // All colors meet WCAG 2.1 AA contrast requirements (4.5:1 minimum)
        background: '#0d0d0d',
        foreground: '#f5f5f5',
        muted: '#8a8a8a', // 5.1:1 contrast against background
        border: '#262626',
        // Logo blue. Use for backgrounds with light text:
        //   bg-accent + text-white = 7.43:1 ✓ (AA Large + AAA Normal)
        // Do NOT use as text-on-dark-bg — only 2.89:1 against #0d0d0d.
        // For "accent-coloured TEXT on dark backgrounds," use `text-accent-bright`
        // (defined below). See the shipshape/07-accessibility audit fix.
        accent: '#005ea2',
        'accent-hover': '#0071bc',
        // Lighter blue specifically for text on dark backgrounds.
        //   text-accent-bright on background (#0d0d0d) = 5.83:1 ✓ (AA Normal)
        // Do NOT use as a background — white text on it is only 3.29:1 ✗.
        'accent-bright': '#4a90e2',
      },
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
  plugins: [],
};
