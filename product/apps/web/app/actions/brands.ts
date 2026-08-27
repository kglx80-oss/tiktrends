'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { BRAND_COOKIE } from '../../lib/brands';
import { anthropicFromEnv, generateBrandProfile, type BrandProfileDraft } from '@tiktrends/ai';
import { fetchSiteText } from '../../lib/site-text';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { discoverShopify } from '../../lib/shopify';
import { extractBrandDA } from '../../lib/brand-da';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const lines = (v: FormDataEntryValue | null) => norm(v).split('\n').map((x) => x.trim()).filter(Boolean);
const commas = (v: FormDataEntryValue | null) => norm(v).split(',').map((x) => x.trim()).filter(Boolean);

/** Sélection de la marque active (tout membre) · pose un cookie, sans redirection. */
export async function setActiveBrand(brandId: string): Promise<void> {
  const s = await getSession();
  if (!s) return;
  const c = await cookies();
  if (!brandId) { c.delete(BRAND_COOKIE); return; }
  if (db) {
    const [b] = await db.select({ id: schema.brands.id }).from(schema.brands)
      .where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
    if (!b) return;
  }
  c.set(BRAND_COOKIE, brandId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
}

/* ===================== Génération IA du profil depuis le site ===================== */
export interface BrandDraftState { error?: string; draft?: BrandProfileDraft; cost?: number }

export async function generateBrandDraftAction(_prev: BrandDraftState, formData: FormData): Promise<BrandDraftState> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Action réservée aux administrateurs.' };

  const name = norm(formData.get('name'));
  const url = norm(formData.get('url'));
  if (!name) return { error: 'Indique au moins le nom de la marque.' };

  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur (clé manquante). Remplis le profil manuellement." };

  const cost = costFor('brief');
  const unlimited = unlimitedCredits(s.user.email);

  let siteText: string | undefined;
  if (url) { try { siteText = await fetchSiteText(url); } catch { /* on continue sans le contenu du site */ } }

  // Débit atomique avant l'appel IA (remboursé en cas d'échec).
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Marque · génération IA du profil'))) {
    return { error: `Crédits insuffisants (${cost} requis). Recharge depuis Crédits.` };
  }

  try {
    const draft = await generateBrandProfile(client, { name, url: url || undefined, siteText });
    return { draft, cost };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · profil de marque');
    return { error: 'Échec de la génération : ' + (e as Error).message };
  }
}

/* ===================== Création de marque (wizard complet) ===================== */
export async function createBrandAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/brands?e=forbidden');

  const name = norm(formData.get('name'));
  if (!name) redirect('/brands/new?e=name');

  const [b] = await db.insert(schema.brands).values({
    workspaceId: s.workspaceId,
    name,
    url: norm(formData.get('url')) || null,
    logoUrl: norm(formData.get('logoUrl')) || null,
    logos: commas(formData.get('logos')),
    industry: norm(formData.get('industry')) || null,
    description: norm(formData.get('description')) || null,
    usp: norm(formData.get('usp')) || null,
    audience: norm(formData.get('audience')) || null,
    category: norm(formData.get('category')) || null,
    categoryNeeds: norm(formData.get('categoryNeeds')) || null,
    moreAbout: norm(formData.get('moreAbout')) || null,
    tone: norm(formData.get('tone')) || null,
    industryTags: commas(formData.get('industryTags')),
    colors: commas(formData.get('colors')),
    fonts: commas(formData.get('fonts')),
    preferredWords: commas(formData.get('preferredWords')),
    avoidWords: commas(formData.get('avoidWords')),
    competitors: lines(formData.get('competitors')),
    languages: commas(formData.get('languages')),
  }).returning();

  if (b) {
    // Personas & scénarios (payloads JSON produits par le wizard).
    try {
      const personas = JSON.parse(norm(formData.get('personas')) || '[]') as Array<{ name?: string; description?: string; pains?: string[]; desires?: string[] }>;
      const rows = personas.filter((p) => p?.name?.trim()).map((p) => ({
        brandId: b.id, name: String(p.name).trim(), description: p.description ?? null,
        pains: Array.isArray(p.pains) ? p.pains : [], desires: Array.isArray(p.desires) ? p.desires : [],
      }));
      if (rows.length) await db.insert(schema.personas).values(rows);
    } catch { /* payload invalide : on ignore */ }
    try {
      const scen = JSON.parse(norm(formData.get('scenarios')) || '[]') as Array<{ title?: string; context?: string }>;
      const rows = scen.filter((x) => x?.title?.trim()).map((x) => ({ brandId: b.id, title: String(x.title).trim(), context: x.context ?? null }));
      if (rows.length) await db.insert(schema.scenarios).values(rows);
    } catch { /* payload invalide : on ignore */ }

    const c = await cookies();
    c.set(BRAND_COOKIE, b.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
    redirect(`/brands/${b.id}?ok=created`);
  }
  redirect('/brands?ok=1');
}

