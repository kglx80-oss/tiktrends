import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { canAccess, roleAtLeast, FEATURES } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { listBatchesAction } from '../../../actions/adsmap';
import { PageInfo } from '../../../../components/PageInfo';
import { Lots } from './Lots';
import { effectiveAccess } from '../../../../lib/access';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * Préparation des lots · réservée aux administrateurs.
 *
 * C'est le maillon qui manquait au DÉBUT de la chaîne. Le module savait juger un
 * lot après coup ; rien ne permettait d'en préparer un, et le rattachement
 * quotidien des métriques reposait sur un nom d'annonce que personne n'avait
 * d'endroit pour poser.
 */
export default async function LotsPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess(effectiveAccess(s), feature)) redirect('/adsmap');
  if (!roleAtLeast(s.role, 'admin')) redirect('/adsmap');

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) redirect('/adsmap');

  const batches = await listBatchesAction();

  return (
    <main style={{ padding: '18px clamp(16px, 4vw, 36px) 60px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '2px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 30px)', fontWeight: 500, color: 'var(--ink)' }}>Lots de test</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 12, maxWidth: 760, lineHeight: 1.55 }}>
        Un lot rend les ads comparables · une campagne dédiée, une fenêtre, un protocole.
      </p>

      <PageInfo title="préparer un lot" minHeight={CIBLE_TACTILE_MIN} mb={16}>
        L’écran répond à une question : <b>ce lot peut-il partir, et si non pourquoi</b>. Il vérifie
        l’invariant de test sur chaque ad · hypothèse, variable, offre, page de destination · et
        <b> génère les noms attendus côté régie</b>, ceux que la mesure quotidienne saura relire pour
        rattacher les métriques sans qu’on colle d’identifiant à la main. Le <b>budget</b> est confronté
        au seuil de conclusion de la marque : un lot trop peu financé produit sept jours plus tard une
        colonne entière de « non concluant », autant le savoir avant. Rien n’est créé dans Meta ·
        le brief se recopie.
      </PageInfo>

      {/* CDC v8 · F01 (lots) · la bascule de marque passe par un rafraîchissement
          SOUPLE · les composants serveur se recalculent, mais `Lots` sème son
          état à la monte (`liste`, `choisi`, `detail`…) et resterait sur les lots
          de la marque précédente jusqu'à un rechargement complet · ses actions
          agiraient alors dans le mauvais contexte. La clé par marque force le
          remontage · toute la sélection et la liste se ré-ensemencent ensemble. */}
      <Lots key={brand.id} batches={batches} brandName={brand.name} />
    </main>
  );
}
