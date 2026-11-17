/**
 * Meta Marketing API · métriques QUOTIDIENNES au niveau annonce, plus la
 * structure de campagne (ad set, campagne, budget).
 *
 * Pourquoi un module à part de `meta-insights` : celui-ci sert l'Analytics et
 * remonte des agrégats sur 30 jours. ADSMAP a besoin d'autre chose · une ligne
 * PAR JOUR et PAR ANNONCE, plus le budget de chaque ad set. Sans ces deux
 * éléments, deux exigences du cahier des charges tombent :
 *
 *  - le contrôle de protocole (§6.2) compare les budgets quotidiens des ad sets
 *    d'un lot et la part de dépense de chaque annonce · impossible sans la
 *    structure ni le budget ;
 *  - la fenêtre d'évaluation (§6.3) et l'évolution sur sept jours (§7.2)
 *    supposent des lignes datées, pas une somme.
 *
 * `time_increment: 1` donne une ligne par jour. Le reste est de la pagination.
 */

import { BORNE_PAGES_META, TAILLE_PAGE_META, erreurLectureIncomplete, reprisePageMeta, suitePagination, type EchecPageMeta } from '@tiktrends/core';

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Une journée d'une annonce · correspond à une ligne de `metrics_daily`. */
export interface MetaDailyRow {
  adId: string;
  adName: string;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  date: string;                 // AAAA-MM-JJ
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  landingViews: number;
  addToCart: number;
  purchases: number;
  purchaseValue: number;
  video3s: number;
  thruplays: number;
  videoP25: number;
  videoP50: number;
  videoP75: number;
  videoP100: number;
}

/** Ad set d'un compte · le budget quotidien sert au contrôle de protocole. */
export interface MetaAdsetInfo {
  adsetId: string;
  name: string;
  campaignId: string | null;
  dailyBudget: number | null;    // en unité monétaire, pas en centimes
  lifetimeBudget: number | null;
  status: string | null;
  /** Vrai si le budget est piloté au niveau campagne (CBO) · le verdict s'en trouve dégradé. */
  campaignBudgetOptimization: boolean;
}

interface ActionRow { action_type: string; value: string }
type ActArr = ActionRow[] | undefined;

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Somme des actions d'un type. Meta renvoie plusieurs variantes du même
 * événement (`purchase`, `omni_purchase`, `offsite_conversion.fb_pixel_purchase`) :
 * on prend la plus spécifique disponible plutôt que de les additionner, sans quoi
 * un achat serait compté deux ou trois fois.
 */
function pickAction(arr: ActArr, ...types: string[]): number {
  for (const t of types) {
    const a = (arr || []).find((x) => x.action_type === t);
    if (a) return num(a.value);
  }
  // Repli : première action dont le type se termine par le libellé cherché.
  for (const t of types) {
    const a = (arr || []).find((x) => x.action_type.endsWith(t));
    if (a) return num(a.value);
  }
  return 0;
}

const normAct = (id: string): string => {
  const t = id.trim();
  return t.startsWith('act_') ? t : `act_${t.replace(/[^0-9]/g, '')}`;
};

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/** Meta renvoie les budgets en centimes (« minor units »). */
const fromMinor = (v: unknown): number | null => {
  const n = num(v);
  return n > 0 ? n / 100 : null;
};

interface Paged<T> { data: T[]; paging?: { next?: string; cursors?: { after?: string } } }
type ReponseGraph<T> = Paged<T> & { error?: { message: string; code?: number; is_transient?: boolean } };

/**
 * L'attente entre deux essais d'une même page · remplaçable par les tests
 * (aucune vraie attente dans un test), jamais ailleurs.
 */
export const horlogeMeta = { attendre: (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)) };

/**
 * Une page Graph, redemandée sur un échec PASSAGER (limite d'appels, réseau,
 * 5xx) selon `reprisePageMeta` · la même URL, donc le même curseur, toujours
 * valable. Une erreur de jeton ou de droits n'est jamais redemandée.
 */
