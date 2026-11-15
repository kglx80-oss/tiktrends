import 'server-only';
import { pastilleAImporter, type PastilleAImporter } from '@tiktrends/core';
import { compterAImporter } from '../../../app/(spatial)/sp/adsmap/donnees';

/**
 * La pastille « à importer » du rail Spatial · LE compte des lots de la marque
 * qui attendent leurs mesures (`compterAImporter` · lecture légère, règle
 * `lotAttendDesMesures` au noyau) · le nombre de lots de la liste « Lot » de
 * l'écran d'import qui attendent. Un LIEN vers l'import (`?lot=` quand un seul
 * lot attend). Posée s'il y en a au moins un, `null` sinon. Lecture seule.
 *
 * Appelée par la coquille (`poserPastilleAImporter`) seulement quand l'import
 * est ouvert (fonction `import` · rôle admin ET formule) · un membre n'a pas
 * l'écran, il n'a pas la pastille (le compte n'est même pas lu).
 */
export async function pastilleImport(workspaceId: string, brandId: string): Promise<PastilleAImporter | null> {
  try {
    return pastilleAImporter(await compterAImporter(workspaceId, brandId));
  } catch {
    // Une pastille ne fait jamais tomber la coquille · sans lecture, rien à signaler.
    return null;
  }
}
