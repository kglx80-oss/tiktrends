import { redirect } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { ttSearchAds, ttSearchTikTok, ttSearchGoogle, SAMPLE_INSPO_ADS, type InspoAd } from '@tiktrends/integrations';
import {
  analyserRechercheVeille, contexteVeille, lienRetourVeille, termeRetourVeille, filtrerEchantillonVeille, lienVeille, lireCriteresVeille, lireCpmVeille, NICHE_DEFAUT,
  perimetreVeille, pucesVeille, suggestionsVeille, veilleSeedDefaut, videRechercheVeille, type PerimetreVeille, type TriVeille,
} from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason, PLAN_LABEL } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { cleRecherche, lireRecherche, ecrireRecherche } from '../../../../lib/veille-search-cache';
import { baseUrlRecette, cleEffective } from '../../../../lib/veille-recette-base';
import { COUT_CONVERSATION_JARVIS } from '../../../../lib/veille-jarvis';
import { PubsDuMoment } from '../../../../spatial/vues/veille/PubsDuMoment';
import { VeilleFermee } from '../../../../spatial/vues/veille/Fermee';
import { carteVeille } from './cartes';
import { pastilleRadar } from './acces';

export const dynamic = 'force-dynamic';

const Veille = FEATURES.find((f) => f.key === 'inspo')!;
const LIMIT = 24;
// La mémoire marché reste derrière l'offre Résultats (`adsmap`) et une marque active · même porte que l'ancienne section.
const RESULTATS = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * « Pubs du moment » (Spatial) · mêmes gardes, mêmes appels à la source, mêmes
 * caches que la Veille V5 (`app/(app)/veille/page.tsx`) · seule la présentation
 * change. La recherche « Jarvis » est une lecture déterministe de la phrase
 * (noyau `analyserRechercheVeille`) · aucun appel IA, aucun crédit.
 */
