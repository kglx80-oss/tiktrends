import { redirect } from 'next/navigation';
import { ETAT_TAGGING, sortieTagging } from '@tiktrends/core';
import { db } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { lireVocabulaireCompte } from '../../../../lib/veille-tags';
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
  const resultats = canAccess({ role: s.role, plan: s.plan, equipe: s.equipe ?? undefined }, FEATURES.find((f) => f.key === 'adsmap')!);
  const Veille = FEATURES.find((f) => f.key === 'inspo')!;
  const roleVeille = denyReason(effectiveAccess(s), Veille) !== 'role';
  let tags = null;
  if (roleVeille && db) {
    const brand = await getActiveBrand(s.workspaceId);
    tags = {
      tags: await lireVocabulaireCompte(s.workspaceId, brand?.id ?? null),
      portee: brand ? `Marque ${brand.name}` : 'Espace, sans marque active',
      ecriture: { ouvert: true as const },
    };
  }
  return <Tagging etat={ETAT_TAGGING} sortie={sortieTagging({ resultats })} tags={tags} />;
}
