/** Inspo via Trendtrack — API publique (CDC §F6).
 *  Auth : `Authorization: Bearer <clé>` · Recherche : GET /v1/ads · Vérif : GET /v1/me.
 *  Doc : https://docs.trendtrack.io — structure de réponse mappée ci-dessous. */

const DEFAULT_BASE = 'https://api.trendtrack.io';

export interface TrendtrackConfig { apiKey: string; baseUrl?: string }

/** Annonce normalisée pour l'affichage Inspo (sous-ensemble utile du payload). */
export interface InspoAd {
  id: string;
  platform: string;
  status: string;
  daysRunning: number;
  mediaType?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  advertiserName?: string;
  advertiserLogo?: string;
  liveAdsCount?: number;
  body?: string;
  callToAction?: string;
  landingDomain?: string;
  reach?: number;
  estimatedSpend?: number;
  reachDelta7d?: number;
  mainCountry?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapAd(r: any): InspoAd {
  return {
    id: String(r.id),
    platform: r.platform ?? 'facebook',
    status: r.status ?? 'active',
    daysRunning: r.daysRunning ?? 0,
    mediaType: r.media?.type,
    thumbnailUrl: r.media?.thumbnailUrl,
    mediaUrl: r.media?.mediaUrl,
    advertiserName: r.advertiser?.name,
    advertiserLogo: r.advertiser?.logoUrl,
    liveAdsCount: r.advertiser?.liveAdsCount,
    body: r.content?.body ?? r.content?.title ?? undefined,
    callToAction: r.content?.callToAction ?? undefined,
    landingDomain: r.content?.landingPageDomain ?? undefined,
    reach: r.metrics?.reach ?? undefined,
    estimatedSpend: r.metrics?.estimatedSpend ?? undefined,
    reachDelta7d: r.metrics?.reachDelta7d ?? undefined,
    mainCountry: r.audience?.mainCountry ?? undefined,
  };
}

export type AdSort = 'reachDelta7d' | 'longestRunning' | 'reach' | 'newest' | 'mostDuplicates';
export interface SearchAdsInput {
  search: string;
  limit?: number;
  offset?: number;
  mediaType?: 'video' | 'image';
  status?: 'active' | 'all';
  searchIn?: 'ad_copy' | 'brand' | 'domain';
  country?: string;             // ISO alpha-2 (FR, DE, US…)
  adLanguage?: string;          // fr, en, de…
  minReach?: number;
  minDaysRunning?: number;
  sortBy?: AdSort;
  order?: 'asc' | 'desc';
}
export interface SearchAdsResult { ads: InspoAd[]; total: number }

/** Recherche d'annonces (Inspo). Lance une erreur si l'API répond non-2xx. */
export async function ttSearchAds(cfg: TrendtrackConfig, input: SearchAdsInput): Promise<SearchAdsResult> {
  const base = cfg.baseUrl || DEFAULT_BASE;
  const u = new URL('/v1/ads', base);
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  };
  set('search', input.search);
  set('limit', input.limit ?? 24);
  set('offset', input.offset ?? 0);
  set('mediaType', input.mediaType);
  set('status', input.status);
  set('searchIn', input.searchIn);
  set('country', input.country);
  set('adLanguage', input.adLanguage);
  set('minReach', input.minReach);
  set('reachPeriod', input.minReach ? 'total' : undefined);
  set('minDaysRunning', input.minDaysRunning);
  set('sortBy', input.sortBy);
  set('order', input.order ?? (input.sortBy ? 'desc' : undefined));

  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Trendtrack ${res.status}: ${body.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const rows: any[] = Array.isArray(json?.data) ? json.data : [];
  return { ads: rows.map(mapAd), total: json?.pagination?.total ?? rows.length };
}

/** Vérifie la clé et retourne l'espace de travail Trendtrack résolu. */
export async function ttGetMe(cfg: TrendtrackConfig): Promise<{ ok: boolean; workspace?: string; error?: string }> {
  try {
    const res = await fetch(new URL('/v1/me', cfg.baseUrl || DEFAULT_BASE), {
      headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const j: any = await res.json();
    return { ok: true, workspace: j?.workspace?.name ?? j?.name };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Échantillon RÉEL (capturé via l'API) affiché tant qu'aucune clé n'est configurée. */
export const SAMPLE_INSPO_ADS: InspoAd[] = [
  {
    id: 'sample_oldspice', platform: 'facebook', status: 'active', daysRunning: 41, mediaType: 'video',
    thumbnailUrl: 'https://medias.trendtrack.io/facebook/thumbnails/f5b236f2889c7c67156298837776aa45183059a071653c4e3d4b845880999363.jpg',
    mediaUrl: 'https://medias.trendtrack.io/facebook/video/0f3904b1b55df91b830fc1d5d387363de418f2c318896acbb410672f22c370d9.mp4',
    advertiserName: 'Old Spice.', advertiserLogo: 'https://medias.trendtrack.io/profile_picture/596698237104856.jpg',
    liveAdsCount: 56, body: 'POV: Deine Freundin klaut dir alles 🤣 … Coconut Vanilla & Aloe Rain',
    callToAction: null as unknown as undefined, landingDomain: undefined, reach: 15484761, estimatedSpend: 139363, reachDelta7d: 9296287, mainCountry: 'DE',
  },
  {
    id: 'sample_neutrogena', platform: 'facebook', status: 'active', daysRunning: 143, mediaType: 'video',
    thumbnailUrl: 'https://medias.trendtrack.io/facebook/thumbnails/ffb8d519088ebec75ce83898bb8f068f6d2d56695ec506f3e33b67632d87c223.jpg',
    mediaUrl: 'https://medias.trendtrack.io/facebook/video/4324dc7891d62725b81ca4f88aa4338a246264dc262f9291a562b2291b168d1f.mp4',
    advertiserName: 'Neutrogena', advertiserLogo: 'https://medias.trendtrack.io/profile_picture/157448800978315.jpg',
    liveAdsCount: 22, body: 'Kennst du schon das Geheimnis von @tatemcrae für strahlend frische Haut? Hydro Boost Aqua Gel …',
    callToAction: 'ORDER NOW', landingDomain: 'amazon.de', reach: 16151675, estimatedSpend: 145365, reachDelta7d: 8918178, mainCountry: 'DE',
  },
];
