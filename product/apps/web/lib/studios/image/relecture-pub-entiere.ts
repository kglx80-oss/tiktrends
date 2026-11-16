import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  borneMaxAppel, depasseMontantApprouve, photosDuProduit, relecturePubEntiere, typeMediaReel, CLE_RELECTURE_JOB,
  type PubEntiere, type VerdictRelecturePubEntiere,
} from '@tiktrends/core';
import { controlePubEntiere, requeteControlePub, type ImageJointe } from '@tiktrends/ai';
import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';
import { hacherImage } from '../produit/catalogue';
import { octetsDataUri } from '../../import-image';

/**
 * Studios · relecture d'une PUB ENTIÈRE à sa génération · le générateur a écrit
 * la typographie lui-même, on relit ce qu'il a écrit.
 *
 * Perception par la vision (`controlePubEntiere`, `packages/ai` : texte lu,
 * packaging comparé à la photo du produit, lisibilité), jugement en code
 * (`relecturePubEntiere`, noyau : mots exacts, mots manquants et en trop,
 * cohérence de l'accroche avec les faits du produit).
 *
 * ── Argent ───────────────────────────────────────────────────────────────────
 *
 * La relecture est PAYÉE par la ligne « contrôle visuel » du devis accepté
 * (cochée par défaut en pub entière, sa borne y est ajoutée). Elle ne part que
 * si sa requête EXACTE tient dans la part approuvée (`depasseMontantApprouve`,
 * avant l'envoi), puis par le client sous plafond (`guardedAnthropic` :
 * réservation du maximum, réglage au réel). Aucune reprise automatique : une
 * pub « à reprendre » le dit, la régénérer passe par un nouveau devis.
 *
 * Un échec ne fait jamais échouer le job : la pub reste livrée, la relecture
 * est « non conclue » et le dit.
 */

export interface DependancesRelecture {
  /** Client Anthropic sous plafond · `null` sans fournisseur de vision. */
  client: Anthropic | null;
  /** Lecture de la photo du produit · défaut : data URI décodée, sinon `safeFetch` borné. */
  lireReference?: (url: string) => Promise<ImageJointe | null>;
}

const OCTETS_REFERENCE_MAX = 6_000_000;

/** La photo du produit, en octets · jamais une adresse transmise au fournisseur de vision. */
export async function lireReferenceParDefaut(url: string): Promise<ImageJointe | null> {
  const octets = url.startsWith('data:') ? octetsDataUri(url) : (await safeFetch(url, { maxBytes: OCTETS_REFERENCE_MAX, timeoutMs: 15_000 }))?.body ?? null;
  if (!octets) return null;
  const type = typeMediaReel(new Uint8Array(octets));
  if (type !== 'image/png' && type !== 'image/jpeg' && type !== 'image/webp' && type !== 'image/gif') return null;
  return { mediaType: type, base64: Buffer.from(octets).toString('base64') };
}

/** L'adresse de la photo épinglée (`pph_…`) dans le catalogue de la MARQUE du job · `null` sinon. */
export async function adressePhotoProduit(portee: { workspaceId: string; brandId: string }, assetId: string): Promise<string | null> {
  const P = schema.products;
  const lignes = await db.select({ id: P.id, name: P.name, imageUrl: P.imageUrl, imageUrls: P.imageUrls })
    .from(P).innerJoin(schema.brands, eq(schema.brands.id, P.brandId))
    .where(and(eq(P.brandId, portee.brandId), eq(schema.brands.workspaceId, portee.workspaceId)));
  for (const l of lignes) for (const ph of photosDuProduit(l, hacherImage)) if (ph.assetId === assetId) return ph.url;
  return null;
}

/**
 * Relit la pub livrée · rend TOUJOURS un verdict (jamais d'exception) ; « non
 * conclue » quand la vision n'a pas pu répondre, avec la raison.
 */
export async function relirePubEntiere(e: {
  pub: PubEntiere;
  /** Part de la ligne approuvée réservée à la relecture, micro-dollars. */
  approuveMicros: number;
  sortie: { octets: Uint8Array; mime: string } | null;
  referenceUrl: string | null;
  faits: readonly string[];
}, d: DependancesRelecture): Promise<VerdictRelecturePubEntiere> {
  const non = (motif: string) => relecturePubEntiere({ copie: e.pub.copie, constat: null, faits: e.faits, motif });
  if (!e.sortie) return non('média livré illisible');
  if (!d.client) return non('le fournisseur de vision n’est pas configuré sur ce serveur');
  const image: ImageJointe = { mediaType: e.sortie.mime, base64: Buffer.from(e.sortie.octets).toString('base64') };
  let reference: ImageJointe | null = null;
  if (e.referenceUrl) {
    try { reference = await (d.lireReference ?? lireReferenceParDefaut)(e.referenceUrl); } catch { reference = null; }
  }
  // La requête EXACTE que `controlePubEntiere` enverra · refusée AVANT l'envoi si elle dépasse la part approuvée.
  const refus = depasseMontantApprouve(borneMaxAppel(requeteControlePub({ image, reference })), e.approuveMicros);
  if (refus) return non(`relecture refusée avant l’envoi · ${refus}`);
  try {
    const constat = await controlePubEntiere(d.client, { image, reference });
    if (!constat) return non('la vision n’a rien rendu d’exploitable');
    return relecturePubEntiere({ copie: e.pub.copie, constat, faits: e.faits });
  } catch (err) {
    console.error('[studios:relecture] relecture non conclue', err instanceof Error ? err.message : err);
    return non('la vision n’a pas répondu');
  }
}

/** Écrit le verdict à côté des médias livrés (`studio_jobs.result`) · une écriture, rien d'autre. */
export async function ecrireRelecture(jobId: string, workspaceId: string, v: VerdictRelecturePubEntiere): Promise<void> {
  const J = schema.studioJobs;
  await db.update(J)
    .set({ result: sql`jsonb_set(coalesce(${J.result}, '{}'::jsonb), ${`{${CLE_RELECTURE_JOB}}`}::text[], ${JSON.stringify(v)}::jsonb)` })
    .where(and(eq(J.id, jobId), eq(J.workspaceId, workspaceId)));
}
