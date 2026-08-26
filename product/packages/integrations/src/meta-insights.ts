/**
 * Meta Marketing API · Insights (token système Business Manager + ad account).
 * Remonte les vraies performances pub (dépense, ROAS, top créas) pour nourrir l'analyse (et Jarvis).
 */
const GRAPH = 'https://graph.facebook.com/v21.0';

export interface MetaAdsInsights {
  accountName?: string;
  currency?: string;
  spend30d: number;
  purchases30d: number;
  revenue30d: number;
  roas30d: number;
  topAds: Array<{ name: string; spend: number; roas: number; purchases: number }>;
}

function normAct(id: string): string {
  const t = id.trim();
  return t.startsWith('act_') ? t : `act_${t.replace(/[^0-9]/g, '')}`;
}

async function graph<T>(path: string, token: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const json = await res.json() as { data?: T; error?: { message: string }; name?: string; currency?: string } & T;
  if (!res.ok || (json as { error?: unknown }).error) {
    const msg = (json as { error?: { message: string } }).error?.message || `HTTP ${res.status}`;
    throw new Error('Meta : ' + msg);
  }
  return json as T;
}

/** Teste la connexion : renvoie le nom du compte publicitaire. */
export async function metaAdsTest(adAccountId: string, token: string): Promise<{ accountName: string; currency: string }> {
  const d = await graph<{ name: string; currency: string }>(normAct(adAccountId), token, { fields: 'name,currency' });
  return { accountName: d.name, currency: d.currency };
}

const num = (v: unknown) => Number(v || 0);
function roasFrom(actions: Array<{ action_type: string; value: string }> | undefined, key: string): number {
  const a = (actions || []).find((x) => x.action_type === key || x.action_type.endsWith(key));
  return num(a?.value);
}

/** Synchronise les KPIs pub des 30 derniers jours + top créas par ROAS. */
export async function metaAdsSync(adAccountId: string, token: string): Promise<MetaAdsInsights> {
  const acct = normAct(adAccountId);
  const info = await metaAdsTest(acct, token).catch(() => ({ accountName: undefined as string | undefined, currency: undefined as string | undefined }));

  // Agrégat compte (30 j).
  type Row = { spend?: string; action_values?: Array<{ action_type: string; value: string }>; actions?: Array<{ action_type: string; value: string }>; ad_name?: string };
  const acc = await graph<{ data: Row[] }>(`${acct}/insights`, token, {
    date_preset: 'last_30d', level: 'account', fields: 'spend,actions,action_values',
  });
  const a0 = acc.data?.[0] || {};
  const spend = num(a0.spend);
  const revenue = roasFrom(a0.action_values, 'omni_purchase') || roasFrom(a0.action_values, 'purchase');
  const purchases = roasFrom(a0.actions, 'omni_purchase') || roasFrom(a0.actions, 'purchase');

  // Top créas par ROAS (30 j).
  const ads = await graph<{ data: Row[] }>(`${acct}/insights`, token, {
    date_preset: 'last_30d', level: 'ad', fields: 'ad_name,spend,actions,action_values', limit: '50',
  });
  const topAds = (ads.data || []).map((r) => {
    const rev = roasFrom(r.action_values, 'omni_purchase') || roasFrom(r.action_values, 'purchase');
    const sp = num(r.spend);
    return { name: r.ad_name || '(sans nom)', spend: Math.round(sp), roas: sp ? Math.round((rev / sp) * 100) / 100 : 0, purchases: roasFrom(r.actions, 'omni_purchase') || roasFrom(r.actions, 'purchase') };
  }).filter((x) => x.spend > 0).sort((a, b) => b.roas - a.roas).slice(0, 8);

  return {
    accountName: info.accountName, currency: info.currency,
    spend30d: Math.round(spend), purchases30d: Math.round(purchases), revenue30d: Math.round(revenue),
    roas30d: spend ? Math.round((revenue / spend) * 100) / 100 : 0, topAds,
  };
}
