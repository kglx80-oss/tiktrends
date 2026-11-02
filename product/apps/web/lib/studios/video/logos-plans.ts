import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  annonceLogosAReimporter, consigneDuPlan, referencesUtiliseesParPlan,
  type AnnonceLogosAReimporter, type ContenuVersion, type LogoDuProjet,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { etatLogosCharte, verificateurUnique, type VerifierLogo } from '../../logos-charte-etat';
import { logosDuCatalogue } from '../produit/catalogue';
import { roleAtLeast } from '../../rbac';
import { consignesCompileesSur } from './consigne';

/**
 * Les logos de la charte que l'image clé de chaque plan utiliserait, à
 * réimporter · aucun logo lié ⇒ aucune lecture ; un logo lié sans empreinte ⇒
 * aucune requête ; sinon un `HEAD` par logo (le même que la relecture des
 * consignes, `verifier`), aux bornes de la fiche (`VERIFICATION_LOGOS_RENDU`).
 * Rien n'est bloqué · le devis relit la consigne et refuse ce qu'il ne pourrait
 * pas envoyer (`verdictConsignePlan`).
 *
 * Lu par l'écran vidéo (`lireVideoPour`, qui partage son vérificateur avec la
 * relecture des consignes) et par l'atelier Identités
 * (`annoncesLogosDesPlans`) · les deux disent la MÊME chose d'un plan.
 */
export async function logosAReimporterDesPlans(
  ctx: ContexteStudio, projet: { workspaceId: string; brandId: string }, utilises: ReadonlyMap<string, readonly string[]>, verifier: VerifierLogo,
): Promise<Map<string, AnnonceLogosAReimporter>> {
  const out = new Map<string, AnnonceLogosAReimporter>();
  const lies = new Set([...utilises.values()].flat().filter((id) => id.startsWith('logo_')));
  if (!lies.size) return out;
  const [m] = await db.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos, logoEmpreintes: schema.brands.logoEmpreintes }).from(schema.brands)
    .where(and(eq(schema.brands.id, projet.brandId), eq(schema.brands.workspaceId, projet.workspaceId))).limit(1);
  if (!m) return out;
  const vus = new Set<string>();
  const logos: LogoDuProjet[] = [];
  for (const l of logosDuCatalogue(projet.brandId, m)) {
    if (!lies.has(l.assetId) || vus.has(l.assetId)) continue;
    vus.add(l.assetId);
    logos.push({ assetId: l.assetId, url: l.url, libelle: l.libelle });
  }
  if (!logos.length) return out;
  const bilan = await etatLogosCharte({ workspaceId: projet.workspaceId, logoUrl: null, logos: logos.map((l) => l.url), logoEmpreintes: m.logoEmpreintes }, undefined, verifier);
  const peutGerer = roleAtLeast(ctx.roleEspace, 'admin');
  for (const [sid, ids] of utilises) {
    const a = annonceLogosAReimporter({ utilises: ids, logos, bilan, brandId: projet.brandId, peutGerer });
    if (a) out.set(sid, a);
  }
  return out;
}

/**
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * L'atelier « Identités et voix » montre chaque plan de la vidéo (fiches
 * liées, narration, mode de parole), mais ne disait rien d'un logo de la
 * charte que l'image clé du plan utiliserait et qui a été remplacé dans le
 * stockage depuis son import · on ne l'apprenait qu'à l'écran vidéo, ou au
 * refus du devis.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Le MÊME ensemble que l'écran vidéo (`referencesUtiliseesParPlan` · ce que
 * la compilation transmettrait, la consigne retenue dans la version et la
 * dernière compilée en attente), la MÊME annonce (`annonceLogosAReimporter`),
 * le même jugement (`etatLogosCharte`, bornes `VERIFICATION_LOGOS_RENDU`, un
 * `HEAD` au plus par logo lié à empreinte, aucun sans empreinte, aucune
 * lecture sans logo lié). Lecture seule · rien n'est bloqué ni écrit.
 */
export async function annoncesLogosDesPlans(
  ctx: ContexteStudio, projet: { id: string; workspaceId: string; brandId: string }, contenu: ContenuVersion, versionId: string,
): Promise<Map<string, AnnonceLogosAReimporter>> {
  const compilees = await consignesCompileesSur(db, { workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id }, versionId);
  const utilises = new Map<string, string[]>();
  for (const sid of contenu.shots.order) utilises.set(sid, referencesUtiliseesParPlan(contenu, sid, [consigneDuPlan(contenu, sid), compilees.get(sid)?.consigne]));
  return logosAReimporterDesPlans(ctx, projet, utilises, verificateurUnique(projet.workspaceId));
}
