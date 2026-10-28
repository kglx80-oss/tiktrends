import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ECRANS_SPATIAUX, PREFIXE_SPATIAL } from '@tiktrends/core';

/**
 * Une adresse est-elle SERVIE ? L'ancienne interface (groupe `(app)`) est
 * retirée · une adresse l'est par son écran Spatial (le middleware réécrit tout
 * écran porté), ou par un fichier hors coquille posé à son chemin (filet de
 * redirection `app/studio/…`, route de fichier). Les gardes de navigation
 * (« une route déclarée mène quelque part ») passent par ici, pour qu'un
 * retrait NON couvert tombe toujours.
 */
const APP = join(__dirname, '..', '..', 'app');
const SP = join(APP, '(spatial)', PREFIXE_SPATIAL.slice(1));

/** Les écrans Spatial qui ont leur page sous `app/(spatial)/sp` · motifs (`[id]`) compris. */
export function cheminsSpatiauxServis(): string[] {
  return ECRANS_SPATIAUX.filter((e) => existsSync(join(SP, ...e.chemin.split('/').filter(Boolean), 'page.tsx'))).map((e) => e.chemin);
}

/** Le fichier qui sert un motif · sa page Spatiale, sinon une page ou une route hors coquille à son chemin. */
export function fichierServi(motif: string): string | null {
  const segs = motif.split('/').filter(Boolean);
  if (cheminsSpatiauxServis().includes(motif)) return join(SP, ...segs, 'page.tsx');
  for (const f of ['page.tsx', 'route.ts']) { const p = join(APP, ...segs, f); if (existsSync(p)) return p; }
  return null;
}

export const RACINE_APP = APP;
export const RACINE_SPATIALE = SP;
