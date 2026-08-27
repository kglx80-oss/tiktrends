import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { canAccess, FEATURES, roleAtLeast } from '../../../lib/rbac';
import { effectiveAccess } from '../../../lib/access';
import { getActiveBrand } from '../../../lib/brands';
import { BrandRemoveButton } from '../../../components/InspoButtons';
import { PageInfo } from '../../../components/PageInfo';
import { SavedBoards, type SavedItem } from '../../../components/SavedBoards';
import { TrackerFeed, type TrackerEvent } from '../../../components/TrackerFeed';
import type { InspoAd } from '@tiktrends/integrations';

export const dynamic = 'force-dynamic';

export default async function SavedPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'member')) redirect('/dashboard');

  let items: SavedItem[] = [];
  let brands: Array<typeof schema.followedBrands.$inferSelect> = [];
  let trackerEvents: TrackerEvent[] = [];
  const followKeys: string[] = [];
  const activeBrand = db ? await getActiveBrand(s.workspaceId) : null;
  if (db) {
    const savedWhere = activeBrand
      ? and(eq(schema.savedAds.workspaceId, s.workspaceId), eq(schema.savedAds.brandId, activeBrand.id))
      : eq(schema.savedAds.workspaceId, s.workspaceId);
    const followWhere = activeBrand
      ? and(eq(schema.followedBrands.workspaceId, s.workspaceId), eq(schema.followedBrands.brandId, activeBrand.id))
      : eq(schema.followedBrands.workspaceId, s.workspaceId);
    const [sv, fl, ev] = await Promise.all([
      db.select().from(schema.savedAds).where(savedWhere).orderBy(desc(schema.savedAds.createdAt)),
      db.select().from(schema.followedBrands).where(followWhere).orderBy(desc(schema.followedBrands.createdAt)),
      db.select().from(schema.brandTrackerEvents).where(eq(schema.brandTrackerEvents.workspaceId, s.workspaceId)).orderBy(desc(schema.brandTrackerEvents.createdAt)).limit(48),
    ]);
    items = sv.map((r) => ({ ad: r.snapshot as InspoAd, folder: r.folder ?? null, externalId: r.externalId, platform: r.platform }));
    brands = fl;
    trackerEvents = ev.map((r) => ({ ad: r.snapshot as InspoAd, advertiserName: r.advertiserName, unseen: !r.seenAt }));
    for (const b of fl) followKeys.push(b.platform + ':' + b.name);
  }
  const trackingEnabled = !!process.env.TRENDTRACK_API_KEY;
  // Le bouton « Suivre dans ADSMAP » ne s'affiche que si la carte est ouverte à
  // cet espace ET qu'une marque est active · sinon l'action n'aurait nulle part
  // où écrire, et on proposerait un geste qui échoue.
  const adsmapOpen = !!activeBrand && canAccess(effectiveAccess(s), FEATURES.find((f) => f.key === 'adsmap')!);

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Sauvegardes</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 24 }}>
        Tes créas gardées et les marques que tu suis. Depuis l'<b>Inspo</b>, ★ sauvegarde une créa et « + Suivre » une marque.
      </p>

      <PageInfo title="tes créas & marques gardées">
        Retrouve ici tout ce que tu as sauvegardé depuis l'<b>Inspo</b>. Range tes créas dans des <b>boards</b>
        (dossiers) pour organiser ta veille par angle, campagne ou concurrent. Clique <b>★</b> pour retirer une créa,
        <b> voir</b> pour relancer une recherche sur une marque suivie, et <b>✨ Générer une variante</b> pour l'envoyer au Studio.
      </PageInfo>

      {/* Fil des nouveautés concurrents (tracking) */}
      <TrackerFeed events={trackerEvents} followedCount={brands.length} trackingEnabled={trackingEnabled} />

      {/* Marques suivies */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px' }}>Marques suivies ({brands.length})</h2>
      {brands.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucune marque suivie pour l'instant.</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 30 }}>
        {brands.map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 999, padding: '6px 8px 6px 6px', background: 'var(--surface)' }}>
            {b.logoUrl
               
              ? <img src={b.logoUrl} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--paper)' }} />}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{b.name}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)' }}>{b.platform}</span>
            <a href={`/inspo?q=${encodeURIComponent(b.name)}&searchIn=brand&p=${b.platform}`} style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none' }}>voir</a>
            <BrandRemoveButton platform={b.platform} name={b.name} />
          </div>
        ))}
      </div>

      {/* Créas sauvegardées · organisées en boards */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px' }}>Créas sauvegardées ({items.length})</h2>
      <SavedBoards items={items} followKeys={followKeys} adsmap={adsmapOpen} />
    </main>
  );
}
