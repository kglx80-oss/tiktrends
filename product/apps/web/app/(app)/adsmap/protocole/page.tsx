import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { canAccess, roleAtLeast, FEATURES } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { getSettingsAction } from '../../../actions/adsmap-protocol';
import { ProtocolForm } from './ProtocolForm';
import { effectiveAccess } from '../../../../lib/access';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

/** Protocole de test et seuils de verdict · une marque, un réglage. */
export default async function ProtocolePage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess(effectiveAccess(s), feature)) redirect('/adsmap');

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) redirect('/adsmap');

  const r = await getSettingsAction();
  if (!r.settings) {
    return (
      <main style={{ padding: '30px 36px 60px', maxWidth: 860, margin: '0 auto' }}>
        <p style={{ color: '#ff8095', fontSize: 13 }}>{r.error}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Protocole & seuils</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 20, maxWidth: 720, lineHeight: 1.6 }}>
        Ces réglages décident de ce qui compte comme une victoire. Ils s’appliquent aux verdicts
        calculés ensuite · les verdicts déjà validés ne bougent pas.
      </p>

      <ProtocolForm initial={r.settings} canEdit={roleAtLeast(s.role, 'admin')} />
    </main>
  );
}
