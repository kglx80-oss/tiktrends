/**
 * Shopify Admin API (app personnalisée · token shpat_...).
 * Remonte les vraies données commerce d'une boutique pour nourrir l'analyse (et Jarvis).
 */
const API_VERSION = '2024-10';

export interface ShopifyCommerceInsights {
  shopName: string;
  currency: string;
  orders30d: number;
  revenue30d: number;
  aov30d: number;                 // panier moyen
  topProducts: Array<{ title: string; units: number; revenue: number }>;
}

function normDomain(domain: string): string {
  return domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

async function adminGraphQL<T>(domain: string, token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${normDomain(domain)}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}${res.status === 401 ? ' · token invalide' : ''}`);
  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error('Shopify : ' + json.errors.map((e) => e.message).join(', '));
  if (!json.data) throw new Error('Réponse Shopify vide.');
  return json.data;
}

/** Teste la connexion et renvoie le nom de la boutique. */
export async function shopifyAdminTest(domain: string, token: string): Promise<{ shopName: string; currency: string }> {
  const d = await adminGraphQL<{ shop: { name: string; currencyCode: string } }>(domain, token, `{ shop { name currencyCode } }`);
  return { shopName: d.shop.name, currency: d.shop.currencyCode };
}

/** Synchronise les KPIs commerce des 30 derniers jours + top produits. */
export async function shopifyCommerceSync(domain: string, token: string): Promise<ShopifyCommerceInsights> {
  const shop = await shopifyAdminTest(domain, token);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  // Commandes payées des 30 derniers jours (jusqu'à 250, suffisant pour un KPI de test).
  const q = `query($q: String!) {
    orders(first: 250, query: $q, sortKey: CREATED_AT, reverse: true) {
      edges { node {
        currentTotalPriceSet { shopMoney { amount } }
        lineItems(first: 20) { edges { node { title quantity originalTotalSet { shopMoney { amount } } } } }
      } }
    }
  }`;
  const data = await adminGraphQL<{ orders: { edges: Array<{ node: {
    currentTotalPriceSet: { shopMoney: { amount: string } };
    lineItems: { edges: Array<{ node: { title: string; quantity: number; originalTotalSet: { shopMoney: { amount: string } } } }> };
  } }> } }>(domain, token, q, { q: `created_at:>=${since} financial_status:paid` });

  const orders = data.orders.edges;
  let revenue = 0;
  const prod = new Map<string, { units: number; revenue: number }>();
  for (const { node } of orders) {
    revenue += Number(node.currentTotalPriceSet?.shopMoney?.amount || 0);
    for (const li of node.lineItems.edges) {
      const t = li.node.title;
      const cur = prod.get(t) || { units: 0, revenue: 0 };
      cur.units += li.node.quantity || 0;
      cur.revenue += Number(li.node.originalTotalSet?.shopMoney?.amount || 0);
      prod.set(t, cur);
    }
  }
  const topProducts = [...prod.entries()].map(([title, v]) => ({ title, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const orders30d = orders.length;
  return {
    shopName: shop.shopName, currency: shop.currency,
    orders30d, revenue30d: Math.round(revenue), aov30d: orders30d ? Math.round(revenue / orders30d) : 0,
    topProducts,
  };
}