export default async function VeilleSpatiale({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const access = effectiveAccess(s);
  const radar = pastilleRadar(access);
  if (!canAccess(access, Veille)) {
    const plan = denyReason(access, Veille) === 'plan';
    return (
      <VeilleFermee titre="Pubs du moment" actif="/veille" pastilleRadar={radar}
        raison={plan ? `La Veille est incluse dès l’offre ${PLAN_LABEL.core}.` : 'Ton rôle ne permet pas d’accéder à la Veille.'}
        texte={plan ? 'Les pubs du marché, les concurrents et les sauvegardes s’ouvrent avec elle.' : 'Demande l’accès à un administrateur de l’espace.'}
        action={plan && s.role === 'owner' ? { href: '/billing', libelle: 'Voir les forfaits' } : null} />
    );
  }

  const sp = await searchParams;
  // Le champ ET l'exemple cliqué portent `jarvis` · le bouton qui soumet vient
  // en dernier dans la requête, c'est lui qui l'emporte.
  const jarvisBrut = Array.isArray(sp.jarvis) ? sp.jarvis.filter((x) => x.trim()).pop() : sp.jarvis;
  const jarvis = typeof jarvisBrut === 'string' ? jarvisBrut.trim() : '';
  if (jarvis) redirect(lienVeille(analyserRechercheVeille(jarvis)));

  const c = lireCriteresVeille(sp);
  const vue = c.vue ?? 'tout';
  const cpm = lireCpmVeille(sp.cpm as string | undefined);
  const query = c.q ?? '';
  const platform = c.p ?? 'meta';
  const page = c.page ?? 1;
  const rafraichir = sp.refresh === '1';
  const baseUrl = baseUrlRecette();
  const apiKey = cleEffective(baseUrl, process.env.TRENDTRACK_API_KEY);
  const brand = db ? await getActiveBrand(s.workspaceId) : null;

  // Un domaine ou une URL tapés · recherche par domaine (même règle que la V5).
  const urlLike = /^https?:\/\//i.test(query) || /^[a-z0-9-]+(\.[a-z0-9-]+){1,}(\/|$)/i.test(query);
  let effSearch = query;
  let effSearchIn: PerimetreVeille = perimetreVeille(c.searchIn);
  if (urlLike) {
    try { effSearch = new URL(/^https?:\/\//i.test(query) ? query : 'https://' + query).hostname.replace(/^www\./, ''); }
    catch { effSearch = query.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./, ''); }
    effSearchIn = 'domain';
  }
  // Le tri envoyé à la source · sans requête, les pistes installées sortent par
  // ancienneté (comme la V5) tant que l'utilisateur n'a pas choisi.
  const sort: TriVeille = vue === 'tendance' ? 'reachDelta7d' : (c.sort ?? (query ? 'newest' : 'longestRunning'));

  let ads: InspoAd[] = [];
  let total = 0;
  let error = '';
  let sample = false;
  let defaut: { seed: string; parCategorie: boolean } | null = null;

  // Sauvegardes et suivis de la marque active · cochent les cartes.
  let savedSet = new Set<string>();
  let followSet = new Set<string>();
  let suivis: Array<{ id: string; platform: string; name: string }> = [];
  if (db) {
    const savedWhere = brand ? and(eq(schema.savedAds.workspaceId, s.workspaceId), eq(schema.savedAds.brandId, brand.id)) : eq(schema.savedAds.workspaceId, s.workspaceId);
    const followWhere = brand ? and(eq(schema.followedBrands.workspaceId, s.workspaceId), eq(schema.followedBrands.brandId, brand.id)) : eq(schema.followedBrands.workspaceId, s.workspaceId);
    const [sv, fl] = await Promise.all([
      db.select({ p: schema.savedAds.platform, e: schema.savedAds.externalId }).from(schema.savedAds).where(savedWhere),
      db.select({ id: schema.followedBrands.id, platform: schema.followedBrands.platform, name: schema.followedBrands.name }).from(schema.followedBrands).where(followWhere).orderBy(desc(schema.followedBrands.createdAt)),
    ]);
    savedSet = new Set(sv.map((r) => r.p + ':' + r.e));
    followSet = new Set(fl.map((r) => r.platform + ':' + r.name));
    suivis = fl;
  }

  if (vue === 'suivies') {
    // Les nouvelles pubs repérées par le suivi chez les marques suivies (table
    // `brand_tracker_events`) · aucune requête au fournisseur depuis cet écran.
    if (db && suivis.length) {
      const ev = await db.select({ snapshot: schema.brandTrackerEvents.snapshot }).from(schema.brandTrackerEvents)
        .where(and(eq(schema.brandTrackerEvents.workspaceId, s.workspaceId), inArray(schema.brandTrackerEvents.followedBrandId, suivis.map((f) => f.id))))
        .orderBy(desc(schema.brandTrackerEvents.createdAt)).limit(48);
      ads = ev.map((e) => e.snapshot as InspoAd).filter((a) => a && a.id && (!c.p || a.platform === c.p));
    }
    total = ads.length;
  } else if (!apiKey) {
    ads = filtrerEchantillonVeille(SAMPLE_INSPO_ADS, { q: effSearch, p: platform, searchIn: effSearchIn, media: c.media, status: c.status, country: c.country });
    sample = true;
    total = ads.length;
  } else if (query) {
    const cle = cleRecherche([platform, urlLike ? 'dom' : 'q', effSearch, effSearchIn, page, c.media, c.status, sort, c.country]);
    // `?refresh=1` court-circuite le cache mémoire · un appel frais (et réécrit le cache), comme la V5.
    const enCache = rafraichir ? undefined : lireRecherche(cle);
    if (enCache) { ads = enCache.ads; total = enCache.total; }
    else {
      try {
        const r = platform === 'tiktok'
          ? await ttSearchTikTok({ apiKey, baseUrl }, { search: urlLike ? undefined : effSearch, domain: urlLike ? effSearch : undefined, limit: LIMIT, page, mediaType: c.media })
          : platform === 'google'
            ? await ttSearchGoogle({ apiKey, baseUrl }, { search: effSearch, limit: LIMIT, page, country: c.country })
            : await ttSearchAds({ apiKey, baseUrl }, { search: effSearch, limit: LIMIT, offset: (page - 1) * LIMIT, mediaType: c.media, status: c.status === 'active' ? 'active' : 'all', searchIn: effSearchIn, sortBy: sort, country: c.country });
        ads = r.ads; total = r.total;
        ecrireRecherche(cle, { ads, total });
      } catch (e) { error = (e as Error).message; }
    }
  } else if (platform === 'meta') {
    // Sans requête · les pistes installées de la catégorie de la marque (V5).
    const chercher = async (seed: string) => {
      const cle = cleRecherche(['defaut', platform, seed, page, c.country, sort, c.media]);
      const enCache = rafraichir ? undefined : lireRecherche(cle);
      if (enCache) return enCache;
      const r = await ttSearchAds({ apiKey, baseUrl }, { search: seed, limit: LIMIT, offset: (page - 1) * LIMIT, status: 'active', searchIn: 'ad_copy', sortBy: sort, country: c.country, mediaType: c.media });
      ecrireRecherche(cle, { ads: r.ads, total: r.total });
      return { ads: r.ads, total: r.total };
    };
    defaut = veilleSeedDefaut({ category: brand?.category });
    try {
      let r = await chercher(defaut.seed);
      if (r.ads.length === 0 && defaut.parCategorie) { defaut = { seed: NICHE_DEFAUT, parCategorie: false }; r = await chercher(defaut.seed); }
      ads = r.ads; total = r.total;
    } catch (e) { error = (e as Error).message; }
  }

  const contexte = contexteVeille(sp);
  const cartes = ads.map((ad) => carteVeille(ad, {
    cpm, contexte,
    sauvee: savedSet.has(ad.platform + ':' + ad.id),
    suivie: followSet.has(ad.platform + ':' + (ad.advertiserName || '')),
  }));
  const annonceurs = new Set(ads.map((a) => a.advertiserName).filter(Boolean)).size;
  const totalPages = Math.min(Math.ceil(total / LIMIT) || 1, 417);
  const pagine = !sample && !error && vue !== 'suivies' && (query || defaut) && ads.length > 0 && totalPages > 1;

  const sous = vue === 'suivies'
    ? 'Les nouvelles pubs repérées chez les marques que tu suis'
    : sample ? 'Démonstration · un échantillon réel, la recherche en direct n’est pas encore activée pour ton espace'
      : error ? 'La source de données ne répond pas pour l’instant'
        : query ? `≈ ${total.toLocaleString('fr-FR')} annonce${total > 1 ? 's' : ''} pour « ${query} »${urlLike ? ' · recherche par domaine' : ''}`
          : defaut ? `Pistes installées de ta catégorie · « ${defaut.seed} »${defaut.parCategorie ? '' : ' · hors catégorie'} · signaux d’observation, pas des preuves`
            : 'Lance une recherche pour voir les pubs du marché';

  let vide: { titre: string; texte: string; action: { href: string; libelle: string } | null } | null = null;
  if (!cartes.length) {
    if (error) vide = { titre: 'La source de données a renvoyé une erreur', texte: error, action: { href: lienVeille(c), libelle: 'Réessayer' } };
    else if (vue === 'suivies') vide = suivis.length
      ? { titre: 'Aucune nouvelle pub chez tes marques suivies', texte: 'Le suivi relève les nouvelles pubs des marques suivies · rien de neuf pour l’instant.', action: { href: '/radar', libelle: 'Ouvrir le Radar' } }
      : { titre: 'Tu ne suis encore aucune marque', texte: 'Ouvre le détail d’une pub et choisis « Suivre » pour voir ici ses nouvelles pubs.', action: { href: lienVeille(c, { vue: undefined }), libelle: 'Voir toutes les pubs' } };
    else if (query || sample) {
      const v = videRechercheVeille(query, effSearchIn, sample);
      vide = { titre: v.titre, texte: v.pourquoi, action: v.essayerMarque && platform === 'meta' ? { href: lienVeille(c, { searchIn: 'brand' }), libelle: 'Chercher dans le nom de la marque' } : { href: '/veille', libelle: 'Tout effacer' } };
    } else vide = { titre: 'Aucune annonce à afficher pour l’instant', texte: 'Élargis le terme, change de plateforme, ou repars des pistes installées.', action: { href: '/veille', libelle: 'Voir les pistes installées' } };
  }

  const puces = pucesVeille(c);
  return (
    <PubsDuMoment
      sous={sous}
      pastilleRadar={radar}
      recherche={{
        phrase: c.j ?? '',
        compris: c.j ? {
          puces: puces.map((x) => ({ libelle: x.libelle, retirer: lienVeille(c, { [x.cle]: undefined }) })),
          texte: c.q ? { libelle: c.q, retirer: lienVeille(c, { q: undefined }) } : null,
          effacer: '/veille',
        } : null,
        suggestions: suggestionsVeille(suivis.find((f) => f.platform === 'meta')?.name),
      }}
      barre={{ criteres: c, plateforme: platform, vue, cpm, tri: sort, stat: { pubs: ads.length, annonceurs, suite: pagine ? ` · page ${page} / ${totalPages}` : sample ? ' · démonstration' : '' } }}
      cartes={cartes}
      vide={vide}
      pages={pagine ? { precedente: page > 1 ? lienVeille(c, { page: page - 1 }) : null, suivante: page < totalPages ? lienVeille(c, { page: page + 1 }) : null, libelle: `${page} / ${totalPages}` } : null}
      coutJarvis={COUT_CONVERSATION_JARVIS}
      retour={(() => { const href = lienRetourVeille(sp.rv); return href ? { href, terme: termeRetourVeille(sp.rv) } : null; })()}
      marche={brand && canAccess(access, RESULTATS) ? { marque: brand.name } : null}
    />
  );
}
