import { redirect } from 'next/navigation';
import { getSession } from '../../../../../../lib/auth';
import { effectiveAccess } from '../../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../../lib/rbac';
import { lireExportProjet } from '../../../../../actions/studios/export';
import { PanneauExport } from '../../../../../../components/studios/export/PanneauExport';
import { EnTeteProjet, RefusProjet } from '../../../../../../components/studios/produit/EnTeteProjet';
import { cadrePage } from '../../../../../../components/ui';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

/**
 * Export image d'une version (EXPORT-01, 04, 05) · contrôle avant export,
 * fichier PNG ou JPEG vérifié, historique des exports. La visite n'écrit rien
 * (le contrôle est une lecture) ; seul le clic « Exporter » trace l'export.
 * `?version=<id>` choisit une version antérieure.
 */
export default async function ExportProjetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const sp = await searchParams;
  const r = await lireExportProjet({ projectId: id, ...(sp.version ? { versionId: sp.version } : {}) });
  if (!r.ok) {
    const plan = (r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED') && denyReason(effectiveAccess(s), feature) === 'plan';
    return <main style={cadrePage}><RefusProjet r={r} plan={plan} /></main>;
  }
  return (
    <main style={cadrePage}>
      <div style={{ display: 'grid', gap: 18 }}>
        <EnTeteProjet projet={r.vue.projet} version={r.vue.version} titre="Exporter l’image" sousTitre="fichier vérifié, dérivé de la version, sans génération" />
        <PanneauExport vue={r.vue} />
      </div>
    </main>
  );
}
