import 'server-only';
import { resumerContexteJarvis, type ContexteJarvisResolu, type DemandeContexteJarvis } from '@tiktrends/core';
import type { Session } from './auth';
import { effectiveAccess } from './access';
import { canAccess, FEATURES } from './rbac';
import { conceptPourJarvis } from './studios/jarvis-projets';
import { chargerLots } from '../app/(spatial)/sp/adsmap/donnees';

/**
 * « Demander à Jarvis » en contexte (lot 5 V5) · le côté serveur. La règle de
 * ce qui part vit au noyau (`resumerContexteJarvis`, `C/spatial/jarvis/contexte.ts`).
 *
 * L'identifiant vient de l'adresse (à l'ouverture de `/jarvis`) ou du corps de
 * l'envoi (route `/api/jarvis/chat`) · il n'est JAMAIS cru. Il est relu ici,
 * dans la portée de la session, par les MÊMES lectures que les écrans qui
 * l'affichent :
 *  · lot, hypothèse, page de Résultats · la fonction `adsmap` (comme
 *    `gardeResultats`), puis `chargerLots(espace, marque ACTIVE)` · la lecture
 *    des écrans Résultats (une ad s'y rattache par le graphe concept → angle →
 *    désir → persona → marque). Un lot ou une ad d'une autre marque n'y figure
 *    tout simplement pas ;
 *  · projet · `conceptPourJarvis` · les gardes de l'écran « Projets » (session
 *    relue, `studio.read`, capacité, portée, marque active) et le bloc concept
 *    EXISTANT, celui que le panneau Jarvis du projet envoie déjà.
 *
 * Lecture seule, aucun modèle, aucun réseau. Un refus, une absence ou une panne
 * rendent `null` · l'appelant dit `REFUS_CONTEXTE_JARVIS`, la même phrase
 * dans tous les cas (rien ne dit si l'objet existe dans une autre marque).
 */

const ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;

type SessionLue = Pick<Session, 'workspaceId' | 'role' | 'plan' | 'user' | 'equipe'>;

export async function resoudreContexteJarvis(s: SessionLue, brand: { id: string }, demande: DemandeContexteJarvis | null, maintenant: Date = new Date()): Promise<ContexteJarvisResolu | null> {
  if (!demande) return null;
  try {
    if (demande.type === 'projet') {
      const c = await conceptPourJarvis(brand.id, demande.id, maintenant);
      if (!c) return null;
      return resumerContexteJarvis({ type: 'projet', brandId: c.brandId, id: c.id, titre: c.titre, etape: c.etape, bloc: c.bloc }, { brandId: brand.id });
    }
    if (!canAccess(effectiveAccess(s), ADSMAP)) return null;
    const d = await chargerLots(s.workspaceId, brand.id, maintenant);
    const cibleCpa = d.config.targetCpa ?? null;
    if (demande.type === 'lot') {
      const lot = d.lots.find((l) => l.id === demande.id);
      return lot ? resumerContexteJarvis({ type: 'lot', brandId: brand.id, lot, lots: d.lots, ctx: d.ctx, cibleCpa }, { brandId: brand.id }) : null;
    }
    if (demande.type === 'hypothese') {
      const ad = [...d.lots.flatMap((l) => l.ads), ...d.horsLot].find((a) => a.id === demande.id);
      if (!ad) return null;
      const lot = ad.lotId ? d.lots.find((l) => l.id === ad.lotId) ?? null : null;
      return resumerContexteJarvis({ type: 'hypothese', brandId: brand.id, ad, lot, ctx: d.ctx }, { brandId: brand.id });
    }
    return resumerContexteJarvis({ type: 'resultats', brandId: brand.id, page: demande.id as 'ensemble' | 'lots' | 'hypotheses', lots: d.lots, horsLot: d.horsLot, ctx: d.ctx, cibleCpa }, { brandId: brand.id });
  } catch {
    return null;
  }
}
