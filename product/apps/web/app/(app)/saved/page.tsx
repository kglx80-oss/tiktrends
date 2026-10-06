import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { canAccess, denyReason, FEATURES, roleAtLeast } from '../../../lib/rbac';
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
import { explicationPontAdsmap, lireFormatCreatif, ongletValide, raisonPontAdsmap } from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';
import { cadrePage, h1 } from '../../../components/ui';

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
    // `format` · le classement lu au noyau (valeur inconnue → non classée) · prêt
    // pour le choix « Format » des cartes (lot 19C).
    items = sv.map((r) => ({ id: r.id, ad: r.snapshot as InspoAd, folder: r.folder ?? null, externalId: r.externalId, platform: r.platform, format: lireFormatCreatif(r.snapshot) }));
    brands = fl;
    trackerEvents = ev.map((r) => ({ ad: r.snapshot as InspoAd, advertiserName: r.advertiserName, unseen: !r.seenAt }));
    for (const b of fl) followKeys.push(b.platform + ':' + b.name);
  }
  const trackingEnabled = !!process.env.TRENDTRACK_API_KEY;
  // Le bouton « Suivre dans ADSMAP » ne s'affiche que si la carte est ouverte à
  // cet espace ET qu'une marque est active · sinon l'action n'aurait nulle part
  // où écrire, et on proposerait un geste qui échoue.
  const Adsmap = FEATURES.find((f) => f.key === 'adsmap')!;
  const adsmapOpen = !!activeBrand && canAccess(effectiveAccess(s), Adsmap);
  // Lot 20B · fermé, le pont dit pourquoi au lieu de disparaître · la raison
  // RÉELLE (refus de la fonctionnalité · rôle avant offre · puis marque
  // active), calculée ici comme sur `/veille/formats`, texte du noyau · aucun
  // bouton ni lien d'achat. Les droits ne changent pas (Starter n'a pas
  // Adsmap · il lit « inclus dans l'offre Plus »).
  const refusAdsmap = adsmapOpen ? null
    : explicationPontAdsmap(raisonPontAdsmap(denyReason(effectiveAccess(s), Adsmap), !!activeBrand), 'Suivre dans Adsmap');
  // Lot 19C · le classement par format suit le droit Veille · le MÊME calcul que
  // la garde de l'action (`classerFormatSauvegarde`) et que `/veille/formats` ·
  // fait ici, côté serveur, et transmis aux cartes · jamais recalculé au client.
  const accesVeille = effectiveAccess(s);
  const Veille = FEATURES.find((f) => f.key === 'inspo')!;
  const formatIndisponible = canAccess(accesVeille, Veille) ? null
    : denyReason(accesVeille, Veille) === 'plan' ? 'Classement réservé à la Veille · offre Core.' : 'Classement réservé aux rôles qui ont accès à la Veille.';
  const nonVus = trackerEvents.filter((e) => e.unseen).length;
  // Bibliothèque ENTIÈREMENT vide · une seule activation, pas trois « Ouvrir la
  // veille » répétés par onglet (CDC v7 · N05). Dès qu'un espace se remplit, les
  // onglets reprennent et la collection s'ouvre immédiatement.
  const toutVide = items.length === 0 && brands.length === 0 && trackerEvents.length === 0;

  // Le même état vide quand la liste arrive vide ET quand le dernier concurrent
  // vient d'être retiré à l'écran (lot 16 · sans attendre le rendu serveur).
  const marquesVide = (
    <Empty
      tone="todo" icon="radar" title="Aucun concurrent suivi pour l'instant."
      why="Suis des concurrents depuis la Veille pour surveiller leurs nouvelles pubs et nourrir Jarvis."
      action={{ label: 'Ouvrir la veille', href: '/veille' }}
    />
  );

  return (
    <main style={cadrePage}>
      <h1 style={h1}>Sauvegardes</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 18 }}>
        Tes créas gardées, les concurrents que tu suis et ce qu'ils sortent de neuf. Depuis la <b>Veille</b>, ★ sauvegarde une créa et « + Suivre » un concurrent.
        {items.length > 0 && <> Range tes créas par format dans <a href="/veille/formats" style={{ color: 'var(--accent-strong)', fontWeight: 700, whiteSpace: 'nowrap' }}>Formats créatifs</a>.</>}
      </p>

      {toutVide ? (
        <BibliothequeVide />
      ) : (
        <SavedTabs
          initial={ongletValide(sp.onglet)}
          compteurs={{ creations: items.length, marques: brands.length, nouveautes: nonVus }}
          creations={<SavedBoards items={items} followKeys={followKeys} adsmap={adsmapOpen} refusAdsmap={refusAdsmap} formatIndisponible={formatIndisponible} />}
          marques={brands.length === 0
            ? marquesVide
            : <MarquesSuivies brands={brands.map((b) => ({ id: b.id, platform: b.platform, name: b.name, logoUrl: b.logoUrl, domain: b.domain }))} vide={marquesVide} />}
          nouveautes={<TrackerFeed events={trackerEvents} followedCount={brands.length} trackingEnabled={trackingEnabled} />}
          explorer={trackingEnabled ? <><DecouverteSection /><GrammaireCategorie /></> : null}
        />
      )}
    </main>
  );
}
