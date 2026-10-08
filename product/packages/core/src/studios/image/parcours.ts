/**
 * Studios · F-B · parcours image de bout en bout : consigne compilée → devis →
 * approbation → job → média dans le projet.
 *
 * Pur. Le serveur lit la base, ce module DÉCIDE.
 *
 * ── Où vit la consigne compilée ──────────────────────────────────────────────
 *
 * `studio_prompt_runs` ne garde que l'EMPREINTE de la sortie du modèle (par
 * construction : la trace n'est pas une copie). La consigne VALIDÉE de
 * `image.compile` est donc conservée ailleurs, sans migration :
 *
 *  · à la compilation, le serveur écrit une ATTESTATION dans le journal
 *    d'audit (ajout seul, déclencheur en base) : `image.consigne.compilee`,
 *    cible le projet, détails = la consigne persistable et son empreinte ;
 *  · « Retenir » relit cette attestation par son `runId` (jamais une consigne
 *    venue du navigateur) et l'écrit dans une NOUVELLE VERSION du projet
 *    (`enregistrerVersion`, 409 respecté) : `styleRef.consigneImage` (la
 *    recette de rendu de l'image) et le plan `s_image`, dont l'image clé
 *    `keyframe:s_image` est l'opération payante du studio Image ;
 *  · le devis et l'approbation n'acceptent une consigne que si son empreinte
 *    est ATTESTÉE pour ce projet · une consigne écrite à la main dans le
 *    contenu (l'éditeur peut écrire tout le contenu) n'est jamais exécutée.
 *
 * La version étant immuable, « consigne changée après le devis » veut dire
 * « autre version » : l'approbation la refuse (version et `inputHash`), et
 * l'empreinte d'entrée du devis porte en plus celle de la consigne.
 */

import { empreinteContenu, EMPREINTE_VALIDE } from '../version';
import { estIdStable, type ContenuVersion, type PlanStudio } from '../document';
import type { ChangementPatch } from '../patch';
import type { ReferenceBrief } from '../brief';
import type { ConsigneImage, ModeImage } from '../produit/compilation';
import {
  parametresImageDuDevis, lireParametresImage, DIMENSION_MIN, DIMENSION_MAX,
  type ParametresImageSnapshot, type ReferenceParametres,
} from '../fournisseurs/fal-image';
import { empreinteEntreesDevis, type EntreesDevis } from '../execution/devis';
import { GRILLE_STUDIO, estLigneDeProduction, type LigneDevis, type ProfilLigne, type ProfilOperation } from '../execution/tarifs';
import type { CodeErreurStudio } from '../erreurs';
import type { EtatJob, StatutQualite } from '../machines';

export const SCHEMA_CONSIGNE_IMAGE = 'consigne_image/1' as const;
/** Le plan unique du studio Image · son image clé est la génération payante. */
export const PLAN_IMAGE = 's_image' as const;
export const OPERATION_IMAGE = `keyframe:${PLAN_IMAGE}` as const;
/** Clé de la consigne dans `styleRef` (la recette de rendu de l'image). */
export const CLE_CONSIGNE_STYLE = 'consigneImage' as const;
/** Action d'audit qui ATTESTE une consigne produite et validée par le serveur. */
export const ACTION_CONSIGNE_COMPILEE = 'image.consigne.compilee' as const;
export const MODES_IMAGE: readonly ModeImage[] = ['faithful_composite', 'generative_scene'];

export interface ConsigneImagePersistee {
  schema: typeof SCHEMA_CONSIGNE_IMAGE;
  /** `studio_prompt_runs.id` de la compilation acceptée. */
  runId: string;
  mode: ModeImage;
  /** La version du projet sur laquelle la compilation a porté. */
  sourceVersionId: string;
  /** Empreinte du brief et du produit épinglé compilés · une consigne d'un autre brief est périmée. */
  entrees: string;
  /** Consigne FINALE (interdits du serveur compris). */
  consigne: ConsigneImage;
  /** Les références LIÉES par la consigne, avec la version et l'empreinte vues à la compilation. */
  references: ReferenceParametres[];
  format: { largeur: number; hauteur: number };
  compileeLe: string;
}

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Empreinte de ce que la compilation a lu dans le contenu · le brief et le produit épinglé. */
export function empreinteEntreesCompilation(c: Pick<ContenuVersion, 'brief' | 'productRef'>): string {
  return empreinteContenu({ brief: c.brief ?? null, productRef: c.productRef ?? null });
}

