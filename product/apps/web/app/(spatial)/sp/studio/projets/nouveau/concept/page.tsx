import { redirect } from 'next/navigation';
import { aPermissionEspace, capacitesDuRefus, etatNouveauProjet, refusStudiosSpatial, CHEMIN_PROJETS } from '@tiktrends/core';
import { getSession } from '../../../../../../../lib/auth';
import { getActiveBrand } from '../../../../../../../lib/brands';
import { gardeSources } from '../../../../../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../../../../../lib/studios/interrupteurs';
import { NouveauConcept } from '../../../../../../../spatial/vues/studios/NouveauConcept';
import { RefusStudios } from '../../../../../../../spatial/vues/studios/Refus';

export const dynamic = 'force-dynamic';

/**
 * « Nouveau concept créatif » · Spatial. Mêmes gardes que la page V5 · session,
 * garde studio (`studio.read`), capacité `projets`, marque active, droit
 * `studio.propose` (`etatNouveauProjet`). LECTURE SEULE au GET · ni projet, ni
 * conversation, ni modèle · la création part du premier message.
 */
export default async function NouveauConceptSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  const g = await gardeSources('studio.read');
  if (!g.ok) redirect(CHEMIN_PROJETS);
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return <RefusStudios titre="Nouveau concept créatif" sous="Studios" refus={refusStudiosSpatial({ capacites: capacitesDuRefus(coupe), code: coupe.code, plan: false, message: coupe.message, traceId: coupe.traceId })} />;
  const active = await getActiveBrand(s.workspaceId);
  const peutProposer = aPermissionEspace(g.ctx.permissions, 'studio.propose');
  const etat = etatNouveauProjet({ peutProposer, marqueActive: active ? { id: active.id, name: active.name } : null });
  return <NouveauConcept etat={etat} sous={etat.etat === 'pret' ? `Studios · ${etat.marque.nom}` : 'Studios'} />;
}
