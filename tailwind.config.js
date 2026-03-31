/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fp: {
          app: 'var(--fp-bg-primary)',
          secondary: 'var(--fp-bg-secondary)',
          card: 'var(--fp-bg-card)',
          input: 'var(--fp-bg-input)',
          hover: 'var(--fp-bg-hover)',
          active: 'var(--fp-bg-active)',
          border: 'var(--fp-border-default)',
          'border-soft': 'var(--fp-border-soft)',
          accent: 'var(--fp-accent)',
        },
        fptext: {
          primary: 'var(--fp-text-primary)',
          secondary: 'var(--fp-text-secondary)',
          muted: 'var(--fp-text-muted)',
        },
      },
    },
  },
  plugins: [],
}