'use server';

import { and, count, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  planValidation, rejectImpact, needsRename, renameReason,
  KIND_LABEL, type NodeKind, type NodeRef,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { invalidateJarvisMemory } from '../../lib/jarvis-memory';
import { revalidatePath } from 'next/cache';

/**
 * Trier ce que les passerelles ont proposé.
 *
 * ── La dette qu'on a laissée grandir ─────────────────────────────────────────
 *
 * Le radar, le studio et l'import poussent tous des nœuds « proposés ». C'était
 * la bonne décision à chaque fois · une créa venue d'ailleurs ne décide pas de
 * la taxonomie d'une marque. Mais rien ne permettait de valider quoi que ce
 * soit : le provisoire s'accumulait sans porte de sortie.
 *
 * ── Ce que cet écran fait, et ce qu'il ne fait pas ───────────────────────────
 *
 * Accepter, refuser, renommer. Pas fusionner · re-raccrocher les enfants de
 * deux personas est un travail à part, et une fusion ratée perd des tests.
 */

export interface ProposedNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Le chemin au-dessus · sert à dire ce que la validation entraînera. */
  parents: NodeRef[];
  /** Ce qui pend en dessous, et combien a déjà été testé. */
  descendants: number;
  tested: number;
  /** Pourquoi ce nom ne peut pas rester · `null` quand il convient. */
  rename: string | null;
  /** Ce que valider entraînera · calculé, montré avant le clic. */
  notice: string | null;
  /** Ce que refuser emporte. */
  warning: string | null;
}

export interface CurationView {
  nodes: ProposedNode[];
  /** Total par type · pour dire l'ampleur sans tout charger. */
  counts: Record<NodeKind, number>;
}

/* -------------------------------------------------------------------------- */

/** Un nœud proposé, tel qu'il sort de sa table · même forme pour les quatre. */
type Brut = { id: string; label: string; status: string; parentId: string | null };

async function lireProposes(brandId: string, workspaceId: string): Promise<Record<NodeKind, Brut[]>> {
  if (!db) return { persona: [], desire: [], angle: [], concept: [] };

  const [personas, desires, angles, concepts] = await Promise.all([
    db.select({ id: schema.personas.id, label: schema.personas.name, status: schema.personas.status })
      .from(schema.personas)
      .where(and(eq(schema.personas.brandId, brandId), eq(schema.personas.status, 'proposed')))
      .limit(200)
      .then((r) => r.map((x) => ({ ...x, parentId: null }))),

    db.select({ id: schema.desires.id, label: schema.desires.label, status: schema.desires.status, parentId: schema.desires.personaId })
      .from(schema.desires)
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(eq(schema.personas.brandId, brandId), eq(schema.desires.status, 'proposed')))
      .limit(200),

    db.select({ id: schema.angles.id, label: schema.angles.label, status: schema.angles.status, parentId: schema.angles.desireId })
      .from(schema.angles)
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(eq(schema.personas.brandId, brandId), eq(schema.angles.status, 'proposed')))
      .limit(200),

    db.select({ id: schema.concepts.id, label: schema.concepts.title, status: schema.concepts.status, parentId: schema.concepts.angleId })
      .from(schema.concepts)
      .where(and(eq(schema.concepts.workspaceId, workspaceId), eq(schema.concepts.status, 'proposed')))
      .limit(200),
  ]);

  return { persona: personas, desire: desires, angle: angles, concept: concepts };
}

/** Le chemin complet au-dessus d'un nœud · nécessaire pour dire ce qu'on valide. */
async function ancetres(kind: NodeKind, parentId: string | null): Promise<NodeRef[]> {
  if (!db || !parentId) return [];
  const out: NodeRef[] = [];

  if (kind === 'concept') {
    const [a] = await db.select({ id: schema.angles.id, label: schema.angles.label, status: schema.angles.status, parentId: schema.angles.desireId })
      .from(schema.angles).where(eq(schema.angles.id, parentId)).limit(1);
    if (!a) return out;
    out.push({ id: a.id, kind: 'angle', label: a.label, status: a.status as NodeRef['status'] });
    out.push(...await ancetres('angle', a.parentId));
    return out;
  }
  if (kind === 'angle') {
    const [d] = await db.select({ id: schema.desires.id, label: schema.desires.label, status: schema.desires.status, parentId: schema.desires.personaId })
      .from(schema.desires).where(eq(schema.desires.id, parentId)).limit(1);
    if (!d) return out;
    out.push({ id: d.id, kind: 'desire', label: d.label, status: d.status as NodeRef['status'] });
    out.push(...await ancetres('desire', d.parentId));
    return out;
  }
  if (kind === 'desire') {
    const [p] = await db.select({ id: schema.personas.id, label: schema.personas.name, status: schema.personas.status })
      .from(schema.personas).where(eq(schema.personas.id, parentId)).limit(1);
    if (p) out.push({ id: p.id, kind: 'persona', label: p.label, status: p.status as NodeRef['status'] });
    return out;
  }
  return out;
}

