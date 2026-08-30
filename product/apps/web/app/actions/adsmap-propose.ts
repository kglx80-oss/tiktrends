'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  proposePersonas, proposeDesires, proposeAngles, proposeConcepts,
  type BrandContext,
} from '@tiktrends/ai';
import {
  cleanPersonas, cleanDesires, cleanAngles, cleanConcepts, dedupeByLabel, costFor,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { reserveCredits, refundCredits, unlimitedCredits } from '../../lib/credits';
import { jarvisFullMemory } from '../../lib/jarvis-memory';
import { guardedAnthropic } from '../../lib/spend-guard';
import { GUARD } from '../../lib/guard-error';

/**
 * ADSMAP · agents A1 à A3, remplissage de la carte (§8.3).
 *
 * Jusqu'ici la carte se remplissait à la main ou par import. Ces agents la
 * descendent : avatar → désir → angle → concept.
 *
 * Trois règles, et elles décident de tout :
 *
 *  1. **Tout entre en `proposed`.** Un agent ne décide pas de la taxonomie d'une
 *     marque, il propose un rattachement qu'un humain corrige. Sans cette
 *     précaution, la carte se remplit d'angles fantômes en une semaine et plus
 *     personne n'ose la lire.
 *  2. **La mémoire mesurée passe en tête du prompt.** Proposer du listicle à une
 *     marque où le listicle perd trois fois sur quatre fait perdre de l'argent
 *     avec assurance · c'est pire qu'une proposition générique, parce que ça a
 *     l'air informé.
 *  3. **Les doublons sont écartés et COMPTÉS.** Un agent relancé propose les
 *     mêmes désirs · afficher « 4 propositions » dont 3 sont des jumeaux le ferait
 *     passer pour plus productif qu'il n'est.
 *
 * On facture après avoir vu la sortie, jamais avant : une réserve prise sur un
 * appel qui ne rend rien fait payer une file d'attente.
 */

const ACTION = 'map_proposal' as const;

export interface ProposeResult {
  created?: number;
  duplicates?: number;
  /** Angles rejetés faute de mécanisme reconnu · on le dit plutôt que de compléter. */
  rejected?: string[];
  summary?: string;
  error?: string;
}

/** Contexte de marque commun aux quatre agents · la mémoire mesurée en tête. */
async function context(brandId: string, workspaceId: string): Promise<BrandContext> {
  const [b] = await db!.select({
    name: schema.brands.name, description: schema.brands.description, usp: schema.brands.usp,
    audience: schema.brands.audience, category: schema.brands.category, rules: schema.brands.creativeRules,
  }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);

  const [produits, measured] = await Promise.all([
    db!.select({ name: schema.products.name }).from(schema.products).where(eq(schema.products.brandId, brandId)).limit(12),
    jarvisFullMemory(brandId, workspaceId),
  ]);

  return {
    name: b?.name ?? 'la marque',
    description: b?.description, usp: b?.usp, audience: b?.audience, category: b?.category,
    products: produits.map((p) => p.name),
    measured: measured || null,
    rules: b?.rules?.trim() || null,
  };
}

/**
 * Facture un appel, l'exécute, rembourse s'il ne rend rien.
 *
 * L'ordre compte : on réserve AVANT l'appel (sinon un solde à zéro paierait quand
 * même le jeton), et on rembourse quand la sortie est vide. Un agent qui ne
 * propose rien n'a rendu aucun service.
 */
async function billed<T>(
  ws: string, email: string, ref: string, work: () => Promise<T[]>,
): Promise<{ rows: T[]; error?: string }> {
  const gratuit = unlimitedCredits(email);
  const cout = costFor(ACTION, 1);
  if (!gratuit && !(await reserveCredits(ws, cout, `adsmap:propose:${ref}`))) {
    return { rows: [], error: 'Crédits insuffisants · recharge pour lancer une proposition.' };
  }
  try {
    const rows = await work();
    if (!rows.length && !gratuit) await refundCredits(ws, cout, `adsmap:propose:vide:${ref}`);
    return { rows };
  } catch (e) {
    if (!gratuit) await refundCredits(ws, cout, `adsmap:propose:erreur:${ref}`);
    throw e;
  }
}

const bilan = (quoi: string, created: number, duplicates: number, rejected: string[]): string => {
  if (!created && !duplicates && !rejected.length) return `Aucun ${quoi} proposé · complète le profil de la marque et réessaie.`;
  const parts = [`${created} ${quoi}(s) ajouté(s) en « proposé »`];
  if (duplicates) parts.push(`${duplicates} écarté(s), déjà présent(s)`);
  if (rejected.length) parts.push(`${rejected.length} rejeté(s) faute de mécanisme reconnu`);
  return parts.join(' · ') + '.';
};

/* -------------------------------------------------------------------------- */
/*  A1 · avatars                                                              */
/* -------------------------------------------------------------------------- */

export async function proposePersonasAction(count = 3): Promise<ProposeResult> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };
  const client = guardedAnthropic({ action: 'adsmap-propose' });
  if (!client) return { error: GUARD.aiOff() };

  try {
    const ctx = await context(g.brand.id, g.s.workspaceId);
    const existants = await db!.select({ name: schema.personas.name })
      .from(schema.personas).where(eq(schema.personas.brandId, g.brand.id));

    const r = await billed(g.s.workspaceId, g.s.user.email, `personas:${g.brand.id}`, async () =>
      cleanPersonas(await proposePersonas(client, ctx, { count, existing: existants.map((e) => e.name) })));
    if (r.error) return { error: r.error };

    const { kept, duplicates } = dedupeByLabel(r.rows, (p) => p.name, existants.map((e) => e.name));
    for (const p of kept) {
      await db!.insert(schema.personas).values({
        brandId: g.brand.id, name: p.name, description: p.description,
        pains: p.pains, desires: p.desires, objections: p.objections,
        status: 'proposed',
      });
    }
    return {
      created: kept.length, duplicates: duplicates.length, rejected: [],
      summary: bilan('avatar', kept.length, duplicates.length, []),
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:propose-personas', e, { subject: 'la proposition d’avatars', workspaceId: g.s.workspaceId }) };
  }
}

