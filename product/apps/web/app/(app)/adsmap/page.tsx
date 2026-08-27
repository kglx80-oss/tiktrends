import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { canAccess, denyReason, FEATURES } from '../../../lib/rbac';
import { getActiveBrand } from '../../../lib/brands';
import { listBatchesAction } from '../../actions/adsmap';
import { PageInfo } from '../../../components/PageInfo';
import { AdsMapTable } from './AdsMapTable';
import { effectiveAccess } from '../../../lib/access';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * ADSMAP · vue Table.
 *
 * Livrée avant le canvas à dessein : elle valide tout le modèle de données sans
 * dépendre du rendu, et c'est elle qui porte la compatibilité descendante avec
 * le tableur que l'équipe utilise aujourd'hui.
 */
export default async function AdsMapPage() {
  const s = await getSession();
  if (!s) redirect('/login');

  if (!canAccess(effectiveAccess(s), feature)) {
    const why = denyReason(effectiveAccess(s), feature);
    return (
      <main style={{ padding: '30px 36px 60px', maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>ADSMAP</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '10px auto 0', lineHeight: 1.6 }}>
            {why === 'plan'
              ? 'ADSMAP est disponible à partir de l’offre Plus.'
              : 'Ton rôle ne permet pas d’accéder à ADSMAP.'}
          </p>
          {why === 'plan' && (
            <Link href="/billing" style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
              Voir les formules ›
            </Link>
          )}
        </div>
      </main>
    );
  }

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) {
    return (
      <main style={{ padding: '30px 36px 60px', maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>ADSMAP</h1>
        <div style={{ marginTop: 20, border: '1px dashed var(--line-2)', borderRadius: 16, padding: '30px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', fontWeight: 700 }}>Sélectionne une marque active.</p>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>ADSMAP travaille marque par marque : chacune a sa carte, ses lots et ses seuils.</p>
        </div>
      </main>
    );
  }

  const batches = await listBatchesAction();

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>ADSMAP</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
        <span style={{ flex: 1 }} />
        <Link href="/adsmap/import" style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, textDecoration: 'none' }}>
          Importer le tableau
        </Link>
        <Link href="/adsmap/protocole" style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, textDecoration: 'none' }}>
          Protocole & seuils
        </Link>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 18, maxWidth: 760, lineHeight: 1.6 }}>
        Chaque test et son résultat, de l’hypothèse au verdict. Les lots {batches.length > 0 && `· ${batches.length} lot(s) `}
        se lisent ici avant d’être arbitrés.
      </p>

      <PageInfo title="lire ce tableau">
        Une ad n’entre en test qu’avec une <b>hypothèse</b> et <b>une seule variable</b> modifiée : c’est ce qui permet
        d’attribuer un résultat à une cause. Le verdict est <b>calculé</b>, pas saisi · un astérisque signale un test
        hors protocole, dont la conclusion ne vaut que par comparaison au sein du lot. Le <b>CPA</b> est suivi de sa
        borne haute : avec peu d’achats, l’écart entre les deux dit à quel point le chiffre est encore incertain.
      </PageInfo>

      <AdsMapTable batches={batches} />
    </main>
  );
}
