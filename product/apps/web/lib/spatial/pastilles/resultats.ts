import 'server-only';
import { pastilleLotsAConclure, type EntreeRail } from '@tiktrends/core';
import { chargerLots, etatsLots } from '../../../app/(spatial)/sp/adsmap/donnees';

/**
 * La pastille de « Résultats » dans le rail Spatial (`badge` de la maquette) ·
 * posée s'il existe AU MOINS un lot de la marque réellement prêt à conclure
 * (règle pure `etatLotSpatial` / `pastilleLotsAConclure`, testée dans le noyau),
 * `null` sinon. Lecture seule.
 *
 * Pas encore branchée dans la coquille · le chef de projet l'ajoute dans
 * `lib/spatial/coquille.ts` (entrée `resultats` de `entreesRail`), après la
 * garde d'accès Adsmap · l'appeler pour un rôle ou une formule sans Adsmap
 * dévoilerait un compte que l'écran refuserait.
 */
export async function pastilleResultats(workspaceId: string, brandId: string): Promise<NonNullable<EntreeRail['pastille']> | null> {
  try {
    return pastilleLotsAConclure(etatsLots(await chargerLots(workspaceId, brandId)));
  } catch {
    // Une pastille ne fait jamais tomber la coquille · sans lecture, rien à signaler.
    return null;
  }
}
