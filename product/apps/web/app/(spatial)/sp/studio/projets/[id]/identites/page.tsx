import { redirect } from 'next/navigation';
import { getSession } from '../../../../../../../lib/auth';
import { etatInterrupteurs } from '../../../../../../../lib/studios/interrupteurs';
import { lireIdentitesProjet } from '../../../../../../actions/studios/identites';
import { Identites } from '../../../../../../../spatial/vues/projet/Identites';
import { EtatProjet } from '../../../../../../../spatial/vues/projet/EtatProjet';
import { atelierDuProjet, raisonDuRefus } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Atelier « Identités et voix » · Spatial (`/studio/projets/[id]/identites`).
 * Mêmes gardes et même lecture que la page V5 · `lireIdentitesProjet` (garde
 * studio, capacité « identites ») ; la capacité « voix » de l'espace dit si les
 * modes de parole se changent. Rien n'est écrit à la visite.
 */
export default async function IdentitesSpatial({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const r = await lireIdentitesProjet({ projectId: id });
  if (!r.ok) return <EtatProjet raison={raisonDuRefus(r, s, 'Les projets du Studio')} projectId={id} titre="Identités et voix" />;
  const inter = await etatInterrupteurs(s.workspaceId);
  return <Identites vue={r.vue} voixActive={inter.actif('voix')} atelier={await atelierDuProjet(s, r.vue.projet.id)} />;
}