/** Ce qui pend sous un nœud, et ce qui a déjà été testé dessous. */
async function dessous(kind: NodeKind, id: string): Promise<{ descendants: number; tested: number }> {
  if (!db) return { descendants: 0, tested: 0 };
  try {
    if (kind === 'concept') {
      const [r] = await db.select({ n: count() }).from(schema.ads).where(eq(schema.ads.conceptId, id));
      const n = Number(r?.n ?? 0);
      return { descendants: n, tested: n };
    }
    if (kind === 'angle') {
      const [c] = await db.select({ n: count() }).from(schema.concepts).where(eq(schema.concepts.angleId, id));
      const [t] = await db.select({ n: count() }).from(schema.ads)
        .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
        .where(eq(schema.concepts.angleId, id));
      return { descendants: Number(c?.n ?? 0), tested: Number(t?.n ?? 0) };
    }
    if (kind === 'desire') {
      const [a] = await db.select({ n: count() }).from(schema.angles).where(eq(schema.angles.desireId, id));
      return { descendants: Number(a?.n ?? 0), tested: 0 };
    }
    const [d] = await db.select({ n: count() }).from(schema.desires).where(eq(schema.desires.personaId, id));
    return { descendants: Number(d?.n ?? 0), tested: 0 };
  } catch {
    return { descendants: 0, tested: 0 };
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Ce qui attend d'être trié.
 *
 * L'ordre est délibéré : **les personas d'abord**. Valider un concept remonte
 * ses ancêtres · trier par le haut évite de valider vingt fois le même persona
 * sans s'en rendre compte.
 */
export async function curationViewAction(): Promise<{ view?: CurationView; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    const bruts = await lireProposes(g.brand.id, g.s.workspaceId);
    const counts: Record<NodeKind, number> = {
      persona: bruts.persona.length, desire: bruts.desire.length,
      angle: bruts.angle.length, concept: bruts.concept.length,
    };

    const ordre: NodeKind[] = ['persona', 'desire', 'angle', 'concept'];
    const nodes: ProposedNode[] = [];

    for (const kind of ordre) {
      // Vingt par type · l'écran sert à trier, pas à tout afficher. Le compte
      // total dit l'ampleur, et on repasse tant qu'il en reste.
      for (const b of bruts[kind].slice(0, 20)) {
        const parents = await ancetres(kind, b.parentId);
        const self: NodeRef = { id: b.id, kind, label: b.label, status: 'proposed' };
        const { descendants, tested } = await dessous(kind, b.id);
        nodes.push({
          id: b.id, kind, label: b.label, parents, descendants, tested,
          rename: renameReason(b.label),
          notice: planValidation(self, parents).notice,
          warning: rejectImpact(self, descendants, tested).warning,
        });
      }
    }

    return { view: { nodes, counts } };
  } catch (e) {
    return { error: logAndTranslate('adsmap:curation', e, { subject: 'les propositions à trier', workspaceId: g.s.workspaceId }) };
  }
}

/* -------------------------------------------------------------------------- */

const TABLE = {
  persona: schema.personas, desire: schema.desires,
  angle: schema.angles, concept: schema.concepts,
} as const;

/**
 * Valide un nœud, et ce qui le porte.
 *
 * Le plan est recalculé côté serveur · celui affiché à l'écran a pu vieillir, et
 * on ne valide jamais sur la foi d'un identifiant envoyé par le navigateur.
 */
export async function validateNodeAction(input: { id: string; kind: NodeKind; rename?: string }): Promise<{ ok?: true; validated?: number; error?: string }> {
  const g = await adsmapGuard({ minRole: 'member' });
  if ('error' in g) return { error: g.error };

  try {
    const courant = await lireUn(input.kind, input.id, g.brand.id, g.s.workspaceId);
    if (!courant) return { error: `Ce ${KIND_LABEL[input.kind]} n’existe plus sur cette marque.` };

    const nom = input.rename?.trim() || courant.label;
    if (needsRename(nom)) return { error: renameReason(nom) ?? 'Ce nom ne peut pas rester.' };

    const parents = await ancetres(input.kind, courant.parentId);
    const plan = planValidation({ id: courant.id, kind: input.kind, label: nom, status: 'proposed' }, parents);

    for (const cible of plan.ids) {
      const t = TABLE[cible.kind];
      await db!.update(t).set({ status: 'validated' as never }).where(eq(t.id, cible.id));
    }

    // Renommage sur le nœud lui-même seulement · un ancêtre remonté garde son
    // nom, on ne renomme pas ce qu'on n'a pas regardé.
    if (input.rename?.trim() && input.rename.trim() !== courant.label) {
      await renommer(input.kind, input.id, input.rename.trim());
    }

    invalidateJarvisMemory(g.brand.id);
    revalidatePath('/adsmap');
    return { ok: true, validated: plan.ids.length };
  } catch (e) {
    return { error: logAndTranslate('adsmap:validate-node', e, { subject: 'la validation', workspaceId: g.s.workspaceId }) };
  }
}

/** Refuse un nœud · sans cascade, jamais. Ce qui pend dessous reste à trier. */
export async function rejectNodeAction(input: { id: string; kind: NodeKind }): Promise<{ ok?: true; error?: string }> {
  const g = await adsmapGuard({ minRole: 'member' });
  if ('error' in g) return { error: g.error };
  try {
    const courant = await lireUn(input.kind, input.id, g.brand.id, g.s.workspaceId);
    if (!courant) return { error: `Ce ${KIND_LABEL[input.kind]} n’existe plus sur cette marque.` };
    const t = TABLE[input.kind];
    await db!.update(t).set({ status: 'rejected' as never }).where(eq(t.id, input.id));
    invalidateJarvisMemory(g.brand.id);
    revalidatePath('/adsmap');
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('adsmap:reject-node', e, { subject: 'le refus', workspaceId: g.s.workspaceId }) };
  }
}

