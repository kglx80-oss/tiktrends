/**
 * Recette Studios · E2 · le DEVIS COMPLET du pas 1, calculé sur ce qui sera
 * RÉELLEMENT envoyé, AVANT toute dépense et sans aucune écriture.
 *
 * ── Le défaut réparé (Codex/propriétaire, 9 octobre) ─────────────────────────
 *
 * « Corrige le montant figé de 0,36 $ : calcule la réservation nécessaire pour
 * la compilation, l'image et le contrôle visuel à partir des paramètres
 * effectivement envoyés. » La ligne de compilation était `coutMaximalTexte`
 * (3,5 caractères par jeton) : une ESTIMATION, dépassable (mesures R3,
 * `packages/core/src/depense-prudente.ts`).
 *
 * ── Comment la requête réelle est construite sans être envoyée ───────────────
 *
 * `executerTache` (résolveur) n'a pas d'entrée « à blanc » : tout échec après
 * la compilation y écrit une trace `studio_prompt_runs` (ligne métier). Ce
 * module rejoue donc, EN LECTURE SEULE, les mêmes étapes avec les MÊMES
 * fonctions exportées, dans le même ordre :
 *
 *   `compilerEtAttesterPour` → format de la version courante ;
 *   `compilerConsigneImagePour` → catalogue du projet, contrôle avant
 *     compilation, `entreeCompilation`, contexte `image.compile` ;
 *   `executerTache` → release active (pointeur), `resoudreTemplate`,
 *     `construireContexte`, `allouerContexte` (budget par défaut du
 *     résolveur), `compilerRequete` (politique serveur, socle, rendu) ;
 *   adaptateur réel → `requeteDepuisMessagesCompiles` → `borneMaxAppel`.
 *
 * Garde au RÉSULTAT (`test/e2-devis-pas1.test.ts`) : les messages et le
 * plafond de sortie calculés ici sont IDENTIQUES à ceux que l'adaptateur
 * reçoit quand la vraie compilation s'exécute, et la borne écrite au devis est
 * ÉGALE à la réservation que `guardedAnthropic` pose réellement en base. Si le
 * résolveur change d'étape, la garde tombe.
 *
 * Et à l'exécution, la compilation passe par `adaptateurBorne` à la ligne du
 * devis : une requête dont la borne dépasserait ce qui a été confirmé est
 * refusée AVANT l'envoi. La ligne est donc une borne, pas une estimation.
 */

import {
  borneMaxAppel, controlerAvantCompilation, entreeCompilation, requeteDepuisMessagesCompiles, sourcesCitees,
  JETONS_ENTREE_MAX_PROPOSITION, JETONS_RESERVE_CONTEXTE, JETONS_SORTIE_MAX_PROPOSITION,
  type ContenuVersion, type ModeImage,
} from '@tiktrends/core';
import { allouerContexte, compilerRequete, resoudreTemplate, POLITIQUE_SERVEUR, type MessageCompile } from '../../lib/studios/prompts/noyau';
import { releaseActive } from '../../lib/studios/prompts/depot-prompts';
import { construireContexte } from '../../lib/studios/prompts/contexte';
import { chargerSource } from '../../lib/studios/prompts/source';
import { chargerCatalogueProjet } from '../../lib/studios/produit/catalogue';
import { formatImageDuContenu } from '../../lib/studios/image/verification';
import { lireProjet, lireVersion } from '../../lib/studios/depot';
import type { ContexteStudio } from '../../lib/studios/garde';

export interface RequeteCompilationCalculee {
  modele: string;
  profil: string;
  messages: ReadonlyArray<MessageCompile>;
  maxJetonsSortie: number;
  /** Borne du coût de CETTE requête (ce que `guardedAnthropic` réservera), en dollars. */
  borneUsd: number;
  /** Même borne, micro-dollars entiers arrondis au supérieur. */
  borneUsdMicros: number;
}

export type ResultatRequeteCompilation = { ok: true; requete: RequeteCompilationCalculee } | { ok: false; raison: string };

/**
 * La requête `image.compile` que la commande enverrait MAINTENANT, et sa
 * borne · aucune écriture, aucun appel. `modelePour` est le routage de
 * l'adaptateur réel (`PROFILS_ROUTES_ANTHROPIC`).
 */
