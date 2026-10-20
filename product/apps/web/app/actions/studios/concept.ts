'use server';

import { conceptParDefaut, erreurStudio, type ErreurStudio } from '@tiktrends/core';
import { getActiveBrand } from '../../../lib/brands';
import { gardeStudio } from '../../../lib/studios/garde';
import { creerConversation, conversationDuProjet } from '../../../lib/jarvis/conversations';
import { creerProjet } from './projets';

/**
 * Concept créatif V5 · la CRÉATION DIFFÉRÉE au premier message (mandat Kevin du
 * 20/10). L'écran `/studio/projets/nouveau/concept` n'écrit RIEN au GET · c'est
 * le premier envoi utilisateur qui démarre le concept, via cette action.
 *
 * Ce que fait un démarrage, et ce qu'il ne fait pas :
 *  · même garde que l'écriture canonique `creerProjet` (studio.propose +
 *    capacité `projets`), RELUE ici AVANT tout · une capacité d'espace coupée
 *    refuse (`UNSUPPORTED_CAPABILITY`) sans rien lire ni écrire ;
 *  · il crée EXACTEMENT un projet studio par `creerProjet` (#837, type et titre
 *    décidés au noyau `conceptParDefaut`) · elle n'est PAS réécrite ici ;
 *  · il crée EXACTEMENT une conversation Jarvis LIÉE au concept (`projectId`),
 *    portée espace + marque + personne · le fil de reprise du concept ;
 *  · il NE dépense RIEN et n'appelle AUCUN modèle · le premier tour Jarvis est
 *    lancé ensuite par le client (POST `/api/jarvis/chat`), qui passe la barrière
 *    de dépense (`guardedAnthropic`/`sousPlafond`). Prix annoncé là, jamais ici.
 *
 * Idempotence · si une conversation du concept existe déjà (envoi rejoué après la
 * création du projet), on la RÉUTILISE plutôt que d'en empiler une seconde. Le
 * verrou d'action côté composeur (`verrouAction`) arrête le double-clic en amont.
 */

export interface DemarrageConcept {
  /** Le projet studio (= concept) créé · la route de reprise `/studio/projets/[id]`. */
  projectId: string;
  /** La conversation Jarvis liée au concept · le fil où écrire le premier tour. */
  conversationId: string;
}

export async function demarrerConcept(): Promise<({ ok: true; demarrage: DemarrageConcept }) | ErreurStudio> {
  // Garde RELUE d'abord · droit (studio.propose) ET capacité d'espace (`projets`).
  // Même garde que `creerProjet` · ici AVANT la marque, pour qu'une coupure
  // d'espace refuse nommément même sans marque active.
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;

  const brand = await getActiveBrand(g.ctx.workspaceId);
  if (!brand) return erreurStudio('NOT_FOUND', { traceId: g.ctx.traceId });

  // Type et titre décidés au NOYAU (concept = projet « ads », titre dérivé) · le
  // composeur et cette action les LISENT, ils ne les réécrivent pas.
  const { kind, title } = conceptParDefaut(brand.name);

  // Écriture canonique · `creerProjet` revérifie toute la garde · un refus remonte tel quel.
  const cree = await creerProjet({ brandId: brand.id, kind, title });
  if (!cree.ok) return cree;

  const portee = { workspaceId: g.ctx.workspaceId, brandId: brand.id, userId: g.ctx.userId };
  try {
    const existantes = await conversationDuProjet(portee, cree.projet.id).catch(() => []);
    const conversationId = existantes[0]?.id ?? (await creerConversation(portee, { projectId: cree.projet.id }));
    return { ok: true, demarrage: { projectId: cree.projet.id, conversationId } };
  } catch {
    // Le projet existe · la conversation n'a pas pu être écrite · recouvrable.
    return erreurStudio('PERSISTENCE_FAILED', { traceId: g.ctx.traceId });
  }
}
