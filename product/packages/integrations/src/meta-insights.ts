/**
 * Meta Marketing API · Insights (token système Business Manager + ad account).
 * Remonte les vraies performances pub (dépense, ROAS, CPA, AOV, CPC, CPM, top créas)
 * sur 30 jours + période précédente pour les variations. Nourrit l'Analytics et Jarvis.
 */
const GRAPH = 'https://graph.facebook.com/v21.0';

export interface MetaKpiSet {
  spend: number; revenue: number; purchases: number; roas: number; cpa: number; aov: number;
  impressions: number; clicks: number; linkClicks: number; cpcAll: number; cpcLink: number; cpm: number; ctr: number;
}
export interface MetaAdsInsights {
  accountName?: string;
  currency?: string;
  window: MetaKpiSet;    // 30 derniers jours
  previous: MetaKpiSet;  // 30 jours précédents
  topAds: Array<{ name: string; spend: number; roas: number; purchases: number; cpa: number }>;
  // Rétro-compat (anciens champs plats lus ailleurs).
  spend30d: number; purchases30d: number; revenue30d: number; roas30d: number;
}

function normAct(id: string): string {
  const t = id.trim();
  return t.startsWith('act_') ? t : `act_${t.replace(/[^0-9]/g, '')}`;
}

async function graph<T>(path: string, token: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const json = await res.json() as T & { error?: { message: string } };
  if (!res.ok || json.error) throw new Error('Meta : ' + (json.error?.message || `HTTP ${res.status}`));
  return json;
}

export async function metaAdsTest(adAccountId: string, token: string): Promise<{ accountName: string; currency: string }> {
  const d = await graph<{ name: string; currency: string }>(normAct(adAccountId), token, { fields: 'name,currency' });
  return { accountName: d.name, currency: d.currency };
}

const num = (v: unknown) => Number(v || 0);
type ActArr = Array<{ action_type: string; value: string }> | undefined;
function pick(arr: ActArr, key: string): number {
  const a = (arr || []).find((x) => x.action_type === key || x.action_type.endsWith(key));
  return num(a?.value);
}
interface Row { spend?: string; impressions?: string; clicks?: string; inline_link_clicks?: string; cpm?: string; ctr?: string; actions?: ActArr; action_values?: ActArr; ad_name?: string }

function kpiFromRow(r: Row | undefined): MetaKpiSet {
  const spend = num(r?.spend);
  const impressions = num(r?.impressions);
  const clicks = num(r?.clicks);
  const linkClicks = num(r?.inline_link_clicks);
  const revenue = pick(r?.action_values, 'omni_purchase') || pick(r?.action_values, 'purchase');
  const purchases = pick(r?.actions, 'omni_purchase') || pick(r?.actions, 'purchase');
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    spend: Math.round(spend), revenue: Math.round(revenue), purchases: Math.round(purchases),
    roas: spend ? r2(revenue / spend) : 0, cpa: purchases ? r2(spend / purchases) : 0, aov: purchases ? r2(revenue / purchases) : 0,
    impressions, clicks, linkClicks,
    cpcAll: clicks ? r2(spend / clicks) : 0, cpcLink: linkClicks ? r2(spend / linkClicks) : 0,
    cpm: r?.cpm ? r2(num(r.cpm)) : (impressions ? r2((spend / impressions) * 1000) : 0),
    ctr: r?.ctr ? r2(num(r.ctr)) : (impressions ? r2((clicks / impressions) * 100) : 0),
  };
}

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

/** Synchronise les KPIs pub (30 j + période précédente) + top créas par ROAS. */
export async function metaAdsSync(adAccountId: string, token: string): Promise<MetaAdsInsights> {
  const acct = normAct(adAccountId);
  const info = await metaAdsTest(acct, token).catch(() => ({ accountName: undefined as string | undefined, currency: undefined as string | undefined }));
  const fields = 'spend,impressions,clicks,inline_link_clicks,cpm,ctr,actions,action_values';

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d60 = new Date(now.getTime() - 60 * 86_400_000);
  const d31 = new Date(now.getTime() - 31 * 86_400_000);

  const [cur, prev, ads] = await Promise.all([
    graph<{ data: Row[] }>(`${acct}/insights`, token, { level: 'account', fields, time_range: JSON.stringify({ since: ymd(d30), until: ymd(now) }) }),
    graph<{ data: Row[] }>(`${acct}/insights`, token, { level: 'account', fields, time_range: JSON.stringify({ since: ymd(d60), until: ymd(d31) }) }).catch(() => ({ data: [] as Row[] })),
    graph<{ data: Row[] }>(`${acct}/insights`, token, { level: 'ad', fields: 'ad_name,' + fields, time_range: JSON.stringify({ since: ymd(d30), until: ymd(now) }), limit: '50' }).catch(() => ({ data: [] as Row[] })),
  ]);

  const window = kpiFromRow(cur.data?.[0]);
  const previous = kpiFromRow(prev.data?.[0]);
  const topAds = (ads.data || []).map((r) => {
    const k = kpiFromRow(r);
    return { name: r.ad_name || '(sans nom)', spend: k.spend, roas: k.roas, purchases: k.purchases, cpa: k.cpa };
  }).filter((x) => x.spend > 0).sort((a, b) => b.roas - a.roas).slice(0, 12);

  return {
    accountName: info.accountName, currency: info.currency, window, previous, topAds,
    spend30d: window.spend, purchases30d: window.purchases, revenue30d: window.revenue, roas30d: window.roas,
  };
}
