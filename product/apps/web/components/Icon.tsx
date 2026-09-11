/**
 * Le jeu d'icônes premium · un seul trait, jamais un emoji.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Le rail de navigation avait déjà de vraies icônes au trait (style Lucide),
 * mais elles étaient prisonnières de `AppShell` · le reste de l'outil retombait
 * sur des emojis (🖼️ 🎬 🎵 📎 …) qui font « kitch » et changent de rendu selon
 * l'OS. On sort donc le jeu ici, partageable, et on le complète pour couvrir les
 * usages courants (assets, actions). Une icône = un `d`, tracé sur une grille
 * 24 · `currentColor` prend la couleur du texte, la taille est réglable.
 *
 * Les cercles sont tracés en arcs dans le `d` (comme `coin`/`gauge`) · un seul
 * `<path>` suffit, le composant reste minuscule et cohérent d'une icône à l'autre.
 */
export const ICON_PATHS: Record<string, string> = {
  // Navigation (repris de AppShell, à l'identique).
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  tag: 'M20.6 13.4 12 22l-9-9V4h9zM7.5 7.5h.01',
  bulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2h6c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z',
  spark: 'M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4',
  film: 'M2 3h20v18H2zM7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5',
  image: 'M3 3h18v18H3zM3 15l5-5 4 4 3-3 6 6',
  trend: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  store: 'M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16',
  plug: 'M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9',
  card: 'M2 5h20v14H2zM2 10h20',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.2 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  gauge: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M13.4 10.6 19 5M4 20a8 8 0 1 1 16 0z',
  radar: 'M12 12a9 9 0 1 0 0 0.01M12 12a5 5 0 1 0 0 0.01M12 12l6-4',
  coin: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 7v10M9.5 9.2a2.5 2 0 0 1 2.5-1.2c1.4 0 2.5.8 2.5 1.8s-1.1 1.7-2.5 1.7-2.5.8-2.5 1.8 1.1 1.7 2.5 1.7a2.5 2 0 0 0 2.5-1.2',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10zM2 21c0-3 1.85-5.36 5.08-6',
  brain: 'M9.5 2a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.6A3 3 0 0 0 6 16a3 3 0 0 0 3.5 3V2zM14.5 2a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.6A3 3 0 0 1 18 16a3 3 0 0 1-3.5 3V2z',
  layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  check: 'M20 6 9 17l-5-5',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  // Assets & actions (nouveaux · remplacent les emojis).
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  sparkles: 'M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7zM19 14v4M21 16h-4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-4-4',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v9',
  map: 'M9 3 3 6v15l6-3 6 3 6-3V3l-6 3zM9 3v15M15 6v15',
  swap: 'M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  star: 'M12 2l3 6.9 7.1.6-5.4 4.6 1.7 7L12 18l-6.1 3.7 1.7-7-5.4-4.6 7.1-.6z',
  phone: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 19h2',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  frame: 'M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3',
  contrast: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 2v20',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 7v5l3 2',
  pen: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  plus: 'M12 5v14M5 12h14',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  cap: 'M22 10 12 5 2 10l10 5zM22 10v6M6 12.5V17c0 1.1 2.7 2 6 2s6-.9 6-2v-4.5',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  terminal: 'M4 17l6-6-6-6M12 19h8',
  palette: 'M12 2a10 10 0 1 0 0 20 2 2 0 0 0 2-2 2 2 0 0 1 2-2h1a5 5 0 0 0 5-5c0-5.5-4.9-9-11-9zM6.5 12.5h.01M8.5 8.5h.01M12.5 7.5h.01M16.5 9.5h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01',
};

/** Icône au trait · `currentColor`, taille réglable (défaut 17, comme le rail). */
export function Icon({ name, size = 17 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON_PATHS[name] || ICON_PATHS.grid} />
    </svg>
  );
}

/** Le nom d'icône qui correspond au type d'un asset · plus jamais un emoji. */
export function iconForAssetKind(kind: string): string {
  return kind === 'image' ? 'image' : kind === 'video' ? 'film' : kind === 'audio' ? 'music' : 'file';
}