export function empreinteConsigne(c: ConsigneImagePersistee): string {
  return empreinteContenu(c);
}

/** Les paramètres de l'instantané du job (`studio_image/1`) · ceux que le worker relit. */
export function parametresDepuisConsigne(c: ConsigneImagePersistee): ParametresImageSnapshot {
  return parametresImageDuDevis({ consigne: c.consigne, references: c.references, largeur: c.format.largeur, hauteur: c.format.hauteur, promptRunId: c.runId });
}

export type ConstructionConsigne = { ok: true; consigne: ConsigneImagePersistee; empreinte: string } | { ok: false; violations: string[] };

/**
 * La consigne persistable d'une compilation ACCEPTÉE · les références sont
 * celles que la tâche a reçues (`preparation.references`), jamais relues du
 * navigateur. Une liaison vers une référence non transmise est refusée.
 */
export function construireConsignePersistee(e: {
  runId: string;
  mode: ModeImage;
  sourceVersionId: string;
  contenu: Pick<ContenuVersion, 'brief' | 'productRef'>;
  consigne: ConsigneImage;
  referencesTransmises: ReadonlyArray<ReferenceBrief>;
  largeur: number;
  hauteur: number;
  compileeLe: Date;
}): ConstructionConsigne {
  const violations: string[] = [];
  const ids: string[] = [];
  for (const b of e.consigne.referenceBindings) if (!ids.includes(b.referenceId)) ids.push(b.referenceId);
  const references: ReferenceParametres[] = [];
  for (const id of ids) {
    const r = e.referencesTransmises.filter((x) => x.assetId === id);
    if (!r.length) { violations.push(`liaison ${id} : référence non transmise à la compilation`); continue; }
    const role = r.some((x) => x.role === 'product') ? 'product' : r[0]!.role;
    references.push({ assetId: id, assetVersion: r[0]!.assetVersion, sha256: r[0]!.sha256, role });
  }
  if (!MODES_IMAGE.includes(e.mode)) violations.push('mode image inconnu');
  if (violations.length) return { ok: false, violations };
  const consigne: ConsigneImagePersistee = {
    schema: SCHEMA_CONSIGNE_IMAGE, runId: e.runId, mode: e.mode, sourceVersionId: e.sourceVersionId,
    entrees: empreinteEntreesCompilation(e.contenu),
    consigne: parametresImageDuDevis({ consigne: e.consigne, references, largeur: e.largeur, hauteur: e.hauteur }).consigne,
    references, format: { largeur: Math.round(e.largeur), hauteur: Math.round(e.hauteur) }, compileeLe: e.compileeLe.toISOString(),
  };
  const lu = lireParametresImage(parametresDepuisConsigne(consigne));
  if (!lu.ok) return { ok: false, violations: lu.violations };
  return { ok: true, consigne, empreinte: empreinteConsigne(consigne) };
}

/** Relecture défensive · `null` si la forme n'est pas celle que le serveur écrit. */
export function lireConsignePersistee(x: unknown): ConsigneImagePersistee | null {
  if (!estObjet(x) || x.schema !== SCHEMA_CONSIGNE_IMAGE) return null;
  if (typeof x.runId !== 'string' || x.runId.length < 1 || x.runId.length > 64) return null;
  if (!MODES_IMAGE.includes(x.mode as ModeImage)) return null;
  if (typeof x.sourceVersionId !== 'string' || x.sourceVersionId.length < 1 || x.sourceVersionId.length > 64) return null;
  if (typeof x.entrees !== 'string' || !EMPREINTE_VALIDE.test(x.entrees)) return null;
  if (typeof x.compileeLe !== 'string' || Number.isNaN(Date.parse(x.compileeLe))) return null;
  const f = x.format;
  if (!estObjet(f)) return null;
  const lu = lireParametresImage({ schema: 'studio_image/1', consigne: x.consigne, references: x.references, format: f, promptRunId: x.runId });
  if (!lu.ok) return null;
  const cles = Object.keys(x).sort().join(',');
  if (cles !== 'compileeLe,consigne,entrees,format,mode,references,runId,schema,sourceVersionId') return null;
  return x as unknown as ConsigneImagePersistee;
}

