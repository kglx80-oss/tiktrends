import { redirect } from 'next/navigation';
import { getSession } from '../../../../../../lib/auth';
import { effectiveAccess } from '../../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../../lib/rbac';
import { lireIdentitesProjet } from '../../../../../actions/studios/identites';
import { EcranIdentites } from '../../../../../../components/studios/identites/EcranIdentites';
import { EnTeteProjet, RefusProjet } from '../../../../../../components/studios/produit/EnTeteProjet';
import { cadrePage } from '../../../../../../components/ui';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

/**
 * Identités de personnages et voix d'un projet (cahier §4.5, §4.6) · fiches,
 * liaisons aux plans, contradictions bloquantes avant devis, modes de parole,
 * durées mesurées. La visite n'écrit rien et n'appelle aucun modèle.
 */
export default async function IdentitesProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const r = await lireIdentitesProjet({ projectId: id });
  if (!r.ok) {
    const plan = (r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED') && denyReason(effectiveAccess(s), feature) === 'plan';
    return <main style={cadrePage}><RefusProjet r={r} plan={plan} /></main>;
  }
  return (
    <main style={cadrePage}>
      <div style={{ display: 'grid', gap: 18 }}>
        <EnTeteProjet projet={r.vue.projet} version={r.vue.version} titre="Identités et voix" sousTitre="personnages récurrents, plans liés, contradictions et modes de parole" />
        <EcranIdentites vue={r.vue} />
      </div>
    </main>
  );
}
