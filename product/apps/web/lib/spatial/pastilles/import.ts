import 'server-only';
import { pastilleAImporter, type PastilleAImporter } from '@tiktrends/core';
import { compterAImporter, type PartageRail } from '../../../app/(spatial)/sp/adsmap/donnees';

/**
 * La pastille « à importer » du rail Spatial · LE compte des lots de la marque
 * dont les mesures MANQUENT (`compterAImporter` · règle `casMesuresLot` au
 * noyau · fin prévue passée ou fenêtre du moteur écoulée) · le nombre de lots
 * du groupe « Mesures manquantes » de la liste « Lot » de l'écran d'import ·
 * un lot en diffusion dont les mesures montent ne l'allume pas. Un LIEN vers
 * l'import (`?lot=` quand un seul lot attend). Posée s'il y en a au moins un,
 * `null` sinon. Lecture seule. `partage` · la lecture que la coquille partage
 * avec la pastille de Résultats (`chargerFaitsRail`, UNE lecture par page).
 *
 * Appelée par la coquille (`poserPastilleAImporter`) seulement quand l'import
 * est ouvert (fonction `import` · rôle admin ET formule) · un membre n'a pas
 * l'écran, il n'a pas la pastille (le compte n'est même pas lu).
 */
export async function pastilleImport(workspaceId: string, brandId: string, partage?: PartageRail): Promise<PastilleAImporter | null> {
  try {
    return pastilleAImporter(await compterAImporter(workspaceId, brandId, new Date(), partage));
  } catch {
    // Une pastille ne fait jamais tomber la coquille · sans lecture, rien à signaler.
    return null;
  }
}
