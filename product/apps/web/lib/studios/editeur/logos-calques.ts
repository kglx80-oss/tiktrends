import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { annonceLogosEditeur, calquesParZ, logosPosesParCalques, type AnnonceLogosEditeur, type DocumentStudio, type LogoDuProjet } from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { etatLogosCharte, VERIFICATION_LOGOS_RENDU, type VerifierLogo } from '../../logos-charte-etat';
import { logosDuCatalogue } from '../produit/catalogue';
import { roleAtLeast } from '../../rbac';

/**
 * Au rendu de l'éditeur d'image · ce que disent les calques qui posent un logo
 * de la charte (noyau `annonceLogosEditeur`), jugés par le MÊME bilan que la
 * fiche Identité, l'atelier Identités et l'écran vidéo (`etatLogosCharte`,
 * bornes `VERIFICATION_LOGOS_RENDU`). Lecture seule · rien n'est bloqué ni
 * écrit, le préflight de l'export relit chaque logo lui-même.
 *
 * Coût, mesuré par la garde (`studios-editeur-logo-db.test.tsx`, faux S3 qui
 * compte chaque requête) ·
 *  · aucun calque ne pose de logo de la charte ⇒ 0 lecture de la marque, 0
 *    requête au stockage ;
 *  · logos posés SANS empreinte (anciens, externes) ⇒ 1 lecture de la marque,
 *    0 requête au stockage ;
 *  · sinon 1 `HEAD` signé `If-Match` par logo DISTINCT à empreinte, quel que
 *    soit le nombre de calques qui le posent (mesuré · 3 calques, 2 logos ⇒
 *    2 HEAD ; 2 calques, 1 logo ⇒ 1 HEAD), aucun octet lu ; en parallèle et
 *    sous budget (≈ 3 s au pire, au-delà « non vérifiable », jamais « à
 *    réimporter »).
 */
export async function annonceLogosDesCalques(
  ctx: ContexteStudio, projet: { workspaceId: string; brandId: string }, doc: DocumentStudio | null, verifier?: VerifierLogo,
): Promise<AnnonceLogosEditeur | null> {
  const calques = doc ? calquesParZ(doc) : [];
  const poses = new Set(logosPosesParCalques(calques));
  if (!poses.size) return null;
  const [m] = await db.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos, logoEmpreintes: schema.brands.logoEmpreintes }).from(schema.brands)
    .where(and(eq(schema.brands.id, projet.brandId), eq(schema.brands.workspaceId, projet.workspaceId))).limit(1);
  if (!m) return null;
  const logos: LogoDuProjet[] = logosDuCatalogue(projet.brandId, m).filter((l) => poses.has(l.assetId)).map((l) => ({ assetId: l.assetId, url: l.url, libelle: l.libelle }));
  if (!logos.length) return null;
  const bilan = await etatLogosCharte({ workspaceId: projet.workspaceId, logoUrl: null, logos: logos.map((l) => l.url), logoEmpreintes: m.logoEmpreintes }, VERIFICATION_LOGOS_RENDU, verifier);
  return annonceLogosEditeur({ calques, logos, bilan, brandId: projet.brandId, peutGerer: roleAtLeast(ctx.roleEspace, 'admin') });
}
