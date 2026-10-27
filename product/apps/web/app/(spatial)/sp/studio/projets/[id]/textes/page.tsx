import { redirect } from 'next/navigation';
import { getSession } from '../../../../../../../lib/auth';
import { lireTextesProjet } from '../../../../../../actions/studios/textes';
import { Textes } from '../../../../../../../spatial/vues/projet/Textes';
import { EtatProjet } from '../../../../../../../spatial/vues/projet/EtatProjet';
import { atelierDuProjet, raisonDuRefus } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Atelier « Textes » · Spatial (`/studio/projets/[id]/textes`). Mêmes gardes et
 * même lecture que la page V5 · `lireTextesProjet` (garde studio, capacité
 * « textes », disponibilité de l'IA et plafond relus). Rien n'est écrit ni
 * appelé à la visite.
 */
export default async function TextesSpatial({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const r = await lireTextesProjet({ projectId: id });
  if (!r.ok) return <EtatProjet raison={raisonDuRefus(r, s, 'Les projets du Studio')} projectId={id} titre="Textes" />;
  return <Textes vue={r.vue} atelier={await atelierDuProjet(s, r.vue.projet.id)} />;
}
