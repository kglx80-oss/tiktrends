/**
 * Studios · G-B · retouche masquée (`edit.mask`) · du job approuvé à la requête
 * fal, sans jamais faire confiance au modèle pour la conservation des pixels.
 *
 * Pur. Décide ce que le worker (et l'exécuteur du benchmark F05) envoie, et
 * QUAND la tâche est bloquée avant tout appel et toute dépense.
 *
 * ── L'instantané d'une retouche (`SnapshotJob.parametres`, `studio_retouche/1`)
 *
 *   · `consigne` · le `result` validé de `edit.mask` (instruction, à préserver,
 *     changements attendus) ;
 *   · `source` · le média studio retouché (`sta_<uuid>`), sa version, son
 *     empreinte et sa résolution vues au devis ;
 *   · `masque` · le média studio du masque, au FORMAT CANONIQUE fixé ici :
 *     **PNG gris 8 bits** (profondeur 8, type de couleur 0, sans alpha ni
 *     palette), à la résolution EXACTE de la source, 255 = modifier,
 *     0 = préserver (convention `MasqueBrut`, L5-A) ;
 *   · `fonduPx` · la bande de fondu autorisée autour du support.
 *
 * ── Ce qui part chez le fournisseur ─────────────────────────────────────────
 *
 * Le modèle d'édition existant (`FAL_IMAGE_MODEL_EDIT`, aucun modèle nouveau)
 * ne prend pas de masque en paramètre : il reçoit la SOURCE comme image de
 * départ et la zone décrite dans la consigne (boîte du support, en pourcents
 * et en pixels). Le masque ne part pas ; il sert APRÈS, au worker, à recomposer
 * la sortie sur la source (`composerRetoucheStricte`) : 0 pixel hors zone + fondu
 * ne peut changer, quoi que le modèle ait repeint.
 *
 * ── Ce qui bloque la tâche AVANT tout appel (0 $) ───────────────────────────
 *
 *   paramètres absents ou mal formés · masque absent, pas en PNG gris 8 bits,
 *   d'une autre résolution que la source, modifié depuis le devis ou vide ·
 *   source absente, modifiée, non transmissible ou d'une autre résolution ·
 *   plus d'une image demandée · emplacement de gabarit non résolu.
 */

import { empreinteContenu } from '../version';
import { FONDU_MAX_PX } from '../rendu/masque';
import type { ProfilOperation } from '../execution/tarifs';
import {
  DIMENSION_MAX, TEXTE_CONSIGNE_MAX, LISTE_CONSIGNE_MAX, adresseTransmissible, contientEmplacement, corpsFalImage, ratioFal,
  operationsImageDuJob, type MediaResolu, type ModelesRoutes, type RequeteFal,
} from './fal-image';

export const SCHEMA_PARAMETRES_RETOUCHE = 'studio_retouche/1' as const;
/** Format canonique d'un masque STOCKÉ · PNG gris 8 bits à la résolution de la source. */
export const FORMAT_MASQUE_CANONIQUE = 'png_gris8' as const;

/** Le `result` validé de `edit.mask` (03-CONTRATS `edit_mask_output`). */
export interface ConsigneRetouche {
  generationInstruction: string;
  preserve: string[];
  expectedChanges: string[];
}

export interface MediaRetouche {
  /** Média studio · `sta_<uuid>` (ligne `studio_assets`). */
  assetId: string;
  assetVersion: string;
  sha256: string;
  largeur: number;
  hauteur: number;
}

export interface ParametresRetoucheSnapshot {
  schema: typeof SCHEMA_PARAMETRES_RETOUCHE;
  consigne: ConsigneRetouche;
  /** Trace de `edit.mask` (`studio_prompt_runs.id`) · `null` si inconnue. */
  promptRunId: string | null;
  source: MediaRetouche;
  masque: MediaRetouche & { format: typeof FORMAT_MASQUE_CANONIQUE };
  fonduPx: number;
}

