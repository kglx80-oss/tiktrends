import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Polices embarquées (Liberation Sans) — chargées depuis public/ (copié dans l'image standalone).
// On tente plusieurs emplacements pour couvrir dev (cwd=apps/web) et prod standalone (cwd=/app).
function load(file: string): Buffer {
  const candidates = [
    join(process.cwd(), 'apps/web/public/fonts', file),
    join(process.cwd(), 'public/fonts', file),
    join(process.cwd(), '.next/standalone/apps/web/public/fonts', file),
  ];
  for (const p of candidates) {
    try { return readFileSync(p); } catch { /* suivant */ }
  }
  throw new Error(`Police introuvable : ${file}`);
}

let cache: { name: string; data: Buffer; weight: 400 | 700; style: 'normal' }[] | null = null;

export function adFonts() {
  if (!cache) {
    cache = [
      { name: 'Sans', data: load('sans-400.ttf'), weight: 400, style: 'normal' },
      { name: 'Sans', data: load('sans-700.ttf'), weight: 700, style: 'normal' },
    ];
  }
  return cache;
}
