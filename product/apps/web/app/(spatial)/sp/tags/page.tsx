import { redirect } from 'next/navigation';
import { ETAT_TAGGING, accesHypothese, propositionHypotheseTag, sortieTagging, type PropositionHypotheseTag } from '@tiktrends/core';
import { db } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { lireSauvegardesDesTags, lireVocabulaireCompte } from '../../../../lib/veille-tags';
import { Tagging } from '../../../../spatial/vues/reglages/Tagging';

export const dynamic = 'force-dynamic';

/**
 * « Tagging » · vague 4 · toute session (l'écran V5 retiré était ouvert dès
 * Starter). La sortie vers les apprentissages n'apparaît qu'avec un accès
 * RÉEL à Résultats (offre et rôle).
 *
 * Lot 6 V5 · les tags de Veille de la marque active (ou des sauvegardes sans
 * marque) · lus et écrits avec la MÊME porte que les écritures sur une
 * sauvegarde (`gardeEcritureSauvegarde` · rôle de la Veille, l'offre n'est pas
 * exigée, comme `/saved`). Un rôle sans la Veille ne voit pas le tableau.
 */
export default async function TaggingSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  const Resultats = FEATURES.find((f) => f.key === 'adsmap')!;
  const resultats = canAccess({ role: s.role, plan: s.plan, equipe: s.equipe ?? undefined }, Resultats);
  const Veille = FEATURES.find((f) => f.key === 'inspo')!;
  const roleVeille = denyReason(effectiveAccess(s), Veille) !== 'role';
  let tags = null;
  if (roleVeille && db) {
    const brand = await getActiveBrand(s.workspaceId);
    // Lot 6 bis · « Formuler une hypothèse » sur un tag RÉCURRENT (règle du noyau, seuil mesuré) · la porte
    // est celle de la garde serveur (`adsmap`, marque active) · fermée, sa raison est écrite à l'écran.
    const parTag = await lireSauvegardesDesTags(s.workspaceId, brand?.id ?? null);
    const propositions: Record<string, PropositionHypotheseTag> = {};
    for (const [cle, x] of parTag) { const p = propositionHypotheseTag(x.tag, x.sauvegardes); if (p) propositions[cle] = p; }
    const acces = effectiveAccess(s);
    tags = {
      tags: await lireVocabulaireCompte(s.workspaceId, brand?.id ?? null),
      portee: brand ? `Marque ${brand.name}` : 'Espace, sans marque active',
      ecriture: { ouvert: true as const },
      hypothese: {
        acces: accesHypothese({ adsmap: canAccess(acces, Resultats) ? 'ok' : denyReason(acces, Resultats) === 'plan' ? 'plan' : 'role', marqueActive: !!brand }),
        propositions,
      },
    };
  }
  return <Tagging etat={ETAT_TAGGING} sortie={sortieTagging({ resultats })} tags={tags} />;
}