/** La consigne retenue dans un contenu de version · `null` sinon. */
export function consigneDuContenu(c: Pick<ContenuVersion, 'styleRef'> | null | undefined): ConsigneImagePersistee | null {
  const s = c?.styleRef;
  return estObjet(s) ? lireConsignePersistee(s[CLE_CONSIGNE_STYLE]) : null;
}

/** Le plan `s_image` · ce que l'image clé devisée représente, lisible sur la page projet. */
export function planImage(c: ConsigneImagePersistee): PlanStudio {
  return {
    shotId: PLAN_IMAGE,
    purpose: 'Image du studio · consigne compilée',
    subject: c.consigne.generationInstruction,
    action: '',
    framing: `${c.format.largeur} × ${c.format.hauteur}`,
    camera: '',
    lighting: '',
    environment: '',
    referenceIds: c.references.map((r) => r.assetId).filter(estIdStable),
    narration: '',
    onScreenText: [],
    speechMode: 'none',
    estimatedDurationMs: 0,
  };
}

/** Chemins qu'écrit « Retenir la consigne » · rien d'autre. */
export const CHEMINS_CONSIGNE: readonly string[] = ['/styleRef', '/shots'];

/** Le patch qui range la consigne dans la version · `styleRef.consigneImage` et le plan `s_image`. */
export function changementsConsigne(contenu: Pick<ContenuVersion, 'styleRef' | 'shots'>, c: ConsigneImagePersistee, raison: string): ChangementPatch[] {
  const out: ChangementPatch[] = [];
  if (!estObjet(contenu.styleRef)) out.push({ op: 'replace', path: '/styleRef', newValue: { [CLE_CONSIGNE_STYLE]: c }, reason: raison });
  else out.push({ op: CLE_CONSIGNE_STYLE in contenu.styleRef ? 'replace' : 'add', path: `/styleRef/${CLE_CONSIGNE_STYLE}`, newValue: c, reason: raison });
  const plan = planImage(c);
  if (contenu.shots.byId[PLAN_IMAGE]) out.push({ op: 'replace', path: `/shots/byId/${PLAN_IMAGE}`, newValue: plan, reason: raison });
  else {
    out.push({ op: 'add', path: `/shots/byId/${PLAN_IMAGE}`, newValue: plan, reason: raison });
    out.push({ op: 'replace', path: '/shots/order', newValue: [...contenu.shots.order, PLAN_IMAGE], reason: raison });
  }
  return out;
}

/* ─────────────────────────────── Devis ───────────────────────────────────── */

/**
 * Un devis qui contient l'image du studio (`keyframe:s_image`) se raccorde à la
 * consigne. Il ne mélange pas d'autre génération : le fournisseur rendrait
 * autant d'images de LA MÊME consigne qu'il y a d'opérations image.
 */
export function exigenceImageDuDevis(lignes: ReadonlyArray<{ operation: string; profil: ProfilOperation | ProfilLigne }>): { concerne: false } | { concerne: true; horsImage: string[] } {
  if (!lignes.some((l) => l.operation === OPERATION_IMAGE)) return { concerne: false };
  // R3 · la ligne du contrôle visuel accompagne l'image, elle n'est pas « hors image ».
  return { concerne: true, horsImage: lignes.filter((l) => l.operation !== OPERATION_IMAGE && l.profil !== 'calcul' && estLigneDeProduction(l)).map((l) => l.operation) };
}

/** L'empreinte d'entrée d'un devis image · celle de L3, plus l'empreinte de la consigne. */
export function empreinteEntreesDevisImage(e: EntreesDevis, consigne: string): string {
  return empreinteContenu({ devis: empreinteEntreesDevis(e), consigneImage: consigne });
}

/* ───────────────────────── Vérification de la consigne ───────────────────── */

/** Une référence relue maintenant dans le catalogue de la marque du projet. */
export type ResolutionReference =
  | { etat: 'present'; assetVersion: string; sha256: string; transmissible: boolean }
  | { etat: 'absent' }
  /** Source concurrente ou identifiant hors catalogue · aucun média que le fournisseur puisse recevoir. */
  | { etat: 'sans_media' };

export type CauseRefusConsigne = 'absente' | 'non_attestee' | 'perimee' | 'reference_retiree' | 'reference_modifiee' | 'non_transmissible';

export type VerdictConsigne =
  | { ok: true }
  | { ok: false; cause: CauseRefusConsigne; code: CodeErreurStudio; motif: string; cibles: string[] };

