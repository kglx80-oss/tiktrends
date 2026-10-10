/**
 * Studios · animation d'un plan vidéo · de l'image clé d'un plan à un clip
 * animé, sur la file fal (modèle image → vidéo).
 *
 * Pur. Même contrat que `fal-image.ts` : le worker résout le média AU MOMENT de
 * soumettre, la règle décide, rien ne part si un doute subsiste.
 *
 *  · Un clip part de l'image clé PRODUITE et encore valide du plan (média
 *    `sta_<uuid>` du projet, empreinte vue au devis). Aucune image clé, une
 *    image clé remplacée, révoquée ou modifiée depuis le devis : bloqué, aucune
 *    substitution, rien n'est envoyé ni facturé.
 *  · La consigne de mouvement est DÉRIVÉE des champs du plan (action, caméra,
 *    sujet, décor, lumière), bornée, sans texte écran : le storyboard est déjà
 *    la consigne validée du plan. Le gabarit `animation.compile` du registre
 *    n'est pas consommé ici (aucun appel texte de plus par clip) · à brancher
 *    quand une compilation dédiée sera voulue.
 *  · Durée : 5 s, la durée de base du modèle (Kling « 5 »). Le forfait réservé
 *    (`FIXED_COSTS.fal_video`) couvre une durée de base ; une durée longue ne
 *    se devise pas tant que son prix n'est pas mesuré.
 *  · Un clip par job, seul dans son devis : la sortie i ⇒ opération i reste
 *    sans ambiguïté.
 *
 * Mêmes variables que `packages/integrations/src/fal.ts` : `FAL_VIDEO_MODEL_I2V`
 * (défaut Kling 2.5 turbo pro image → vidéo), aucun modèle nouveau.
 */

import { empreinteContenu } from '../version';
import type { ContenuVersion, PlanStudio } from '../document';
import type { ProfilOperation } from '../execution/tarifs';
import { adresseTransmissible, contientEmplacement, type MediaResolu } from './fal-image';
/** Le plan réservé de l'image fixe du parcours image (`image/parcours.ts`) · jamais animé. */
const PLAN_IMAGE = 's_image';

export const SCHEMA_PARAMETRES_CLIP = 'studio_clip/1' as const;
/** Défaut de `falGenerateVideo` en image → vidéo · même modèle, même variable. */
export const MODELE_FAL_ANIMATION_DEFAUT = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
/** Durée de base du modèle, en secondes · la seule devisée (voir l'en-tête). */
export const DUREE_CLIP_S = 5;
/** Borne de la consigne de mouvement envoyée (le modèle accepte davantage · on reste court et lisible). */
export const CONSIGNE_MOUVEMENT_MAX = 1_200;
const CHAMP_MAX = 300;

/** Ce qui ne doit jamais apparaître dans un clip · le texte se pose au montage, jamais dans les images. */
export const INTERDITS_ANIMATION = [
  'texte incrusté', 'sous-titres', 'logo déformé', 'filigrane', 'mains ou visages déformés', 'changement de produit',
] as const;

export interface ParametresClipSnapshot {
  schema: typeof SCHEMA_PARAMETRES_CLIP;
  /** `clip:<plan>` · la seule opération du job. */
  operation: string;
  shotId: string;
  /** L'image clé de départ · média du projet, empreinte vue au devis. */
  source: { assetId: string; sha256: string };
  /** Consigne de mouvement dérivée du plan (`consigneMouvementDuPlan`). */
  consigne: string;
  interdits: string[];
  dureeS: number;
}

const net = (s: unknown, max = CHAMP_MAX): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `clip:<plan>` → `<plan>` · `null` pour toute autre opération. */
export function planDeClip(operation: string): string | null {
  if (!operation.startsWith('clip:')) return null;
  const sid = operation.slice('clip:'.length);
  return /^[A-Za-z0-9_-]{1,60}$/.test(sid) && sid !== PLAN_IMAGE ? sid : null;
}

/**
 * La consigne de mouvement d'un plan · ce qui bouge (action), comment la
 * caméra se déplace, ce qui doit rester identique (sujet, décor, lumière).
 * Aucun texte écran, aucune narration (la voix et les textes se posent au
 * montage). Bornée, espaces normalisés.
 */
