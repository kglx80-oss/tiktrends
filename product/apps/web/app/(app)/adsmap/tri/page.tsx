import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { canAccess, FEATURES } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { effectiveAccess } from '../../../../lib/access';
import { PageInfo } from '../../../../components/PageInfo';
import { Curation } from './Curation';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * Le tri des propositions.
 *
 * Le radar, le studio et l'import poussent tous des nœuds « proposés » · c'était
 * la bonne décision à chaque fois, une créa venue d'ailleurs ne décide pas de la
 * taxonomie d'une marque. Mais rien ne permettait de valider quoi que ce soit,
 * et le provisoire s'accumulait sans porte de sortie.
 *
 * Une carte qu'on ne croit plus ne sert plus à attribuer, ce qui est exactement
 * ce qu'on lui demande.
 */
export default async function TriPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess(effectiveAccess(s), feature)) redirect('/adsmap');
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) redirect('/adsmap');

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Tri des propositions</h1>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 720 }}>
        Ce que le radar, les studios et l’import ont posé sur la carte de <b>{brand.name}</b> sans décider à ta
        place. Tant que ça reste « proposé », ça encombre la carte sans rien y ajouter.
      </p>

      <PageInfo title="comment ça marche">
        <b>Valider</b> fait entrer le nœud dans la carte définitive · et remonte ses parents encore proposés,
        parce qu’un concept validé sous un angle proposé serait accroché à rien. C’est dit avant le clic.<br /><br />
        <b>Refuser</b> ne casse jamais rien en dessous : un angle refusé dont un concept a déjà tourné effacerait
        un test payé. On avertit, ce qui pend reste à trier.<br /><br />
        <b>Renommer</b> est exigé sur les noms provisoires (« À qualifier ») · les valider tels quels ferait
        entrer le provisoire dans la carte définitive, ce qui est le problème qu’on règle ici.
      </PageInfo>

      <Curation />
    </main>
  );
}
