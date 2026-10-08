'use server';

import type { ErreurStudio, ExportBrief } from '@tiktrends/core';
import { gardeSources } from '../../../lib/studios/sources/acces';
import { getSession } from '../../../lib/auth';
import { getActiveBrand } from '../../../lib/brands';
import type { Preparation } from '../../../lib/studios/sources/preparation';
import type { ResultatPropositions } from '../../../lib/studios/sources/hypotheses';
import type { ProjetCree, DetailProjet, CarteProjet, EntreeCreationDepuisSources } from '../../../lib/studios/sources/projet';

/**
 * Commandes du parcours Veille → sources → hypothèse → brief → projet
 * (cahier 01 §4.1, §4.2 · plan 06 §3).
 *
 * Chaque commande : garde studio (session relue, contexte serveur, portée) +
 * ouverture de la Veille relue, puis le lib. Les entrées sont `unknown` : une
 * action serveur s'appelle directement, son type n'est pas une validation.
 *
 * Seule `proposerHypotheses` appelle un modèle (texte, sous la barrière de
 * dépense existante, aucun crédit). Aucune commande ne génère de média, ne
 * crée de devis ni ne débite quoi que ce soit.
 *
 * Les modules lourds (registre de prompts) sont chargés à la demande : le
 * bouton « Préparer une création » vit dans la carte de Veille, rendue sur
 * chaque écran de veille.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

/** Lecture · la préparation d'une création (sources figées, marque, produits, IA). */
export async function preparerCreation(entree: { sources: unknown; brandId?: unknown }): Promise<Reponse<Preparation>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  const [{ preparerCreationPour }, { lirePointeur }, { adaptateurAnthropicGarde, modeleTexte }] = await Promise.all([
    import('../../../lib/studios/sources/preparation'),
    import('../../../lib/studios/prompts/depot-prompts'),
    import('../../../lib/studios/prompts/adaptateur'),
  ]);
  const s = await getSession();
  const active = s ? await getActiveBrand(s.workspaceId) : null;
  return preparerCreationPour(g.ctx, { sources: entree?.sources, brandId: entree?.brandId }, {
    veilleOuverte: g.veilleOuverte,
    maintenant: new Date(),
    marqueActive: active?.id ?? null,
    ia: { configuree: adaptateurAnthropicGarde() !== null, releasePubliee: (await lirePointeur()) !== null, modele: modeleTexte() },
  });
}

/** Appel texte payant (plafond annoncé avant le clic) · au plus trois hypothèses scellées. */
export async function proposerHypotheses(entree: { sources: unknown; brandId: unknown; objectif?: unknown }): Promise<ResultatPropositions> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return { ...g, saisieManuelle: true };
  const [{ proposerHypothesesPour }, { adaptateurAnthropicGarde }, { environnementPrompts }] = await Promise.all([
    import('../../../lib/studios/sources/hypotheses'),
    import('../../../lib/studios/prompts/adaptateur'),
    import('../../../lib/studios/prompts/environnement'),
  ]);
  return proposerHypothesesPour(g.ctx, { sources: entree?.sources, brandId: entree?.brandId, objectif: entree?.objectif }, {
    veilleOuverte: g.veilleOuverte,
    maintenant: new Date(),
    ia: { adaptateur: adaptateurAnthropicGarde(), environnement: environnementPrompts(process.env) },
  });
}

/** Écriture · projet + version 1 (brief, sources, hypothèse, produit), idempotente par clé de clic, auditée. */
export async function creerProjetDepuisSources(entree: EntreeCreationDepuisSources): Promise<Reponse<ProjetCree>> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  const { creerProjetDepuisSourcesPour } = await import('../../../lib/studios/sources/projet');
  return creerProjetDepuisSourcesPour(g.ctx, {
    sources: entree?.sources, brandId: entree?.brandId, kind: entree?.kind, titre: entree?.titre, objectif: entree?.objectif,
    hypothese: entree?.hypothese, productId: entree?.productId, cleClic: entree?.cleClic,
  }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

/** Lecture pure · le brief exporté (Markdown ou JSON), sans génération ni achat. */
export async function exporterBrief(entree: { projectId: unknown; versionId?: unknown; format?: unknown }): Promise<Reponse<ExportBrief>> {
  const g = await gardeSources('studio.export');
  if (!g.ok) return g;
  const { exporterBriefPour } = await import('../../../lib/studios/sources/projet');
  return exporterBriefPour(g.ctx, { projectId: entree?.projectId, versionId: entree?.versionId, format: entree?.format }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

/** Lecture pure · le projet complet, tel que le serveur le garde (reprise durable). */
export async function lireProjetDetail(entree: { projectId: unknown; versionId?: unknown }): Promise<Reponse<{ detail: DetailProjet }>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  const { lireProjetDetailPour } = await import('../../../lib/studios/sources/projet');
  return lireProjetDetailPour(g.ctx, entree?.projectId, { veilleOuverte: g.veilleOuverte, maintenant: new Date(), versionId: entree?.versionId });
}

/** Lecture pure · les cartes de reprise. */
export async function listerProjetsCartes(entree?: { brandId?: unknown }): Promise<Reponse<{ cartes: CarteProjet[] }>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  const { listerCartesPour } = await import('../../../lib/studios/sources/projet');
  const brandId = typeof entree?.brandId === 'string' ? entree.brandId : null;
  return { ok: true, cartes: await listerCartesPour(g.ctx, { brandId, veilleOuverte: g.veilleOuverte, maintenant: new Date() }) };
}
