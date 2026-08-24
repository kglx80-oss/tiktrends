/** Inspo via Trendtrack — API publique (CDC §F6).
 *  Auth : `Authorization: Bearer <clé>` · Recherche : GET /v1/ads · Vérif : GET /v1/me.
 *  Doc : https://docs.trendtrack.io — structure de réponse mappée ci-dessous. */

const DEFAULT_BASE = 'https://api.trendtrack.io';

export interface TrendtrackConfig { apiKey: string; baseUrl?: string }

export type AdPlatform = 'meta' | 'tiktok' | 'google';

/** Annonce normalisée pour l'affichage Inspo (multi-plateformes). */
export interface InspoAd {
  id: string;
  platform: AdPlatform;
  status: string;
  daysRunning: number;
  mediaType?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  advertiserName?: string;
  advertiserId?: string;
  advertiserLogo?: string;
  liveAdsCount?: number;
  body?: string;
  callToAction?: string;
  landingDomain?: string;
  landingUrl?: string;
  reach?: number;
  estimatedSpend?: number;
  reachDelta7d?: number;
  reachDelta30d?: number;
  mainCountry?: string;
  // Spécifiques TikTok
  views?: number;
  likes?: number;
  engagementRate?: number;
  // Spécifiques Google
  format?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapAd(r: any): InspoAd {
  return {
    id: String(r.id),
    platform: 'meta',
    status: r.status ?? 'active',
    daysRunning: r.daysRunning ?? 0,
    mediaType: r.media?.type,
    thumbnailUrl: r.media?.thumbnailUrl,
    mediaUrl: r.media?.mediaUrl,
    advertiserName: r.advertiser?.name,
    advertiserId: r.advertiser?.id ? String(r.advertiser.id) : undefined,
    advertiserLogo: r.advertiser?.logoUrl,
    liveAdsCount: r.advertiser?.liveAdsCount,
    body: r.content?.body ?? r.content?.title ?? undefined,
    callToAction: r.content?.callToAction ?? undefined,
    landingDomain: r.content?.landingPageDomain ?? undefined,
    landingUrl: r.content?.landingPageUrl ?? undefined,
    reach: r.metrics?.reach ?? undefined,
    estimatedSpend: r.metrics?.estimatedSpend ?? undefined,
    reachDelta7d: r.metrics?.reachDelta7d ?? undefined,
    reachDelta30d: r.metrics?.reachDelta30d ?? undefined,
    mainCountry: r.audience?.mainCountry ?? undefined,
  };
}

export type AdSort = 'reachDelta7d' | 'reachDelta30d' | 'longestRunning' | 'reach' | 'newest' | 'mostDuplicates';
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

const SEARCH_TYPE: Record<string, string> = { ad_copy: 'adCopy', brand: 'brand', domain: 'domain' };

/** Recherche d'annonces Meta (POST /v1/ads/query).
 *  sortBy=newest + status=all pour NE PAS filtrer sur le reach EU (sinon les
 *  annonceurs US comme Grüns sont exclus). Lance une erreur si non-2xx. */
export async function ttSearchAds(cfg: TrendtrackConfig, input: SearchAdsInput): Promise<SearchAdsResult> {
  const limit = input.limit ?? 24;
  const page = Math.floor((input.offset ?? 0) / limit) + 1;
  const body: Record<string, unknown> = {
    search: [input.search],
    searchType: SEARCH_TYPE[input.searchIn ?? 'ad_copy'] ?? 'adCopy',
    keywordMode: 'any',
    sortBy: input.sortBy ?? 'newest',
    order: input.order ?? 'desc',
    page,
    limit,
    platforms: ['facebook'],
    status: input.status ?? 'all',
  };
  if (input.mediaType) body.mediaType = input.mediaType;
  if (input.country) body.country = input.country;

  const res = await fetch(new URL('/v1/ads/query', cfg.baseUrl || DEFAULT_BASE), {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Source ${res.status}: ${t.slice(0, 200)}`);
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

/* ------------------------------- TikTok ---------------------------------- */
function mapTikTok(r: any): InspoAd {
  return {
    id: String(r.id),
    platform: 'tiktok',
    status: r.status ?? 'active',
    daysRunning: r.daysRunning ?? 0,
    mediaType: r.media?.type,
    thumbnailUrl: r.media?.thumbnailUrl,
    mediaUrl: r.media?.videoUrl || r.media?.mediaUrl,
    advertiserName: r.profile?.name || (r.profile?.handle ? '@' + r.profile.handle : undefined),
    advertiserId: r.profile?.id ? String(r.profile.id) : (r.profile?.handle || undefined),
    advertiserLogo: r.profile?.avatarUrl,
    liveAdsCount: r.pageSnapshot?.adsCount,
    body: r.content?.description,
    landingDomain: r.shop?.domain || undefined,
    mainCountry: undefined,
    views: r.metrics?.views,
    likes: r.metrics?.likes,
    engagementRate: r.metrics?.engagementRate,
  };
}

export interface SearchTikTokInput {
  search?: string; domain?: string; limit?: number; page?: number;
  type?: 'ad' | 'organic' | 'all'; mediaType?: 'video' | 'image' | 'carousel';
  sortBy?: string;
}
export async function ttSearchTikTok(cfg: TrendtrackConfig, input: SearchTikTokInput): Promise<SearchAdsResult> {
  const base = cfg.baseUrl || DEFAULT_BASE;
  const headers = { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json' };
  const limit = input.limit ?? 24;
  const page = input.page ?? 1;

  const body: Record<string, unknown> = {
    keywordMode: 'any', searchArea: 'all', type: input.type ?? 'ad',
    status: 'all', sortBy: input.sortBy ?? 'newest', order: 'desc', page, limit,
  };
  if (input.search) body.search = [input.search];
  if (input.domain) body.domain = input.domain;
  if (input.mediaType) body.mediaType = input.mediaType;

  // Meta/Google passent par POST /v1/<res>/query ; on tente le même schéma pour TikTok,
  // avec repli GET /v1/tiktok/library si le chemin POST n'existe pas.
  const candidates: Array<{ method: 'POST' | 'GET'; path: string }> = [
    { method: 'POST', path: '/v1/tiktok/library/query' },
    { method: 'POST', path: '/v1/tiktok/query' },
    { method: 'GET', path: '/v1/tiktok/library' },
  ];

  let lastErr = '';
  for (const c of candidates) {
    try {
      let res: Response;
      if (c.method === 'POST') {
        res = await fetch(new URL(c.path, base), { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      } else {
        const u = new URL(c.path, base);
        const set = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v)); };
        set('search', input.search); set('domain', input.domain); set('type', input.type ?? 'ad');
        set('status', 'all'); set('sortBy', input.sortBy ?? 'newest'); set('searchArea', 'all');
        set('mediaType', input.mediaType); set('page', page); set('limit', limit);
        res = await fetch(u, { headers, cache: 'no-store' });
      }
      if (res.status === 404 || res.status === 405) { lastErr = `${c.method} ${c.path} -> ${res.status}`; continue; }
      if (!res.ok) throw new Error(`Source (TikTok) ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      const json: any = await res.json();
      const rows: any[] = Array.isArray(json?.data) ? json.data : [];
      return { ads: rows.map(mapTikTok), total: json?.pagination?.total ?? rows.length };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(lastErr || 'Source indisponible');
}

/* ------------------------------- Google ---------------------------------- */
function mapGoogle(r: any): InspoAd {
  return {
    id: String(r.compositeAdId || r.adId),
    platform: 'google',
    status: r.isActive ? 'active' : 'inactive',
    daysRunning: r.servedDays ?? 0,
    mediaType: r.media?.kind || 'image',
    thumbnailUrl: r.media?.url,
    mediaUrl: r.media?.url,
    advertiserName: r.advertiser?.name || r.advertiser?.shopName,
    advertiserId: r.advertiser?.id ? String(r.advertiser.id) : undefined,
    advertiserLogo: r.advertiser?.logoUrl,
    liveAdsCount: r.advertiser?.liveAds?.all,
    body: undefined,
    landingDomain: r.advertiser?.domain,
    reach: r.reach?.value,
    format: r.media?.format || r.raw?.format,
    mainCountry: r.mainCountry,
  };
}

export interface SearchGoogleInput { search: string; limit?: number; page?: number; country?: string; sortBy?: 'newest' | 'longest-running' | 'impressions'; }
export async function ttSearchGoogle(cfg: TrendtrackConfig, input: SearchGoogleInput): Promise<SearchAdsResult> {
  const u = new URL('/v1/google-ads/query', cfg.baseUrl || DEFAULT_BASE);
  const filters: Record<string, unknown> = {};
  if (input.country) filters.country = [input.country];
  const body = {
    search: [input.search],
    page: input.page ?? 1,
    limit: input.limit ?? 24,
    sort: input.sortBy ?? 'newest',
    order: 'desc',
    filters,
  };
  const res = await fetch(u, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Source (Google) ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const json: any = await res.json();
  const rows: any[] = Array.isArray(json?.data) ? json.data : [];
  return { ads: rows.map(mapGoogle), total: json?.pagination?.total ?? rows.length };
}

/** Échantillon RÉEL (capturé via l'API) affiché tant qu'aucune clé n'est configurée. */
export const SAMPLE_INSPO_ADS: InspoAd[] = [
  {
    id: 'sample_oldspice', platform: 'meta', status: 'active', daysRunning: 41, mediaType: 'video',
    thumbnailUrl: 'https://medias.trendtrack.io/facebook/thumbnails/f5b236f2889c7c67156298837776aa45183059a071653c4e3d4b845880999363.jpg',
    mediaUrl: 'https://medias.trendtrack.io/facebook/video/0f3904b1b55df91b830fc1d5d387363de418f2c318896acbb410672f22c370d9.mp4',
    advertiserName: 'Old Spice.', advertiserLogo: 'https://medias.trendtrack.io/profile_picture/596698237104856.jpg',
    liveAdsCount: 56, body: 'POV: Deine Freundin klaut dir alles 🤣 … Coconut Vanilla & Aloe Rain',
    callToAction: null as unknown as undefined, landingDomain: undefined, reach: 15484761, estimatedSpend: 139363, reachDelta7d: 9296287, mainCountry: 'DE',
  },
  {
    id: 'sample_neutrogena', platform: 'meta', status: 'active', daysRunning: 143, mediaType: 'video',
    thumbnailUrl: 'https://medias.trendtrack.io/facebook/thumbnails/ffb8d519088ebec75ce83898bb8f068f6d2d56695ec506f3e33b67632d87c223.jpg',
    mediaUrl: 'https://medias.trendtrack.io/facebook/video/4324dc7891d62725b81ca4f88aa4338a246264dc262f9291a562b2291b168d1f.mp4',
    advertiserName: 'Neutrogena', advertiserLogo: 'https://medias.trendtrack.io/profile_picture/157448800978315.jpg',
    liveAdsCount: 22, body: 'Kennst du schon das Geheimnis von @tatemcrae für strahlend frische Haut? Hydro Boost Aqua Gel …',
    callToAction: 'ORDER NOW', landingDomain: 'amazon.de', reach: 16151675, estimatedSpend: 145365, reachDelta7d: 8918178, mainCountry: 'DE',
  },
];
