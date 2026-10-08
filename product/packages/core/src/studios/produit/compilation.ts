/**
 * Studios · L5 · contrôle AVANT et APRÈS la compilation de la consigne image
 * (`image.compile`, cahier 01 §4.4 points 2 et 5 ; recettes IMG-01, IMG-04).
 *
 * Pur. Avant tout appel :
 *  · le produit est épinglé, sa photo est la référence Produit, à la même
 *    version et la même empreinte ;
 *  · chaque association respecte son rôle (rejoué sur la donnée stockée) ;
 *  · chaque référence concurrente produit ses INTERDITS de transfert (sujet,
 *    personnage, produit, logo, texte, nom), qui partent dans les invariants
 *    de la tâche ET sont ajoutés par le serveur à la consigne finale (ils ne
 *    dépendent pas de la bonne volonté du modèle).
 * Après l'appel :
 *  · chaque liaison de référence porte un rôle DÉCLARÉ pour ce fichier (un
 *    rôle que l'utilisateur n'a pas choisi est un rôle déduit : refusé) ;
 *  · la consigne ne nomme pas l'annonceur, ne recopie pas son texte ;
 *  · les composants obligatoires sont tous protégés.
 */

import type { ViolationStudio } from '../document';
import type { BriefCanonique, ReferenceBrief, RoleReference } from '../brief';
import type { SourceReferenceStudio } from '../sources/reference';
import { fuitesConcurrent } from '../sources/import';
import type { FichierCatalogue } from './catalogue';
import { controlerAssociations, LIBELLES_ROLE, ROLES_PERMIS_CONCURRENT } from './references';
import { documentBrief, documentResolu } from '../textes/textes';
import type { ReferenceProduitEpinglee } from './epinglage';

export type ModeImage = 'faithful_composite' | 'generative_scene';
export const LIBELLES_MODE_IMAGE: Readonly<Record<ModeImage, string>> = {
  faithful_composite: 'Produit fidèle · photo détourée non régénérée, décor généré à part',
  generative_scene: 'Mise en scène générée · contrôle visuel des composants obligatoire',
};

export interface PreparationCompilation {
  ok: boolean;
  violations: ViolationStudio[];
  /** Les associations transmises à la tâche, dans l'ordre du brief. */
  references: ReferenceBrief[];
  referenceIds: string[];
  /** Interdits de transfert, un par référence concurrente · ajoutés par le serveur à la consigne. */
  interditsTransfert: string[];
  composantsProteges: string[];
  invariants: string[];
  avertissements: string[];
}

export function interditsDeTransfert(f: FichierCatalogue, roles: readonly RoleReference[]): string {
  const qui = f.annonceur?.trim() ? `« ${f.annonceur.trim()} »` : 'l’annonceur source';
  return `Référence ${f.assetId} (${roles.map((r) => LIBELLES_ROLE[r]).join(' et ')} d’une annonce concurrente de ${qui}) : reprendre seulement matière, lumière, palette et cadrage · ni son sujet, ni son personnage, ni son produit, ni son logo, ni son texte, ni le nom de ${qui}.`;
}

export function controlerAvantCompilation(e: {
  mode: ModeImage;
  brief: BriefCanonique | null;
  produit: ReferenceProduitEpinglee | null;
  fichiers: ReadonlyMap<string, FichierCatalogue>;
}): PreparationCompilation {
  const v: ViolationStudio[] = [];
  const avertissements: string[] = [];
  const refs = e.brief?.references ?? [];
  if (!e.brief) v.push({ chemin: '/brief', raison: 'le projet n’a pas de brief' });
  if (!e.produit) v.push({ chemin: '/productRef', raison: 'épingle le produit et UNE photo précise avant de compiler' });
  else {
    const p = e.produit;
    const assoc = refs.find((r) => r.role === 'product' && r.assetId === p.photo.assetId);
    if (!assoc) v.push({ chemin: '/brief/references', raison: 'la photo épinglée n’est pas la référence Produit du brief' });
    else if (assoc.sha256 !== p.photo.sha256 || assoc.assetVersion !== p.photo.assetVersion) v.push({ chemin: '/brief/references', raison: 'la référence Produit ne porte pas la version épinglée' });
    const f = e.fichiers.get(p.photo.assetId);
    if (!f || f.sha256 !== p.photo.sha256) v.push({ chemin: '/productRef/photo', raison: 'la photo épinglée n’est plus dans le catalogue · épingle une photo présente' });
    if (e.mode === 'generative_scene' && p.composantsObligatoires.length === 0) {
      avertissements.push('Aucun composant obligatoire déclaré · le contrôle visuel de l’identité reste exigé après génération.');
    }
  }
  v.push(...controlerAssociations(refs, e.fichiers, e.produit));

  const rolesParFichier = new Map<string, RoleReference[]>();
  for (const r of refs) rolesParFichier.set(r.assetId, [...(rolesParFichier.get(r.assetId) ?? []), r.role]);
  const interdits: string[] = [];
  for (const [assetId, roles] of rolesParFichier) {
    const f = e.fichiers.get(assetId);
    if (f?.provenance === 'concurrent') interdits.push(interditsDeTransfert(f, roles));
  }
  const composants = e.produit ? [...e.produit.composantsObligatoires] : [];
  const invariants = [
    ...(e.brief?.invariants ?? []),
    ...(e.produit?.attributsImmuables ?? []),
    ...composants.map((c) => `Composant obligatoire visible : ${c}`),
    ...interdits,
  ].slice(0, 100);
  return {
    ok: v.length === 0, violations: v, references: [...refs], referenceIds: [...new Set(refs.map((r) => r.assetId))],
    interditsTransfert: interdits, composantsProteges: composants, invariants, avertissements,
  };
}