export function consigneMouvementDuPlan(p: Pick<PlanStudio, 'action' | 'camera' | 'subject' | 'environment' | 'lighting' | 'framing'>): string {
  const parties: string[] = [];
  const action = net(p.action);
  const camera = net(p.camera);
  if (action) parties.push(`Mouvement : ${action}.`);
  if (camera) parties.push(`Caméra : ${camera}.`);
  const garde = [net(p.subject) && `sujet ${net(p.subject)}`, net(p.framing) && `cadrage ${net(p.framing)}`, net(p.environment) && `décor ${net(p.environment)}`, net(p.lighting) && `lumière ${net(p.lighting)}`]
    .filter(Boolean);
  if (garde.length) parties.push(`À garder identique à l’image de départ : ${garde.join(' ; ')}.`);
  parties.push('Mouvement naturel et fluide, aucun texte à l’écran.');
  return parties.join(' ').slice(0, CONSIGNE_MOUVEMENT_MAX);
}

export type ParametresClip = { ok: true; parametres: ParametresClipSnapshot } | { ok: false; code: 'NOT_FOUND' | 'MISSING_REFERENCE' | 'INVALID_SCHEMA'; motif: string };

/**
 * Les paramètres d'un clip, construits par le SERVEUR au devis puis relus à
 * l'approbation · le plan doit exister et son image clé produite être connue
 * (média du projet et empreinte).
 */
export function parametresDuClip(e: {
  contenu: ContenuVersion;
  shotId: string;
  /** L'image clé encore valide du plan · `null` si aucune. */
  keyframe: { assetUuid: string; sha256: string } | null;
}): ParametresClip {
  const p = e.contenu.shots.byId[e.shotId];
  if (!p) return { ok: false, code: 'NOT_FOUND', motif: 'Ce plan n’existe plus dans la version courante.' };
  if (!e.keyframe) return { ok: false, code: 'MISSING_REFERENCE', motif: 'Ce plan n’a pas d’image clé valide · produis-la avant de l’animer.' };
  if (!UUID.test(e.keyframe.assetUuid) || !SHA.test(e.keyframe.sha256)) return { ok: false, code: 'MISSING_REFERENCE', motif: 'Image clé illisible (média ou empreinte).' };
  const consigne = consigneMouvementDuPlan(p);
  if (contientEmplacement(consigne)) return { ok: false, code: 'INVALID_SCHEMA', motif: 'Emplacement de gabarit non résolu dans le plan.' };
  return {
    ok: true,
    parametres: {
      schema: SCHEMA_PARAMETRES_CLIP, operation: `clip:${e.shotId}`, shotId: e.shotId,
      source: { assetId: `sta_${e.keyframe.assetUuid}`, sha256: e.keyframe.sha256 },
      consigne, interdits: [...INTERDITS_ANIMATION], dureeS: DUREE_CLIP_S,
    },
  };
}

/** Empreinte des paramètres d'un clip · entre dans `inputHash` du devis (relue à l'approbation). */
export function empreinteParametresClip(p: ParametresClipSnapshot): string {
  return empreinteContenu(p as unknown as Record<string, unknown>);
}

export function estParametresClip(x: unknown): boolean {
  return estObjet(x) && x.schema === SCHEMA_PARAMETRES_CLIP;
}

