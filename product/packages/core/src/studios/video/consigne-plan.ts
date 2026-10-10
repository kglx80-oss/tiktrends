/**
 * Studios · L6-A · la consigne d'image d'un PLAN vidéo (`shot.image`), sur le
 * modèle exact de l'image du studio (F-B, `image/parcours.ts`).
 *
 * Pur. Le serveur lit la base, ce module DÉCIDE.
 *
 *  · Compilation (`shot.image`, appel texte payant) ⇒ le serveur ATTESTE la
 *    consigne validée dans le journal d'audit (ajout seul) : action
 *    `video.consigne_plan.compilee`, cible le projet, détails = consigne
 *    persistable + empreinte.
 *  · « Retenir » relit l'attestation par son `runId` et range la consigne dans
 *    une NOUVELLE VERSION : `styleRef.consignesPlans.<plan>`. Le graphe L1 la
 *    fait entrer dans la seule image clé de CE plan (`impact.ts`).
 *  · Le devis et l'approbation d'une image clé `keyframe:<plan>` (hors
 *    `s_image`) exigent une consigne présente, ATTESTÉE pour ce projet,
 *    compilée sur les entrées COURANTES de l'image clé (visuel du plan, style
 *    commun, produit cité, fiches citées) et des références intactes. Les
 *    paramètres du job sont `studio_image/1` · plus jamais `{}`.
 *
 * Une tenue changée sur les plans 1 et 2 change les entrées de leurs images
 * clés : leurs consignes sont PÉRIMÉES (à recompiler), celle du plan 3 tient.
 */

import { empreinteContenu, EMPREINTE_VALIDE, jsonCanonique, sha256Hex } from '../version';
import { estIdStable, type ContenuVersion } from '../document';
import type { ChangementPatch } from '../patch';
import { CLE_CONSIGNES_PLANS, consigneRetenueDuPlan, entreesKeyframe } from '../impact';
import type { ConsigneImage } from '../produit/compilation';
import { lireReferenceEpinglee } from '../produit/epinglage';
import { parametresImageDuDevis, lireParametresImage, type ParametresImageSnapshot, type ReferenceParametres } from '../fournisseurs/fal-image';
import { estLigneDeProduction, type ProfilLigne, type ProfilOperation } from '../execution/tarifs';
import type { CodeErreurStudio } from '../erreurs';
import type { ResolutionReference } from '../image/parcours';
import { PLAN_IMAGE } from '../image/parcours';
import { FORMATS_DOCUMENT, formatDepuisBrief } from '../calques/formats';

export const SCHEMA_CONSIGNE_PLAN = 'consigne_plan/1' as const;
export const ACTION_CONSIGNE_PLAN = 'video.consigne_plan.compilee' as const;
/** Interdit posé par le SERVEUR sur toute image clé de plan · le texte est un calque, jamais des pixels (VIDEO-09). */
export const INTERDIT_TEXTE_IMAGE_CLE = 'Aucun texte, aucune lettre, aucun chiffre ni logo dessiné dans l’image : les textes de la vidéo sont posés au montage.';

export interface ConsignePlanPersistee {
  schema: typeof SCHEMA_CONSIGNE_PLAN;
  runId: string;
  shotId: string;
  sourceVersionId: string;
  /** Empreinte des entrées de l'image clé compilées (`entreesKeyframe`). */
  entrees: string;
  consigne: ConsigneImage;
  references: ReferenceParametres[];
  format: { largeur: number; hauteur: number };
  compileeLe: string;
}

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** L'opération d'image clé d'un plan vidéo · `null` pour l'image du studio ou une autre opération. */
export function planDeKeyframe(operation: string): string | null {
  if (!operation.startsWith('keyframe:')) return null;
  const sid = operation.slice('keyframe:'.length);
  return sid && sid !== PLAN_IMAGE ? sid : null;
}

/** Empreinte des entrées de l'image clé d'un plan · `null` si le plan n'existe pas. */
export function entreesConsignePlan(c: ContenuVersion, shotId: string): string | null {
  const e = entreesKeyframe(c, shotId);
  return e ? empreinteContenu(e) : null;
}

export const empreinteConsignePlan = (c: ConsignePlanPersistee): string => empreinteContenu(c);