/** Le `result` de `image_compile_output` (forme validée par le registre). */
export interface ConsigneImage {
  generationInstruction: string;
  negativeConstraints: string[];
  referenceBindings: Array<{ referenceId: string; role: string; scope: string }>;
  protectedComponents: string[];
  needsDeterministicOverlay: boolean;
}

/**
 * Contrôle APRÈS l'appel · liste vide = sortie acceptable. Un rôle de liaison
 * qui ne fait pas partie des rôles DÉCLARÉS pour ce fichier est refusé (rôle
 * déduit), une référence concurrente ne sert que de style ou de composition,
 * l'annonceur n'est ni nommé ni recopié, chaque composant est protégé.
 */
export function controlerSortieCompilation(r: ConsigneImage, prep: PreparationCompilation, fichiers: ReadonlyMap<string, FichierCatalogue>, sources: readonly SourceReferenceStudio[]): ViolationStudio[] {
  const v: ViolationStudio[] = [];
  const declares = new Map<string, Set<string>>();
  for (const a of prep.references) declares.set(a.assetId, new Set([...(declares.get(a.assetId) ?? []), a.role]));
  r.referenceBindings.forEach((b, i) => {
    const c = `/result/referenceBindings/${i}`;
    const roles = declares.get(b.referenceId);
    if (!roles) { v.push({ chemin: `${c}/referenceId`, raison: 'référence non transmise à la tâche' }); return; }
    if (!roles.has(b.role)) v.push({ chemin: `${c}/role`, raison: `rôle « ${b.role} » non déclaré pour ce fichier · aucun rôle déduit` });
    if (fichiers.get(b.referenceId)?.provenance === 'concurrent' && !(ROLES_PERMIS_CONCURRENT as readonly string[]).includes(b.role)) {
      v.push({ chemin: `${c}/role`, raison: 'une annonce concurrente ne sert que de style ou de composition' });
    }
  });
  const proteges = new Set(r.protectedComponents);
  for (const c of prep.composantsProteges) if (!proteges.has(c)) v.push({ chemin: '/result/protectedComponents', raison: `composant obligatoire « ${c} » non protégé` });
  const concurrents = sources.filter((s) => fichiers.get(s.sourceId)?.provenance === 'concurrent' && prep.referenceIds.includes(s.sourceId));
  const champs = [
    { chemin: '/result/generationInstruction', texte: r.generationInstruction },
    ...r.referenceBindings.map((b, i) => ({ chemin: `/result/referenceBindings/${i}/scope`, texte: b.scope })),
    ...r.protectedComponents.map((t, i) => ({ chemin: `/result/protectedComponents/${i}`, texte: t })),
  ];
  for (const f of fuitesConcurrent(champs, concurrents)) v.push({ chemin: f.chemin, raison: f.raison });
  return v;
}

/**
 * La consigne finale · les interdits de transfert et les composants protégés
 * du SERVEUR s'ajoutent à ceux du modèle (jamais l'inverse).
 */
export function consigneFinale(r: ConsigneImage, prep: PreparationCompilation): ConsigneImage {
  return {
    ...r,
    negativeConstraints: [...new Set([...r.negativeConstraints, ...prep.interditsTransfert])].slice(0, 100),
    protectedComponents: [...new Set([...r.protectedComponents, ...prep.composantsProteges])].slice(0, 100),
  };
}

/**
 * L'entrée de `image.compile` · le brief et le concept en documents résolus
 * (le concept d'une image statique = composition, intention de style, formats
 * et textes du brief, séparés des pixels), les références TYPÉES, les
 * invariants du serveur (dont les interdits de transfert).
 */
export function entreeCompilation(e: { prep: PreparationCompilation; brief: BriefCanonique; versionId: string; mode: ModeImage; largeur: number; hauteur: number }) {
  const docBrief = documentBrief(e.brief, e.versionId);
  const concept = [
    e.brief.composition ? `Composition : ${e.brief.composition}` : '',
    e.brief.styleIntent ? `Intention de style : ${e.brief.styleIntent}` : '',
    e.brief.formats.length ? `Formats : ${e.brief.formats.join(', ')}` : '',
    e.brief.texts.length ? 'Textes : posés par des calques texte, jamais dans les pixels.' : 'Aucun texte prévu.',
  ].filter(Boolean).join('\n');
  const docConcept = documentResolu(`concept_${e.versionId}`, e.versionId, concept);
  return {
    taskInputs: {
      briefId: docBrief.id, conceptId: docConcept.id, mode: e.mode, referenceIds: e.prep.referenceIds,
      width: Math.min(Math.max(64, Math.round(e.largeur)), 8192), height: Math.min(Math.max(64, Math.round(e.hauteur)), 8192),
    },
    resolvedDocuments: [docBrief, docConcept],
    references: e.prep.references,
    invariants: e.prep.invariants,
    facts: e.brief.facts.map((f) => ({ id: f.id, claim: f.claim, sourceIds: [...f.sourceIds], kind: f.kind, confidence: f.confidence })),
  };
}
