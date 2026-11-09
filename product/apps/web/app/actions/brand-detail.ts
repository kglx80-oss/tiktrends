'use server';

import { plafonnerConcurrents, type CleForfait } from '@tiktrends/core';
import { forfaitEffectif } from '../../lib/droits-forfait';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { generateProducts, generateBrandProfile, extractVisualDa } from '@tiktrends/ai';
import { fetchSiteText } from '../../lib/site-text';
import { falFromEnv, falGenerateImage, storageFromEnv, basePubliqueStockage, ecrireApresDepot, lireDebutObjetEspace } from '@tiktrends/integrations';
import { TEXTES_REFUS_JETON_DEPOT, costFor, decisionCharteDeposee, decisionLogoDeposeRelu, empreintesLogosCharte, imageModelByKey, OCTETS_RELUS_DEPOT, policeTechnique, type DaVisuelleMarque } from '@tiktrends/core';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { resolveProductImage } from '../../lib/product-image';
import { discoverShopify, normalizeShopDomain } from '../../lib/shopify';
import { extractBrandDA } from '../../lib/brand-da';
import { brandMediaPreview } from '../../lib/brand-media-url';
import { logAndTranslate } from '../../lib/error-log';
import { guardedAnthropic, sousPlafond } from '../../lib/spend-guard';
import { GUARD } from '../../lib/guard-error';
import { lireJetonDepot } from '../../lib/jeton-depot';
import { cleDeDepot, referencesDans, retirerDepotsSousVerrou, verrouDepot } from '../../lib/verrou-depot';
import { referencesObjetEnBase } from '../../lib/references-objet';
import { invalidateJarvisMemory } from '../../lib/jarvis-memory';
import { REFUS_PERSONA_INTROUVABLE, rangsApres, rangsAEcrire, validerPersona, type ChampPersona } from '@tiktrends/core';
import { revalidatePath } from 'next/cache';

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

  const client = guardedAnthropic({ workspaceId: g.workspaceId, action: 'brand-detail' });
  if (!client) redirect(`/brands/${brandId}?tab=overview&e=ai`);

  const unlimited = unlimitedCredits(g.email);
  const cost = costFor('brief');
  // Débit atomique avant l'appel IA (remboursé plus bas si la génération échoue).
  if (!unlimited && !(await reserveCredits(g.workspaceId, cost, 'Marque · génération complète du profil'))) {
    redirect(`/brands/${brandId}?tab=overview&e=credits`);
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
      competitors: has(b.competitors) ? b.competitors : plafonnerConcurrents(g.plan, asArr(d.competitors)), // droits du forfait (29/10, point 6)
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

  } catch (e) {
    errMsg = (e as Error)?.message || 'inconnue';
    console.error('[generateFullBrand] ERREUR:', errMsg);
    if (!unlimited) await refundCredits(g.workspaceId, cost, 'Remboursement · profil de marque');
  }

  if (errMsg) redirect(`/brands/${brandId}?tab=overview&e=generate&m=${encodeURIComponent(errMsg.slice(0, 160))}`);
  console.log('[generateFullBrand] succès, redirection');
  redirect(`/brands/${brandId}?tab=overview&ok=generated`);
}

/**
 * Analyse le STYLE du site (LLM) et le range dans brandKit · la génération le lit
 * et le tourne en contrainte de DA sur chaque créa. Dépense IA · même barrière
 * que le profil (guardedAnthropic + reserveCredits), prix annoncé côté bouton.
 */
