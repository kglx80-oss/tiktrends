'use server';

import { refusListeConcurrents } from '@tiktrends/core';
import { forfaitEffectif, refusMarqueEspace } from '../../lib/droits-forfait';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { and, eq, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { BRAND_COOKIE } from '../../lib/brands';
import { policeTechnique, refusSuppressionMarque } from '@tiktrends/core';
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

/* ===================== Création de marque (wizard complet) ===================== */
export async function createBrandAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/brands?e=forbidden');

  const name = norm(formData.get('name'));
  if (!name) redirect('/brands/new?e=name');
  // Droits du forfait (29/10, point 6) · nombre de marques et de concurrents, refusés au serveur.
  if (await refusMarqueEspace(s.workspaceId, s.plan)) redirect('/brands?e=limite_marques');
  if (refusListeConcurrents(forfaitEffectif(s.plan), 0, lines(formData.get('competitors')).length)) redirect('/brands/new?e=limite_concurrents');

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
    fonts: commas(formData.get('fonts')).filter((f) => !policeTechnique(f)),
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
  if (await refusMarqueEspace(s.workspaceId, s.plan)) redirect('/brands?e=limite_marques');

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
  // Droits du forfait (29/10, point 6) · la liste des concurrents ne grandit pas au-delà de la limite.
  const [avant] = await db.select({ c: schema.brands.competitors }).from(schema.brands).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
  if (refusListeConcurrents(forfaitEffectif(s.plan), avant?.c?.length ?? 0, lines(formData.get('competitors')).length)) redirect(`/brands/${id}?e=limite_concurrents`);

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
    fonts: commas(formData.get('fonts')).filter((f) => !policeTechnique(f)),
    preferredWords: commas(formData.get('preferredWords')),
    avoidWords: commas(formData.get('avoidWords')),
    competitors: lines(formData.get('competitors')),
    languages: commas(formData.get('languages')),
  }).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId)));
  redirect(`/brands/${id}?ok=saved`);
}

export async function deleteBrandAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/brands?e=forbidden');
  const id = norm(formData.get('id'));
  if (id) {
    // Le studio protège son historique en RESTRICT ; ses traces d'exécution
    // suivent la marque (voir refusSuppressionMarque). Tout dans UNE
    // transaction : un refus n'efface rien.
    const refus = await db.transaction(async (tx) => {
      const compter = async (t: { brandId: AnyPgColumn; workspaceId: AnyPgColumn } & PgTable) =>
        (await tx.select({ n: sql<number>`count(*)::int` }).from(t).where(and(eq(t.brandId, id), eq(t.workspaceId, s.workspaceId))))[0]?.n ?? 0;
      const motif = refusSuppressionMarque({
        projets: await compter(schema.studioProjects), medias: await compter(schema.studioAssets),
        registre: await compter(schema.studioBudgetLedger), audit: await compter(schema.studioAuditEvents),
        prompts: await compter(schema.studioPromptVersions), restrictions: await compter(schema.studioMemberBrandScopes),
      });
      if (motif) return motif;
      await tx.delete(schema.studioPromptRuns).where(and(eq(schema.studioPromptRuns.brandId, id), eq(schema.studioPromptRuns.workspaceId, s.workspaceId)));
      await tx.delete(schema.brands).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId)));
      return null;
    });
    if (refus) redirect(`/brands?e=${refus}`);
    const c = await cookies();
    if (c.get(BRAND_COOKIE)?.value === id) c.delete(BRAND_COOKIE);
  }
  redirect('/brands?ok=deleted');
}
