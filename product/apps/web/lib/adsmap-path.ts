import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';

/**
 * Le chemin persona → désir → angle, trouvé ou créé.
 *
 * ── Pourquoi il vit ici et pas dans une action ───────────────────────────────
 *
 * Il était privé à la passerelle Studio → Adsmap. Le radar en a besoin du même
 * chemin, exactement · et l'exporter depuis un fichier `'use server'` en aurait
 * fait un point d'entrée public prenant `brandId` et `workspaceId` en
 * paramètres, c'est-à-dire un moyen d'écrire dans la carte d'un autre espace.
 *
 * Un module ordinaire, appelé par des actions qui ont déjà vérifié qui parle.
 *
 * ── Tout arrive « proposé » ──────────────────────────────────────────────────
 *
 * Une créa poussée depuis ailleurs ne décide pas de la taxonomie de la marque,
 * elle propose un rattachement que l'humain corrige. Sans cette précaution, la
 * carte se remplirait d'angles fantômes en quelques jours · et une carte qu'on
 * ne croit plus ne sert plus à attribuer quoi que ce soit.
 */
export async function ensureGraphPath(opts: {
  workspaceId: string; brandId: string;
  personaId?: string | null;
  desireLabel: string; angleLabel: string; mechanism: string;
}): Promise<{ angleId: string } | null> {
  if (!db) return null;

  let personaId = opts.personaId ?? null;
  if (personaId) {
    const [ok] = await db.select({ id: schema.personas.id }).from(schema.personas)
      .where(and(eq(schema.personas.id, personaId), eq(schema.personas.brandId, opts.brandId))).limit(1);
    if (!ok) personaId = null;
  }
  if (!personaId) {
    const nom = 'À qualifier';
    const [exist] = await db.select({ id: schema.personas.id }).from(schema.personas)
      .where(and(eq(schema.personas.brandId, opts.brandId), eq(schema.personas.name, nom))).limit(1);
    if (exist) personaId = exist.id;
    else {
      const [row] = await db.insert(schema.personas).values({
        brandId: opts.brandId, name: nom, status: 'proposed',
        description: 'Persona provisoire · créé automatiquement en rattachant une créa à la carte. À scinder en avatars réels.',
      }).returning({ id: schema.personas.id });
      personaId = row!.id;
    }
  }

  const [d0] = await db.select({ id: schema.desires.id }).from(schema.desires)
    .where(and(eq(schema.desires.personaId, personaId), eq(schema.desires.label, opts.desireLabel))).limit(1);
  const desireId = d0?.id ?? (await db.insert(schema.desires).values({
    workspaceId: opts.workspaceId, personaId, label: opts.desireLabel, status: 'proposed',
  }).returning({ id: schema.desires.id }))[0]!.id;

  const [a0] = await db.select({ id: schema.angles.id }).from(schema.angles)
    .where(and(eq(schema.angles.desireId, desireId), eq(schema.angles.label, opts.angleLabel))).limit(1);
  const angleId = a0?.id ?? (await db.insert(schema.angles).values({
    workspaceId: opts.workspaceId, desireId, label: opts.angleLabel,
    mechanism: opts.mechanism as typeof schema.angles.$inferInsert.mechanism, status: 'proposed',
  }).returning({ id: schema.angles.id }))[0]!.id;

  return { angleId };
}

/** Prochaine variante libre d'un concept · v1, v2, v3… */
export async function nextVariant(conceptId: string): Promise<string> {
  if (!db) return 'v1';
  const rows = await db.select({ id: schema.ads.id }).from(schema.ads).where(eq(schema.ads.conceptId, conceptId));
  return `v${rows.length + 1}`;
}
