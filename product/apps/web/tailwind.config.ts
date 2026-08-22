import type { Config } from 'tailwindcss';
import { tikTrendsPreset } from '@tiktrends/ui';

export default {
  presets: [tikTrendsPreset as Config],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
} satisfies Config;
