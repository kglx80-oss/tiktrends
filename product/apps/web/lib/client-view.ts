import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';

/**
 * ADSMAP · lecture publique d'une carte, par jeton de partage (§12).
 *
 * Tout ce fichier est écrit autour d'une contrainte : **ce qui sort d'ici part
 * chez quelqu'un qui n'est pas dans l'espace de travail, et ne revient pas.** Un
 * lien se transfère ; on ne sait pas qui le lira.
 *
 * La sélection SQL est donc la frontière de sécurité, pas le rendu. Les colonnes
 * sensibles ne sont pas masquées à l'affichage : elles ne sont jamais lues.
 *
 * Trois exclusions, chacune pour une raison différente :
 *
 *  - **dépense, CPA, budget** · la marge de l'agence se lit dedans ;
 *  - **hypothèses et apprentissages** · c'est la méthode, ce que le client paie ;
 *  - **verdicts non arbitrés** · un chiffre provisoire ferait discuter une
 *    conclusion qui n'est pas encore prise.
 */

export interface ClientAd {
  variantCode: string;
  concept: string;
  angle: string | null;
  format: string;
  verdict: string;
  launchedAt: string | null;
}

export interface ClientView {
  brandName: string;
  /** Ads arbitrées, les plus récentes d'abord. */
  ads: ClientAd[];
  counts: { tested: number; winners: number };
  /** Taux de réussite sur les tests concluants · le seul chiffre qui sort. */
  hitRate: number | null;
  updatedAt: string | null;
}

const GAGNANTS = new Set(['winner', 'baby_winner', 'relative_winner']);
const NON_CONCLUANTS = new Set(['inconclusive', 'insufficient_delivery']);

/**
 * Résout un jeton et compose la vue.
 *
 * Renvoie `null` sans distinguer « jeton inconnu » de « jeton expiré » : la
 * différence n'aiderait qu'à savoir qu'un lien a existé.
 */
export async function clientViewByToken(token: string): Promise<ClientView | null> {
  if (!db || !token || token.length > 200) return null;

  const [lien] = await db.select({
    brandId: schema.clientShareLinks.brandId,
    workspaceId: schema.clientShareLinks.workspaceId,
    expiresAt: schema.clientShareLinks.expiresAt,
    brandName: schema.brands.name,
    syncedAt: schema.brands.adsmapSyncedAt,
  })
    .from(schema.clientShareLinks)
    .innerJoin(schema.brands, eq(schema.clientShareLinks.brandId, schema.brands.id))
    .where(eq(schema.clientShareLinks.token, token))
    .limit(1);

  if (!lien) return null;
  if (lien.expiresAt && (lien.expiresAt as Date).getTime() < Date.now()) return null;

  // Seulement les verdicts ARBITRÉS. `validated` porte la décision humaine ·
  // `computed` peut encore bouger à la prochaine mesure.
  const rows = await db.select({
    variantCode: schema.ads.variantCode,
    format: schema.ads.format,
    launchedAt: schema.ads.launchedAt,
    concept: schema.concepts.title,
    angle: schema.angles.label,
    verdict: schema.verdicts.validated,
  })
    .from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .innerJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
    .where(and(
      eq(schema.personas.brandId, lien.brandId),
      eq(schema.ads.workspaceId, lien.workspaceId),
      eq(schema.verdicts.status, 'validated'),
    ))
    .orderBy(desc(schema.ads.launchedAt))
    .limit(300);

  const ads: ClientAd[] = rows
    .filter((r) => !!r.verdict)
    .map((r) => ({
      variantCode: r.variantCode,
      concept: r.concept,
      angle: r.angle,
      format: r.format,
      verdict: r.verdict!,
      launchedAt: r.launchedAt ? (r.launchedAt as Date).toISOString() : null,
    }));

  const concluantes = ads.filter((a) => !NON_CONCLUANTS.has(a.verdict));
  const gagnantes = concluantes.filter((a) => GAGNANTS.has(a.verdict));

  return {
    brandName: lien.brandName,
    ads,
    counts: { tested: ads.length, winners: gagnantes.length },
    hitRate: concluantes.length ? gagnantes.length / concluantes.length : null,
    updatedAt: lien.syncedAt ? (lien.syncedAt as Date).toISOString() : null,
  };
}
