import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { canAccess, FEATURES, roleAtLeast } from '../../../lib/rbac';
import { effectiveAccess } from '../../../lib/access';
import { getActiveBrand } from '../../../lib/brands';
import { MarquesSuivies } from '../../../components/MarquesSuivies';
import { SavedBoards, type SavedItem } from '../../../components/SavedBoards';
import { TrackerFeed, type TrackerEvent } from '../../../components/TrackerFeed';
import { DecouverteSection } from '../../../components/DecouverteSection';
import { GrammaireCategorie } from '../../../components/GrammaireCategorie';
import { SavedTabs } from '../../../components/SavedTabs';
import { BibliothequeVide } from '../../../components/BibliothequeVide';
import { Empty } from '../../../components/Empty';
import { ongletValide } from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';

export const dynamic = 'force-dynamic';

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const sp = await searchParams;
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
    items = sv.map((r) => ({ id: r.id, ad: r.snapshot as InspoAd, folder: r.folder ?? null, externalId: r.externalId, platform: r.platform }));
    brands = fl;
    trackerEvents = ev.map((r) => ({ ad: r.snapshot as InspoAd, advertiserName: r.advertiserName, unseen: !r.seenAt }));
    for (const b of fl) followKeys.push(b.platform + ':' + b.name);
  }
  const trackingEnabled = !!process.env.TRENDTRACK_API_KEY;
  // Le bouton « Suivre dans ADSMAP » ne s'affiche que si la carte est ouverte à
  // cet espace ET qu'une marque est active · sinon l'action n'aurait nulle part
  // où écrire, et on proposerait un geste qui échoue.
  const adsmapOpen = !!activeBrand && canAccess(effectiveAccess(s), FEATURES.find((f) => f.key === 'adsmap')!);
  const nonVus = trackerEvents.filter((e) => e.unseen).length;
  // Bibliothèque ENTIÈREMENT vide · une seule activation, pas trois « Ouvrir la
  // veille » répétés par onglet (CDC v7 · N05). Dès qu'un espace se remplit, les
  // onglets reprennent et la collection s'ouvre immédiatement.
  const toutVide = items.length === 0 && brands.length === 0 && trackerEvents.length === 0;

  return (
    <main style={{ padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Sauvegardes</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 18 }}>
        Tes créas gardées, les concurrents que tu suis et ce qu'ils sortent de neuf. Depuis la <b>Veille</b>, ★ sauvegarde une créa et « + Suivre » un concurrent.
      </p>

      {toutVide ? (
        <BibliothequeVide />
      ) : (
        <SavedTabs
          initial={ongletValide(sp.onglet)}
          compteurs={{ creations: items.length, marques: brands.length, nouveautes: nonVus }}
          creations={<SavedBoards items={items} followKeys={followKeys} adsmap={adsmapOpen} />}
          marques={brands.length === 0
            ? <Empty
                tone="todo" icon="radar" title="Aucun concurrent suivi pour l'instant."
                why="Suis des concurrents depuis la Veille pour surveiller leurs nouvelles pubs et nourrir Jarvis."
                action={{ label: 'Ouvrir la veille', href: '/veille' }}
              />
            : <MarquesSuivies brands={brands.map((b) => ({ id: b.id, platform: b.platform, name: b.name, logoUrl: b.logoUrl, domain: b.domain }))} />}
          nouveautes={<TrackerFeed events={trackerEvents} followedCount={brands.length} trackingEnabled={trackingEnabled} />}
          explorer={trackingEnabled ? <><DecouverteSection /><GrammaireCategorie /></> : null}
        />
      )}
    </main>
  );
}
