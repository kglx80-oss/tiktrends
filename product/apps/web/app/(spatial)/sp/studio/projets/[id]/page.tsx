import { redirect } from 'next/navigation';
import { segmentReserveProjets } from '@tiktrends/core';
import { getSession } from '../../../../../../lib/auth';
import { Projet } from '../../../../../../spatial/vues/projet/Projet';
import { EtatProjet } from '../../../../../../spatial/vues/projet/EtatProjet';
import { chargerProjet } from './donnees';

export const dynamic = 'force-dynamic';

/**
 * Fiche d'un projet · Spatial (`/studio/projets/[id]`, maquette `projet`).
 * Mêmes gardes que la page V5 · session, garde studio (rôle, formule,
 * capacité « projets »), portée marque. `?version=<id>` ouvre une version
 * antérieure en lecture seule. Hors portée ou inconnu · la même page neutre.
 */
export default async function ProjetSpatial({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const { version } = await searchParams;
  // `/studio/projets/nouveau` · tant que son écran Spatial n'existe pas, le motif `[id]` l'attrape · on ne le lit
  // jamais comme un projet, on renvoie vers l'écran qui le sert (lien plein, l'interface précédente).
  if (segmentReserveProjets(id)) {
    return <EtatProjet projectId={id} raison={{ type: 'ailleurs', titre: 'Nouveau projet', message: 'La création de projet s’ouvre dans l’interface précédente le temps de son portage.', href: `/studio/projets/${id}?ui=v5`, libelle: 'Créer un projet' }} />;
  }
  const r = await chargerProjet(s, id, version);
  if (!r.ok) return <EtatProjet raison={r.raison} projectId={id} />;
  return <Projet {...r.props} />;
}
