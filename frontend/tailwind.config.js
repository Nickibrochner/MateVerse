/**
 * Fælles tema for alle mates: varme, neutrale flader (stone) og én accentfarve pr. mate.
 * Accenten sættes som CSS-variabel (--accent) af App.vue ud fra den aktive mate,
 * så komponenterne kan skrive `bg-accent`, `text-accent` osv. uden at kende maten.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
        },
        gain: '#047857',
        loss: '#b91c1c',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
