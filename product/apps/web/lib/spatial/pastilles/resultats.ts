import 'server-only';
import { pastilleAConclure, type EntreeRail } from '@tiktrends/core';
import { compterAConclure } from '../../../app/(spatial)/sp/adsmap/donnees';

/**
 * La pastille de « Résultats » dans le rail Spatial (`badge` de la maquette) ·
 * LE compte « à conclure » de la marque (`compterAConclure` · lecture légère,
 * règle `lotConcluable` au noyau) · le nombre de lignes de la liste
 * « À conclure » (`/adsmap/lots`), le même que l'Accueil. Posée s'il y en a au
 * moins un, `null` sinon. Lecture seule.
 *
 * Appelée par la coquille (`SOURCES_PASTILLES`) seulement quand Résultats est
 * ouvert (rôle et formule) · l'appeler sans ce droit dévoilerait un compte que
 * l'écran refuserait.
 */
export async function pastilleResultats(workspaceId: string, brandId: string): Promise<NonNullable<EntreeRail['pastille']> | null> {
  try {
    return pastilleAConclure(await compterAConclure(workspaceId, brandId));
  } catch {
    // Une pastille ne fait jamais tomber la coquille · sans lecture, rien à signaler.
    return null;
  }
}
