import type { Config } from 'tailwindcss';

/** Preset Tailwind — DA TikTrends (repris 1:1 de la maquette). */
export const tikTrendsPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        bg: '#120810', surface: '#1c121b', rail: '#0d070c', paper: '#2a1826',
        ink: '#f6eef4', 'ink-2': '#cbbcc7', muted: '#9a8a98',
        accent: { DEFAULT: '#fe2c55', strong: '#ff5c8a' },
        ok: '#18cc8c', warn: '#f5a623', err: '#ff4d6d', info: '#3b82f6',
      },
      borderRadius: { sm: '8px', md: '12px', card: '20px', pill: '999px' },
      fontFamily: {
        sans: ['Geist', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      backgroundImage: { accent: 'linear-gradient(135deg,#fe2c55 0%,#ff2d8f 100%)' },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.40)',
        lift: '0 14px 34px -10px rgba(0,0,0,0.60)',
      },
    },
  },
};