/* -------------------------------------------------------------------------- */
/*  A1b · désirs d'un avatar                                                  */
/* -------------------------------------------------------------------------- */

export async function proposeDesiresAction(personaId: string, count = 4): Promise<ProposeResult> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };
  const client = guardedAnthropic({ action: 'adsmap-propose' });
  if (!client) return { error: GUARD.aiOff() };

  try {
    const [p] = await db!.select().from(schema.personas)
      .where(and(eq(schema.personas.id, personaId), eq(schema.personas.brandId, g.brand.id))).limit(1);
    if (!p) return { error: 'Avatar introuvable sur cette marque.' };

    const ctx = await context(g.brand.id, g.s.workspaceId);
    const existants = await db!.select({ label: schema.desires.label })
      .from(schema.desires).where(eq(schema.desires.personaId, personaId));

    const r = await billed(g.s.workspaceId, g.s.user.email, `desires:${personaId}`, async () =>
      cleanDesires(await proposeDesires(client, ctx,
        { name: p.name, description: p.description, pains: p.pains ?? [] },
        { count, existing: existants.map((e) => e.label) })));
    if (r.error) return { error: r.error };

    const { kept, duplicates } = dedupeByLabel(r.rows, (d) => d.label, existants.map((e) => e.label));
    for (const d of kept) {
      await db!.insert(schema.desires).values({
        workspaceId: g.s.workspaceId, personaId, label: d.label,
        // `undefined` et non une valeur par défaut : l'agent n'a pas su, on ne
        // devine pas · Drizzle laisse alors la colonne à sa valeur par défaut.
        type: (d.type ?? undefined) as typeof schema.desires.$inferInsert.type,
        awarenessStage: (d.awareness ?? undefined) as typeof schema.desires.$inferInsert.awarenessStage,
        status: 'proposed',
      });
    }
    return {
      created: kept.length, duplicates: duplicates.length, rejected: [],
      summary: bilan('désir', kept.length, duplicates.length, []),
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:propose-desires', e, { subject: 'la proposition de désirs', workspaceId: g.s.workspaceId }) };
  }
}