/**
 * Valide plusieurs nœuds d'un coup.
 *
 * C'est le geste qui répond vraiment à la dette · trier trente concepts un par
 * un, personne ne le fait deux fois. Les noms provisoires sont ÉCARTÉS et
 * rendus à l'appelant : les valider en masse ferait entrer le provisoire dans
 * la carte définitive, ce qui est exactement le problème qu'on règle.
 */
export async function validateManyAction(input: { ids: string[]; kind: NodeKind }): Promise<{ validated?: number; skipped?: string[]; error?: string }> {
  const g = await adsmapGuard({ minRole: 'member' });
  if ('error' in g) return { error: g.error };
  if (!input.ids.length) return { validated: 0, skipped: [] };

  try {
    let validated = 0;
    const skipped: string[] = [];

    for (const id of input.ids.slice(0, 50)) {
      const courant = await lireUn(input.kind, id, g.brand.id, g.s.workspaceId);
      if (!courant) continue;
      if (needsRename(courant.label)) { skipped.push(courant.label); continue; }

      const parents = await ancetres(input.kind, courant.parentId);
      const plan = planValidation({ id, kind: input.kind, label: courant.label, status: 'proposed' }, parents);
      for (const cible of plan.ids) {
        const t = TABLE[cible.kind];
        await db!.update(t).set({ status: 'validated' as never }).where(eq(t.id, cible.id));
      }
      validated++;
    }

    invalidateJarvisMemory(g.brand.id);
    revalidatePath('/adsmap');
    return { validated, skipped };
  } catch (e) {
    return { error: logAndTranslate('adsmap:validate-many', e, { subject: 'la validation en lot', workspaceId: g.s.workspaceId }) };
  }
}

/* -------------------------------------------------------------------------- */

/** Relit un nœud en vérifiant qu'il appartient bien à la marque courante. */
async function lireUn(kind: NodeKind, id: string, brandId: string, workspaceId: string): Promise<Brut | null> {
  if (!db) return null;

  if (kind === 'persona') {
    const [r] = await db.select({ id: schema.personas.id, label: schema.personas.name, status: schema.personas.status })
      .from(schema.personas).where(and(eq(schema.personas.id, id), eq(schema.personas.brandId, brandId))).limit(1);
    return r ? { ...r, parentId: null } : null;
  }
  if (kind === 'desire') {
    const [r] = await db.select({ id: schema.desires.id, label: schema.desires.label, status: schema.desires.status, parentId: schema.desires.personaId })
      .from(schema.desires)
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(eq(schema.desires.id, id), eq(schema.personas.brandId, brandId))).limit(1);
    return r ?? null;
  }
  if (kind === 'angle') {
    const [r] = await db.select({ id: schema.angles.id, label: schema.angles.label, status: schema.angles.status, parentId: schema.angles.desireId })
      .from(schema.angles)
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(eq(schema.angles.id, id), eq(schema.personas.brandId, brandId))).limit(1);
    return r ?? null;
  }
  const [r] = await db.select({ id: schema.concepts.id, label: schema.concepts.title, status: schema.concepts.status, parentId: schema.concepts.angleId })
    .from(schema.concepts)
    .where(and(eq(schema.concepts.id, id), eq(schema.concepts.workspaceId, workspaceId))).limit(1);
  return r ?? null;
}

async function renommer(kind: NodeKind, id: string, nom: string): Promise<void> {
  if (!db) return;
  if (kind === 'persona') { await db.update(schema.personas).set({ name: nom }).where(eq(schema.personas.id, id)); return; }
  if (kind === 'desire') { await db.update(schema.desires).set({ label: nom }).where(eq(schema.desires.id, id)); return; }
  if (kind === 'angle') { await db.update(schema.angles).set({ label: nom }).where(eq(schema.angles.id, id)); return; }
  await db.update(schema.concepts).set({ title: nom }).where(eq(schema.concepts.id, id));
}