/** Le format des images clés · celui du brief, sinon vertical 9:16 (annoncé comme défaut). */
export function formatVideo(contenu: Pick<ContenuVersion, 'brief'>): { largeur: number; hauteur: number; libelle: string; depuisBrief: boolean } {
  const brief = contenu.brief as { formats?: unknown } | null;
  const f = formatDepuisBrief(Array.isArray(brief?.formats) ? brief!.formats : null);
  const format = f.depuisBrief ? f.format : '9:16';
  const d = FORMATS_DOCUMENT[format];
  return { largeur: d.width, hauteur: d.height, libelle: d.libelle, depuisBrief: f.depuisBrief };
}

/* ─────────────────────────── Entrée de la tâche ──────────────────────────── */

/** Document résolu au format d'un contrat (`schemaKey`) · empreinte du contenu canonique. */
function document(id: string, version: string, schemaKey: string, content: Record<string, unknown>) {
  return { id, version, schemaKey, content, sha256: sha256Hex(jsonCanonique(content)) };
}

export interface ReferenceTache { assetId: string; assetVersion: string; sha256: string; role: 'product'; scope: 'product'; allowedChanges: string[]; requiredComponents: string[] }

export type PreparationShotImage =
  | {
    ok: true;
    taskInputs: { shotId: string; referenceIds: string[]; identityVersion: string };
    resolvedDocuments: Array<ReturnType<typeof document>>;
    references: ReferenceTache[];
    invariants: string[];
    composantsProteges: string[];
    entrees: string;
  }
  | { ok: false; code: CodeErreurStudio; motif: string };

/**
 * Ce que reçoit `shot.image` · le plan VALIDÉ (document `Shot`), les fiches
 * d'identité citées (documents, version = empreinte), la photo épinglée du
 * produit si le plan le cite (seule référence MÉDIA), les invariants du
 * serveur. Bloqué avant l'appel si le plan cite le produit sans photo épinglée.
 */
