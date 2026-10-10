/**
 * Studios · F-A · du job approuvé aux paramètres NATIFS de fal (plan 06 §5 et §8).
 *
 * Pur. Le fournisseur ne reçoit jamais l'enveloppe `ready/blocked` d'une tâche :
 * on transforme la consigne VALIDÉE de `image.compile` (consigne finale, avec
 * les interdits du serveur), les médias AUTORISÉS résolus au moment de
 * l'exécution, et le format, en corps de requête du modèle routé
 * (`FAL_IMAGE_MODEL` sans référence, `FAL_IMAGE_MODEL_EDIT` avec références ·
 * mêmes variables et même aiguillage que `packages/integrations/src/fal.ts`,
 * aucun modèle nouveau).
 *
 * Ce qui bloque la tâche AVANT tout appel et toute dépense :
 *  · des paramètres d'instantané absents ou mal formés (le job ne porte pas la
 *    consigne compilée) ;
 *  · un emplacement non résolu (`{{ … }}`, `${ … }`) dans ce qui partirait ;
 *  · une référence liée par la consigne mais absente, révoquée, modifiée
 *    depuis le devis ou sans média transmissible · AUCUNE substitution ;
 *  · une opération que le fournisseur image ne sait pas faire (animation,
 *    voix) ou plus d'images qu'un appel n'en rend.
 *
 * L'instruction négative n'est pas un paramètre des modèles routés : elle est
 * intégrée à la consigne, et la limite est conservée (`limites`). On garde
 * l'EMPREINTE du corps EXPURGÉ (médias remplacés par leur identifiant et leur
 * empreinte) : jamais d'adresse ni de data URI dans une trace.
 */

import { empreinteContenu } from '../version';
import type { ConsigneImage } from '../produit/compilation';
import type { ProfilOperation } from '../execution/tarifs';

export const SCHEMA_PARAMETRES_IMAGE = 'studio_image/1' as const;

/** Bornes du contrat `image_compile_output` (03-CONTRATS.schema.json) · reprises, pas inventées. */
export const TEXTE_CONSIGNE_MAX = 12_000;
export const LISTE_CONSIGNE_MAX = 100;
export const ID_REFERENCE_MAX = 160;
/** Bornes de `entreeCompilation` (L5-C) pour la largeur et la hauteur demandées. */
export const DIMENSION_MIN = 64;
export const DIMENSION_MAX = 8192;
/** `falGenerateImage` envoie au plus 4 images et 8 références par appel · mêmes bornes. */
export const IMAGES_PAR_APPEL_MAX = 4;
export const REFERENCES_PAR_APPEL_MAX = 8;

export interface ReferenceParametres { assetId: string; assetVersion: string; sha256: string; role: string }

/** Ce que l'instantané d'un job image doit porter (`SnapshotJob.parametres`). */
export interface ParametresImageSnapshot {
  schema: typeof SCHEMA_PARAMETRES_IMAGE;
  /** Consigne FINALE (`consigneFinale`) d'une compilation `image.compile` acceptée. */
  consigne: ConsigneImage;
  /** Trace de la compilation (`studio_prompt_runs.id`) · `null` si inconnue. */
  promptRunId: string | null;
  /** Les références transmises à la tâche, avec la version et l'empreinte vues au devis. */
  references: ReferenceParametres[];
  format: { largeur: number; hauteur: number };
}

/**
 * Le constructeur à appeler par la commande d'approbation (L3, `commandes.ts`)
 * pour remplir `SnapshotJob.parametres` · le worker relit exactement cette forme.
 */
export function parametresImageDuDevis(e: {
  consigne: ConsigneImage;
  references: ReadonlyArray<{ assetId: string; assetVersion: string; sha256: string; role: string }>;
  largeur: number;
  hauteur: number;
  promptRunId?: string | null;
}): ParametresImageSnapshot {
  return {
    schema: SCHEMA_PARAMETRES_IMAGE,
    consigne: {
      generationInstruction: e.consigne.generationInstruction,
      negativeConstraints: [...e.consigne.negativeConstraints],
      referenceBindings: e.consigne.referenceBindings.map((b) => ({ referenceId: b.referenceId, role: b.role, scope: b.scope })),
      protectedComponents: [...e.consigne.protectedComponents],
      needsDeterministicOverlay: e.consigne.needsDeterministicOverlay,
    },
    promptRunId: e.promptRunId ?? null,
    references: e.references.map((r) => ({ assetId: r.assetId, assetVersion: r.assetVersion, sha256: r.sha256, role: r.role })),
    format: { largeur: Math.round(e.largeur), hauteur: Math.round(e.hauteur) },
  };
}

