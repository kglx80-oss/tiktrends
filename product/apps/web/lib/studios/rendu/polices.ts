import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { POLICES_EMBARQUEES } from '@tiktrends/core';
import { lirePoliceTtf, type PoliceTtf } from './police-ttf';

/**
 * Studios · L5-A · polices embarquées, chargées pour le rendu.
 *
 * Mêmes fichiers que la maquette publicitaire (`public/fonts`, copiés dans
 * l'image autonome). L'empreinte du fichier est comparée à celle de la table du
 * noyau : un fichier remplacé sans régénérer les métriques est REFUSÉ (le rendu
 * ne dessinerait plus ce que la mise en page a calculé).
 */

function chemins(fichier: string): string[] {
  return [
    join(process.cwd(), 'apps/web/public/fonts', fichier),
    join(process.cwd(), 'public/fonts', fichier),
    join(process.cwd(), '.next/standalone/apps/web/public/fonts', fichier),
  ];
}

export function octetsPolice(fichier: string): Buffer {
  for (const p of chemins(fichier)) {
    try { return readFileSync(p); } catch { /* emplacement suivant */ }
  }
  throw new Error(`police embarquée introuvable : ${fichier}`);
}

const cache = new Map<string, PoliceTtf>();

/** Police parsée d'un fichier embarqué · vérifiée contre l'empreinte du noyau. */
export function policeRendu(fichier: string): PoliceTtf {
  const connue = cache.get(fichier);
  if (connue) return connue;
  const attendue = Object.values(POLICES_EMBARQUEES).find((m) => m.fichier === fichier);
  if (!attendue) throw new Error(`police non embarquée : ${fichier}`);
  const b = octetsPolice(fichier);
  const sha = createHash('sha256').update(b).digest('hex');
  if (sha !== attendue.sha256) throw new Error(`police ${fichier} différente de celle mesurée par le noyau · régénérer la table de métriques`);
  const p = lirePoliceTtf(b);
  cache.set(fichier, p);
  return p;
}
