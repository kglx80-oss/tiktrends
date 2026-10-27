import { redirect } from 'next/navigation';
import { getSession } from '../../../../../../../lib/auth';
import { lireExportProjet } from '../../../../../../actions/studios/export';
import { Export } from '../../../../../../../spatial/vues/projet/Export';
import { EtatProjet } from '../../../../../../../spatial/vues/projet/EtatProjet';
import { atelierDuProjet, raisonDuRefus } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Atelier « Export » · Spatial (`/studio/projets/[id]/export`). Mêmes gardes et
 * même lecture que la page V5 · `lireExportProjet` (garde studio, capacité
 * « export », portée) ; le préflight est calculé à la visite sans rien écrire.
 * `?version=<id>` choisit une version antérieure.
 */
export default async function ExportSpatial({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const { version } = await searchParams;
  const r = await lireExportProjet({ projectId: id, ...(version ? { versionId: version } : {}) });
  if (!r.ok) return <EtatProjet raison={raisonDuRefus(r, s, 'Les projets du Studio')} projectId={id} titre="Export" />;
  return <Export vue={r.vue} atelier={await atelierDuProjet(s, r.vue.projet.id)} />;
}
