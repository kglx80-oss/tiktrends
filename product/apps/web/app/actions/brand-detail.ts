'use server';

import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { anthropicFromEnv, generateProducts, generateBrandProfile, fetchSiteText } from '@tiktrends/ai';
import { falFromEnv, falGenerateImage } from '@tiktrends/integrations';
import { costFor, imageModelByKey } from '@tiktrends/core';
import { unlimitedCredits } from '../../lib/credits';
import { resolveProductImage } from '../../lib/product-image';
import { discoverShopify, normalizeShopDomain } from '../../lib/shopify';
import { extractBrandDA } from '../../lib/brand-da';

const has = (a?: unknown[] | null) => Array.isArray(a) && a.length > 0;
// Coercition robuste en tableau de chaînes (l'IA peut renvoyer une chaîne au lieu d'un tableau).
const asArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean)
  : typeof v === 'string' && v.trim() ? v.split(/[\n,]/).map((x) => x.trim()).filter(Boolean)
  : [];

/** Génère TOUT le profil depuis le site et l'enregistre (profil + personas + scénarios + concurrents). */
export async function generateFullBrandAction(formData: FormData): Promise<void> {
  const brandId = norm(formData.get('brandId'));
  const g = await guardBrand(brandId);
  if (!g || !db) redirect('/brands');

  const [b] = await db.select().from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!b) redirect('/brands');

  const client = anthropicFromEnv();
  if (!client) redirect(`/brands/${brandId}?tab=overview&e=ai`);

  const unlimited = unlimitedCredits(g.email);
  const cost = costFor('brief');
  if (!unlimited) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, g.workspaceId)).limit(1);
    if ((w?.c ?? 0) < cost) redirect(`/brands/${brandId}?tab=overview&e=credits`);
  }

  let siteText: string | undefined;
  if (b.url) { try { siteText = await fetchSiteText(b.url); } catch { /* on continue */ } }

  // NB : redirect() lève une exception spéciale Next · il doit rester HORS du try/catch.
  console.log(`[generateFullBrand] start brand=${b.name} url=${b.url ?? '-'} siteText=${siteText ? siteText.length + 'c' : 'none'}`);
  let errMsg = '';
  try {
    const d = await generateBrandProfile(client, { name: b.name, url: b.url || undefined, siteText });
    console.log(`[generateFullBrand] IA ok personas=${d.personas?.length ?? 0} scenarios=${d.scenarios?.length ?? 0}`);

    // On ne remplit que les champs vides (ne pas écraser ce que l'utilisateur a saisi).
    await db.update(schema.brands).set({
      description: b.description || d.description || null,
      usp: b.usp || d.usp || null,
      audience: b.audience || d.audience || null,
      category: b.category || d.category || null,
      categoryNeeds: b.categoryNeeds || d.categoryNeeds || null,
      tone: b.tone || d.tone || null,
      industryTags: has(b.industryTags) ? b.industryTags : asArr(d.industryTags),
      preferredWords: has(b.preferredWords) ? b.preferredWords : asArr(d.preferredWords),
      avoidWords: has(b.avoidWords) ? b.avoidWords : asArr(d.avoidWords),
      competitors: has(b.competitors) ? b.competitors : asArr(d.competitors),
    }).where(eq(schema.brands.id, brandId));

    // Personas / scénarios : on ne crée que s'il n'y en a pas encore.
    const personas = Array.isArray(d.personas) ? d.personas : [];
    const scenarios = Array.isArray(d.scenarios) ? d.scenarios : [];
    const [pc] = await db.select({ n: schema.personas.id }).from(schema.personas).where(eq(schema.personas.brandId, brandId)).limit(1);
    const pRows = personas.filter((p) => p?.name?.trim()).map((p) => ({
      brandId, name: String(p.name).trim(), description: p.description || null,
      pains: asArr(p.pains), desires: asArr(p.desires),
    }));
    if (!pc && pRows.length) await db.insert(schema.personas).values(pRows);
    const [sc] = await db.select({ n: schema.scenarios.id }).from(schema.scenarios).where(eq(schema.scenarios.brandId, brandId)).limit(1);
    const sRows = scenarios.filter((x) => x?.title?.trim()).map((x) => ({ brandId, title: String(x.title).trim(), context: x.context || null }));
    if (!sc && sRows.length) await db.insert(schema.scenarios).values(sRows);

    if (!unlimited) {
      try {
        const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, g.workspaceId)).limit(1);
        await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, (w?.c ?? 0) - cost) }).where(eq(schema.workspaces.id, g.workspaceId));
        await db.insert(schema.creditLedger).values({ workspaceId: g.workspaceId, delta: -cost, reason: 'Marque · génération complète du profil' });
      } catch { /* best-effort */ }
    }
  } catch (e) {
    errMsg = (e as Error)?.message || 'inconnue';
    console.error('[generateFullBrand] ERREUR:', errMsg);
  }

  if (errMsg) redirect(`/brands/${brandId}?tab=overview&e=generate&m=${encodeURIComponent(errMsg.slice(0, 160))}`);
  console.log('[generateFullBrand] succès, redirection');
  redirect(`/brands/${brandId}?tab=overview&ok=generated`);
}

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const commas = (v: FormDataEntryValue | null) => norm(v).split(',').map((x) => x.trim()).filter(Boolean);

