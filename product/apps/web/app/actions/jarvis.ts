'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { anthropicFromEnv, proposeJarvisRules, distillWinningPatterns, type WinningAdSummary } from '@tiktrends/ai';
import { ttSearchAds, type InspoAd } from '@tiktrends/integrations';
import { costFor } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { getActiveBrand } from '../../lib/brands';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { logAndTranslate } from '../../lib/user-error';

/** Enregistre les règles créatives maison (Jarvis) de la marque active. Injectées dans chaque génération. */
export async function saveJarvisRulesAction(input: { creativeRules: string }): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Action réservée aux administrateurs.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active.' };
  const rules = (input.creativeRules || '').slice(0, 4000);
  await db.update(schema.brands).set({ creativeRules: rules || null }).where(eq(schema.brands.id, brand.id));
  return { ok: true };
}

function textFromSnapshot(snap: unknown): string | null {
  if (!snap || typeof snap !== 'object') return null;
  const o = snap as Record<string, unknown>;
  const cand = [o.headline, o.primaryText, o.body, o.text, o.caption, o.title].find((x) => typeof x === 'string' && (x as string).trim().length > 8);
  return (cand as string) ?? null;
}

/**
 * Jarvis rédige lui-même un règlement créatif puissant en analysant la marque + les concurrents
 * + les pubs qui fonctionnent. Retourne une proposition (non enregistrée). Débite 5 crédits (brief).
 */
export async function proposeJarvisRulesAction(): Promise<{ rules?: string; cost?: number; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Action réservée aux administrateurs.' };
  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active.' };

  const [b] = await db.select().from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  if (!b) return { error: 'Marque introuvable.' };

  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('brief', 1);

  const saved = await db.select({ snapshot: schema.savedAds.snapshot }).from(schema.savedAds).where(eq(schema.savedAds.workspaceId, s.workspaceId)).limit(20);
  const winningCopy = saved.map((r) => textFromSnapshot(r.snapshot)).filter((x): x is string => !!x);

  // Débit atomique juste avant l'appel payant (remboursé si l'IA échoue) : vérifier
  // puis débiter en deux temps laissait deux requêtes simultanées passer pour un débit.
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Jarvis · rédaction des règles (IA)'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }

  let rules: string;
  try {
    rules = await proposeJarvisRules(client, {
      brand: b.name, category: b.category ?? b.industry ?? undefined, audience: b.audience ?? undefined,
      usp: b.usp ?? undefined, tone: b.tone ?? undefined,
      preferredWords: (b.preferredWords ?? []).join(', ') || undefined, avoidWords: (b.avoidWords ?? []).join(', ') || undefined,
      competitors: b.competitors ?? undefined, winningCopy,
    });
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · règles Jarvis');
    return { error: logAndTranslate('jarvis:rules', e, { subject: 'la rédaction des règles' }) };
  }
  if (!rules.trim()) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · règles Jarvis');
    return { error: "Aucune proposition n'a pu être générée." };
  }
  return { rules, cost: unlimited ? 0 : cost };
}

const toWinning = (a: InspoAd): WinningAdSummary => ({ advertiser: a.advertiserName, body: a.body, cta: a.callToAction, daysRunning: a.daysRunning, reach: a.reach, mediaType: a.mediaType });

/**
 * Entraîne Jarvis : récupère des pubs qui PERFORMENT (concurrents + niche) via la veille,
 * distille les patterns gagnants et les enregistre · injectés ensuite dans chaque génération.
 * Débite 20 crédits (analyse lourde).
 */
