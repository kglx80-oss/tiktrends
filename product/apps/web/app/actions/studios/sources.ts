'use server';

import { erreurStudio, type ErreurStudio, type ExportBrief } from '@tiktrends/core';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { refusCloneVideoEspace } from '../../../lib/droits-forfait';
import { gardeSources } from '../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../lib/studios/interrupteurs';
import { getSession } from '../../../lib/auth';
import { getActiveBrand } from '../../../lib/brands';
import type { Preparation } from '../../../lib/studios/sources/preparation';
import type { ResultatPropositions } from '../../../lib/studios/sources/hypotheses';
import type { ProjetCree, DetailProjet, CarteProjet, EntreeCreationDepuisSources } from '../../../lib/studios/sources/projet';
import type { VueSource } from '../../../lib/studios/sources/sources';

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
 *
 * F1 · capacité « projets » (« export » pour le brief exporté) · coupée pour
 * l'espace ⇒ `UNSUPPORTED_CAPABILITY` avant toute écriture ou appel.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

/**
 * Droits du forfait (29/10, point 6) · cloner une pub (une source de Veille ou
 * une sauvegarde) en VIDÉO est inclus dès Pro. Refusé au serveur, dans la
 * commande canonique (toute entrée y passe), avant toute écriture · le refus
 * nomme le forfait qui débloque. Sans `TARIFS_V2`, aucun refus (`forfaitEffectif`).
 */
async function refusClone(ctx: { workspaceId: string; traceId: string }, kind: unknown, aDesSources: boolean): Promise<ErreurStudio | null> {
  if (kind !== 'video' || !aDesSources) return null;
  const refus = await refusCloneVideoEspace(ctx.workspaceId);
  return refus ? erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, targetIds: [], message: refus }) : null;
}
/** Une pub parmi les sources (annonce de Veille ou sauvegarde) · une création de la marque n'est pas un clone. */
const contientUnePub = (v: unknown) => Array.isArray(v) && v.some((e) => !(typeof e === 'object' && e !== null && (e as { type?: unknown }).type === 'creation'));

/** Lecture · la préparation d'une création (sources figées, marque, produits, IA). */
export async function preparerCreation(entree: { sources: unknown; brandId?: unknown }): Promise<Reponse<Preparation>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
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
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return { ...coupe, saisieManuelle: true };
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
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  const clone = await refusClone(g.ctx, entree?.kind, contientUnePub(entree?.sources));
  if (clone) return clone;
  const { creerProjetDepuisSourcesPour } = await import('../../../lib/studios/sources/projet');
  return creerProjetDepuisSourcesPour(g.ctx, {
    sources: entree?.sources, brandId: entree?.brandId, kind: entree?.kind, titre: entree?.titre, objectif: entree?.objectif,
    hypothese: entree?.hypothese, productId: entree?.productId, directionVisuelle: entree?.directionVisuelle, cleClic: entree?.cleClic,
  }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

/**
 * Écriture · projet préparé depuis un ancien lien de création (contexte repris :
 * annonce sauvegardée, objectif). Même garde et même capacité que la création
 * depuis des sources ; idempotente par clé de clic ; aucun appel modèle.
 */
export async function creerProjetDepuisContexte(entree: { brandId: unknown; kind?: unknown; titre?: unknown; objectif?: unknown; productId?: unknown; ref?: unknown; retourVeille?: unknown; cleClic: unknown }): Promise<Reponse<ProjetCree>> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  const clone = await refusClone(g.ctx, entree?.kind, entree?.ref !== undefined && entree?.ref !== null && entree?.ref !== '');
  if (clone) return clone;
  const { creerProjetDepuisContextePour } = await import('../../../lib/studios/sources/projet');
  return creerProjetDepuisContextePour(g.ctx, {
    brandId: entree?.brandId, kind: entree?.kind, titre: entree?.titre, objectif: entree?.objectif,
    productId: entree?.productId, ref: entree?.ref, retourVeille: entree?.retourVeille, cleClic: entree?.cleClic,
  }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

/**
 * Écriture · ajoute des sources (annonce de Veille, sauvegarde, création) à un
 * projet EXISTANT, après sa création (V5 A20). Même garde et même capacité que
 * la création depuis des sources · accès Veille relu pour une annonce de Veille,
 * portée de marque sur le projet et les sources. Aucun appel modèle, aucune
 * dépense ; les sources vivent sur `source_refs`, relues au rechargement.
 */
export async function ajouterSourcesAuProjet(entree: { projectId: unknown; sources: unknown }): Promise<Reponse<{ projet: { id: string; brandId: string }; sources: VueSource[]; ajoutees: number }>> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  if (db && typeof entree?.projectId === 'string' && /^[0-9a-f-]{36}$/i.test(entree.projectId)) {
    const [p] = await db.select({ kind: schema.studioProjects.kind }).from(schema.studioProjects)
      .where(and(eq(schema.studioProjects.id, entree.projectId), eq(schema.studioProjects.workspaceId, g.ctx.workspaceId))).limit(1);
    const clone = await refusClone(g.ctx, p?.kind, contientUnePub(entree?.sources));
    if (clone) return clone;
  }
  const { ajouterSourcesAuProjetPour } = await import('../../../lib/studios/sources/projet');
  return ajouterSourcesAuProjetPour(g.ctx, { projectId: entree?.projectId, sources: entree?.sources }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

/** Lecture pure · le brief exporté (Markdown ou JSON), sans génération ni achat. */
export async function exporterBrief(entree: { projectId: unknown; versionId?: unknown; format?: unknown }): Promise<Reponse<ExportBrief>> {
  const g = await gardeSources('studio.export');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['export']);
  if (coupe) return coupe;
  const { exporterBriefPour } = await import('../../../lib/studios/sources/projet');
  return exporterBriefPour(g.ctx, { projectId: entree?.projectId, versionId: entree?.versionId, format: entree?.format }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

/** Lecture pure · le projet complet, tel que le serveur le garde (reprise durable). */
export async function lireProjetDetail(entree: { projectId: unknown; versionId?: unknown }): Promise<Reponse<{ detail: DetailProjet }>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  const { lireProjetDetailPour } = await import('../../../lib/studios/sources/projet');
  return lireProjetDetailPour(g.ctx, entree?.projectId, { veilleOuverte: g.veilleOuverte, maintenant: new Date(), versionId: entree?.versionId });
}

/** Lecture pure · les cartes de reprise. */
export async function listerProjetsCartes(entree?: { brandId?: unknown; archives?: unknown }): Promise<Reponse<{ cartes: CarteProjet[] }>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  const { listerCartesPour } = await import('../../../lib/studios/sources/projet');
  const brandId = typeof entree?.brandId === 'string' ? entree.brandId : null;
  // `archives: true` · les projets archivés de la même portée (filtre « Archivés », restauration).
  const statut = entree?.archives === true ? 'archived' as const : 'active' as const;
  return { ok: true, cartes: await listerCartesPour(g.ctx, { brandId, veilleOuverte: g.veilleOuverte, maintenant: new Date(), statut }) };
}
