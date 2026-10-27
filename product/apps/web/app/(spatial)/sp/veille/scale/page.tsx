import { redirect } from 'next/navigation';
import { ttSearchAds, SAMPLE_INSPO_ADS, type InspoAd } from '@tiktrends/integrations';
import { and, eq } from 'drizzle-orm';
import {
  ANGLE_LABEL, accrocheDe, anglesPresentsScale, apercuImage, bibliothequePub, capPerBrand, classerParDuree, classifyAngle, joursCourts, libelleBibliotheque,
  lireOutilsScale, requetesOutilsScale, statsOutilsScale, veilleSeedDefaut, veillePersistable,
} from '@tiktrends/core';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../../lib/auth';
import { FEATURES, canAccess, denyReason, PLAN_LABEL } from '../../../../../lib/rbac';
import { effectiveAccess } from '../../../../../lib/access';
import { getActiveBrand } from '../../../../../lib/brands';
import { getVeilleCache, isFresh, refreshAllowed, setVeilleCache } from '../../../../../lib/veille-cache';
import { lireRecherche, ecrireRecherche, cleRecherche } from '../../../../../lib/veille-search-cache';
import { estMonoMarque, hoteRequete, plafondParMarque } from '../../../../../lib/scale-requete';
import { studioDepuisVeille } from '../../../../../lib/veille-link';
import { CeQuiScale, type LigneScale } from '../../../../../spatial/vues/veille/CeQuiScale';
import type { LigneScaleOutil } from '../../../../../spatial/vues/veille/scale-client';
import { VeilleFermee } from '../../../../../spatial/vues/veille/Fermee';
import { pastilleRadar } from '../acces';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'scale')!;
/** Les niches proposées par la V5 · seules elles écrivent le cache persistant (même règle `veillePersistable`). */
const NICHES = [
  { q: 'complément alimentaire', libelle: 'Compléments' }, { q: 'skincare', libelle: 'Skincare' }, { q: 'bijoux', libelle: 'Bijoux' },
  { q: 'maison déco', libelle: 'Maison & déco' }, { q: 'animaux', libelle: 'Animaux' }, { q: 'café', libelle: 'Café' },
];
const PRESETS = NICHES.map((n) => n.q);
const growthOf = (a: InspoAd) => a.reachDelta30d ?? a.reachDelta7d ?? a.reach ?? 0;
const LIGNES = 24;

/**
 * « Ce qui scale » (Spatial) · même source, mêmes caches et même garde que la
 * V5 (`app/(app)/veille/scale`) · le swipe file des créas qui montent,
 * plafonné par marque. La maquette les range par DURÉE de diffusion · c'est le
 * classement affiché ici (`classerParDuree`, noyau).
 */
