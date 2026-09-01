import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { storageFromEnv, putObject } from '@tiktrends/integrations';

/**
 * Là où vit une pub une fois composée.
 *
 * ── Le cache mémoire ne suffisait pas ────────────────────────────────────────
 *
 * Les PNG composés vivaient dans une `Map` du processus. Ça marche, tant que le
 * processus vit · c'est-à-dire jusqu'au prochain déploiement. Après chaque mise
 * en ligne, la première personne à ouvrir le studio repayait la composition de
 * toutes ses pubs, une par une, devant un écran vide.
 *
 * Un rendu qui a été payé une fois ne devrait jamais être repayé : la recette
 * n'a pas changé, l'image serait identique au pixel près.
 *
 * ── Pourquoi `output` et pas `input` ─────────────────────────────────────────
 *
 * `input` porte la recette · ce qu'il faut dessiner. `output` porte ce qui a été
 * produit · où l'image se trouve. Ranger l'adresse du PNG dans la recette aurait
 * mélangé la consigne et son résultat, et le jour où quelqu'un recalcule une
 * empreinte sur la recette, il l'aurait faite sur un objet qui bouge.
 *
 * ── Écriture différée, jamais bloquante ──────────────────────────────────────
 *
 * L'envoi vers le bucket ne retient pas la réponse : l'image est déjà rendue,
 * la faire attendre un aller-retour S3 rendrait le premier affichage plus lent
 * pour accélérer les suivants. On répond, puis on range.
 *
 * Tout échoue en silence · un cache qui tombe doit se contenter de ne pas
 * accélérer, jamais empêcher l'affichage.
 */

/** Ce que `generations.output` contient pour une pub · rien d'autre. */
interface SortieRendus { renders?: Record<string, string> }

/** L'adresse publique déjà connue pour cette variante, s'il y en a une. */
export function renduConnu(output: unknown, cle: string): string | null {
  const o = (output ?? {}) as SortieRendus;
  const u = o.renders?.[cle];
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : null;
}

/**
 * Range le PNG dans le bucket et note son adresse.
 *
 * La clé porte l'identifiant de la génération et l'empreinte de la recette ·
 * retoucher le texte d'une pub produit une autre clé, donc une autre image,
 * et l'ancienne reste valable pour qui l'avait déjà en cache.
 */
export async function rangerRendu(generationId: string, cle: string, png: ArrayBuffer): Promise<void> {
  const cfg = storageFromEnv();
  if (!cfg || !db) return;

  try {
    // `cle` vient de nous (id, ratio, drapeau, empreinte) · on la nettoie
    // quand même, une clé d'objet ne doit pas pouvoir sortir de son préfixe.
    const sure = cle.replace(/[^a-zA-Z0-9:_-]/g, '-');
    const url = await putObject(cfg, `renders/${generationId}/${sure}.png`, Buffer.from(png), 'image/png');

    // Fusion À L'INTÉRIEUR de `renders` · l'opérateur `||` de jsonb ne fusionne
    // qu'au premier niveau, donc `{renders:{a}} || {renders:{b}}` remplacerait
    // la clé entière et perdrait `a`. Deux ratios rendus le même jour
    // s'écraseraient l'un l'autre sans qu'on s'en aperçoive.
    await db.update(schema.generations)
      .set({
        output: sql`jsonb_set(
          coalesce(${schema.generations.output}, '{}'::jsonb),
          '{renders}',
          coalesce(${schema.generations.output} -> 'renders', '{}'::jsonb) || ${JSON.stringify({ [cle]: url })}::jsonb,
          true
        )`,
      })
      .where(eq(schema.generations.id, generationId));
  } catch {
    // Bucket absent, mal configuré, ou coupure · on garde le cache mémoire.
  }
}