export async function trainJarvisAction(): Promise<{ learnings?: string; adsAnalyzed?: number; cost?: number; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Action réservée aux administrateurs.' };
  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active.' };
  const [b] = await db.select().from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  if (!b) return { error: 'Marque introuvable.' };

  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('review_mining', 1);
  // Pré-contrôle informatif : la collecte du corpus ci-dessous est gratuite et peut
  // s'arrêter d'elle-même, donc le vrai débit (atomique) attend l'appel IA.
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
  if (!unlimited && (w?.c ?? 0) < cost) return { error: `Crédits insuffisants (${cost} requis).` };

  // 1) Récupère un corpus de pubs performantes : concurrents (par marque) + niche (par ad copy).
  const apiKey = process.env.TRENDTRACK_API_KEY;
  const ads: WinningAdSummary[] = [];
  if (apiKey) {
    const competitors = (b.competitors ?? []).slice(0, 4);
    const niche = [b.category, b.industry].filter(Boolean)[0] as string | undefined;
    const queries: Array<{ search: string; searchIn: 'brand' | 'ad_copy' }> = [
      ...competitors.map((c) => ({ search: c, searchIn: 'brand' as const })),
      ...(niche ? [{ search: niche, searchIn: 'ad_copy' as const }] : []),
    ];
    for (const q of queries) {
      try {
        const r = await ttSearchAds({ apiKey }, { search: q.search, searchIn: q.searchIn, status: 'all', sortBy: 'longestRunning', order: 'desc', limit: 12, offset: 0 });
        ads.push(...r.ads.map(toWinning));
      } catch { /* on continue */ }
    }
  }

  // 2) Complément : copy des pubs sauvegardées (veille interne).
  const saved = await db.select({ snapshot: schema.savedAds.snapshot }).from(schema.savedAds).where(eq(schema.savedAds.workspaceId, s.workspaceId)).limit(20);
  for (const r of saved) { const t = textFromSnapshot(r.snapshot); if (t) ads.push({ body: t, daysRunning: 0 }); }

  // 3) NOS vraies performances (Meta Ads) : nos créas qui convertissent = signal le plus fort.
  const metaTop = (b.adsInsights as { topAds?: Array<{ name: string; roas: number; purchases: number }> } | null)?.topAds ?? [];
  for (const a of metaTop.slice(0, 8)) {
    if (a.roas > 0) ads.push({ advertiser: b.name, body: `NOTRE créa qui performe : « ${a.name} » · ROAS ${a.roas}x, ${a.purchases} achats.`, reach: Math.round(a.roas * 1000), daysRunning: 30 });
  }
  // Contexte produits qui vendent (Shopify).
  const commerceTop = (b.commerceInsights as { topProducts?: Array<{ title: string; revenue: number }> } | null)?.topProducts ?? [];
  const bestSellers = commerceTop.slice(0, 5).map((p) => p.title);

  const uniq = ads.filter((a) => (a.body || '').trim().length > 8);
  if (uniq.length < 3) return { error: apiKey ? "Pas assez de pubs performantes trouvées. Ajoute des concurrents à la marque, ou sauvegarde des pubs dans la Veille." : "Veille non branchée (clé serveur) et trop peu de pubs sauvegardées pour entraîner Jarvis." };

  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Jarvis · entraînement (veille)'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }

  let learnings: string;
  try {
    const cat = [b.category ?? b.industry ?? undefined, bestSellers.length ? `Produits phares (à mettre en avant) : ${bestSellers.join(', ')}` : undefined].filter(Boolean).join('. ') || undefined;
    learnings = await distillWinningPatterns(client, { brand: b.name, category: cat, audience: b.audience ?? undefined }, uniq);
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · entraînement Jarvis');
    return { error: logAndTranslate('jarvis:train', e, { subject: 'l’entraînement de Jarvis' }) };
  }
  if (!learnings.trim()) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · entraînement Jarvis');
    return { error: "La distillation n'a rien produit, réessaie." };
  }

  await db.update(schema.brands).set({ jarvisLearnings: learnings.slice(0, 4000), jarvisTrainedAt: new Date() }).where(eq(schema.brands.id, brand.id));
  return { learnings, adsAnalyzed: uniq.length, cost: unlimited ? 0 : cost };
}

/** Enregistre / édite manuellement les learnings Jarvis. */
export async function saveJarvisLearningsAction(input: { learnings: string }): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Action réservée aux administrateurs.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active.' };
  await db.update(schema.brands).set({ jarvisLearnings: (input.learnings || '').slice(0, 4000) || null }).where(eq(schema.brands.id, brand.id));
  return { ok: true };
}