export function preparerShotImage(c: ContenuVersion, shotId: string, versionId: string): PreparationShotImage {
  const p = Object.prototype.hasOwnProperty.call(c.shots.byId, shotId) ? c.shots.byId[shotId]! : null;
  if (!p || shotId === PLAN_IMAGE) return { ok: false, code: 'NOT_FOUND', motif: 'Ce plan n’existe pas dans la version courante.' };
  const entrees = entreesConsignePlan(c, shotId)!;
  const shot = {
    shotId: p.shotId, purpose: p.purpose, subject: p.subject, action: p.action, framing: p.framing, camera: p.camera, lighting: p.lighting,
    environment: p.environment, referenceIds: [...p.referenceIds], narration: p.narration, onScreenText: [...p.onScreenText], speechMode: p.speechMode,
    estimatedDurationMs: p.estimatedDurationMs,
  };
  const docs = [document(shotId, versionId, 'Shot', shot)];
  const identites = p.referenceIds.filter((r) => Object.prototype.hasOwnProperty.call(c.characterRefs, r)).sort();
  for (const cid of identites) {
    const fiche = c.characterRefs[cid]!;
    const claim = Object.entries(fiche).filter(([, v]) => typeof v === 'string' || Array.isArray(v)).map(([k, v]) => `${k} : ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' · ');
    docs.push(document(cid, empreinteContenu(fiche).slice(0, 16), 'Fact', { id: cid, claim: (claim || 'Fiche d’identité sans attribut renseigné.').slice(0, 12_000), sourceIds: [], kind: 'declared', confidence: 'high' }));
  }
  const references: ReferenceTache[] = [];
  const invariants: string[] = [INTERDIT_TEXTE_IMAGE_CLE];
  let composantsProteges: string[] = [];
  const citeProduit = !!c.productRef && (p.referenceIds.includes(c.productRef.productId) || (typeof c.productRef.assetId === 'string' && p.referenceIds.includes(c.productRef.assetId)));
  if (citeProduit) {
    const ep = lireReferenceEpinglee(c.productRef);
    if (!ep) return { ok: false, code: 'MISSING_REFERENCE', motif: 'Ce plan montre le produit, mais aucune photo précise n’est épinglée · épingle le produit et sa photo (page « Produit et références »).' };
    composantsProteges = [...ep.composantsObligatoires];
    references.push({ assetId: ep.photo.assetId, assetVersion: ep.photo.assetVersion, sha256: ep.photo.sha256, role: 'product', scope: 'product', allowedChanges: [], requiredComponents: [...ep.composantsObligatoires] });
    docs.push(document(ep.productId, ep.photo.assetVersion, 'Fact', { id: ep.productId, claim: `Produit : ${ep.nom}`.slice(0, 12_000), sourceIds: [], kind: 'declared', confidence: 'high' }));
    if (ep.composantsObligatoires.length) invariants.push(`Composants du produit à conserver : ${ep.composantsObligatoires.join(', ')}.`);
  }
  for (const cid of identites) invariants.push(`Identité ${cid} : respecter la fiche telle quelle (tenue, cheveux, accessoires), sans réinterprétation.`);
  return {
    ok: true,
    taskInputs: { shotId, referenceIds: references.map((r) => r.assetId), identityVersion: empreinteContenu(identites.map((cid) => [cid, c.characterRefs[cid]])).slice(0, 32) },
    resolvedDocuments: docs, references, invariants, composantsProteges, entrees,
  };
}

/* ─────────────────────────── Consigne persistable ────────────────────────── */

export type ConstructionConsignePlan = { ok: true; consigne: ConsignePlanPersistee; empreinte: string } | { ok: false; violations: string[] };

/**
 * La consigne persistable d'une compilation `shot.image` ACCEPTÉE · les
 * liaisons ne visent que les références transmises, les interdits du serveur
 * s'ajoutent (texte, composants protégés).
 */
export function construireConsignePlan(e: {
  runId: string;
  shotId: string;
  sourceVersionId: string;
  entrees: string;
  resultat: { generationInstruction: string; referenceBindings: Array<{ referenceId: string; role: string; scope: string }>; protectedComponents: string[] };
  references: ReadonlyArray<{ assetId: string; assetVersion: string; sha256: string; role: string }>;
  composantsProteges: readonly string[];
  surimpression: boolean;
  largeur: number;
  hauteur: number;
  compileeLe: Date;
}): ConstructionConsignePlan {
  const violations: string[] = [];
  const transmises = new Map(e.references.map((r) => [r.assetId, r] as const));
  for (const b of e.resultat.referenceBindings) if (!transmises.has(b.referenceId)) violations.push(`liaison ${b.referenceId} : référence non transmise à la compilation`);
  for (const k of e.composantsProteges) if (!e.resultat.protectedComponents.includes(k)) violations.push(`composant obligatoire « ${k} » non protégé par la consigne`);
  if (!estIdStable(e.shotId) || e.shotId === PLAN_IMAGE) violations.push('plan inconnu');
  if (violations.length) return { ok: false, violations };
  const references: ReferenceParametres[] = e.references
    .filter((r) => e.resultat.referenceBindings.some((b) => b.referenceId === r.assetId))
    .map((r) => ({ assetId: r.assetId, assetVersion: r.assetVersion, sha256: r.sha256, role: r.role }));
  const consigne: ConsigneImage = {
    generationInstruction: e.resultat.generationInstruction,
    negativeConstraints: [INTERDIT_TEXTE_IMAGE_CLE],
    referenceBindings: e.resultat.referenceBindings.map((b) => ({ referenceId: b.referenceId, role: b.role, scope: b.scope })),
    protectedComponents: [...new Set([...e.resultat.protectedComponents, ...e.composantsProteges])].slice(0, 100),
    needsDeterministicOverlay: e.surimpression,
  };
  const c: ConsignePlanPersistee = {
    schema: SCHEMA_CONSIGNE_PLAN, runId: e.runId, shotId: e.shotId, sourceVersionId: e.sourceVersionId, entrees: e.entrees,
    consigne: parametresImageDuDevis({ consigne, references, largeur: e.largeur, hauteur: e.hauteur }).consigne,
    references, format: { largeur: Math.round(e.largeur), hauteur: Math.round(e.hauteur) }, compileeLe: e.compileeLe.toISOString(),
  };
  const lu = lireParametresImage(parametresDepuisConsignePlan(c));
  if (!lu.ok) return { ok: false, violations: lu.violations };
  return { ok: true, consigne: c, empreinte: empreinteConsignePlan(c) };
}

/** Relecture défensive · `null` si la forme n'est pas celle que le serveur écrit. */
export function lireConsignePlan(x: unknown): ConsignePlanPersistee | null {
  if (!estObjet(x) || x.schema !== SCHEMA_CONSIGNE_PLAN) return null;
  if (typeof x.runId !== 'string' || x.runId.length < 1 || x.runId.length > 64) return null;
  if (!estIdStable(x.shotId) || x.shotId === PLAN_IMAGE) return null;
  if (typeof x.sourceVersionId !== 'string' || x.sourceVersionId.length < 1 || x.sourceVersionId.length > 64) return null;
  if (typeof x.entrees !== 'string' || !EMPREINTE_VALIDE.test(x.entrees)) return null;
  if (typeof x.compileeLe !== 'string' || Number.isNaN(Date.parse(x.compileeLe))) return null;
  if (!estObjet(x.format)) return null;
  const lu = lireParametresImage({ schema: 'studio_image/1', consigne: x.consigne, references: x.references, format: x.format, promptRunId: x.runId });
  if (!lu.ok) return null;
  if (Object.keys(x).sort().join(',') !== 'compileeLe,consigne,entrees,format,references,runId,schema,shotId,sourceVersionId') return null;
  return x as unknown as ConsignePlanPersistee;
}

/** La consigne retenue d'un plan, relue · `null` si absente ou mal formée, ou rangée sous un autre plan. */
export function consigneDuPlan(c: Pick<ContenuVersion, 'styleRef'>, shotId: string): ConsignePlanPersistee | null {
  const x = lireConsignePlan(consigneRetenueDuPlan(c, shotId));
  return x && x.shotId === shotId ? x : null;
}

export function parametresDepuisConsignePlan(c: ConsignePlanPersistee): ParametresImageSnapshot {
  return parametresImageDuDevis({ consigne: c.consigne, references: c.references, largeur: c.format.largeur, hauteur: c.format.hauteur, promptRunId: c.runId });
}

export const CHEMINS_CONSIGNE_PLAN: readonly string[] = ['/styleRef'];

/** Le patch qui range la consigne d'un plan · rien d'autre que `styleRef.consignesPlans.<plan>`. */
export function changementsConsignePlan(contenu: Pick<ContenuVersion, 'styleRef'>, c: ConsignePlanPersistee, raison: string): ChangementPatch[] {
  const s = contenu.styleRef;
  if (!estObjet(s)) return [{ op: 'replace', path: '/styleRef', newValue: { [CLE_CONSIGNES_PLANS]: { [c.shotId]: c } }, reason: raison }];
  const m = s[CLE_CONSIGNES_PLANS];
  if (!estObjet(m)) return [{ op: CLE_CONSIGNES_PLANS in s ? 'replace' : 'add', path: `/styleRef/${CLE_CONSIGNES_PLANS}`, newValue: { [c.shotId]: c }, reason: raison }];
  return [{ op: c.shotId in m ? 'replace' : 'add', path: `/styleRef/${CLE_CONSIGNES_PLANS}/${c.shotId}`, newValue: c, reason: raison }];
}

/* ───────────────────────────────── Verdict ───────────────────────────────── */

export type CauseRefusPlan = 'absente' | 'non_attestee' | 'perimee' | 'reference_retiree' | 'reference_modifiee' | 'non_transmissible';
export type VerdictConsignePlan = { ok: true } | { ok: false; cause: CauseRefusPlan; code: CodeErreurStudio; motif: string; cibles: string[] };

/** Une consigne de plan peut-elle partir ? Même règle au devis et à l'approbation, aucune substitution. */
export function verdictConsignePlan(e: {
  shotId: string;
  rang: number;
  consigne: ConsignePlanPersistee | null;
  attestee: boolean;
  entreesCourantes: string | null;
  resolutions: ReadonlyMap<string, ResolutionReference>;
}): VerdictConsignePlan {
  const plan = `plan ${e.rang || e.shotId}`;
  const c = e.consigne;
  const op = `keyframe:${e.shotId}`;
  if (!c) return { ok: false, cause: 'absente', code: 'MISSING_REFERENCE', cibles: [op], motif: `Aucune consigne d’image retenue pour le ${plan} · compile-la puis retiens-la avant de demander un devis.` };
  if (!e.attestee) return { ok: false, cause: 'non_attestee', code: 'INVALID_SCHEMA', cibles: [op], motif: `La consigne du ${plan} ne vient pas d’une compilation validée par le serveur · recompile-la, rien n’est parti.` };
  if (e.entreesCourantes === null || c.entrees !== e.entreesCourantes) return { ok: false, cause: 'perimee', code: 'VERSION_CONFLICT', cibles: [op], motif: `Le ${plan}, son style, son produit ou une fiche d’identité citée a changé depuis la compilation · recompile sa consigne.` };
  const retirees: string[] = [];
  const modifiees: string[] = [];
  const bloquees: string[] = [];
  for (const r of c.references) {
    const m = e.resolutions.get(r.assetId);
    if (!m || m.etat === 'absent') retirees.push(r.assetId);
    else if (m.etat === 'sans_media') bloquees.push(r.assetId);
    else if (m.sha256 !== r.sha256 || m.assetVersion !== r.assetVersion) modifiees.push(r.assetId);
    else if (!m.transmissible) bloquees.push(r.assetId);
  }
  if (retirees.length) return { ok: false, cause: 'reference_retiree', code: 'MISSING_REFERENCE', cibles: retirees, motif: `Référence retirée ou hors de la marque depuis la compilation du ${plan} · ${retirees.join(', ')}. Rien n’est substitué.` };
  if (modifiees.length) return { ok: false, cause: 'reference_modifiee', code: 'MISSING_REFERENCE', cibles: modifiees, motif: `Fichier modifié depuis la compilation du ${plan} · ${modifiees.join(', ')}. Recompile la consigne.` };
  if (bloquees.length) return { ok: false, cause: 'non_transmissible', code: 'UNSUPPORTED_CAPABILITY', cibles: bloquees, motif: `La consigne du ${plan} lie ${bloquees.join(', ')} : le fournisseur d’images ne reçoit pas ce fichier.` };
  return { ok: true };
}

/* ──────────────────────────────── Devis ──────────────────────────────────── */

/** Un devis qui contient l'image clé d'un plan vidéo se raccorde à sa consigne. */
export function exigencePlansDuDevis(lignes: ReadonlyArray<{ operation: string; profil: ProfilOperation | ProfilLigne }>): { concerne: false } | { concerne: true; plans: string[]; horsImage: string[] } {
  const plans = lignes.map((l) => planDeKeyframe(l.operation)).filter((x): x is string => x !== null);
  if (!plans.length) return { concerne: false };
  // R3 · la ligne du contrôle visuel accompagne les images clés, elle n'est pas « hors image ».
  return { concerne: true, plans, horsImage: lignes.filter((l) => planDeKeyframe(l.operation) === null && l.profil !== 'calcul' && estLigneDeProduction(l)).map((l) => l.operation) };
}

/** Ce que le fournisseur recevrait, sans la trace · deux consignes équivalentes rendent la même requête. */
function requete(c: ConsignePlanPersistee): string {
  return empreinteContenu({ ...parametresDepuisConsignePlan(c), promptRunId: null });
}

/**
 * Les paramètres `studio_image/1` d'un job d'images clés · le fournisseur rend
 * N images d'UNE consigne : plusieurs images clés ne partagent un job que si
 * leurs consignes font la MÊME requête (sinon, un devis par plan).
 */
export function parametresDesPlans(consignes: ReadonlyArray<ConsignePlanPersistee>):
  { ok: true; parametres: ParametresImageSnapshot } | { ok: false; motif: string; cibles: string[] } {
  if (!consignes.length) return { ok: false, motif: 'aucune consigne', cibles: [] };
  const tries = [...consignes].sort((a, b) => (a.shotId < b.shotId ? -1 : a.shotId > b.shotId ? 1 : 0));
  const r0 = requete(tries[0]!);
  const autres = tries.filter((c) => requete(c) !== r0).map((c) => `keyframe:${c.shotId}`);
  if (autres.length) return { ok: false, motif: `chaque plan a sa propre consigne · une image clé par devis (${autres.join(', ')} à deviser à part)`, cibles: autres };
  return { ok: true, parametres: parametresDepuisConsignePlan(tries[0]!) };
}

/** L'empreinte des consignes d'un devis · entre dans son `inputHash`. */
export function empreinteConsignesDevis(consignes: ReadonlyArray<ConsignePlanPersistee>): string {
  return empreinteContenu([...consignes].sort((a, b) => (a.shotId < b.shotId ? -1 : 1)).map((c) => [c.shotId, empreinteConsignePlan(c)]));
}
