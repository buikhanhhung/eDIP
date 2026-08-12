/**
 * Token names follow ECVBot's AlignUI setup so the two products read as one
 * family: `bg-white-0`, `text-sub-600`, `stroke-soft-200`, `primary-base`.
 *
 * The shadcn-style aliases below (background, foreground, muted, …) point at
 * the same variables. They exist so components written against the earlier
 * palette keep working while the app moves over, not as a second system.
 *
 * @type {import('tailwindcss').Config}
 */
const hsl = (name) => `hsl(var(--${name}))`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        bg: {
          'strong-950': hsl('bg-strong-950'),
          'surface-800': hsl('bg-surface-800'),
          'sub-300': hsl('bg-sub-300'),
          'soft-200': hsl('bg-soft-200'),
          'weak-50': hsl('bg-weak-50'),
          'white-0': hsl('bg-white-0'),
        },
        text: {
          'strong-950': hsl('text-strong-950'),
          'sub-600': hsl('text-sub-600'),
          'soft-400': hsl('text-soft-400'),
          'disabled-300': hsl('text-disabled-300'),
          'white-0': hsl('text-white-0'),
        },
        stroke: {
          'strong-950': hsl('stroke-strong-950'),
          'sub-300': hsl('stroke-sub-300'),
          'soft-200': hsl('stroke-soft-200'),
          'white-0': hsl('stroke-white-0'),
        },
        primary: {
          base: hsl('primary-base'),
          dark: hsl('primary-dark'),
          light: hsl('primary-light'),
          lighter: hsl('primary-lighter'),
          DEFAULT: hsl('primary-base'),
          foreground: hsl('text-white-0'),
        },
        success: { base: hsl('success-base'), light: hsl('success-light') },
        warning: { base: hsl('warning-base'), light: hsl('warning-light') },
        danger: { base: hsl('danger-base'), light: hsl('danger-light') },

        // Aliases for components written against the previous palette.
        background: hsl('bg-white-0'),
        foreground: hsl('text-strong-950'),
        card: { DEFAULT: hsl('bg-white-0'), foreground: hsl('text-strong-950') },
        muted: { DEFAULT: hsl('bg-weak-50'), foreground: hsl('text-sub-600') },
        accent: { DEFAULT: hsl('bg-weak-50'), foreground: hsl('text-strong-950') },
        secondary: { DEFAULT: hsl('bg-weak-50'), foreground: hsl('text-strong-950') },
        destructive: { DEFAULT: hsl('danger-base'), foreground: hsl('text-white-0') },
        border: hsl('stroke-soft-200'),
        input: hsl('stroke-soft-200'),
        ring: hsl('primary-base'),
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontSize: {
        'subheading-xs': ['0.6875rem', { lineHeight: '0.75rem', letterSpacing: '0.04em' }],
      },
      boxShadow: {
        // One soft elevation, used for cards and the sidebar edge. More than
        // one depth on a page this flat reads as noise.
        soft: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)',
        raised: '0 4px 12px -2px rgb(16 24 40 / 0.08), 0 2px 6px -2px rgb(16 24 40 / 0.05)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