/** Vérifie que la marque appartient bien au workspace de l'utilisateur admin. */
async function guardBrand(brandId: string): Promise<{ workspaceId: string; email: string | null } | null> {
  const s = await getSession();
  if (!s || !db) return null;
  if (!roleAtLeast(s.role, 'admin')) return null;
  const [b] = await db.select({ id: schema.brands.id }).from(schema.brands)
    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
  return b ? { workspaceId: s.workspaceId, email: s.user.email } : null;
}

/* ---------------- Personas ---------------- */
export async function addPersonaAction(formData: FormData): Promise<void> {
  const brandId = norm(formData.get('brandId'));
  const g = await guardBrand(brandId);
  if (!g || !db) redirect('/brands');
  const name = norm(formData.get('name'));
  if (name) {
    await db.insert(schema.personas).values({
      brandId, name, description: norm(formData.get('description')) || null,
      pains: commas(formData.get('pains')), desires: commas(formData.get('desires')),
    });
  }
  redirect(`/brands/${brandId}?tab=audience&ok=persona`);
}
export async function deletePersonaAction(formData: FormData): Promise<void> {
  const brandId = norm(formData.get('brandId'));
  const g = await guardBrand(brandId);
  if (!g || !db) redirect('/brands');
  const id = norm(formData.get('id'));
  if (id) await db.delete(schema.personas).where(and(eq(schema.personas.id, id), eq(schema.personas.brandId, brandId)));
  redirect(`/brands/${brandId}?tab=audience`);
}

/* ---------------- Scénarios ---------------- */
export async function addScenarioAction(formData: FormData): Promise<void> {
  const brandId = norm(formData.get('brandId'));
  const g = await guardBrand(brandId);
  if (!g || !db) redirect('/brands');
  const title = norm(formData.get('title'));
  if (title) await db.insert(schema.scenarios).values({ brandId, title, context: norm(formData.get('context')) || null });
  redirect(`/brands/${brandId}?tab=audience&ok=scenario`);
}
export async function deleteScenarioAction(formData: FormData): Promise<void> {
  const brandId = norm(formData.get('brandId'));
  const g = await guardBrand(brandId);
  if (!g || !db) redirect('/brands');
  const id = norm(formData.get('id'));
  if (id) await db.delete(schema.scenarios).where(and(eq(schema.scenarios.id, id), eq(schema.scenarios.brandId, brandId)));
  redirect(`/brands/${brandId}?tab=audience`);
}

/**
 * Génère une vignette d'illustration pour un scénario d'usage : le contexte devient
 * visuel, ce qui aide à choisir le bon décor avant de lancer une créa. Débite l'image.
 */
export async function generateScenarioImageAction(input: { brandId: string; scenarioId: string }): Promise<{ url?: string; error?: string }> {
  const g = await guardBrand(input.brandId);
  if (!g || !db) return { error: 'Accès refusé.' };
  const cfg = falFromEnv();
  if (!cfg) return { error: "La génération d'image n'est pas activée." };

  const [sc] = await db.select({ title: schema.scenarios.title, context: schema.scenarios.context })
    .from(schema.scenarios).where(and(eq(schema.scenarios.id, input.scenarioId), eq(schema.scenarios.brandId, input.brandId))).limit(1);
  if (!sc) return { error: 'Scénario introuvable.' };

  // Texte -> image : on laisse falGenerateImage choisir le modèle « texte » adapté.
  // (Forcer le modèle « /edit » sans image source ferait échouer l'appel.)
  const cost = imageModelByKey('nano').credits;
  const unlimited = unlimitedCredits(g.email);
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, g.workspaceId)).limit(1);
  if (!unlimited && (w?.c ?? 0) < cost) return { error: `Crédits insuffisants (${cost} requis).` };

  const prompt = `Photographie lifestyle réaliste illustrant ce contexte d'usage : ${sc.title}. ${sc.context || ''} `
    + 'Cadrage naturel, lumière douce et crédible, ambiance authentique. Aucun texte, aucun logo, aucune marque visible.';
  try {
    const { images } = await falGenerateImage(cfg, { prompt, aspectRatio: '1:1', count: 1 });
    const url = images?.[0];
    if (!url) return { error: 'Aucune image générée.' };
    await db.update(schema.scenarios).set({ imageUrl: url }).where(eq(schema.scenarios.id, input.scenarioId));
    if (!unlimited) try {
      // Débit ATOMIQUE : plusieurs visuels lancés en parallèle doivent tous être facturés.
      await db.update(schema.workspaces)
        .set({ creditsBalance: sql`greatest(0, ${schema.workspaces.creditsBalance} - ${cost})` })
        .where(eq(schema.workspaces.id, g.workspaceId));
      await db.insert(schema.creditLedger).values({ workspaceId: g.workspaceId, delta: -cost, reason: 'Marque · visuel de scénario' });
    } catch { /* débit best-effort */ }
    return { url };
  } catch (e) { return { error: (e as Error).message }; }
}

