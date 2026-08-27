import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { canAccess, roleAtLeast, FEATURES } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { ImportPanel } from './ImportPanel';
import { effectiveAccess } from '../../../../lib/access';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

/** Import du tableau historique · réservé aux administrateurs de l'espace. */
export default async function ImportPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess(effectiveAccess(s), feature)) redirect('/adsmap');
  if (!roleAtLeast(s.role, 'admin')) redirect('/adsmap');

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) redirect('/adsmap');

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 900, margin: '0 auto' }}>
      <Link href="/adsmap" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>‹ ADSMAP</Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Importer le tableau</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 20, maxWidth: 720, lineHeight: 1.6 }}>
        Reprend l’historique tel qu’il est, sans rien jeter : les lignes répétées deviennent des
        variantes numérotées, les dates abîmées sont réparées quand c’est mécanique et laissées
        vides sinon, et chaque écart est listé avant que quoi que ce soit ne soit écrit.
      </p>
      <ImportPanel brandName={brand.name} />
    </main>
  );
}