/** Crée une marque directement depuis une boutique Shopify : produits + images + DA. */
export async function createBrandFromShopifyAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/brands?e=forbidden');

  const domain = norm(formData.get('domain'));
  // D'où vient la demande : on renvoie l'erreur sur la page d'origine.
  const back = norm(formData.get('back')) === 'brands' ? '/brands' : '/brands/new';
  if (!domain) redirect(`${back}?e=shopify_domain`);

  // NB : redirect() lève une exception Next -> il doit rester hors du try/catch.
  const found = await discoverShopify(domain);
  if (!found) redirect(`${back}?e=shopify_notfound`);
  const { origin, products } = found!;

  // Nom de marque : vendor le plus fréquent, sinon le domaine.
  const host = origin.replace('https://', '');
  const vendorCount = new Map<string, number>();
  for (const p of products) if (p.vendor) vendorCount.set(p.vendor, (vendorCount.get(p.vendor) ?? 0) + 1);
  const topVendor = [...vendorCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const name = topVendor || host.replace(/^www\./, '').split('.')[0]!.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  let da: { logoUrl: string | null; colors: string[]; fonts: string[] } = { logoUrl: null, colors: [], fonts: [] };
  try { da = await extractBrandDA(origin); } catch { /* best-effort */ }

  const [b] = await db.insert(schema.brands).values({
    workspaceId: s.workspaceId, name, url: origin, shopifyDomain: host,
    logoUrl: da.logoUrl, colors: da.colors, fonts: da.fonts,
  }).returning({ id: schema.brands.id });

  if (b) {
    const rows = products.slice(0, 250).map((p) => ({
      brandId: b.id, name: p.title, description: p.description, price: p.price, url: p.url, imageUrl: p.imageUrl,
    }));
    if (rows.length) { try { await db.insert(schema.products).values(rows); } catch { /* ignore */ } }

    const c = await cookies();
    c.set(BRAND_COOKIE, b.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
    redirect(`/brands/${b.id}?ok=shopify&n=${rows.length}`);
  }
  redirect('/brands?ok=1');
}

/* ===================== Mise à jour du profil (page détail) ===================== */
export async function updateBrandAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/brands?e=forbidden');
  const id = norm(formData.get('id'));
  if (!id) redirect('/brands');

  const name = norm(formData.get('name'));
  await db.update(schema.brands).set({
    name: name || undefined,
    url: norm(formData.get('url')) || null,
    industry: norm(formData.get('industry')) || null,
    description: norm(formData.get('description')) || null,
    usp: norm(formData.get('usp')) || null,
    audience: norm(formData.get('audience')) || null,
    category: norm(formData.get('category')) || null,
    categoryNeeds: norm(formData.get('categoryNeeds')) || null,
    moreAbout: norm(formData.get('moreAbout')) || null,
    tone: norm(formData.get('tone')) || null,
    industryTags: commas(formData.get('industryTags')),
    colors: commas(formData.get('colors')),
    fonts: commas(formData.get('fonts')),
    preferredWords: commas(formData.get('preferredWords')),
    avoidWords: commas(formData.get('avoidWords')),
    competitors: lines(formData.get('competitors')),
    languages: commas(formData.get('languages')),
  }).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId)));
  redirect(`/brands/${id}?ok=saved`);
}

export async function renameBrandAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/brands?e=forbidden');
  const id = norm(formData.get('id'));
  const name = norm(formData.get('name'));
  if (id && name) await db.update(schema.brands).set({ name }).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId)));
  redirect('/brands?ok=renamed');
}

export async function deleteBrandAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/brands?e=forbidden');
  const id = norm(formData.get('id'));
  if (id) {
    await db.delete(schema.brands).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId)));
    const c = await cookies();
    if (c.get(BRAND_COOKIE)?.value === id) c.delete(BRAND_COOKIE);
  }
  redirect('/brands?ok=deleted');
}