export async function extractBrandVisualDaAction(formData: FormData): Promise<void> {
  const brandId = norm(formData.get('brandId'));
  const g = await guardBrand(brandId);
  if (!g || !db) redirect('/brands');

  const [b] = await db.select().from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!b) redirect('/brands');

  // Barrière de dépense · aucune sortie IA si le plafond est atteint.
  const client = guardedAnthropic({ workspaceId: g.workspaceId, action: 'brand-detail' });
  if (!client) redirect(`/brands/${brandId}?tab=overview&e=ai`);

  const unlimited = unlimitedCredits(g.email);
  const cost = costFor('brief');
  // Débit atomique AVANT l'appel IA · remboursé si l'analyse échoue.
  if (!unlimited && !(await reserveCredits(g.workspaceId, cost, 'Marque · analyse du style du site'))) {
    redirect(`/brands/${brandId}?tab=overview&e=credits`);
  }

  let siteText: string | undefined;
  if (b.url) { try { siteText = await fetchSiteText(b.url); } catch { /* on continue sans le contenu */ } }

  // redirect() lève une exception Next · il reste HORS du try/catch.
  let errMsg = '';
  try {
    const da = await extractVisualDa(client, {
      name: b.name, url: b.url || undefined, siteText,
      colors: Array.isArray(b.colors) ? b.colors : undefined,
    });
    // Rangée dans brandKit (jsonb) · la génération la lit déjà (#485).
    await db.update(schema.brands).set({ brandKit: da }).where(eq(schema.brands.id, brandId));
  } catch (e) {
    errMsg = (e as Error)?.message || 'inconnue';
    if (!unlimited) await refundCredits(g.workspaceId, cost, 'Remboursement · analyse du style');
  }

  if (errMsg) redirect(`/brands/${brandId}?tab=overview&e=generate&m=${encodeURIComponent(errMsg.slice(0, 160))}`);
  redirect(`/brands/${brandId}?tab=overview&ok=da`);
}

/**
 * Corrige à la main le STYLE déduit du site (brandKit) · pas de dépense, simple
 * écriture. Transparence + levier : si l'agent a mal lu la marque, on rectifie
 * sans re-payer un scan. Bornée à la marque (guardBrand).
 */
export async function saveBrandVisualDaAction(formData: FormData): Promise<void> {
  const brandId = norm(formData.get('brandId'));
  const g = await guardBrand(brandId);
  if (!g || !db) redirect('/brands');

  const da: DaVisuelleMarque = {
    style: norm(formData.get('style')) || undefined,
    photo: norm(formData.get('photo')) || undefined,
    ambiance: norm(formData.get('ambiance')) || undefined,
    lumiere: norm(formData.get('lumiere')) || undefined,
    couleurs: norm(formData.get('couleurs')) || undefined,
    aEviter: asArr(formData.get('aEviter')),
  };
  await db.update(schema.brands).set({ brandKit: da }).where(eq(schema.brands.id, brandId));
  redirect(`/brands/${brandId}?tab=overview&ok=da-edit`);
}

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const commas = (v: FormDataEntryValue | null) => norm(v).split(',').map((x) => x.trim()).filter(Boolean);

