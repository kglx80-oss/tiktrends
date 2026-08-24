'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { BRAND_COOKIE } from '../../lib/brands';
import { anthropicFromEnv, generateBrandProfile, fetchSiteText, type BrandProfileDraft } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits } from '../../lib/credits';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const lines = (v: FormDataEntryValue | null) => norm(v).split('\n').map((x) => x.trim()).filter(Boolean);
const commas = (v: FormDataEntryValue | null) => norm(v).split(',').map((x) => x.trim()).filter(Boolean);

/** Sélection de la marque active (tout membre) — pose un cookie, sans redirection. */
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
  if (db && !unlimited) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    if ((w?.c ?? 0) < cost) return { error: `Crédits insuffisants (${cost} requis). Recharge depuis Crédits.` };
  }

  let siteText: string | undefined;
  if (url) { try { siteText = await fetchSiteText(url); } catch { /* on continue sans le contenu du site */ } }

  try {
    const draft = await generateBrandProfile(client, { name, url: url || undefined, siteText });
    if (db && !unlimited) {
      try {
        const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
        await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, (w?.c ?? 0) - cost) }).where(eq(schema.workspaces.id, s.workspaceId));
        await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta: -cost, reason: 'Marque — génération IA du profil' });
      } catch { /* la génération reste livrée même si le débit échoue */ }
    }
    return { draft, cost };
  } catch (e) {
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