/* ---------------- Produits ---------------- */
export async function addProductAction(formData: FormData): Promise<void> {
  const brandId = norm(formData.get('brandId'));
  const g = await guardBrand(brandId);
  if (!g || !db) redirect('/brands');
  const name = norm(formData.get('name'));
  if (name) {
    const priceRaw = norm(formData.get('price'));
    const price = priceRaw ? Number(priceRaw.replace(',', '.')) : null;
    await db.insert(schema.products).values({
      brandId, name, description: norm(formData.get('description')) || null,
      usp: norm(formData.get('usp')) || null, url: norm(formData.get('url')) || null,
      price: price != null && !Number.isNaN(price) ? price : null,
    });
  }
  redirect(`/brands/${brandId}?tab=products&ok=product`);
}
export async function deleteProductAction(formData: FormData): Promise<void> {
  const brandId = norm(formData.get('brandId'));
  const g = await guardBrand(brandId);
  if (!g || !db) redirect('/brands');
  const id = norm(formData.get('id'));
  if (id) await db.delete(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.brandId, brandId)));
  redirect(`/brands/${brandId}?tab=products`);
}

const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Récupère la DA (logo, couleurs, polices) depuis le site et complète les champs vides. */
/** Enregistre la charte visuelle éditée à la main (logos, logo par défaut, couleurs, polices). */
export async function saveBrandDAAction(input: {
  brandId: string; logoUrl: string; logos: string[]; colors: string[]; fonts: string[];
}): Promise<{ ok?: true; error?: string }> {
  const g = await guardBrand(input.brandId);
  if (!g || !db) return { error: 'Accès refusé.' };
  const clean = (a: string[]) => (Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : []);
  await db.update(schema.brands).set({
    logoUrl: input.logoUrl.trim() || null,
    logos: clean(input.logos),
    colors: clean(input.colors),
    fonts: clean(input.fonts),
  }).where(eq(schema.brands.id, input.brandId));
  return { ok: true };
}

export async function importBrandDAAction(input: { brandId: string }): Promise<{ logoUrl?: string | null; colors?: string[]; fonts?: string[]; error?: string }> {
  const g = await guardBrand(input.brandId);
  if (!g || !db) return { error: 'Accès refusé.' };
  const [b] = await db.select({ url: schema.brands.url, shopifyDomain: schema.brands.shopifyDomain, logoUrl: schema.brands.logoUrl, colors: schema.brands.colors, fonts: schema.brands.fonts })
    .from(schema.brands).where(eq(schema.brands.id, input.brandId)).limit(1);
  if (!b) return { error: 'Marque introuvable.' };

  const site = b.url || (b.shopifyDomain ? `https://${b.shopifyDomain}` : '');
  if (!site) return { error: "Renseigne le site de la marque (ou connecte Shopify) pour récupérer la DA." };

  const da = await extractBrandDA(site);
  if (!da.logoUrl && !da.colors.length && !da.fonts.length) return { error: "Aucun élément de DA détecté sur le site. Tu peux renseigner logo/couleurs/polices manuellement." };

  const logoUrl = b.logoUrl || da.logoUrl || null;
  const colors = (b.colors && b.colors.length) ? b.colors : da.colors;
  const fonts = (b.fonts && b.fonts.length) ? b.fonts : da.fonts;
  await db.update(schema.brands).set({ logoUrl, colors, fonts }).where(eq(schema.brands.id, input.brandId));
  return { logoUrl, colors, fonts };
}

