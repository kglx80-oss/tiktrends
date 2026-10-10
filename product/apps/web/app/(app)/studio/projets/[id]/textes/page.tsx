import { redirect } from 'next/navigation';
import { getSession } from '../../../../../../lib/auth';
import { effectiveAccess } from '../../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../../lib/rbac';
import { lireTextesProjet } from '../../../../../actions/studios/textes';
import { EcranTextes } from '../../../../../../components/studios/textes/EcranTextes';
import { EnTeteProjet, RefusProjet } from '../../../../../../components/studios/produit/EnTeteProjet';
import { cadrePage } from '../../../../../../components/ui';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

/**
 * Textes liés au brief d'un projet (cahier §4.7) · hooks, corps, CTA,
 * scripts. La visite n'écrit rien et n'appelle aucun modèle. La route
 * historique `/studio/textes` reste intacte.
 */
export default async function TextesProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const r = await lireTextesProjet({ projectId: id });
  if (!r.ok) {
    const plan = (r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED') && denyReason(effectiveAccess(s), feature) === 'plan';
    return <main style={cadrePage}><RefusProjet r={r} plan={plan} projectId={id} /></main>;
  }
  return (
    <main style={cadrePage}>
      <div style={{ display: 'grid', gap: 18 }}>
        <EnTeteProjet projet={r.vue.projet} version={r.vue.version} titre="Textes liés au brief" sousTitre="hooks, corps, CTA et scripts sur les mêmes faits et la même hypothèse" />
        <EcranTextes vue={r.vue} />
      </div>
    </main>
  );
}
