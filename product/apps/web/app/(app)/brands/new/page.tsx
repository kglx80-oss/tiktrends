import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { anthropicConfigured } from '../../../../lib/ai-status';
import { BrandWizard } from '../../../../components/BrandWizard';
import { PageInfo } from '../../../../components/PageInfo';

export const dynamic = 'force-dynamic';

export default async function NewBrandPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 860, margin: '0 auto' }}>
      <Link href="/brands" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>‹ Marques</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 0' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Créer une marque</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ESPACE ADMIN</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 12 }}>
        Cinq étapes pour un profil de marque complet. L'IA peut tout pré-remplir depuis le site&nbsp;: tu vérifies, ajustes, valides.
      </p>
      <PageInfo title="créer une marque">
        Chaque marque a son propre espace (sauvegardes, suivis, analyses). Le profil, la charte, l'audience et les
        concurrents nourrissent le Studio IA et le Radar. Tout reste modifiable ensuite depuis la fiche de la marque.
      </PageInfo>

      <div style={{ marginTop: 18 }}>
        <BrandWizard aiReady={anthropicConfigured()} />
      </div>
    </main>
  );
}