/** Connecte / synchronise la boutique Shopify : importe produits + images + prix depuis le catalogue public. */
export async function syncShopifyProductsAction(input: { brandId: string; domain?: string }): Promise<{ imported?: number; updated?: number; total?: number; error?: string }> {
  const g = await guardBrand(input.brandId);
  if (!g || !db) return { error: 'Accès refusé.' };
  const [b] = await db.select({ url: schema.brands.url, shopifyDomain: schema.brands.shopifyDomain }).from(schema.brands).where(eq(schema.brands.id, input.brandId)).limit(1);
  if (!b) return { error: 'Marque introuvable.' };

  const domainInput = (input.domain || b.shopifyDomain || b.url || '').trim();
  if (!normalizeShopDomain(domainInput)) return { error: "Indique le domaine de ta boutique (ex : ta-marque.com ou ta-marque.myshopify.com)." };

  const found = await discoverShopify(domainInput);
  if (!found) return { error: `Catalogue Shopify introuvable sur ${domainInput.replace(/^https?:\/\//, '')}. Essaie le domaine .myshopify.com de ta boutique. Si ton catalogue public est désactivé, dis-le-moi et on passe par un jeton Storefront.` };
  const { origin, products } = found;

  // Mémorise le domaine connecté (celui qui a répondu).
  await db.update(schema.brands).set({ shopifyDomain: origin.replace('https://', '') }).where(eq(schema.brands.id, input.brandId));

  const existing = await db.select({ id: schema.products.id, name: schema.products.name }).from(schema.products).where(eq(schema.products.brandId, input.brandId));
  const byName = new Map(existing.map((e) => [normName(e.name), e.id]));

  let imported = 0, updated = 0;
  for (const p of products.slice(0, 250)) {
    const key = normName(p.title);
    const id = byName.get(key);
    const values = { name: p.title, description: p.description, price: p.price, url: p.url, imageUrl: p.imageUrl };
    try {
      if (id) { await db.update(schema.products).set(values).where(eq(schema.products.id, id)); updated++; }
      else { await db.insert(schema.products).values({ brandId: input.brandId, ...values }); imported++; byName.set(key, 'x'); }
    } catch { /* ignore la ligne */ }
  }
  return { imported, updated, total: products.length };
}

/** Import IA des produits depuis le site de la marque (gated + débit crédits). */
export async function importProductsAction(formData: FormData): Promise<void> {
  const brandId = norm(formData.get('brandId'));
  const g = await guardBrand(brandId);
  if (!g || !db) redirect('/brands');

  const [brand] = await db.select({ url: schema.brands.url, name: schema.brands.name }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!brand?.url) redirect(`/brands/${brandId}?tab=products&e=nourl`);

  const client = anthropicFromEnv();
  if (!client) redirect(`/brands/${brandId}?tab=products&e=ai`);

  const cost = costFor('brief');
  const unlimited = unlimitedCredits(g.email);
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, g.workspaceId)).limit(1);
  if (!unlimited && (w?.c ?? 0) < cost) redirect(`/brands/${brandId}?tab=products&e=credits`);

  let siteText: string | undefined;
  try { siteText = await fetchSiteText(brand.url); } catch { /* on tente quand même */ }

  try {
    const products = await generateProducts(client, { name: brand.name, url: brand.url, siteText });
    const rows = products.filter((p) => p.name?.trim()).slice(0, 30).map((p) => ({
      brandId, name: p.name.trim(), description: p.description || null, usp: p.usp || null,
      url: p.url || null, price: typeof p.price === 'number' ? p.price : null,
    }));
    if (rows.length) {
      const inserted = await db.insert(schema.products).values(rows).returning({ id: schema.products.id, name: schema.products.name, url: schema.products.url });
      // Récupération best-effort de la photo de chaque produit depuis le site.
      await Promise.all(inserted.map(async (p) => {
        if (!p.url && !brand.url) return;
        const img = await resolveProductImage({ productName: p.name, productUrl: p.url, siteUrl: brand.url });
        if (img) { try { await db!.update(schema.products).set({ imageUrl: img }).where(eq(schema.products.id, p.id)); } catch { /* ignore */ } }
      }));
    }
    if (!unlimited) try {
      await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, (w?.c ?? 0) - cost) }).where(eq(schema.workspaces.id, g.workspaceId));
      await db.insert(schema.creditLedger).values({ workspaceId: g.workspaceId, delta: -cost, reason: 'Marque · import produits IA' });
    } catch { /* débit best-effort */ }
    redirect(`/brands/${brandId}?tab=products&ok=imported&n=${rows.length}`);
  } catch {
    redirect(`/brands/${brandId}?tab=products&e=import`);
  }
}
