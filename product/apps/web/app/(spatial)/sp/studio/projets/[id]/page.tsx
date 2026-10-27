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
  // Un segment fixe (`nouveau`) n'est jamais lu comme un projet · son propre écran Spatial (segment statique) le sert avant `[id]`.
  if (segmentReserveProjets(id)) return <EtatProjet projectId={id} raison={{ type: 'introuvable', message: 'Ce projet n’existe pas ou n’est pas accessible.' }} />;
  const r = await chargerProjet(s, id, version);
  if (!r.ok) return <EtatProjet raison={r.raison} projectId={id} />;
  return <Projet {...r.props} />;
}