async function pageGraph<T>(url: string, arete: string): Promise<ReponseGraph<T>> {
  for (let reprises = 0; ; reprises++) {
    let echec: EchecPageMeta;
    let erreur: Error;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      // Une passerelle en panne répond du HTML · illisible ici, l'échec reste celui du statut HTTP.
      const json = (await res.json().catch(() => null)) as ReponseGraph<T> | null;
      if (res.ok && json && !json.error) return json;
      erreur = new Error('Meta : ' + (json?.error?.message || `HTTP ${res.status}`));
      echec = { status: res.status, code: json?.error?.code ?? null, transitoire: json?.error?.is_transient === true, message: erreur.message };
    } catch (e) {
      // La requête n'a pas abouti (réseau, délai) · l'erreur d'origine, son message ne porte pas l'URL.
      erreur = e as Error;
      echec = { status: null, message: erreur.message };
    }
    const attente = reprisePageMeta(echec, reprises);
    if (attente === null) throw erreur;
    console.warn('[meta] page redemandée', JSON.stringify({ arete, reprise: reprises + 1, attenteMs: attente, status: echec.status, code: echec.code ?? null }));
    await horlogeMeta.attendre(attente);
  }
}

/**
 * Appel Graph avec pagination suivie, JUSQU'AU BOUT ou en échec · jamais un
 * jeu tronqué rendu comme complet. La règle (fin, page suivante, lecture
 * incomplète, reprise) et sa borne vivent dans `@tiktrends/core`
 * (`pagination-meta.ts`).
 *
 * Chaque page est CONVERTIE dès réception (`convertir`) et ses lignes brutes
 * relâchées · garder les brutes jusqu'à la fin coûtait 3 869 octets de tas par
 * ligne contre 550 convertie (mesuré, tableau dans `pagination-meta.ts`).
 *
 * L'URL `next` n'est jamais suivie : elle porte le jeton en clair et finirait
 * dans les journaux au moindre message d'erreur · on n'en reprend que le
 * paramètre de suite, avec notre jeton.
 */
async function graphAll<TBrut, T>(
  path: string, token: string, params: Record<string, string>,
  convertir: (r: TBrut) => T | null, borne = BORNE_PAGES_META,
): Promise<T[]> {
  const out: T[] = [];
  const arete = path.split('/').pop() ?? '';   // l'arête seulement (`insights`, `adsets`) · le chemin porte l'identifiant du compte
  let suite: Record<string, string> = {};
  for (let pagesLues = 1; ; pagesLues++) {
    const qs = new URLSearchParams({ ...params, ...suite, access_token: token, limit: String(TAILLE_PAGE_META) });
    const json = await pageGraph<TBrut>(`${GRAPH}/${path}?${qs.toString()}`, arete);
    for (const brute of json.data ?? []) {
      const r = convertir(brute);
      if (r !== null) out.push(r);
    }
    const s = suitePagination({ pagesLues, borne, next: json.paging?.next, after: json.paging?.cursors?.after });
    if (s.suite === 'fin') return out;
    if (s.suite === 'incomplete') {
      console.error('[meta] lecture incomplète', JSON.stringify({ arete, raison: s.raison, pages: pagesLues, lignes: out.length }));
      throw new Error(erreurLectureIncomplete(s.raison, pagesLues));
    }
    suite = s.params;
  }
}

interface DailyRaw {
  ad_id?: string; ad_name?: string; adset_id?: string; adset_name?: string;
  campaign_id?: string; campaign_name?: string; date_start?: string;
  spend?: string; impressions?: string; reach?: string; clicks?: string; inline_link_clicks?: string;
  actions?: ActArr; action_values?: ActArr;
  video_3_sec_watched_actions?: ActArr; video_thruplay_watched_actions?: ActArr;
  video_p25_watched_actions?: ActArr; video_p50_watched_actions?: ActArr;
  video_p75_watched_actions?: ActArr; video_p100_watched_actions?: ActArr;
}