/** Le constructeur à appeler par la commande d'approbation · le worker relit exactement cette forme. */
export function parametresRetoucheDuDevis(e: {
  consigne: ConsigneRetouche;
  source: MediaRetouche;
  masque: MediaRetouche;
  fonduPx: number;
  promptRunId?: string | null;
}): ParametresRetoucheSnapshot {
  const m = (x: MediaRetouche): MediaRetouche => ({ assetId: x.assetId, assetVersion: x.assetVersion, sha256: x.sha256, largeur: x.largeur, hauteur: x.hauteur });
  return {
    schema: SCHEMA_PARAMETRES_RETOUCHE,
    consigne: { generationInstruction: e.consigne.generationInstruction, preserve: [...e.consigne.preserve], expectedChanges: [...e.consigne.expectedChanges] },
    promptRunId: e.promptRunId ?? null,
    source: m(e.source),
    masque: { ...m(e.masque), format: FORMAT_MASQUE_CANONIQUE },
    fonduPx: e.fonduPx,
  };
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texteBorne = (v: unknown): v is string => typeof v === 'string' && v.length <= TEXTE_CONSIGNE_MAX;
const listeTextes = (v: unknown): v is string[] => Array.isArray(v) && v.length <= LISTE_CONSIGNE_MAX && v.every(texteBorne);
const entierEntre = (v: unknown, a: number, b: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= a && v <= b;
const SHA = /^[a-f0-9]{64}$/;
/** Un média studio (`sta_` + uuid) · seul catalogue relu octet pour octet par le worker. */
export const ID_MEDIA_STUDIO = /^sta_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'instantané porte-t-il une retouche (quelle que soit sa validité) ? */
export function estParametresRetouche(x: unknown): boolean {
  return estObjet(x) && x.schema === SCHEMA_PARAMETRES_RETOUCHE;
}

export type LectureRetouche = { ok: true; parametres: ParametresRetoucheSnapshot } | { ok: false; violations: string[] };

function media(x: unknown, chemin: string, v: string[]): void {
  if (!estObjet(x)) { v.push(`${chemin} : objet attendu`); return; }
  if (typeof x.assetId !== 'string' || !ID_MEDIA_STUDIO.test(x.assetId)) v.push(`${chemin}/assetId : média studio sta_<uuid> attendu`);
  if (typeof x.assetVersion !== 'string' || x.assetVersion.length < 1 || x.assetVersion.length > 160) v.push(`${chemin}/assetVersion : version attendue`);
  if (typeof x.sha256 !== 'string' || !SHA.test(x.sha256)) v.push(`${chemin}/sha256 : empreinte attendue`);
  if (!entierEntre(x.largeur, 1, DIMENSION_MAX) || !entierEntre(x.hauteur, 1, DIMENSION_MAX)) v.push(`${chemin} : largeur et hauteur entières de 1 à ${DIMENSION_MAX}`);
}

/** Relecture défensive · rien n'est complété par défaut, aucune résolution n'est devinée. */
export function lireParametresRetouche(x: unknown): LectureRetouche {
  const v: string[] = [];
  if (!estObjet(x) || x.schema !== SCHEMA_PARAMETRES_RETOUCHE) {
    return { ok: false, violations: ['/parametres : la retouche n’est pas dans l’instantané du job (schéma studio_retouche/1 attendu)'] };
  }
  const c = x.consigne;
  if (!estObjet(c)) v.push('/parametres/consigne : objet attendu');
  else {
    if (!texteBorne(c.generationInstruction) || c.generationInstruction.trim() === '') v.push('/parametres/consigne/generationInstruction : texte de 1 à 12 000 caractères');
    if (!listeTextes(c.preserve)) v.push('/parametres/consigne/preserve : liste de textes bornée');
    if (!listeTextes(c.expectedChanges)) v.push('/parametres/consigne/expectedChanges : liste de textes bornée');
  }
  if (x.promptRunId !== null && typeof x.promptRunId !== 'string') v.push('/parametres/promptRunId : texte ou null');
  media(x.source, '/parametres/source', v);
  media(x.masque, '/parametres/masque', v);
  if (estObjet(x.masque) && x.masque.format !== FORMAT_MASQUE_CANONIQUE) v.push(`/parametres/masque/format : ${FORMAT_MASQUE_CANONIQUE} attendu (PNG gris 8 bits)`);
  if (!entierEntre(x.fonduPx, 0, FONDU_MAX_PX)) v.push(`/parametres/fonduPx : entier de 0 à ${FONDU_MAX_PX}`);
  if (v.length === 0) {
    const p = x as unknown as ParametresRetoucheSnapshot;
    if (p.masque.largeur !== p.source.largeur || p.masque.hauteur !== p.source.hauteur) {
      v.push(`/parametres/masque : résolution ${p.masque.largeur}×${p.masque.hauteur} différente de la source ${p.source.largeur}×${p.source.hauteur}`);
    }
    if (p.masque.assetId === p.source.assetId) v.push('/parametres/masque/assetId : le masque doit être un autre média que la source');
    const textes = [p.consigne.generationInstruction, ...p.consigne.preserve, ...p.consigne.expectedChanges];
    if (textes.some(contientEmplacement)) v.push('/parametres/consigne : emplacement de gabarit non résolu');
  }
  return v.length ? { ok: false, violations: v } : { ok: true, parametres: x as unknown as ParametresRetoucheSnapshot };
}

/* ───────────────────────────── Le fichier du masque ─────────────────────── */

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const u32 = (o: Uint8Array, i: number) => ((o[i]! << 24) >>> 0) + (o[i + 1]! << 16) + (o[i + 2]! << 8) + o[i + 3]!;

export interface EntetePng { largeur: number; hauteur: number; profondeur: number; typeCouleur: number }

/** L'en-tête IHDR d'un PNG, lu dans les octets · `null` si ce n'est pas un PNG. */
export function lireEntetePng(o: Uint8Array): EntetePng | null {
  if (o.length < 33 || !SIGNATURE_PNG.every((b, i) => o[i] === b)) return null;
  if (u32(o, 8) !== 13 || String.fromCharCode(o[12]!, o[13]!, o[14]!, o[15]!) !== 'IHDR') return null;
  return { largeur: u32(o, 16), hauteur: u32(o, 20), profondeur: o[24]!, typeCouleur: o[25]! };
}

/**
 * Un fichier de masque conforme au format canonique pour CETTE source ·
 * liste vide = conforme. Le serveur fournit l'en-tête relu dans les octets et
 * leur empreinte ; la règle ne fait confiance ni à la ligne ni au devis seuls.
 */
export function controlerFichierMasque(e: {
  entete: EntetePng | null;
  sha256: string;
  attendu: { sha256: string; largeur: number; hauteur: number };
  source: { largeur: number; hauteur: number };
}): string[] {
  const v: string[] = [];
  if (!e.entete) return ['le masque n’est pas un PNG lisible'];
  if (e.entete.profondeur !== 8 || e.entete.typeCouleur !== 0) {
    v.push(`masque PNG gris 8 bits attendu (profondeur ${e.entete.profondeur}, type de couleur ${e.entete.typeCouleur})`);
  }
  if (e.entete.largeur !== e.source.largeur || e.entete.hauteur !== e.source.hauteur) {
    v.push(`le masque (${e.entete.largeur}×${e.entete.hauteur}) doit avoir la résolution de la source (${e.source.largeur}×${e.source.hauteur})`);
  }
  if (e.entete.largeur !== e.attendu.largeur || e.entete.hauteur !== e.attendu.hauteur) {
    v.push(`le masque (${e.entete.largeur}×${e.entete.hauteur}) n’a pas la résolution vue au devis (${e.attendu.largeur}×${e.attendu.hauteur})`);
  }
  if (e.sha256 !== e.attendu.sha256) v.push('masque modifié depuis le devis');
  return v;
}

/* ───────────────────────────── La consigne envoyée ──────────────────────── */

export interface BoiteMasque { x0: number; y0: number; x1: number; y1: number; pixels: number }

const pourcent = (v: number, total: number) => `${String(Math.round((v * 1000) / total) / 10).replace('.', ',')} %`;

/** La consigne envoyée · instruction, zone (boîte du support), ce qui se préserve, ce qui change. */
export function promptRetouche(c: ConsigneRetouche, boite: BoiteMasque, source: { largeur: number; hauteur: number }): string {
  const parties = [c.generationInstruction.trim()];
  parties.push(
    `Zone à modifier : uniquement la région de ${pourcent(boite.x0, source.largeur)} à ${pourcent(boite.x1, source.largeur)} de la largeur et de ${pourcent(boite.y0, source.hauteur)} à ${pourcent(boite.y1, source.hauteur)} de la hauteur de l’image (pixels ${boite.x0},${boite.y0} à ${boite.x1},${boite.y1} sur ${source.largeur}×${source.hauteur}). Tout le reste de l’image doit rester identique.`,
  );
  if (c.preserve.length) parties.push(`À préserver à l’identique : ${c.preserve.join(' ; ')}.`);
  if (c.expectedChanges.length) parties.push(`Changement attendu : ${c.expectedChanges.join(' ; ')}.`);
  return parties.join('\n\n');
}

/* ───────────────────────────── La requête ───────────────────────────────── */

/** Ce que le serveur a relu du masque au moment de soumettre · `null` = absent du catalogue. */
export type MasqueRelu = { violations: string[]; boite: BoiteMasque | null } | null;

export const LIMITE_MASQUE_NON_TRANSMIS = 'le modèle d’édition ne reçoit pas de masque · zone décrite dans la consigne, conservation hors zone assurée par recomposition déterministe';
export const LIMITE_REDIMENSION = 'sortie ramenée explicitement à la résolution de la source avant composition';

export function requeteFalRetouche(e: {
  operations: ReadonlyArray<{ operation: string; profil: ProfilOperation }>;
  parametres: unknown;
  /** La source relue dans le catalogue de la marque au moment de soumettre. */
  source: MediaResolu | null;
  /** Résolution relue dans les octets de la source · `null` si illisible. */
  dimensionsSource: { largeur: number; hauteur: number } | null;
  masque: MasqueRelu;
  modeles: ModelesRoutes;
}): RequeteFal {
  const horsImage = e.operations.filter((o) => o.profil !== 'image_generation' && o.profil !== 'calcul');
  if (horsImage.length) return { ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: 'opération hors du fournisseur image (animation ou voix)', cibles: horsImage.map((o) => o.operation) };
  const images = operationsImageDuJob(e.operations);
  if (images.length !== 1) return { ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: `une retouche rend exactement une image (${images.length} demandée(s))`, cibles: images };

  const lu = lireParametresRetouche(e.parametres);
  if (!lu.ok) return { ok: false, code: 'INVALID_SCHEMA', motif: lu.violations.join(' · '), cibles: [] };
  const p = lu.parametres;

  if (!e.masque) return { ok: false, code: 'MISSING_REFERENCE', motif: `masque ${p.masque.assetId} absent du catalogue de la marque, hors portée ou non stocké · aucune substitution`, cibles: [p.masque.assetId] };
  if (e.masque.violations.length) return { ok: false, code: 'INVALID_SCHEMA', motif: `masque refusé · ${e.masque.violations.join(' · ')}`, cibles: [p.masque.assetId] };
  if (!e.masque.boite) return { ok: false, code: 'INVALID_SCHEMA', motif: 'masque vide · aucune zone à retoucher', cibles: [p.masque.assetId] };

  const s = e.source;
  if (!s || s.assetId !== p.source.assetId) return { ok: false, code: 'MISSING_REFERENCE', motif: `source ${p.source.assetId} non résolue · aucune substitution`, cibles: [p.source.assetId] };
  if (s.etat !== 'autorise') return { ok: false, code: 'MISSING_REFERENCE', motif: `source ${s.assetId} : ${s.motif}`, cibles: [s.assetId] };
  if (s.sha256 !== p.source.sha256) return { ok: false, code: 'MISSING_REFERENCE', motif: `source ${s.assetId} : fichier modifié depuis le devis`, cibles: [s.assetId] };
  if (!adresseTransmissible(s.url)) return { ok: false, code: 'MISSING_REFERENCE', motif: `source ${s.assetId} : adresse non transmissible au fournisseur`, cibles: [s.assetId] };
  const d = e.dimensionsSource;
  if (!d || d.largeur !== p.source.largeur || d.hauteur !== p.source.hauteur) {
    return { ok: false, code: 'INVALID_SCHEMA', motif: `source ${s.assetId} : résolution ${d ? `${d.largeur}×${d.hauteur}` : 'illisible'} différente du devis (${p.source.largeur}×${p.source.hauteur})`, cibles: [s.assetId] };
  }

  const modele = e.modeles.edition;
  const { ratio, exact } = ratioFal(p.source.largeur, p.source.hauteur);
  const prompt = promptRetouche(p.consigne, e.masque.boite, p.source);
  if (contientEmplacement(prompt)) return { ok: false, code: 'INVALID_SCHEMA', motif: 'emplacement de gabarit non résolu dans la consigne', cibles: [] };

  const corps = corpsFalImage({ modele, prompt, ratio, references: [s.url], images: 1 });
  const expurge: Record<string, unknown> = { ...corps, modele };
  const piece = { assetId: s.assetId, sha256: s.sha256 };
  if ('image_urls' in expurge) expurge.image_urls = [piece];
  if ('image_url' in expurge) expurge.image_url = piece;
  expurge.masque = { assetId: p.masque.assetId, sha256: p.masque.sha256, nonTransmis: true };
  expurge.fonduPx = p.fonduPx;
  const limites = [LIMITE_MASQUE_NON_TRANSMIS, LIMITE_REDIMENSION];
  if (!exact) limites.push(`format ${p.source.largeur}×${p.source.hauteur} servi au ratio ${ratio}`);
  return { ok: true, modele, corps, operations: images, expurge, empreinte: empreinteContenu(expurge), limites };
}
