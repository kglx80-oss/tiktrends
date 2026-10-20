import { redirect } from 'next/navigation';
import { aPermissionEspace, capacitesDuRefus, etatNouveauProjet, CHEMIN_PROJETS } from '@tiktrends/core';
import { getSession } from '../../../../../../lib/auth';
import { getActiveBrand } from '../../../../../../lib/brands';
import { gardeSources } from '../../../../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../../../../lib/studios/interrupteurs';
import { CapaciteNonActive } from '../../../../../../components/studios/CapaciteNonActive';
import { NouveauConcept } from '../../../../../../components/studios/projet/NouveauConcept';
import { cadrePage, h1, sub } from '../../../../../../components/ui';

export const dynamic = 'force-dynamic';

/**
 * « Nouveau concept créatif » · l'entrée conversationnelle des Studios (mandat
 * Kevin du 20/10). Modèle : la page Jarvis · une page d'accueil de conversation,
 * aucun appel modèle au GET.
 *
 * LECTURE SEULE À L'OUVERTURE · le GET n'écrit RIEN et n'appelle RIEN : ni
 * `creerProjet`, ni `creerConversation`, ni modèle. On ne lit que la session, la
 * garde studio (relue, inchangée), la capacité `projets` et la marque active.
 * La création réelle démarrera au premier message, hors de ce périmètre.
 *
 * Les états du geste viennent du noyau (`etatNouveauProjet`) · sans marque
 * active, on mène vers les marques ; sans le droit `studio.propose`, on le dit
 * (lecture seule). Un « concept créatif » EST un projet studio · même objet.
 */
export default async function NouveauConceptPage() {
  const s = await getSession();
  if (!s) redirect('/login');

  const g = await gardeSources('studio.read');
  if (!g.ok) redirect(CHEMIN_PROJETS);
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return <main style={cadrePage}><CapaciteNonActive capacites={capacitesDuRefus(coupe)} /></main>;

  const active = await getActiveBrand(s.workspaceId);
  const peutProposer = aPermissionEspace(g.ctx.permissions, 'studio.propose');
  const etat = etatNouveauProjet({ peutProposer, marqueActive: active ? { id: active.id, name: active.name } : null });

  return (
    <main style={cadrePage}>
      <h1 style={h1}>Nouveau concept créatif</h1>
      <p style={sub}>Décris ce que tu veux créer · rien n’est généré ni facturé ici.</p>
      <NouveauConcept etat={etat} />
    </main>
  );
}