export default async function ScaleSpatial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const access = effectiveAccess(s);
  const radar = pastilleRadar(access);
  if (!canAccess(access, feature)) {
    const plan = denyReason(access, feature) === 'plan';
    return <VeilleFermee titre="Ce qui scale" actif="/veille/scale" pastilleRadar={radar}
      raison={plan ? `« Ce qui scale » est inclus dès l’offre ${PLAN_LABEL.core}.` : 'Ton rôle ne permet pas d’y accéder.'}
      texte={plan ? 'Les créas qui durent le plus longtemps dans ta niche, plafonnées par marque.' : 'Demande l’accès à un administrateur de l’espace.'}
      action={plan && s.role === 'owner' ? { href: '/billing', libelle: 'Voir les forfaits' } : null} />;
  }

  const sp = await searchParams;
  const brand = db ? await getActiveBrand(s.workspaceId) : null;
  const explicite = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 120);
  const seed = veilleSeedDefaut({ category: brand?.category });
  const q = explicite || seed.seed;
  const mono = !!explicite && estMonoMarque(explicite);
  const terme = mono ? hoteRequete(explicite) : q;
  const plafond = plafondParMarque(explicite);
  const pays = typeof sp.country === 'string' ? sp.country : '';
  const country = /^[A-Za-z]{2}$/.test(pays) ? pays.toUpperCase() : 'FR';
  // `refresh=1` · relire la source même avec un cache frais, seulement quand son âge le permet (même règle que la V5).
  const rafraichir = sp.refresh === '1';
  const apiKey = process.env.TRENDTRACK_API_KEY;

  let ads: InspoAd[] = [];
  let sample = false;
  let error = '';
  let lu: { at: string; cache: boolean } | null = null;
  let peutRafraichir = false;
  if (!apiKey) {
    ads = capPerBrand(SAMPLE_INSPO_ADS, (a) => a.advertiserName || a.id, growthOf, 3);
    sample = true;
  } else {
    const persistable = !mono && veillePersistable(country, q, PRESETS);
    const cleMemoire = cleRecherche(['scale', country, terme, mono, plafond]);
    const cache = await getVeilleCache(country, q);
    const memoire = persistable ? undefined : lireRecherche(cleMemoire);
    peutRafraichir = persistable && refreshAllowed(cache);
    if (cache && isFresh(cache) && !(rafraichir && peutRafraichir)) { ads = cache.ads; lu = { at: cache.fetchedAt, cache: true }; }
    // Le « Rafraîchir » n'a pas de plancher en mémoire · il n'y est pas honoré (cache court), comme la V5.
    else if (memoire) ads = memoire.ads;
    else {
      try {
        const r = await ttSearchAds({ apiKey }, { search: terme, searchIn: mono ? 'domain' : 'ad_copy', status: 'all', sortBy: 'reachDelta30d', country, limit: 100, offset: 0 });
        ads = capPerBrand(r.ads, (a) => a.advertiserName || a.id, growthOf, plafond);
        if (persistable) await setVeilleCache(country, q, ads);
        else ecrireRecherche(cleMemoire, { ads, total: ads.length });
        lu = { at: new Date().toISOString(), cache: false };
        peutRafraichir = false;
      } catch (e) {
        error = (e as Error).message;
        if (cache) { ads = cache.ads; lu = { at: cache.fetchedAt, cache: true }; }
      }
    }
  }

  // État « gardée » et « suivie » · mêmes portées que la V5 (marque active, sinon l'espace).
  let gardees = new Set<string>(); let suivies = new Set<string>();
  if (db && !sample && ads.length) {
    const ouS = brand ? and(eq(schema.savedAds.workspaceId, s.workspaceId), eq(schema.savedAds.brandId, brand.id)) : eq(schema.savedAds.workspaceId, s.workspaceId);
    const ouF = brand ? and(eq(schema.followedBrands.workspaceId, s.workspaceId), eq(schema.followedBrands.brandId, brand.id)) : eq(schema.followedBrands.workspaceId, s.workspaceId);
    const [sv, fl] = await Promise.all([
      db.select({ p: schema.savedAds.platform, e: schema.savedAds.externalId }).from(schema.savedAds).where(ouS),
      db.select({ p: schema.followedBrands.platform, n: schema.followedBrands.name }).from(schema.followedBrands).where(ouF),
    ]);
    gardees = new Set(sv.map((r) => `${r.p}:${r.e}`)); suivies = new Set(fl.map((r) => `${r.p}:${r.n}`));
  }
  const classees = classerParDuree(ads);
  const outilsLignes: LigneScaleOutil[] = classees.map(({ ad, rang, part }) => {
    const video = (ad.mediaType ?? '').toLowerCase().includes('vid');
    const angle = classifyAngle(ad.body);
    const biblio = bibliothequePub({ platform: ad.platform, name: ad.advertiserName });
    const site = ad.landingUrl && /^https?:\/\//i.test(ad.landingUrl) ? ad.landingUrl : ad.landingDomain ? `https://${ad.landingDomain.replace(/^https?:\/\//i, '')}` : null;
    return {
      cle: `${ad.platform}:${ad.id}`, rang, part, jours: joursCourts(ad.daysRunning),
      image: apercuImage({ isVideo: video, thumbnailUrl: ad.thumbnailUrl, mediaUrl: ad.mediaUrl }),
      accroche: accrocheDe(ad.body) || 'Texte non fourni',
      detail: [ad.advertiserName || 'Annonceur', angle === 'other' ? (video ? 'Vidéo' : 'Image') : ANGLE_LABEL[angle]].join(' · '),
      cloner: studioDepuisVeille(ad),
      o: { video, annonceur: ad.advertiserName ?? '', angle, texte: ad.body ?? '', jours: ad.daysRunning ?? 0, croissance: growthOf(ad), reach: ad.reach ?? 0, depense: ad.estimatedSpend ?? 0 },
      ad, sauvee: gardees.has(`${ad.platform}:${ad.id}`), suivie: suivies.has(`${ad.platform}:${ad.advertiserName ?? ''}`),
      site: site ? { href: site, libelle: ad.landingDomain ? `Ouvrir ${ad.landingDomain.replace(/^www\./, '')}` : 'Ouvrir le site' } : null,
      biblio: biblio ? { href: biblio.url, libelle: libelleBibliotheque(biblio)! } : null,
    };
  });
  const annonceurs = [...new Set(outilsLignes.map((l) => l.o.annonceur).filter(Boolean))];
  const angles = anglesPresentsScale(outilsLignes);

  const lignes: LigneScale[] = classees.slice(0, LIGNES).map(({ ad, rang, part }) => {
    const video = (ad.mediaType ?? '').toLowerCase().includes('vid');
    const angle = classifyAngle(ad.body);
    return {
      cle: `${ad.platform}:${ad.id}`, rang, part, jours: joursCourts(ad.daysRunning),
      image: apercuImage({ isVideo: video, thumbnailUrl: ad.thumbnailUrl, mediaUrl: ad.mediaUrl }),
      accroche: accrocheDe(ad.body) || 'Texte non fourni',
      detail: [ad.advertiserName || 'Annonceur', angle === 'other' ? (video ? 'Vidéo' : 'Image') : ANGLE_LABEL[angle]].join(' · '),
      cloner: studioDepuisVeille(ad),
    };
  });

  const sous = sample
    ? 'Démonstration · un échantillon réel, la recherche en direct n’est pas encore activée pour ton espace'
    : `Les créas que les marques gardent en ligne le plus longtemps · « ${terme} » · ${country}${error && ads.length ? ' · dernier résultat en cache' : ''}`;
  const vide = lignes.length ? null : error
    ? { titre: 'La source de données a renvoyé une erreur', texte: error, action: { href: '/veille/scale', libelle: 'Réessayer' } }
    : { titre: 'Aucune créa trouvée pour cette niche', texte: 'Essaie un autre mot-clé depuis Pubs du moment.', action: { href: '/veille', libelle: 'Ouvrir les pubs du moment' } };

  const lienNiche = (n: string, extra: Record<string, string> = {}) => `/veille/scale?${new URLSearchParams({ q: n, country, ...extra })}`;
  const outils = {
    niche: explicite, pays: country,
    presets: NICHES.map((n) => ({ libelle: n.libelle, href: lienNiche(n.q), actif: n.q === q })),
    etat: sample ? 'Démonstration · échantillon réel' : lu ? `Niche « ${q} » · ${country} · ${lu.cache ? 'en cache' : 'à jour'} · ${new Date(lu.at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}` : `Niche « ${q} » · ${country}`,
    rafraichir: !sample && peutRafraichir && lu?.cache ? lienNiche(q, { refresh: '1' }) : null,
    stats: statsOutilsScale(outilsLignes),
    lignes: outilsLignes,
    initial: lireOutilsScale(sp, { annonceurs, angles: angles.map((a) => a.cle) }),
    annonceurs, angles,
    requetes: requetesOutilsScale(sample ? '' : q, country),
  };

  return <CeQuiScale sous={sous} lignes={lignes} pastilleRadar={radar} vide={vide} outils={outils} />;
}
