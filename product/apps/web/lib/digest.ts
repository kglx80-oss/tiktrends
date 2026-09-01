import 'server-only';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { buildDigest, worthSending, digestText, type Digest, type DigestFacts } from '@tiktrends/core';
import { learnedSinceFor, testedKeys } from './milestones';

/**
 * Les faits de la semaine, ramassés marque par marque.
 *
 * ── Chaque lecture est isolée ────────────────────────────────────────────────
 *
 * C'est la même précaution que partout : une lettre qui ne part pas parce qu'un
 * compteur a échoué est pire qu'une lettre incomplète. Un compte manquant vaut
 * zéro · la phrase correspondante disparaît, le reste tient.
 *
 * ── Rien n'est appelé au modèle ──────────────────────────────────────────────
 *
 * Le digest est calculé. Il ne coûte donc rien, et il ne peut pas inventer un
 * chiffre · une lettre hebdomadaire qui dépense à chaque envoi finirait coupée
 * pour la mauvaise raison.
 */

const SEMAINE_MS = 7 * 86_400_000;

async function sansCasse<T>(p: Promise<T>, repli: T): Promise<T> {
  try { return await p; } catch { return repli; }
}

/**
 * Les trouvailles du radar de la semaine, et celles qui ouvrent une voie neuve.
 *
 * `unexplored` n'est pas stocké · le radar le calcule à son passage et ne le
 * garde pas. On le recompose donc à partir des mêmes jalons que lui, pour que
 * les deux écrans ne puissent pas donner deux comptes différents.
 */
async function trouvaillesRadar(
  brandId: string, workspaceId: string, depuis: Date,
): Promise<{ n: number; neuves: number }> {
  if (!db) return { n: 0, neuves: 0 };

  const [rows, stats] = await Promise.all([
    db.select({ hookType: schema.marketCreatives.hookType, openingType: schema.marketCreatives.openingType })
      .from(schema.marketCreatives)
      .where(and(
        eq(schema.marketCreatives.workspaceId, workspaceId),
        eq(schema.marketCreatives.brandId, brandId),
        sql`${schema.marketCreatives.radarSignal} is not null`,
        gte(schema.marketCreatives.reportedAt, depuis),
      ))
      .limit(200),
    testedKeys(brandId),
  ]);

  const testees = stats;
  const neuves = rows.filter((r) => {
    const traits = [r.hookType, r.openingType].filter((t): t is string => !!t);
    return traits.length > 0 && traits.every((t) => !testees.has(t));
  }).length;

  return { n: rows.length, neuves };
}

export interface BrandDigest {
  brandId: string;
  workspaceId: string;
  digest: Digest;
  facts: DigestFacts;
}

/**
 * Rassemble ce qui s'est passé sur une marque depuis `depuis`.
 *
 * Le stock (`pending`) n'est PAS borné à la semaine · c'est justement le point :
 * une créa qui attend un verdict depuis trois semaines est le fait le plus utile
 * de la lettre, et une fenêtre de sept jours l'aurait effacée.
 */
export async function brandFacts(
  brandId: string, workspaceId: string, brandName: string, depuis: Date,
): Promise<DigestFacts> {
  const vide: DigestFacts = {
    brandName, verdictsWeek: 0, winnersWeek: 0, createdWeek: 0, pending: 0,
    radarFindings: 0, radarUnexplored: 0, newlyConclusive: [], iterationsReady: 0,
  };
  if (!db) return vide;
  const base = db;

  const GAGNANTS = ['winner', 'baby_winner', 'relative_winner'];

  const [verdicts, creees, attente, radar, suites, appris] = await Promise.all([
    // Verdicts ARBITRÉS de la semaine · un verdict calculé peut encore bouger,
    // et annoncer un gagnant qui se dédit lundi prochain coûte la confiance.
    sansCasse(
      base.select({
        n: count(),
        gagnants: sql<number>`count(*) filter (where ${schema.verdicts.validated} in ('winner','baby_winner','relative_winner'))`,
      })
        .from(schema.verdicts)
        .innerJoin(schema.ads, eq(schema.verdicts.adId, schema.ads.id))
        .where(and(
          eq(schema.ads.workspaceId, workspaceId),
          eq(schema.verdicts.status, 'validated'),
          gte(schema.verdicts.computedAt, depuis),
        ))
        .then((r) => ({ n: Number(r[0]?.n ?? 0), gagnants: Number(r[0]?.gagnants ?? 0) })),
      { n: 0, gagnants: 0 },
    ),

    sansCasse(
      base.select({ n: count() }).from(schema.generations)
        .where(and(eq(schema.generations.brandId, brandId), gte(schema.generations.createdAt, depuis)))
        .then((r) => Number(r[0]?.n ?? 0)),
      0,
    ),

    // Le stock, hors fenêtre · voir plus haut.
    sansCasse(
      base.select({ n: count() }).from(schema.ads)
        .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
        .where(and(
          eq(schema.ads.workspaceId, workspaceId),
          sql`(${schema.verdicts.validated} is null or ${schema.verdicts.status} <> 'validated')`,
        ))
        .then((r) => Number(r[0]?.n ?? 0)),
      0,
    ),

    sansCasse(trouvaillesRadar(brandId, workspaceId, depuis), { n: 0, neuves: 0 }),

    // Suites possibles · une par ad gagnante arbitrée, c'est la borne haute de
    // ce que le plan d'itération proposera.
    sansCasse(
      base.select({ n: count() })
        .from(schema.verdicts)
        .innerJoin(schema.ads, eq(schema.verdicts.adId, schema.ads.id))
        .where(and(
          eq(schema.ads.workspaceId, workspaceId),
          eq(schema.verdicts.status, 'validated'),
          sql`${schema.verdicts.validated} = any(${GAGNANTS})`,
        ))
        .then((r) => Number(r[0]?.n ?? 0)),
      0,
    ),

    // Ce que la mémoire a appris pendant la fenêtre · les jalons rattrapés du
    // premier passage sont écartés par le noyau.
    sansCasse(learnedSinceFor(brandId, depuis), [] as string[]),
  ]);

  return {
    brandName,
    verdictsWeek: verdicts.n,
    winnersWeek: verdicts.gagnants,
    createdWeek: creees,
    pending: attente,
    radarFindings: radar.n,
    radarUnexplored: radar.neuves,
    newlyConclusive: appris,
    iterationsReady: suites,
  };
}

/**
 * Les lettres à envoyer, toutes marques confondues.
 *
 * Une marque dont la semaine ne mérite pas de lettre n'en produit pas · c'est
 * la règle du noyau, appliquée ici sans exception.
 */
export async function weeklyDigests(now = new Date()): Promise<BrandDigest[]> {
  if (!db) return [];
  const depuis = new Date(now.getTime() - SEMAINE_MS);

  const marques = await sansCasse(
    db.select({ id: schema.brands.id, name: schema.brands.name, workspaceId: schema.brands.workspaceId })
      .from(schema.brands).limit(500),
    [] as Array<{ id: string; name: string; workspaceId: string }>,
  );

  const out: BrandDigest[] = [];
  for (const b of marques) {
    const facts = await brandFacts(b.id, b.workspaceId, b.name, depuis);
    if (!worthSending(facts)) continue;
    out.push({ brandId: b.id, workspaceId: b.workspaceId, digest: buildDigest(facts), facts });
  }
  return out;
}

export { digestText };