/**
 * Une consigne peut-elle partir ? Même règle au devis et à l'approbation.
 * Aucune substitution : une référence retirée, remplacée ou modifiée bloque.
 */
export function verdictConsigne(e: {
  consigne: ConsigneImagePersistee | null;
  attestee: boolean;
  entreesCourantes: string;
  resolutions: ReadonlyMap<string, ResolutionReference>;
}): VerdictConsigne {
  const c = e.consigne;
  if (!c) return { ok: false, cause: 'absente', code: 'MISSING_REFERENCE', cibles: [], motif: 'Aucune consigne image retenue dans la version courante · compile la consigne puis retiens-la avant de demander un devis.' };
  if (!e.attestee) return { ok: false, cause: 'non_attestee', code: 'INVALID_SCHEMA', cibles: [], motif: 'La consigne de cette version ne vient pas d’une compilation validée par le serveur · recompile-la, rien n’est parti.' };
  if (c.entrees !== e.entreesCourantes) return { ok: false, cause: 'perimee', code: 'VERSION_CONFLICT', cibles: [], motif: 'Le brief ou le produit épinglé a changé depuis la compilation · recompile la consigne.' };
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
  if (retirees.length) return { ok: false, cause: 'reference_retiree', code: 'MISSING_REFERENCE', cibles: retirees, motif: `Référence retirée, remplacée ou hors de la marque depuis la compilation · ${retirees.join(', ')}. Rien n’est substitué : rétablis le fichier ou recompile.` };
  if (modifiees.length) return { ok: false, cause: 'reference_modifiee', code: 'MISSING_REFERENCE', cibles: modifiees, motif: `Fichier modifié depuis la compilation · ${modifiees.join(', ')}. Rien n’est substitué : recompile la consigne.` };
  if (bloquees.length) return { ok: false, cause: 'non_transmissible', code: 'UNSUPPORTED_CAPABILITY', cibles: bloquees, motif: `La consigne lie ${bloquees.join(', ')} (annonce concurrente ou source sans média) : le fournisseur d’images ne reçoit pas ce fichier. Retire cette association (le style passe par le texte de la consigne) puis recompile.` };
  return { ok: true };
}

/* ─────────────────────────────── Prix ────────────────────────────────────── */

/** Le prix d'une image du studio · barème existant (`CREDIT_COSTS.image`, `FIXED_COSTS.fal_image`), jamais inventé. */
export function prixImage(): { credits: number; usdMicros: number } {
  const t = GRILLE_STUDIO.image_generation;
  return { credits: t.credits ?? 0, usdMicros: t.usdMicros ?? 0 };
}

export const libelleCredits = (n: number): string => `${n} crédit${n > 1 ? 's' : ''}`;
export const libelleUsd = (micros: number): string => `${(micros / 1_000_000).toFixed(2).replace('.', ',')} $`;

/** Le prix annoncé AVANT le clic · crédits ET dollars. */
export function libellePrix(p: { credits: number; usdMicros: number }): string {
  return `${libelleCredits(p.credits)} · ${libelleUsd(p.usdMicros)} au plus de coût fournisseur`;
}

/* ─────────────────────────── Disponibilité ───────────────────────────────── */

export interface EntreeDisponibiliteImage {
  peutGenerer: boolean;
  peutProposer: boolean;
  briefPresent: boolean;
  preparationOk: boolean;
  releasePubliee: boolean;
  fournisseurTexte: boolean;
  plafondAtteint: boolean;
  fournisseurImage: boolean;
}

export interface Disponibilite { disponible: boolean; raison: string }
export interface DisponibiliteImage { compilation: Disponibilite; retenir: Disponibilite; devis: Disponibilite; lancement: Disponibilite }

const oui: Disponibilite = { disponible: true, raison: '' };
const non = (raison: string): Disponibilite => ({ disponible: false, raison });

