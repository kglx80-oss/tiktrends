import { redirect } from 'next/navigation';
import { ttSearchAds, SAMPLE_INSPO_ADS, type InspoAd } from '@tiktrends/integrations';
import { ANGLE_LABEL, accrocheDe, apercuImage, capPerBrand, classerParDuree, classifyAngle, joursCourts, veilleSeedDefaut, veillePersistable } from '@tiktrends/core';
import { db } from '@tiktrends/db';
import { getSession } from '../../../../../lib/auth';
import { FEATURES, canAccess, denyReason, PLAN_LABEL } from '../../../../../lib/rbac';
import { effectiveAccess } from '../../../../../lib/access';
import { getActiveBrand } from '../../../../../lib/brands';
import { getVeilleCache, isFresh, setVeilleCache } from '../../../../../lib/veille-cache';
import { lireRecherche, ecrireRecherche, cleRecherche } from '../../../../../lib/veille-search-cache';
import { estMonoMarque, hoteRequete, plafondParMarque } from '../../../../../lib/scale-requete';
import { studioDepuisVeille } from '../../../../../lib/veille-link';
import { CeQuiScale, type LigneScale } from '../../../../../spatial/vues/veille/CeQuiScale';
import { VeilleFermee } from '../../../../../spatial/vues/veille/Fermee';
import { pastilleRadar } from '../acces';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'scale')!;
/** Les niches proposées par la V5 · seules elles écrivent le cache persistant (même règle `veillePersistable`). */
const PRESETS = ['complément alimentaire', 'skincare', 'bijoux', 'maison déco', 'animaux', 'café'];
const growthOf = (a: InspoAd) => a.reachDelta30d ?? a.reachDelta7d ?? a.reach ?? 0;
const LIGNES = 24;

/**
 * « Ce qui scale » (Spatial) · même source, mêmes caches et même garde que la
 * V5 (`app/(app)/veille/scale`) · le swipe file des créas qui montent,
 * plafonné par marque. La maquette les range par DURÉE de diffusion · c'est le
 * classement affiché ici (`classerParDuree`, noyau).
 */
export default async function ScaleSpatial({ searchParams }: { searchParams: Promise<{ q?: string; country?: string }> }) {
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
  const explicite = (sp.q || '').trim().slice(0, 120);
  const seed = veilleSeedDefaut({ category: brand?.category });
  const q = explicite || seed.seed;
  const mono = !!explicite && estMonoMarque(explicite);
  const terme = mono ? hoteRequete(explicite) : q;
  const plafond = plafondParMarque(explicite);
  const country = /^[A-Za-z]{2}$/.test(sp.country ?? '') ? sp.country!.toUpperCase() : 'FR';
  const apiKey = process.env.TRENDTRACK_API_KEY;

  let ads: InspoAd[] = [];
  let sample = false;
  let error = '';
  if (!apiKey) {
    ads = capPerBrand(SAMPLE_INSPO_ADS, (a) => a.advertiserName || a.id, growthOf, 3);
    sample = true;
  } else {
    const persistable = !mono && veillePersistable(country, q, PRESETS);
    const cleMemoire = cleRecherche(['scale', country, terme, mono, plafond]);
    const cache = await getVeilleCache(country, q);
    const memoire = persistable ? undefined : lireRecherche(cleMemoire);
    if (cache && isFresh(cache)) ads = cache.ads;
    else if (memoire) ads = memoire.ads;
    else {
      try {
        const r = await ttSearchAds({ apiKey }, { search: terme, searchIn: mono ? 'domain' : 'ad_copy', status: 'all', sortBy: 'reachDelta30d', country, limit: 100, offset: 0 });
        ads = capPerBrand(r.ads, (a) => a.advertiserName || a.id, growthOf, plafond);
        if (persistable) await setVeilleCache(country, q, ads);
        else ecrireRecherche(cleMemoire, { ads, total: ads.length });
      } catch (e) {
        error = (e as Error).message;
        if (cache) ads = cache.ads;
      }
    }
  }

  const lignes: LigneScale[] = classerParDuree(ads).slice(0, LIGNES).map(({ ad, rang, part }) => {
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

  return <CeQuiScale sous={sous} lignes={lignes} pastilleRadar={radar} vide={vide} />;
}
