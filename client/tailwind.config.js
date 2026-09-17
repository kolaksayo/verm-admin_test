/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vs: {
          bg:            'rgb(var(--vs-bg) / <alpha-value>)',
          card:          'rgb(var(--vs-card) / <alpha-value>)',
          elevated:      'rgb(var(--vs-elevated) / <alpha-value>)',
          hover:         'rgb(var(--vs-hover) / <alpha-value>)',
          purple:        'rgb(var(--vs-purple) / <alpha-value>)',
          'purple-on':   'rgb(var(--vs-purple-on) / <alpha-value>)',
          'purple-light':'rgb(var(--vs-purple-light) / <alpha-value>)',
          lime:          'rgb(var(--vs-lime) / <alpha-value>)',
          'lime-on':     'rgb(var(--vs-lime-on) / <alpha-value>)',
          text:          'rgb(var(--vs-text) / <alpha-value>)',
          'text-2':      'rgb(var(--vs-text-2) / <alpha-value>)',
          'text-3':      'rgb(var(--vs-text-3) / <alpha-value>)',
          border:        'rgb(var(--vs-border) / <alpha-value>)',
          ring:          'rgb(var(--vs-ring) / <alpha-value>)',
          danger:        'rgb(var(--vs-danger) / <alpha-value>)',
          success:       'rgb(var(--vs-success) / <alpha-value>)',
          warning:       'rgb(var(--vs-warning) / <alpha-value>)',
        },

        // shadcn/ui token aliases → mapped onto our existing --vs-* variables.
        // Purely additive: lets Zenith/shadcn-style components (bg-background,
        // text-foreground, bg-primary, border-border, …) resolve without
        // touching any existing `vs-*` class already used across the app.
        border:      'rgb(var(--vs-border) / <alpha-value>)',
        input:       'rgb(var(--vs-border) / <alpha-value>)',
        ring:        'rgb(var(--vs-ring) / <alpha-value>)',
        background:  'rgb(var(--vs-bg) / <alpha-value>)',
        foreground:  'rgb(var(--vs-text) / <alpha-value>)',
        primary: {
          DEFAULT:    'rgb(var(--vs-purple) / <alpha-value>)',
          foreground: 'rgb(255 255 255 / <alpha-value>)',
        },
        secondary: {
          DEFAULT:    'rgb(var(--vs-elevated) / <alpha-value>)',
          foreground: 'rgb(var(--vs-text) / <alpha-value>)',
        },
        muted: {
          DEFAULT:    'rgb(var(--vs-elevated) / <alpha-value>)',
          foreground: 'rgb(var(--vs-text-3) / <alpha-value>)',
        },
        accent: {
          DEFAULT:    'rgb(var(--vs-hover) / <alpha-value>)',
          foreground: 'rgb(var(--vs-text) / <alpha-value>)',
        },
        destructive: {
          DEFAULT:    'rgb(var(--vs-danger) / <alpha-value>)',
          foreground: 'rgb(255 255 255 / <alpha-value>)',
        },
        card: {
          DEFAULT:    'rgb(var(--vs-card) / <alpha-value>)',
          foreground: 'rgb(var(--vs-text) / <alpha-value>)',
        },
        popover: {
          DEFAULT:    'rgb(var(--vs-card) / <alpha-value>)',
          foreground: 'rgb(var(--vs-text) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