/** Un emplacement de gabarit non résolu · `{{ … }}`, accolade double orpheline, `${ … }`. */
export function contientEmplacement(texte: string): boolean {
  return /\{\{|\}\}|\$\{/.test(texte);
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texteBorne = (v: unknown, max = TEXTE_CONSIGNE_MAX): v is string => typeof v === 'string' && v.length <= max;
const listeTextes = (v: unknown): v is string[] => Array.isArray(v) && v.length <= LISTE_CONSIGNE_MAX && v.every((x) => texteBorne(x));
const entierEntre = (v: unknown, a: number, b: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= a && v <= b;
const SHA = /^[a-f0-9]{64}$/;

export type LectureParametres = { ok: true; parametres: ParametresImageSnapshot } | { ok: false; violations: string[] };

/** Relecture défensive de `SnapshotJob.parametres` · rien n'est complété par défaut. */
export function lireParametresImage(x: unknown): LectureParametres {
  const v: string[] = [];
  if (!estObjet(x) || x.schema !== SCHEMA_PARAMETRES_IMAGE) {
    return { ok: false, violations: ['/parametres : la consigne image compilée n’est pas dans l’instantané du job (schéma studio_image/1 attendu)'] };
  }
  const c = x.consigne;
  if (!estObjet(c)) v.push('/parametres/consigne : objet attendu');
  else {
    if (!texteBorne(c.generationInstruction) || c.generationInstruction.trim() === '') v.push('/parametres/consigne/generationInstruction : texte de 1 à 12 000 caractères');
    if (!listeTextes(c.negativeConstraints)) v.push('/parametres/consigne/negativeConstraints : liste de textes bornée');
    if (!listeTextes(c.protectedComponents)) v.push('/parametres/consigne/protectedComponents : liste de textes bornée');
    if (typeof c.needsDeterministicOverlay !== 'boolean') v.push('/parametres/consigne/needsDeterministicOverlay : booléen attendu');
    if (!Array.isArray(c.referenceBindings) || c.referenceBindings.length > LISTE_CONSIGNE_MAX) v.push('/parametres/consigne/referenceBindings : liste bornée');
    else c.referenceBindings.forEach((b, i) => {
      if (!estObjet(b) || typeof b.referenceId !== 'string' || b.referenceId.length < 1 || b.referenceId.length > ID_REFERENCE_MAX || !texteBorne(b.role) || !texteBorne(b.scope)) {
        v.push(`/parametres/consigne/referenceBindings/${i} : liaison mal formée`);
      }
    });
  }
  if (!Array.isArray(x.references) || x.references.length > LISTE_CONSIGNE_MAX) v.push('/parametres/references : liste bornée');
  else x.references.forEach((r, i) => {
    if (!estObjet(r) || typeof r.assetId !== 'string' || r.assetId.length < 1 || r.assetId.length > ID_REFERENCE_MAX
      || typeof r.assetVersion !== 'string' || typeof r.sha256 !== 'string' || !SHA.test(r.sha256) || typeof r.role !== 'string') {
      v.push(`/parametres/references/${i} : référence mal formée`);
    }
  });
  if (x.promptRunId !== null && typeof x.promptRunId !== 'string') v.push('/parametres/promptRunId : texte ou null');
  const f = x.format;
  if (!estObjet(f) || !entierEntre(f.largeur, DIMENSION_MIN, DIMENSION_MAX) || !entierEntre(f.hauteur, DIMENSION_MIN, DIMENSION_MAX)) {
    v.push(`/parametres/format : largeur et hauteur entières de ${DIMENSION_MIN} à ${DIMENSION_MAX}`);
  }
  if (v.length === 0) {
    const p = x as unknown as ParametresImageSnapshot;
    const connues = new Set(p.references.map((r) => r.assetId));
    p.consigne.referenceBindings.forEach((b, i) => {
      if (!connues.has(b.referenceId)) v.push(`/parametres/consigne/referenceBindings/${i}/referenceId : référence non transmise à la tâche`);
    });
    const textes = [p.consigne.generationInstruction, ...p.consigne.negativeConstraints, ...p.consigne.protectedComponents];
    if (textes.some(contientEmplacement)) v.push('/parametres/consigne : emplacement de gabarit non résolu');
  }
  return v.length ? { ok: false, violations: v } : { ok: true, parametres: x as unknown as ParametresImageSnapshot };
}

/* ───────────────────────── Médias résolus à l'exécution ───────────────────── */

/**
 * Une référence relue dans le catalogue de la marque AU MOMENT de soumettre
 * (révocation, remplacement) · le worker le calcule, la règle décide.
 */
export type MediaResolu =
  | { assetId: string; etat: 'autorise'; url: string; sha256: string }
  | { assetId: string; etat: 'absent' | 'sans_media'; motif: string };

const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Une adresse qu'on peut confier au fournisseur · https sans identifiants, ou data URI d'image. */
export function adresseTransmissible(url: string): boolean {
  if (DATA_IMAGE.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

/* ───────────────────────────── Corps natif ───────────────────────────────── */

export type RatioFal = '9:16' | '4:5' | '1:1' | '16:9';
/** Mêmes tables que `falGenerateImage` (`packages/integrations/src/fal.ts`) · égalité prouvée par test. */
const TAILLE_FAL: Readonly<Record<RatioFal, string>> = { '9:16': 'portrait_16_9', '4:5': 'portrait_4_3', '1:1': 'square_hd', '16:9': 'landscape_16_9' };
const TAILLE_GPT1: Readonly<Record<RatioFal, string>> = { '9:16': '1024x1536', '4:5': '1024x1536', '1:1': '1024x1024', '16:9': '1536x1024' };
const RATIOS: ReadonlyArray<[RatioFal, number]> = [['9:16', 9 / 16], ['4:5', 4 / 5], ['1:1', 1], ['16:9', 16 / 9]];

/** Le ratio servi le plus proche (écart logarithmique) · seuls les ratios déjà envoyés par le produit. */
export function ratioFal(largeur: number, hauteur: number): { ratio: RatioFal; exact: boolean } {
  const r = largeur / hauteur;
  let meilleur: [RatioFal, number] = RATIOS[0]!;
  for (const c of RATIOS) if (Math.abs(Math.log(r / c[1])) < Math.abs(Math.log(r / meilleur[1]))) meilleur = c;
  return { ratio: meilleur[0], exact: Math.abs(Math.log(r / meilleur[1])) < 1e-3 };
}

export type FamilleModele = 'nano' | 'gpt1' | 'gpt2' | 'reference_unique';
export function familleModele(modele: string): FamilleModele {
  if (/nano-banana/i.test(modele)) return 'nano';
  if (/gpt-image-1/i.test(modele)) return 'gpt1';
  if (/gpt-image-2/i.test(modele)) return 'gpt2';
  return 'reference_unique';
}

/**
 * Le corps fal d'une génération d'image · même aiguillage que `falGenerateImage`
 * (ratio natif pour Nano Banana, taille en pixels pour GPT Image 1, vocabulaire
 * fal pour GPT Image 2 et les autres, une seule image de départ pour Flux).
 */
export function corpsFalImage(e: { modele: string; prompt: string; ratio: RatioFal; references: readonly string[]; images: number }): Record<string, unknown> {
  const corps: Record<string, unknown> = { prompt: e.prompt, num_images: Math.min(IMAGES_PAR_APPEL_MAX, Math.max(1, e.images)) };
  const avecRef = e.references.length > 0;
  switch (familleModele(e.modele)) {
    case 'nano':
      corps.aspect_ratio = e.ratio;
      if (avecRef) corps.image_urls = [...e.references];
      break;
    case 'gpt1':
      corps.image_size = TAILLE_GPT1[e.ratio];
      if (avecRef) corps.image_urls = [...e.references];
      break;
    case 'gpt2':
      corps.image_size = TAILLE_FAL[e.ratio];
      if (avecRef) corps.image_urls = [...e.references];
      break;
    default:
      corps.image_size = TAILLE_FAL[e.ratio];
      corps.output_format = 'jpeg';
      if (avecRef) corps.image_url = e.references[0];
  }
  return corps;
}

/** La consigne envoyée · instruction, composants protégés, contraintes négatives intégrées. */
export function promptFal(c: ConsigneImage): string {
  const parties = [c.generationInstruction.trim()];
  if (c.protectedComponents.length) parties.push(`Composants à préserver à l’identique : ${c.protectedComponents.join(' ; ')}.`);
  if (c.negativeConstraints.length) parties.push(`À éviter absolument : ${c.negativeConstraints.join(' ; ')}.`);
  if (c.needsDeterministicOverlay) parties.push('Aucun texte écrit dans l’image : les textes sont posés ensuite par des calques.');
  return parties.join('\n\n');
}

/* ───────────────────────────── La requête ────────────────────────────────── */

export interface ModelesRoutes {
  /** `FAL_IMAGE_MODEL` · génération sans référence. */
  generation: string;
  /** `FAL_IMAGE_MODEL_EDIT` · génération avec références (fidélité produit). */
  edition: string;
}

/** Les opérations confiées au fournisseur image, dans l'ordre de l'instantané (image i ⇒ opération i). */
export function operationsImageDuJob(ops: ReadonlyArray<{ operation: string; profil: ProfilOperation }>): string[] {
  return ops.filter((o) => o.profil === 'image_generation').map((o) => o.operation);
}

export type RequeteFal =
  | {
    ok: true;
    modele: string;
    corps: Record<string, unknown>;
    /** Les opérations, dans l'ordre des images rendues (image i ⇒ opération i). */
    operations: string[];
    /** Corps expurgé (médias remplacés par identifiant et empreinte) et son empreinte. */
    expurge: Record<string, unknown>;
    empreinte: string;
    /** Ce que le modèle ne prend pas en paramètre et qui a été intégré ou approché. */
    limites: string[];
  }
  | { ok: false; code: 'INVALID_SCHEMA' | 'MISSING_REFERENCE' | 'UNSUPPORTED_CAPABILITY'; motif: string; cibles: string[] };

export function requeteFalImage(e: {
  operations: ReadonlyArray<{ operation: string; profil: ProfilOperation }>;
  parametres: unknown;
  medias: ReadonlyArray<MediaResolu>;
  modeles: ModelesRoutes;
}): RequeteFal {
  const horsImage = e.operations.filter((o) => o.profil !== 'image_generation' && o.profil !== 'calcul');
  if (horsImage.length) return { ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: 'opération hors du fournisseur image (animation ou voix)', cibles: horsImage.map((o) => o.operation) };
  const images = operationsImageDuJob(e.operations);
  if (images.length === 0) return { ok: false, code: 'INVALID_SCHEMA', motif: 'aucune image à générer dans ce job', cibles: [] };
  if (images.length > IMAGES_PAR_APPEL_MAX) return { ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: `plus de ${IMAGES_PAR_APPEL_MAX} images dans un seul appel`, cibles: images };

  const lu = lireParametresImage(e.parametres);
  if (!lu.ok) return { ok: false, code: 'INVALID_SCHEMA', motif: lu.violations.join(' · '), cibles: [] };
  const p = lu.parametres;

  // Les références LIÉES par la consigne, chacune une fois · le produit d'abord.
  const roleDeclare = new Map(p.references.map((r) => [r.assetId, r] as const));
  const liees: string[] = [];
  for (const b of p.consigne.referenceBindings) if (!liees.includes(b.referenceId)) liees.push(b.referenceId);
  liees.sort((a, b) => Number(roleDeclare.get(b)?.role === 'product') - Number(roleDeclare.get(a)?.role === 'product'));

  const parId = new Map(e.medias.map((m) => [m.assetId, m] as const));
  const bloquees: string[] = [];
  const motifs: string[] = [];
  const urls: Array<{ assetId: string; url: string; sha256: string }> = [];
  for (const id of liees) {
    const m = parId.get(id);
    const attendu = roleDeclare.get(id)!;
    if (!m) { bloquees.push(id); motifs.push(`${id} : non résolue`); continue; }
    if (m.etat !== 'autorise') { bloquees.push(id); motifs.push(`${id} : ${m.motif}`); continue; }
    if (m.sha256 !== attendu.sha256) { bloquees.push(id); motifs.push(`${id} : fichier modifié depuis le devis`); continue; }
    if (!adresseTransmissible(m.url)) { bloquees.push(id); motifs.push(`${id} : adresse non transmissible au fournisseur`); continue; }
    urls.push({ assetId: id, url: m.url, sha256: m.sha256 });
  }
  if (bloquees.length) return { ok: false, code: 'MISSING_REFERENCE', motif: `référence indisponible, aucune substitution · ${motifs.join(' · ')}`, cibles: bloquees };
  if (urls.length > REFERENCES_PAR_APPEL_MAX) return { ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: `plus de ${REFERENCES_PAR_APPEL_MAX} références pour un appel`, cibles: urls.map((u) => u.assetId) };

  const modele = urls.length ? e.modeles.edition : e.modeles.generation;
  if (urls.length > 1 && familleModele(modele) === 'reference_unique') {
    return { ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: `le modèle routé ${modele} ne reçoit qu’une image de départ`, cibles: urls.map((u) => u.assetId) };
  }
  const { ratio, exact } = ratioFal(p.format.largeur, p.format.hauteur);
  const prompt = promptFal(p.consigne);
  if (contientEmplacement(prompt)) return { ok: false, code: 'INVALID_SCHEMA', motif: 'emplacement de gabarit non résolu dans la consigne', cibles: [] };

  const corps = corpsFalImage({ modele, prompt, ratio, references: urls.map((u) => u.url), images: images.length });
  const expurge: Record<string, unknown> = { ...corps, modele };
  const pieces = urls.map((u) => ({ assetId: u.assetId, sha256: u.sha256 }));
  if ('image_urls' in expurge) expurge.image_urls = pieces;
  if ('image_url' in expurge) expurge.image_url = pieces[0];
  const limites: string[] = [];
  if (p.consigne.negativeConstraints.length) limites.push('instruction négative non supportée par le modèle · intégrée à la consigne');
  if (!exact) limites.push(`format ${p.format.largeur}×${p.format.hauteur} servi au ratio ${ratio}`);
  return { ok: true, modele, corps, operations: images, expurge, empreinte: empreinteContenu(expurge), limites };
}
