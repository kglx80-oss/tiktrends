import { redirect } from 'next/navigation';
import { getSession } from '../../../../../../../lib/auth';
import { lireProduitProjet } from '../../../../../../actions/studios/produit';
import { Produit } from '../../../../../../../spatial/vues/projet/Produit';
import { EtatProjet } from '../../../../../../../spatial/vues/projet/EtatProjet';
import { atelierDuProjet, raisonDuRefus } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Atelier « Produit » · Spatial (`/studio/projets/[id]/produit`). Mêmes gardes
 * et même lecture que la page V5 · `lireProduitProjet` (session, garde studio,
 * portée marque, capacité). LECTURE seule à la visite · le parcours image ne
 * lance rien tant que la personne ne confirme pas le prix.
 */
export default async function ProduitSpatial({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const r = await lireProduitProjet({ projectId: id });
  if (!r.ok) return <EtatProjet raison={raisonDuRefus(r, s, 'Les projets du Studio')} projectId={id} titre="Produit" />;
  return <Produit vue={r.vue} atelier={await atelierDuProjet(s, r.vue.projet.id)} />;
}
