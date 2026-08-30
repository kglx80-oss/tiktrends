import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { canAccess, FEATURES } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { PageInfo } from '../../../../components/PageInfo';
import { Suites } from './Suites';
import { effectiveAccess } from '../../../../lib/access';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * Ce qu'on fait des tests une fois qu'ils ont parlé.
 *
 * C'est le maillon qui refermait la boucle. Le module savait mesurer, arbitrer,
 * apprendre · et s'arrêtait là. « Cette gagnante n'a jamais été itérée » était
 * un constat, pas une suite.
 */
export default async function SuitesPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess(effectiveAccess(s), feature)) redirect('/adsmap');

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) redirect('/adsmap');

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1000, margin: '0 auto' }}>
      <Link href="/adsmap" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>‹ ADSMAP</Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Suites</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 20, maxWidth: 780, lineHeight: 1.6 }}>
        Chaque test arbitré ouvre une suite : décliner ce qui a gagné, corriger le point précis qui a lâché,
        ou repartir d’ailleurs quand il ne reste rien à garder.
      </p>

      <PageInfo title="lire ces suites">
        Un tunnel est <b>ordonné</b>. Une créa qui échoue à la conversion a été vue, regardée et cliquée ·
        son accroche a marché, son montage a tenu. Ces réponses sont déjà payées. C’est pourquoi chaque
        suite affiche d’abord <b>ce qu’il ne faut pas toucher</b> : le réflexe, quand une créa ne convertit
        pas, est de tout refaire, et tout refaire jette l’information qu’on venait d’acheter.
        Une suite change <b>exactement une variable</b>, sinon son résultat ne s’attribue à rien.
        Enfin, on n’itère pas sur une perdante : la proposition reste, mais elle s’enregistre en nouveau
        concept · déclarer une descendance à partir d’un échec, ce serait en hériter.
      </PageInfo>

      <Suites />
    </main>
  );
}