/** Vérifie que la marque appartient bien au workspace de l'utilisateur admin. */
async function guardBrand(brandId: string): Promise<{ workspaceId: string; userId: string; email: string | null; plan: CleForfait } | null> {
  const s = await getSession();
  if (!s || !db) return null;
  if (!roleAtLeast(s.role, 'admin')) return null;
  const [b] = await db.select({ id: schema.brands.id }).from(schema.brands)
    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
  return b ? { workspaceId: s.workspaceId, userId: s.user.id, email: s.user.email, plan: forfaitEffectif(s.plan) } : null;
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
/**
 * Modifier un persona (lot 9 V5 · VB P05, P11, P12) · nom, description, segment,
 * désirs, freins, objections et RANG. Mêmes gardes que l'ajout et le retrait
 * (`guardBrand` · admin, marque de l'espace) · aucune permission nouvelle. La
 * saisie est validée au noyau AVANT d'écrire (`validerPersona`) · un refus ne
 * touche à rien. Le rang décale les autres personas de la marque, dans la même
 * transaction (`rangsAEcrire` · 1, 2, 3… sans trou). Un persona d'une autre
 * marque (ou d'un autre espace) est « introuvable », sans rien dire de plus.
 * Ni suppression, ni fusion · les objections et sources non saisies restent.
 */
export async function updatePersonaAction(input: { brandId: string; id: string; saisie: unknown }): Promise<{ ok: true } | { error: string; erreurs?: Array<{ champ: ChampPersona; raison: string }> }> {
  const brandId = typeof input?.brandId === 'string' ? input.brandId : '';
  const id = typeof input?.id === 'string' ? input.id : '';
  const UUIDP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUIDP.test(brandId) || !UUIDP.test(id)) return { error: REFUS_PERSONA_INTROUVABLE };
  const s = await getSession();
  if (!s || !roleAtLeast(s.role, 'admin')) return { error: GUARD.role({ needRole: 'admin' }) };
  // Admin, mais la marque n'est pas de son espace · la même phrase qu'un persona inconnu.
  const g = await guardBrand(brandId);
  if (!g || !db) return { error: REFUS_PERSONA_INTROUVABLE };
  const v = validerPersona(input.saisie);
  if (!v.ok) return { error: v.erreurs.map((e) => e.raison).join(' '), erreurs: v.erreurs };
  const p = v.persona;
  const base = db;
  try {
    const trouve = await base.transaction(async (tx) => {
      // Verrou des personas de la marque · deux changements de rang simultanés passent l'un après l'autre.
      const tous = await tx.select({ id: schema.personas.id, rang: schema.personas.rank }).from(schema.personas)
        .where(eq(schema.personas.brandId, brandId)).for('update');
      if (!tous.some((x) => x.id === id)) return false;
      const autres = rangsAEcrire(tous, id, p.rang);
      const rangFinal = rangsApres(tous, id, p.rang).find((x) => x.id === id)!.rang;
      await tx.update(schema.personas).set({
        name: p.nom, description: p.description, segment: p.segment, rank: rangFinal,
        desires: p.desirs, pains: p.freins, objections: p.objections,
      }).where(and(eq(schema.personas.id, id), eq(schema.personas.brandId, brandId)));
      for (const a of autres) await tx.update(schema.personas).set({ rank: a.rang }).where(and(eq(schema.personas.id, a.id), eq(schema.personas.brandId, brandId)));
      return true;
    });
    if (!trouve) return { error: REFUS_PERSONA_INTROUVABLE };
  } catch (e) {
    return { error: logAndTranslate('brand:persona-edit', e, { subject: 'la modification du persona', workspaceId: g.workspaceId }) };
  }
  invalidateJarvisMemory(brandId);
  revalidatePath(`/brands/${brandId}/personas`);
  return { ok: true };
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
  if (!g || !db) return { error: GUARD.role({ needRole: 'admin' }) };
  const cfg = falFromEnv();
  if (!cfg) return { error: "La génération d'image n'est pas activée." };

  const [sc] = await db.select({ title: schema.scenarios.title, context: schema.scenarios.context })
    .from(schema.scenarios).where(and(eq(schema.scenarios.id, input.scenarioId), eq(schema.scenarios.brandId, input.brandId))).limit(1);
  if (!sc) return { error: 'Scénario introuvable.' };

  // Texte -> image : on laisse falGenerateImage choisir le modèle « texte » adapté.
  // (Forcer le modèle « /edit » sans image source ferait échouer l'appel.)
  const cost = imageModelByKey('nano').credits;
  const unlimited = unlimitedCredits(g.email);
  if (!unlimited && !(await reserveCredits(g.workspaceId, cost, 'Marque · visuel de scénario'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }

  const prompt = `Photographie lifestyle réaliste illustrant ce contexte d'usage : ${sc.title}. ${sc.context || ''} `
    + 'Cadrage naturel, lumière douce et crédible, ambiance authentique. Aucun texte, aucun logo, aucune marque visible.';
  try {
    const { images } = await sousPlafond('fal_image', { action: 'brand-detail:image', workspaceId: g.workspaceId, units: 1 }, () => falGenerateImage(cfg, { prompt, aspectRatio: '1:1', count: 1 }));
    const url = images?.[0];
    if (!url) {
      if (!unlimited) await refundCredits(g.workspaceId, cost, 'Remboursement · visuel de scénario');
      return { error: 'Aucune image générée.' };
    }
    await db.update(schema.scenarios).set({ imageUrl: url }).where(eq(schema.scenarios.id, input.scenarioId));
    return { url };
  } catch (e) {
    if (!unlimited) await refundCredits(g.workspaceId, cost, 'Remboursement · visuel de scénario');
    return { error: logAndTranslate('brand:scenario-visual', e, { subject: 'la génération du visuel', workspaceId: g.workspaceId }) };
  }
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
/** Levée DANS la transaction de la charte pour l'annuler · le dépôt est déjà cité par une autre ligne. */
class LogoDejaEmploye extends Error {}

/**
 * Enregistre la charte visuelle éditée à la main (logos, logo par défaut, couleurs, polices).
 *
 * `jetonDepot` · celui que `presignAssetUploadAction` (usage `logo`) a rendu à
 * l'import d'un fichier de logo. Le navigateur ne connaît pas l'adresse du
 * dépôt · il met `LOGO_DEPOSE` à sa place dans la charte, et le jeton la
 * résout. Il est EXIGÉ pour une adresse du bucket NOUVELLE (règle
 * `decisionCharteDeposee`, noyau `jeton-depot.ts`) : scellé, espace,
 * utilisateur, usage, clé, expiration, et objet pas encore cité (un jeton ne
 * sert qu'une fois). L'objet attesté est ensuite RELU (taille au `HEAD`, premiers
 * octets · `lireDebutObjetEspace`, le lecteur de `registerUploadedAssetAction`)
 * et n'est admis que s'il est une image png, jpeg ou webp d'au plus 4 Mo, du
 * type et de la taille signés dans le jeton (`decisionLogoDeposeRelu`, noyau).
 * Le dépôt qu'il prouve est retiré du bucket si la charte est refusée (dont la
 * relecture), si l'écriture échoue, ou si la charte ne le retient pas ·
 * seulement quand aucune ligne ne le cite (`decisionRetraitDepot`). Les
 * adresses déjà en base passent sans jeton ni relecture ; une adresse externe
 * `https:` suit `refusAdresseLogo`.
 */
export async function saveBrandDAAction(input: {
  brandId: string; logoUrl: string; logos: string[]; colors: string[]; fonts: string[]; jetonDepot?: string;
}): Promise<{ ok?: true; error?: string }> {
  const g = await guardBrand(input.brandId);
  if (!g || !db) return { error: GUARD.role({ needRole: 'admin' }) };
  const clean = (a: string[]) => (Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : []);
  const logoUrl = typeof input.logoUrl === 'string' ? input.logoUrl.trim() : '';
  const logos = clean(input.logos);
  // Toute adresse de logo NOUVELLE passe la règle du noyau (`https:` public,
  // ni identifiants, ni IP, ni réseau interne) · celles déjà enregistrées sont
  // renvoyées telles quelles (aucune donnée réécrite), un objet du bucket de
  // l'espace n'est admis que si le jeton de dépôt de l'import l'atteste.
  const [avant] = await db.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos, logoEmpreintes: schema.brands.logoEmpreintes }).from(schema.brands)
    .where(and(eq(schema.brands.id, input.brandId), eq(schema.brands.workspaceId, g.workspaceId))).limit(1);
  const cfg = storageFromEnv();
  const jeton = lireJetonDepot(input.jetonDepot);
  // Un jeton ne sert qu'une fois · l'objet qu'il désigne est-il déjà cité par une ligne ?
  const dejaCite = !!cfg && !!jeton && jeton !== 'illisible' && jeton.espace === g.workspaceId && (await referencesObjetEnBase(jeton.cle)) === 'referencee';
  const d = decisionCharteDeposee({
    charte: { logoUrl, logos }, dejaEnregistrees: [avant?.logoUrl, ...(avant?.logos ?? [])],
    bucket: cfg ? { base: basePubliqueStockage(cfg), espace: g.workspaceId } : null,
    jeton, utilisateur: g.userId, maintenant: Date.now(), dejaCite,
  });
  const base = db;
  // Le retrait d'un dépôt prend le verrou du dépôt (`retirerDepotsSousVerrou`) · il ne lit
  // jamais « aucune ligne » pendant qu'une autre charte s'apprête à citer l'objet.
  const retirer = (deposes: readonly string[] = d.aRetirer) => retirerDepotsSousVerrou(base, { storage: cfg, workspaceId: g.workspaceId, deposes });
  if (!d.ok) { await retirer(); return { error: d.erreur }; }
  // L'objet nouveau attesté par le jeton se RELIT avant de devenir logo · un
  // PDF, une vidéo ou du HTML déposés par le présigné (qui accepte toute la
  // liste blanche) sont refusés et retirés s'ils ne sont cités nulle part.
  // L'empreinte relue (ETag fort du HEAD, exigé par If-Match sur les octets
  // jugés) est gardée par adresse · servir ou transmettre ce logo vérifiera
  // que l'objet est toujours celui-là (`decisionLogoServi`, noyau).
  const relues = new Map<string, string | null>();
  for (const url of d.deposes) {
    const lecture = cfg ? await lireDebutObjetEspace(cfg, url, g.workspaceId, OCTETS_RELUS_DEPOT) : ({ ok: false, raison: 'illisible' } as const);
    const r = decisionLogoDeposeRelu({ jeton, lecture });
    if (!r.ok) {
      if (r.retirer) await retirer([url, ...d.aRetirer]);
      return { error: r.erreur };
    }
    relues.set(url, lecture.ok ? lecture.empreinte : null);
  }
  // La charte RÉSOLUE · `LOGO_DEPOSE` y est devenue l'adresse du dépôt.
  const charte = d.charte;
  const logoEmpreintes = empreintesLogosCharte({ avant: avant?.logoEmpreintes, charte: [charte.logoUrl, ...charte.logos], relues });
  // L'écriture qui échoue retire le dépôt attesté, sauf si une ligne le cite
  // déjà (`ecrireApresDepot`), puis l'erreur remonte comme avant.
  try {
    await ecrireApresDepot({
      storage: cfg, workspaceId: g.workspaceId, deposes: [...d.deposes, ...d.aRetirer], references: referencesObjetEnBase,
      ecrire: () => base.transaction(async (tx) => {
        // Un jeton ne sert qu'une fois · deux chartes simultanées (deux marques)
        // avec le même dépôt sont mises en file sur le verrou du dépôt (même clé
        // que la Bibliothèque), et la seconde relit la citation de la première.
        for (const url of d.deposes) {
          const cle = cfg ? cleDeDepot(cfg, url) : null;
          if (!cle) continue;
          await verrouDepot(tx, cle);
          // Le dépôt est NOUVEAU pour cette marque · toute citation est celle d'une autre ligne.
          if ((await referencesDans(tx)(cle)) === 'referencee') throw new LogoDejaEmploye(TEXTES_REFUS_JETON_DEPOT.deja_employe);
        }
        // Une fonte d'icônes n'est jamais une police de marque · on l'écarte même
        // saisie à la main (CDC v7 · N09), pas seulement à l'extraction du site.
        await tx.update(schema.brands).set({
          logoUrl: charte.logoUrl || null,
          logos: charte.logos,
          logoEmpreintes,
          colors: clean(input.colors),
          fonts: clean(input.fonts).filter((f) => !policeTechnique(f)),
        }).where(eq(schema.brands.id, input.brandId));
      }),
    });
  } catch (e) {
    // `ecrireApresDepot` a tenté le retrait · l'objet cité par l'autre marque est gardé.
    if (e instanceof LogoDejaEmploye) return { error: e.message };
    throw e;
  }
  // Écrite · un dépôt attesté que la charte ne retient pas n'a plus de raison d'être.
  if (d.aRetirer.length) await retirer();
  return { ok: true };
}

/**
 * Complète la charte depuis le site · logo, couleurs et polices MANQUANTS.
 * Le logo rendu au navigateur est son APERÇU par la route média gardée
 * (`brandMediaPreview`) · un logo importé vit au stockage privé, son adresse
 * canonique (celle qu'on enregistre) n'en sort pas (garde
 * `test/adresses-brutes-api-db.test.tsx`).
 */
export async function importBrandDAAction(input: { brandId: string }): Promise<{ apercuLogo?: string | null; colors?: string[]; fonts?: string[]; error?: string }> {
  const g = await guardBrand(input.brandId);
  if (!g || !db) return { error: GUARD.role({ needRole: 'admin' }) };
  const [b] = await db.select({ url: schema.brands.url, shopifyDomain: schema.brands.shopifyDomain, logoUrl: schema.brands.logoUrl, colors: schema.brands.colors, fonts: schema.brands.fonts })
    .from(schema.brands).where(eq(schema.brands.id, input.brandId)).limit(1);
  if (!b) return { error: GUARD.notFound('cette marque') };

  const site = b.url || (b.shopifyDomain ? `https://${b.shopifyDomain}` : '');
  if (!site) return { error: "Renseigne le site de la marque (ou connecte Shopify) pour récupérer la DA." };

  const da = await extractBrandDA(site);
  if (!da.logoUrl && !da.colors.length && !da.fonts.length) return { error: "Aucun élément de DA détecté sur le site. Tu peux renseigner logo/couleurs/polices manuellement." };

  const logoUrl = b.logoUrl || da.logoUrl || null;
  const colors = (b.colors && b.colors.length) ? b.colors : da.colors;
  const fonts = (b.fonts && b.fonts.length) ? b.fonts : da.fonts;
  await db.update(schema.brands).set({ logoUrl, colors, fonts }).where(eq(schema.brands.id, input.brandId));
  return { apercuLogo: logoUrl ? brandMediaPreview(input.brandId, logoUrl) : null, colors, fonts };
}

/** Connecte / synchronise la boutique Shopify : importe produits + images + prix depuis le catalogue public. */
export async function syncShopifyProductsAction(input: { brandId: string; domain?: string }): Promise<{ imported?: number; updated?: number; total?: number; error?: string }> {
  const g = await guardBrand(input.brandId);
  if (!g || !db) return { error: GUARD.role({ needRole: 'admin' }) };
  const [b] = await db.select({ url: schema.brands.url, shopifyDomain: schema.brands.shopifyDomain }).from(schema.brands).where(eq(schema.brands.id, input.brandId)).limit(1);
  if (!b) return { error: GUARD.notFound('cette marque') };

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

  const client = guardedAnthropic({ workspaceId: g.workspaceId, action: 'brand-detail' });
  if (!client) redirect(`/brands/${brandId}?tab=products&e=ai`);

  const cost = costFor('brief');
  const unlimited = unlimitedCredits(g.email);
  if (!unlimited && !(await reserveCredits(g.workspaceId, cost, 'Marque · import produits IA'))) {
    redirect(`/brands/${brandId}?tab=products&e=credits`);
  }

  let siteText: string | undefined;
  try { siteText = await fetchSiteText(brand.url); } catch { /* on tente quand même */ }

  // NB : redirect() lève une exception Next · il doit rester HORS du try/catch,
  // sinon la redirection de succès est avalée par le catch et l'utilisateur reçoit
  // toujours l'écran d'erreur.
  let imported: number | null = null;
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
    imported = rows.length;
  } catch {
    if (!unlimited) await refundCredits(g.workspaceId, cost, 'Remboursement · import produits');
  }
  if (imported === null) redirect(`/brands/${brandId}?tab=products&e=import`);
  redirect(`/brands/${brandId}?tab=products&ok=imported&n=${imported}`);
}
