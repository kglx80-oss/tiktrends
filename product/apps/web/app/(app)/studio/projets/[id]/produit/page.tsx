import { redirect } from 'next/navigation';
import { getSession } from '../../../../../../lib/auth';
import { effectiveAccess } from '../../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../../lib/rbac';
import { lireProduitProjet } from '../../../../../actions/studios/produit';
import { EcranProduit } from '../../../../../../components/studios/produit/EcranProduit';
import { EnTeteProjet, RefusProjet } from '../../../../../../components/studios/produit/EnTeteProjet';
import { cadrePage } from '../../../../../../components/ui';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

/**
 * Produit et références d'un projet (cahier §4.4 points 1 et 2) · produit du
 * catalogue EXISTANT, UNE photo précise et ses composants, références avec
 * rôle explicite, contrôle avant compilation. La visite n'écrit rien ; chaque
 * geste crée une nouvelle version (409 si le projet a bougé).
 *
 * Hors portée ou inconnu : la même page neutre « introuvable ».
 */
export default async function ProduitProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const r = await lireProduitProjet({ projectId: id });
  if (!r.ok) {
    const plan = (r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED') && denyReason(effectiveAccess(s), feature) === 'plan';
    return <main style={cadrePage}><RefusProjet r={r} plan={plan} projectId={id} /></main>;
  }
  return (
    <main style={cadrePage}>
      <div style={{ display: 'grid', gap: 18 }}>
        <EnTeteProjet projet={r.vue.projet} version={r.vue.version} titre="Produit et références" sousTitre="la photo exacte, ses composants et le rôle de chaque fichier" />
        <EcranProduit vue={r.vue} />
      </div>
    </main>
  );
}