/** La première cause qui empêche chaque geste, dite en clair · aucune capacité indisponible présentée comme disponible. */
export function disponibiliteImage(e: EntreeDisponibiliteImage): DisponibiliteImage {
  const compilation = !e.peutGenerer ? non('Ton rôle permet de consulter, pas de compiler (appel texte payant).')
    : !e.briefPresent ? non('Ce projet n’a pas de brief · la consigne se compile à partir du brief.')
    : !e.preparationOk ? non('Le contrôle avant compilation bloque ce mode · corrige les références ci-dessus.')
    : !e.releasePubliee ? non('La compilation de la consigne image n’est pas encore activée : aucune version des consignes n’est publiée. Rien n’est facturé.')
    : !e.fournisseurTexte ? non('Le fournisseur de texte n’est pas configuré sur ce serveur · la consigne ne peut pas être compilée ici. Rien n’est facturé.')
    : e.plafondAtteint ? non('Le plafond de dépense est atteint · aucune compilation avant le prochain cycle.')
    : oui;
  const retenir = e.peutProposer ? oui : non('Ton rôle permet de consulter, pas de modifier le projet.');
  const devis = e.peutGenerer ? oui : non('Ton rôle permet de consulter, pas de demander un devis.');
  const lancement = !e.peutGenerer ? non('Ton rôle permet de consulter, pas de lancer une génération.')
    : !e.fournisseurImage ? non('Le fournisseur d’images n’est pas branché sur ce serveur · aucun lancement possible, rien n’est débité.')
    : e.plafondAtteint ? non('Le plafond de dépense est atteint · aucun lancement avant le prochain cycle.')
    : oui;
  return { compilation, retenir, devis, lancement };
}

/* ─────────────────────────────── Job en mots ─────────────────────────────── */

export const LIBELLES_ETAT_IMAGE: Readonly<Record<EtatJob, string>> = {
  queued: 'En file',
  claimed: 'Pris en charge',
  running: 'En cours',
  persisting: 'Enregistrement du fichier',
  completed: 'Terminé',
  failed: 'Échec',
  cancel_requested: 'Annulation demandée',
  cancelled: 'Annulé',
  reconciliation_required: 'Réconciliation',
};

export const LIBELLES_QUALITE_IMAGE: Readonly<Record<StatutQualite, string>> = {
  pending: 'Contrôle des composants à faire',
  requires_review: 'À relire · aucun contrôle visuel automatique n’a confirmé les composants',
  passed: 'Accepté à la relecture',
  rejected: 'Écarté · un composant manque',
};

/** Le statut qualité d'un job en mots · aucun média tant que le job n'est pas terminé avec fichier. */
export function libelleQualiteImage(etat: EtatJob, q: StatutQualite): string {
  return etat === 'completed' ? LIBELLES_QUALITE_IMAGE[q] : 'Aucun média livré pour l’instant';
}

const MOTIF_MAX = 300;

/** La raison d'un échec, dite en mots · jamais vide, jamais un secret (les motifs du worker sont expurgés). */
export function raisonEchec(erreur: unknown): string {
  const m = estObjet(erreur) && typeof erreur.motif === 'string' ? erreur.motif : '';
  if (/refus certain/i.test(m)) {
    const http = /HTTP (\d{3})/.exec(m);
    return `Le fournisseur a refusé la demande${http ? ` (HTTP ${http[1]})` : ''} · rien n’a été livré, les crédits sont rendus.`;
  }
  if (/MISSING_REFERENCE/.test(m)) return 'Une référence a disparu ou changé avant l’envoi · rien n’a été envoyé au fournisseur, aucune substitution.';
  if (/Plafond de dépense/i.test(m)) return 'Le plafond de dépense était atteint au moment de l’envoi · rien n’est parti.';
  if (/studio_image\/1|consigne image compilée/.test(m)) return 'Le job ne portait pas de consigne compilée · rien n’est parti.';
  if (!m) return 'Le fournisseur a refusé ou échoué · aucun détail n’a été transmis.';
  // Le nom du prestataire technique ne s'affiche pas : « le fournisseur ».
  const dit = m.replace(/\bfal(\.ai)?\b/gi, 'le fournisseur');
  return dit.length > MOTIF_MAX ? `${dit.slice(0, MOTIF_MAX)}…` : dit;
}

/** Bornes du format demandé à la compilation · reprises du contrat, pas inventées. */
export const FORMAT_IMAGE_MIN = DIMENSION_MIN;
export const FORMAT_IMAGE_MAX = DIMENSION_MAX;

/** Les lignes de devis d'une image du studio, telles qu'un devis les affiche. */
export function lignesImage(lignes: ReadonlyArray<LigneDevis>): LigneDevis[] {
  return lignes.filter((l) => l.operation === OPERATION_IMAGE);
}