/* -------------------------------------------------------------------------- */
/*  A2 · angles d'un désir                                                    */
/* -------------------------------------------------------------------------- */

export async function proposeAnglesAction(desireId: string, count = 4): Promise<ProposeResult> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };
  const client = guardedAnthropic({ action: 'adsmap-propose' });
  if (!client) return { error: GUARD.aiOff() };

  try {
    const [d] = await db!.select({
      id: schema.desires.id, label: schema.desires.label, awareness: schema.desires.awarenessStage,
      brandId: schema.personas.brandId,
    })
      .from(schema.desires)
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(eq(schema.desires.id, desireId), eq(schema.personas.brandId, g.brand.id))).limit(1);
    if (!d) return { error: 'Désir introuvable sur cette marque.' };

    const ctx = await context(g.brand.id, g.s.workspaceId);
    const existants = await db!.select({ label: schema.angles.label })
      .from(schema.angles).where(eq(schema.angles.desireId, desireId));

    const r = await billed(g.s.workspaceId, g.s.user.email, `angles:${desireId}`, async () => {
      const brut = await proposeAngles(client, ctx, { label: d.label, awareness: d.awareness }, { count, existing: existants.map((e) => e.label) });
      const { kept, rejected } = cleanAngles(brut);
      return kept.map((a) => ({ ...a, _rejected: rejected }));
    });
    if (r.error) return { error: r.error };

    const rejected = r.rows[0]?._rejected ?? [];
    const { kept, duplicates } = dedupeByLabel(r.rows, (a) => a.label, existants.map((e) => e.label));
    for (const a of kept) {
      await db!.insert(schema.angles).values({
        workspaceId: g.s.workspaceId, desireId, label: a.label,
        mechanism: a.mechanism as typeof schema.angles.$inferInsert.mechanism,
        status: 'proposed',
      });
    }
    return {
      created: kept.length, duplicates: duplicates.length, rejected,
      summary: bilan('angle', kept.length, duplicates.length, rejected),
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:propose-angles', e, { subject: 'la proposition d’angles', workspaceId: g.s.workspaceId }) };
  }
}

/* -------------------------------------------------------------------------- */
/*  A3 · concepts d'un angle                                                  */
/* -------------------------------------------------------------------------- */

export async function proposeConceptsAction(angleId: string, count = 3): Promise<ProposeResult> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };
  const client = guardedAnthropic({ action: 'adsmap-propose' });
  if (!client) return { error: GUARD.aiOff() };

  try {
    const [a] = await db!.select({
      id: schema.angles.id, label: schema.angles.label, mechanism: schema.angles.mechanism,
      desire: schema.desires.label,
    })
      .from(schema.angles)
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(eq(schema.angles.id, angleId), eq(schema.personas.brandId, g.brand.id))).limit(1);
    if (!a) return { error: 'Angle introuvable sur cette marque.' };

    const ctx = await context(g.brand.id, g.s.workspaceId);
    const existants = await db!.select({ title: schema.concepts.title })
      .from(schema.concepts).where(eq(schema.concepts.angleId, angleId));

    const r = await billed(g.s.workspaceId, g.s.user.email, `concepts:${angleId}`, async () =>
      cleanConcepts(await proposeConcepts(client, ctx,
        { label: a.label, mechanism: a.mechanism, desire: a.desire },
        { count, existing: existants.map((e) => e.title) })));
    if (r.error) return { error: r.error };

    const { kept, duplicates } = dedupeByLabel(r.rows, (c) => c.title, existants.map((e) => e.title));
    for (const c of kept) {
      await db!.insert(schema.concepts).values({
        workspaceId: g.s.workspaceId, angleId, title: c.title,
        callout: c.callout || null, valueBlock: c.valueBlock || null, cta: c.cta || null,
        hookOptions: c.hookOptions.length ? c.hookOptions : null,
        adType: 'ideation', status: 'proposed',
      });
    }
    return {
      created: kept.length, duplicates: duplicates.length, rejected: [],
      summary: bilan('concept', kept.length, duplicates.length, []),
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:propose-concepts', e, { subject: 'la proposition de concepts', workspaceId: g.s.workspaceId }) };
  }
}
