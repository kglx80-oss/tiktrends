import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { canAccess, FEATURES } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { PageInfo } from '../../../../components/PageInfo';
import { REGLE_ITERATION, CIBLE_TACTILE_MIN } from '@tiktrends/core';
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
    <main style={{ padding: '18px clamp(16px, 4vw, 36px) 60px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '2px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, color: 'var(--ink)' }}>Suites</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 12, maxWidth: 760, lineHeight: 1.55 }}>
        Choisis le prochain test à partir de tes résultats · décliner ce qui a gagné, corriger ce qui a lâché, ou repartir.
      </p>

      <PageInfo title="lire ces suites" minHeight={CIBLE_TACTILE_MIN} mb={16}>
        Un tunnel est <b>ordonné</b>. Une créa qui échoue à la conversion a été vue, regardée et cliquée ·
        son accroche a marché, son montage a tenu. Ces réponses sont déjà payées. C’est pourquoi chaque
        suite affiche d’abord <b>ce qu’il ne faut pas toucher</b> : le réflexe, quand une créa ne convertit
        pas, est de tout refaire, et tout refaire jette l’information qu’on venait d’acheter.
        Une suite change <b>exactement une variable</b>, sinon son résultat ne s’attribue à rien.
        Enfin, la règle d’itération : {REGLE_ITERATION}
      </PageInfo>

      <Suites />
    </main>
  );
}
