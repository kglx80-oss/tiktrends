import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { roleAtLeast } from '../../../lib/rbac';
import { AdCard } from '../../../components/AdCard';
import { BrandRemoveButton } from '../../../components/InspoButtons';
import type { InspoAd } from '@tiktrends/integrations';

export const dynamic = 'force-dynamic';

export default async function SavedPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'member')) redirect('/dashboard');

  let ads: InspoAd[] = [];
  let brands: Array<typeof schema.followedBrands.$inferSelect> = [];
  const followSet = new Set<string>();
  if (db) {
    const [sv, fl] = await Promise.all([
      db.select().from(schema.savedAds).where(eq(schema.savedAds.workspaceId, s.workspaceId)).orderBy(desc(schema.savedAds.createdAt)),
      db.select().from(schema.followedBrands).where(eq(schema.followedBrands.workspaceId, s.workspaceId)).orderBy(desc(schema.followedBrands.createdAt)),
    ]);
    ads = sv.map((r) => r.snapshot as InspoAd);
    brands = fl;
    for (const b of fl) followSet.add(b.platform + ':' + b.name);
  }

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Sauvegardes</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 24 }}>
        Tes créas gardées et les marques que tu suis. Depuis l'<b>Inspo</b>, ★ sauvegarde une créa et « + Suivre » une marque.
      </p>

      {/* Marques suivies */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px' }}>Marques suivies ({brands.length})</h2>
      {brands.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucune marque suivie pour l'instant.</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 30 }}>
        {brands.map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 999, padding: '6px 8px 6px 6px', background: 'var(--surface)' }}>
            {b.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={b.logoUrl} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--paper)' }} />}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{b.name}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)' }}>{b.platform}</span>
            <a href={`/inspo?q=${encodeURIComponent(b.name)}&searchIn=brand&p=${b.platform}`} style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none' }}>voir</a>
            <BrandRemoveButton platform={b.platform} name={b.name} />
          </div>
        ))}
      </div>

      {/* Créas sauvegardées */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px' }}>Créas sauvegardées ({ads.length})</h2>
      {ads.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucune créa sauvegardée. Va dans l'Inspo et clique ★ sur une annonce.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
        {ads.map((ad) => (
          <AdCard key={ad.platform + ad.id} ad={ad} saved following={followSet.has(ad.platform + ':' + (ad.advertiserName || ''))} />
        ))}
      </div>
    </main>
  );
}
