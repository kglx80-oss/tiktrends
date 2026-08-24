'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { anthropicFromEnv, generateProducts, generateBrandProfile, fetchSiteText } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits } from '../../lib/credits';
import { extractProductImageUrl } from '../../lib/product-image';

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

  // NB : redirect() lève une exception spéciale Next — il doit rester HORS du try/catch.
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
        await db.insert(schema.creditLedger).values({ workspaceId: g.workspaceId, delta: -cost, reason: 'Marque — génération complète du profil' });
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
      const inserted = await db.insert(schema.products).values(rows).returning({ id: schema.products.id, url: schema.products.url });
      // Récupération best-effort de la photo depuis la fiche de chaque produit (og:image).
      await Promise.all(inserted.map(async (p) => {
        const page = (p.url || brand.url || '').trim();
        if (!page) return;
        const img = await extractProductImageUrl(page, { validate: true });
        if (img) { try { await db!.update(schema.products).set({ imageUrl: img }).where(eq(schema.products.id, p.id)); } catch { /* ignore */ } }
      }));
    }
    if (!unlimited) try {
      await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, (w?.c ?? 0) - cost) }).where(eq(schema.workspaces.id, g.workspaceId));
      await db.insert(schema.creditLedger).values({ workspaceId: g.workspaceId, delta: -cost, reason: 'Marque — import produits IA' });
    } catch { /* débit best-effort */ }
    redirect(`/brands/${brandId}?tab=products&ok=imported&n=${rows.length}`);
  } catch {
    redirect(`/brands/${brandId}?tab=products&e=import`);
  }
}