export async function requeteCompilationPas1(
  ctx: ContexteStudio,
  e: { projectId: string; mode: ModeImage; maintenant: Date; modelePour: (profil: string) => string | null },
): Promise<ResultatRequeteCompilation> {
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok || !p.projet.currentVersionId) return { ok: false, raison: 'projet de recette introuvable ou sans version courante' };
  const v = await lireVersion(ctx, p.projet.currentVersionId);
  if (!v.ok) return { ok: false, raison: 'version courante illisible' };
  const format = formatImageDuContenu(v.version.content as ContenuVersion);

  const c = await chargerCatalogueProjet(ctx, e.projectId, { veilleOuverte: true, maintenant: e.maintenant });
  if (!c.ok) return { ok: false, raison: `catalogue du projet illisible (${c.code})` };
  const cat = c.catalogue;
  const prep = controlerAvantCompilation({ mode: e.mode, brief: cat.brief, produit: cat.epingle, fichiers: cat.fichiers });
  if (!prep.ok || !cat.brief) return { ok: false, raison: `contrôle avant compilation refusé · ${prep.violations.map((x) => x.raison).join(' ; ')}` };
  const entree = entreeCompilation({ prep, brief: cat.brief, versionId: cat.version.id, mode: e.mode, largeur: format.largeur, hauteur: format.hauteur });

  const release = await releaseActive();
  if (!release) return { ok: false, raison: 'aucune release de prompts publiée' };
  if (release.noyau.revocation) return { ok: false, raison: 'release active révoquée' };
  const contenus = new Map(release.contenu.templates.map((t) => [`${t.key}@${t.version}`, t]));
  const portee = { workspaceId: ctx.workspaceId, brandId: cat.projet.brandId };
  const res = resoudreTemplate({ templateKey: 'image.compile', espaceId: portee.workspaceId, marqueId: portee.brandId, release: { ...release.noyau, statut: release.noyau.statut === 'staged' ? 'active' : release.noyau.statut }, contenus, overrides: [], champsExtensibles: {} });
  if (!res.ok) return { ok: false, raison: `gabarit image.compile non résolu (${res.constats[0]?.code})` };
  const template = res.template;
  const modele = e.modelePour(template.modelProfile);
  if (!modele) return { ok: false, raison: `profil « ${template.modelProfile} » non routé` };

  const { contexte } = await construireContexte(portee, {
    language: 'fr', projectVersionId: cat.version.id, facts: entree.facts, invariants: entree.invariants,
    references: entree.references, resolvedDocuments: entree.resolvedDocuments, selectionIds: prep.referenceIds,
    sources: sourcesCitees(cat.brief, cat.sourcesProjet, cat.epingle ?? cat.instantane),
  });
  const budget = allouerContexte({ context: contexte, taskInputs: entree.taskInputs }, { budgetJetons: JETONS_ENTREE_MAX_PROPOSITION, reserveJetons: JETONS_RESERVE_CONTEXTE });
  if (!budget.ok) return { ok: false, raison: `contexte hors budget (${budget.code})` };
  const s = chargerSource();
  const comp = compilerRequete({
    politique: POLITIQUE_SERVEUR, socle: { commonSystemInstructions: release.contenu.commonSystemInstructions, commonSystemHash: release.entrees.socle.contentHash },
    rendu: release.contenu.rendering, template, entree: budget.entree, validateur: s.validateur, semantique: { validerDocument: s.validerDocument },
  });
  if (!comp.ok) return { ok: false, raison: `compilation refusée (${comp.code})` };

  const maxJetonsSortie = JETONS_SORTIE_MAX_PROPOSITION;
  const borneUsd = borneMaxAppel(requeteDepuisMessagesCompiles({ modele, messages: comp.requete.messages, images: 0, maxJetonsSortie }));
  return { ok: true, requete: { modele, profil: template.modelProfile, messages: comp.requete.messages, maxJetonsSortie, borneUsd, borneUsdMicros: Math.ceil(borneUsd * 1_000_000 - 1e-6) } };
}