/** Relecture défensive de `SnapshotJob.parametres` d'un clip · rien n'est complété par défaut. */
export function lireParametresClip(x: unknown): { ok: true; parametres: ParametresClipSnapshot } | { ok: false; violations: string[] } {
  const v: string[] = [];
  if (!estObjet(x) || x.schema !== SCHEMA_PARAMETRES_CLIP) return { ok: false, violations: ['/parametres : schéma studio_clip/1 attendu'] };
  if (typeof x.operation !== 'string' || planDeClip(x.operation) === null) v.push('/parametres/operation : clip:<plan> attendu');
  if (typeof x.shotId !== 'string' || x.operation !== `clip:${x.shotId}`) v.push('/parametres/shotId : doit correspondre à l’opération');
  const s = x.source;
  if (!estObjet(s) || typeof s.assetId !== 'string' || !/^sta_/.test(s.assetId) || !UUID.test(s.assetId.slice(4)) || typeof s.sha256 !== 'string' || !SHA.test(s.sha256)) {
    v.push('/parametres/source : image clé du projet (sta_<uuid>) et empreinte attendues');
  }
  if (typeof x.consigne !== 'string' || !x.consigne.trim() || x.consigne.length > CONSIGNE_MOUVEMENT_MAX || contientEmplacement(x.consigne)) v.push('/parametres/consigne : texte de 1 à 1 200 caractères, sans emplacement');
  if (!Array.isArray(x.interdits) || x.interdits.length > 20 || !x.interdits.every((i) => typeof i === 'string' && i.length <= CHAMP_MAX)) v.push('/parametres/interdits : liste bornée');
  if (x.dureeS !== DUREE_CLIP_S) v.push(`/parametres/dureeS : ${DUREE_CLIP_S} s seulement`);
  return v.length ? { ok: false, violations: v } : { ok: true, parametres: x as unknown as ParametresClipSnapshot };
}

export type RequeteFalAnimation =
  | { ok: true; modele: string; corps: Record<string, unknown>; operations: string[]; expurge: Record<string, unknown>; empreinte: string; limites: string[] }
  | { ok: false; code: 'INVALID_SCHEMA' | 'MISSING_REFERENCE' | 'UNSUPPORTED_CAPABILITY'; motif: string; cibles: string[] };

/**
 * Le corps fal d'une animation · même forme que `falGenerateVideo` en image →
 * vidéo (`prompt`, `duration` en texte, `image_url` ; le modèle déduit le
 * ratio de l'image de départ), plus l'instruction négative du modèle.
 */
export function requeteFalAnimation(e: {
  operations: ReadonlyArray<{ operation: string; profil: ProfilOperation }>;
  parametres: unknown;
  source: MediaResolu | null;
  modele: string;
}): RequeteFalAnimation {
  const payantes = e.operations.filter((o) => o.profil !== 'calcul');
  const clips = payantes.filter((o) => o.profil === 'animation');
  if (payantes.length !== clips.length) return { ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: 'un job d’animation ne porte que des clips', cibles: payantes.filter((o) => o.profil !== 'animation').map((o) => o.operation) };
  if (clips.length !== 1) return { ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: 'un seul clip par job', cibles: clips.map((o) => o.operation) };
  const lu = lireParametresClip(e.parametres);
  if (!lu.ok) return { ok: false, code: 'INVALID_SCHEMA', motif: lu.violations.join(' · '), cibles: [] };
  const p = lu.parametres;
  if (p.operation !== clips[0]!.operation) return { ok: false, code: 'INVALID_SCHEMA', motif: 'les paramètres ne correspondent pas au clip du job', cibles: [clips[0]!.operation] };
  const s = e.source;
  if (!s || s.assetId !== p.source.assetId) return { ok: false, code: 'MISSING_REFERENCE', motif: 'image clé non résolue · aucune substitution', cibles: [p.source.assetId] };
  if (s.etat !== 'autorise') return { ok: false, code: 'MISSING_REFERENCE', motif: `image clé indisponible · ${s.motif}`, cibles: [s.assetId] };
  if (s.sha256 !== p.source.sha256) return { ok: false, code: 'MISSING_REFERENCE', motif: 'image clé modifiée depuis le devis · aucune substitution', cibles: [s.assetId] };
  if (!adresseTransmissible(s.url) || s.url.startsWith('data:')) return { ok: false, code: 'MISSING_REFERENCE', motif: 'image clé sans adresse transmissible au fournisseur', cibles: [s.assetId] };
  const corps: Record<string, unknown> = {
    prompt: p.consigne,
    image_url: s.url,
    duration: String(p.dureeS),
    negative_prompt: p.interdits.join(', '),
  };
  const expurge: Record<string, unknown> = { ...corps, modele: e.modele, image_url: { assetId: s.assetId, sha256: s.sha256 } };
  return {
    ok: true, modele: e.modele, corps, operations: [p.operation], expurge, empreinte: empreinteContenu(expurge),
    limites: ['ratio déduit de l’image clé par le modèle', `durée de base ${p.dureeS} s`],
  };
}
