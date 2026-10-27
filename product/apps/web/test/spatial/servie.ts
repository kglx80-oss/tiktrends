import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ECRANS_SPATIAUX, PREFIXE_SPATIAL } from '@tiktrends/core';

/**
 * Une adresse est-elle SERVIE ? Par sa page de l'ancienne interface, ou · quand
 * celle-ci a été retirée · par l'écran Spatial EXCLUSIF qui la remplace (le
 * middleware le sert dans les deux modes, `servirEnSpatial`). Les gardes de
 * navigation (« une route déclarée mène quelque part ») passent par ici, pour
 * qu'un retrait de page V5 couvert par Spatial ne passe pas pour un 404, et
 * qu'un retrait NON couvert tombe toujours.
 */
const APP = join(__dirname, '..', '..', 'app');
const SP = join(APP, '(spatial)', PREFIXE_SPATIAL.slice(1));

/** Les écrans Spatial exclusifs qui ont leur page sous `app/(spatial)/sp` · motifs (`[id]`) compris. */
export function cheminsExclusifsServis(): string[] {
  return ECRANS_SPATIAUX.filter((e) => e.exclusif && existsSync(join(SP, ...e.chemin.split('/').filter(Boolean), 'page.tsx'))).map((e) => e.chemin);
}

/** Le fichier qui sert un motif dans un groupe de l'ancienne interface (`app/(app)`), sinon sa page Spatiale exclusive. */
export function fichierServi(motif: string, groupe = '(app)'): string | null {
  const segs = motif.split('/').filter(Boolean);
  for (const f of ['page.tsx', 'route.ts']) { const p = join(APP, groupe, ...segs, f); if (existsSync(p)) return p; }
  if (cheminsExclusifsServis().includes(motif)) return join(SP, ...segs, 'page.tsx');
  return null;
}

export const RACINE_SPATIALE = SP;