const DAILY_FIELDS = [
  'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name',
  'spend', 'impressions', 'reach', 'clicks', 'inline_link_clicks',
  'actions', 'action_values',
  'video_3_sec_watched_actions', 'video_thruplay_watched_actions',
  'video_p25_watched_actions', 'video_p50_watched_actions',
  'video_p75_watched_actions', 'video_p100_watched_actions',
].join(',');

/** Convertit une ligne brute · tolérante aux champs absents (créa statique, etc.). */
export function toDailyRow(r: DailyRaw): MetaDailyRow | null {
  if (!r.ad_id || !r.date_start) return null;
  return {
    adId: r.ad_id,
    adName: r.ad_name || '(sans nom)',
    adsetId: r.adset_id ?? null,
    adsetName: r.adset_name ?? null,
    campaignId: r.campaign_id ?? null,
    campaignName: r.campaign_name ?? null,
    date: r.date_start,
    spend: num(r.spend),
    impressions: num(r.impressions),
    reach: num(r.reach),
    clicks: num(r.clicks),
    linkClicks: num(r.inline_link_clicks),
    landingViews: pickAction(r.actions, 'landing_page_view', 'omni_landing_page_view'),
    addToCart: pickAction(r.actions, 'omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'),
    purchases: pickAction(r.actions, 'omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'),
    purchaseValue: pickAction(r.action_values, 'omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'),
    video3s: pickAction(r.video_3_sec_watched_actions, 'video_view'),
    thruplays: pickAction(r.video_thruplay_watched_actions, 'video_view'),
    videoP25: pickAction(r.video_p25_watched_actions, 'video_view'),
    videoP50: pickAction(r.video_p50_watched_actions, 'video_view'),
    videoP75: pickAction(r.video_p75_watched_actions, 'video_view'),
    videoP100: pickAction(r.video_p100_watched_actions, 'video_view'),
  };
}

/**
 * Métriques quotidiennes par annonce sur une fenêtre.
 * `since` et `until` sont inclusives, au format AAAA-MM-JJ.
 */
export async function metaDailySync(
  adAccountId: string, token: string,
  opts: { since: Date; until: Date },
): Promise<MetaDailyRow[]> {
  return graphAll<DailyRaw, MetaDailyRow>(`${normAct(adAccountId)}/insights`, token, {
    level: 'ad',
    fields: DAILY_FIELDS,
    time_increment: '1',
    time_range: JSON.stringify({ since: ymd(opts.since), until: ymd(opts.until) }),
  }, toDailyRow);
}

interface AdsetRaw {
  id?: string; name?: string; campaign_id?: string; status?: string;
  daily_budget?: string; lifetime_budget?: string;
  campaign?: { daily_budget?: string; lifetime_budget?: string };
}

export function toAdsetInfo(r: AdsetRaw): MetaAdsetInfo | null {
  if (!r.id) return null;
  // Budget au niveau campagne : c'est la signature du CBO, qui rend les verdicts
  // absolus impossibles (§6.1). On le remonte pour pouvoir le DIRE au client.
  const cbo = !!(r.campaign?.daily_budget || r.campaign?.lifetime_budget);
  return {
    adsetId: r.id,
    name: r.name || '(sans nom)',
    campaignId: r.campaign_id ?? null,
    dailyBudget: fromMinor(r.daily_budget),
    lifetimeBudget: fromMinor(r.lifetime_budget),
    status: r.status ?? null,
    campaignBudgetOptimization: cbo,
  };
}

/** Ad sets du compte, avec leur budget · nécessaire au contrôle de protocole. */
export async function metaAdsetsSync(adAccountId: string, token: string): Promise<MetaAdsetInfo[]> {
  return graphAll<AdsetRaw, MetaAdsetInfo>(`${normAct(adAccountId)}/adsets`, token, {
    fields: 'id,name,campaign_id,status,daily_budget,lifetime_budget,campaign{daily_budget,lifetime_budget}',
  }, toAdsetInfo);
}
