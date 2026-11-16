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
 *  · Le MODÈLE est fixé AU DEVIS (`FAL_VIDEO_MODEL_STUDIO`, `modeleAnimationStudio`)
 *    et porté par les paramètres : le worker envoie au modèle devisé, réserve
 *    son prix, jamais celui d'un autre.
 *  · Durée : la plus proche durée PERMISE du modèle au moins égale à celle du
 *    plan, bornée (`dureeClipPour`, `catalogue-video.ts`) · Kling 5 ou 10 s,
 *    Veo 4, 6 ou 8 s. Prix = prix à la seconde × durée (voix comprise).
 *  · Voix native : seulement pour une prise parlée à l'image, refusée (raison
 *    écrite, clip muet) quand le modèle ne parle pas la langue du projet
 *    (`decisionAudioNatif`).
 *  · Un clip par job, seul dans son devis : la sortie i ⇒ opération i reste
 *    sans ambiguïté.
 *
 * Schéma `studio_clip/2` (modèle, voix, résolution, ratio). Un instantané
 * `studio_clip/1` écrit avant le catalogue reste lisible : 5 s, muet, modèle
 * du worker, corps Kling.
 */

import { empreinteContenu } from '../version';
import type { ContenuVersion, PlanStudio } from '../document';
import type { LigneDevis, ProfilOperation } from '../execution/tarifs';
import { dureePlanMs } from '../video/plans';
import { formatVideo } from '../video/consigne-plan';
import { adresseTransmissible, contientEmplacement, type MediaResolu } from './fal-image';
import {
  MODELE_VIDEO_STUDIO_DEFAUT, corpsFalVideo, decisionAudioNatif, dureeClipPour, entreeCatalogueVideo, langueDuProjet, ratioPourModele, tarifClip,
  type RatioVideo, type ResolutionVideo, type TarifClip,
} from './catalogue-video';
/** Le plan réservé de l'image fixe du parcours image (`image/parcours.ts`) · jamais animé. */
const PLAN_IMAGE = 's_image';

export const SCHEMA_PARAMETRES_CLIP = 'studio_clip/2' as const;
/** L'instantané d'avant le catalogue vidéo · encore lu (jobs déjà en file), plus jamais écrit. */
export const SCHEMA_PARAMETRES_CLIP_V1 = 'studio_clip/1' as const;
/** Défaut du modèle d'animation des Studios · celui déjà en service (Kling 2.5 turbo pro). */
export const MODELE_FAL_ANIMATION_DEFAUT = MODELE_VIDEO_STUDIO_DEFAUT;
/** Durée de base · celle d'un instantané `studio_clip/1` et d'un modèle hors catalogue (forfait de repli). */
export const DUREE_CLIP_S = 5;
/** Borne de la consigne de mouvement envoyée (le modèle accepte davantage · on reste court et lisible). */
export const CONSIGNE_MOUVEMENT_MAX = 1_200;
const CHAMP_MAX = 300;

/** Ce qui ne doit jamais apparaître dans un clip · le texte se pose au montage, jamais dans les images. */
export const INTERDITS_ANIMATION = [
  'texte incrusté', 'sous-titres', 'logo déformé', 'filigrane', 'mains ou visages déformés', 'changement de produit',
] as const;

export interface ParametresClipSnapshot {
  schema: typeof SCHEMA_PARAMETRES_CLIP | typeof SCHEMA_PARAMETRES_CLIP_V1;
  /** `clip:<plan>` · la seule opération du job. */
  operation: string;
  shotId: string;
  /** L'image clé de départ · média du projet, empreinte vue au devis. */
  source: { assetId: string; sha256: string };
  /** Consigne de mouvement dérivée du plan (`consigneMouvementDuPlan`). */
  consigne: string;
  interdits: string[];
  /** Une durée permise du modèle (`dureeClipPour`). */
  dureeS: number;
  /** Endpoint fal DEVISÉ · `null` sur un instantané `studio_clip/1` (modèle du worker). */
  modele: string | null;
  /** Voix native demandée au modèle (`decisionAudioNatif`). */
  audio: boolean;
  /** Résolution envoyée (Veo) · `null` pour un modèle sans ce paramètre. */
  resolution: ResolutionVideo | null;
  /** Ratio envoyé (Veo) · `null` quand le modèle le déduit de l'image clé. */
  ratio: RatioVideo | null;
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

type ParamsPlan = Pick<ParametresClipSnapshot, 'dureeS' | 'modele' | 'audio' | 'resolution' | 'ratio'> & { modele: string };

export type ChoixClip = { ok: true; choix: ParamsPlan; limites: string[] } | { ok: false; code: 'NOT_FOUND' | 'UNSUPPORTED_CAPABILITY'; motif: string };

/**
 * Ce qu'un plan demande au modèle d'animation · durée permise, voix, ratio,
 * résolution. Pur, sans image clé : l'écran l'affiche AVANT le devis, le devis
 * le fige. Refus nommé quand le modèle ne sait pas faire le plan.
 */
export function choixClipDuPlan(e: { contenu: ContenuVersion; shotId: string; modele?: string | null }): ChoixClip {
  const p = e.contenu.shots.byId[e.shotId];
  if (!p) return { ok: false, code: 'NOT_FOUND', motif: 'Ce plan n’existe plus dans la version courante.' };
  const modele = (e.modele ?? '').trim() || MODELE_FAL_ANIMATION_DEFAUT;
  const m = entreeCatalogueVideo(modele);
  const limites: string[] = [];
  const audio = decisionAudioNatif({ entree: m, langue: langueDuProjet(e.contenu), parole: p.speechMode });
  if (audio.refus) limites.push(audio.refus);
  if (audio.limite) limites.push(audio.limite);
  if (!m) {
    limites.push('modèle hors catalogue · 5 s au forfait de repli');
    return { ok: true, choix: { modele, dureeS: DUREE_CLIP_S, audio: false, resolution: null, ratio: null }, limites };
  }
  const ratio = ratioPourModele(m, formatVideo(e.contenu));
  if (!ratio.ok) return { ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: ratio.raison };
  const d = dureeClipPour(m, dureePlanMs(p));
  if (d.bornee) limites.push(`plan plus long que le clip le plus long de ${m.libelle} · ${d.dureeS} s, le reste se règle au montage`);
  return { ok: true, choix: { modele, dureeS: d.dureeS, audio: audio.audio, resolution: m.famille === 'veo' ? m.resolutionDefaut : null, ratio: ratio.ratio }, limites };
}

export type ParametresClip =
  | { ok: true; parametres: ParametresClipSnapshot; limites: string[] }
  | { ok: false; code: 'NOT_FOUND' | 'MISSING_REFERENCE' | 'INVALID_SCHEMA' | 'UNSUPPORTED_CAPABILITY'; motif: string };

/**
 * Les paramètres d'un clip, construits par le SERVEUR au devis puis relus à
 * l'approbation · le plan doit exister et son image clé produite être connue
 * (média du projet et empreinte). `modele` · `modeleAnimationStudio(env)`.
 */
export function parametresDuClip(e: {
  contenu: ContenuVersion;
  shotId: string;
  /** L'image clé encore valide du plan · `null` si aucune. */
  keyframe: { assetUuid: string; sha256: string } | null;
  modele?: string | null;
}): ParametresClip {
  const p = e.contenu.shots.byId[e.shotId];
  if (!p) return { ok: false, code: 'NOT_FOUND', motif: 'Ce plan n’existe plus dans la version courante.' };
  // Ce que le modèle ne sait pas faire (format) se dit d'abord : produire l'image clé n'y changerait rien.
  const c = choixClipDuPlan({ contenu: e.contenu, shotId: e.shotId, modele: e.modele });
  if (!c.ok) return c;
  if (!e.keyframe) return { ok: false, code: 'MISSING_REFERENCE', motif: 'Ce plan n’a pas d’image clé valide · produis-la avant de l’animer.' };
  if (!UUID.test(e.keyframe.assetUuid) || !SHA.test(e.keyframe.sha256)) return { ok: false, code: 'MISSING_REFERENCE', motif: 'Image clé illisible (média ou empreinte).' };
  const consigne = consigneMouvementDuPlan(p);
  if (contientEmplacement(consigne)) return { ok: false, code: 'INVALID_SCHEMA', motif: 'Emplacement de gabarit non résolu dans le plan.' };
  return {
    ok: true,
    parametres: {
      schema: SCHEMA_PARAMETRES_CLIP, operation: `clip:${e.shotId}`, shotId: e.shotId,
      source: { assetId: `sta_${e.keyframe.assetUuid}`, sha256: e.keyframe.sha256 },
      consigne, interdits: [...INTERDITS_ANIMATION], ...c.choix,
    },
    limites: c.limites,
  };
}

/** Empreinte des paramètres d'un clip · entre dans `inputHash` du devis (relue à l'approbation). */
export function empreinteParametresClip(p: ParametresClipSnapshot): string {
  return empreinteContenu(p as unknown as Record<string, unknown>);
}

export function estParametresClip(x: unknown): boolean {
  return estObjet(x) && (x.schema === SCHEMA_PARAMETRES_CLIP || x.schema === SCHEMA_PARAMETRES_CLIP_V1);
}

const MODELE_FAL = /^[a-z0-9][a-z0-9._/-]{0,199}$/i;
const RESOLUTIONS: readonly string[] = ['720p', '1080p'];

/**
 * Relecture défensive de `SnapshotJob.parametres` d'un clip · rien n'est
 * complété par défaut, sauf l'instantané `studio_clip/1` (avant le catalogue) :
 * lu comme ce qu'il était, 5 s, muet, modèle du worker.
 */
export function lireParametresClip(x: unknown): { ok: true; parametres: ParametresClipSnapshot } | { ok: false; violations: string[] } {
  const v: string[] = [];
  if (!estParametresClip(x)) return { ok: false, violations: ['/parametres : schéma studio_clip/2 attendu'] };
  const o = x as Record<string, unknown>;
  if (typeof o.operation !== 'string' || planDeClip(o.operation) === null) v.push('/parametres/operation : clip:<plan> attendu');
  if (typeof o.shotId !== 'string' || o.operation !== `clip:${o.shotId}`) v.push('/parametres/shotId : doit correspondre à l’opération');
  const s = o.source;
  if (!estObjet(s) || typeof s.assetId !== 'string' || !/^sta_/.test(s.assetId) || !UUID.test(s.assetId.slice(4)) || typeof s.sha256 !== 'string' || !SHA.test(s.sha256)) {
    v.push('/parametres/source : image clé du projet (sta_<uuid>) et empreinte attendues');
  }
  if (typeof o.consigne !== 'string' || !o.consigne.trim() || o.consigne.length > CONSIGNE_MOUVEMENT_MAX || contientEmplacement(o.consigne)) v.push('/parametres/consigne : texte de 1 à 1 200 caractères, sans emplacement');
  if (!Array.isArray(o.interdits) || o.interdits.length > 20 || !o.interdits.every((i) => typeof i === 'string' && i.length <= CHAMP_MAX)) v.push('/parametres/interdits : liste bornée');
  if (o.schema === SCHEMA_PARAMETRES_CLIP_V1) {
    if (o.dureeS !== DUREE_CLIP_S) v.push(`/parametres/dureeS : ${DUREE_CLIP_S} s seulement (studio_clip/1)`);
    return v.length ? { ok: false, violations: v } : { ok: true, parametres: { ...(o as unknown as ParametresClipSnapshot), modele: null, audio: false, resolution: null, ratio: null } };
  }
  const modele = typeof o.modele === 'string' && MODELE_FAL.test(o.modele) ? o.modele : null;
  if (!modele) v.push('/parametres/modele : endpoint fal attendu');
  if (typeof o.audio !== 'boolean') v.push('/parametres/audio : vrai ou faux attendu');
  const m = entreeCatalogueVideo(modele);
  if (m) {
    if (typeof o.dureeS !== 'number' || !m.dureesS.includes(o.dureeS)) v.push(`/parametres/dureeS : ${m.dureesS.join(', ')} s seulement (${m.libelle})`);
    if (o.audio === true && !m.voix.native) v.push(`/parametres/audio : ${m.libelle} ne produit pas de voix`);
    if (m.famille === 'veo') {
      if (typeof o.resolution !== 'string' || !RESOLUTIONS.includes(o.resolution) || !m.prix[o.resolution as ResolutionVideo]) v.push(`/parametres/resolution : ${Object.keys(m.prix).join(' ou ')} attendue`);
      if (typeof o.ratio !== 'string' || !(m.ratios ?? []).includes(o.ratio as RatioVideo)) v.push(`/parametres/ratio : ${(m.ratios ?? []).join(' ou ')} attendu`);
    } else {
      if (o.resolution !== null) v.push('/parametres/resolution : aucune pour ce modèle');
      if (o.ratio !== null) v.push('/parametres/ratio : déduit de l’image clé pour ce modèle');
    }
  } else if (modele) {
    // Hors catalogue · le comportement d'avant le catalogue, et lui seul.
    if (o.dureeS !== DUREE_CLIP_S) v.push(`/parametres/dureeS : ${DUREE_CLIP_S} s seulement (modèle hors catalogue)`);
    if (o.audio !== false) v.push('/parametres/audio : muet seulement (modèle hors catalogue)');
    if (o.resolution !== null || o.ratio !== null) v.push('/parametres/resolution, ratio : aucun pour un modèle hors catalogue');
  }
  return v.length ? { ok: false, violations: v } : { ok: true, parametres: o as unknown as ParametresClipSnapshot };
}

/* ───────────────────────────── Tarif du clip ────────────────────────────── */

/**
 * Le tarif d'un clip DEVISÉ · celui que le devis affiche, que l'approbation
 * revérifie et que le worker réserve. `modeleWorker` ne sert qu'à un
 * instantané `studio_clip/1` (sans modèle).
 */
export function tarifDuClip(p: ParametresClipSnapshot, modeleWorker?: string | null): { ok: true; tarif: TarifClip; modele: string } | { ok: false; motif: string } {
  const modele = p.modele ?? ((modeleWorker ?? '').trim() || MODELE_FAL_ANIMATION_DEFAUT);
  const t = tarifClip({ modele, dureeS: p.dureeS, audio: p.audio, resolution: p.resolution });
  return t.ok ? { ok: true, tarif: t.tarif, modele } : t;
}

/**
 * La ligne du clip d'un devis, AU CATALOGUE · une unité par seconde, prix et
 * crédits à la seconde (une unité au forfait pour un modèle hors catalogue).
 * Les autres lignes sont rendues telles quelles.
 */
export function lignesAvecTarifClip(lignes: readonly LigneDevis[], p: ParametresClipSnapshot): { ok: true; lignes: LigneDevis[] } | { ok: false; motif: string } {
  const t = tarifDuClip(p);
  if (!t.ok) return t;
  if (!lignes.some((l) => l.operation === p.operation && l.profil === 'animation')) return { ok: false, motif: `ligne ${p.operation} absente du devis` };
  return {
    ok: true,
    lignes: lignes.map((l) => (l.operation === p.operation && l.profil === 'animation'
      ? { ...l, unites: t.tarif.unites, credits: t.tarif.creditsParUnite, usdMicros: t.tarif.usdMicrosParUnite, inclus: false, natureCout: 'estimation' as const, motifEstimation: t.tarif.motif }
      : l)),
  };
}

/**
 * À l'approbation · la ligne du clip du devis stocké vaut-elle EXACTEMENT le
 * tarif des paramètres relus maintenant ? Sinon (catalogue, modèle ou durée
 * changés depuis le devis) : la phrase du refus, rien n'est débité.
 */
export function refusTarifClipChange(lignes: unknown, p: ParametresClipSnapshot): string | null {
  const ls = Array.isArray(lignes) ? (lignes as Array<Partial<LigneDevis> | null>) : [];
  const l = ls.find((x) => x?.operation === p.operation && x?.profil === 'animation');
  const t = tarifDuClip(p);
  if (!l || !t.ok) return 'Le clip de ce devis n’a plus de tarif · redemande un devis. Rien n’a été débité.';
  if (l.unites !== t.tarif.unites || l.credits !== t.tarif.creditsParUnite || l.usdMicros !== t.tarif.usdMicrosParUnite) {
    return 'Le modèle, la durée ou le prix du clip ont changé depuis ce devis · redemande un devis. Rien n’a été débité.';
  }
  return null;
}

/** Le prix d'un clip pour un plan, AVANT le devis · ce que l'écran annonce, ou pourquoi il est refusé. */
export type PrixClipPlan =
  | { ok: true; modele: string; libelleModele: string; dureeS: number; audio: boolean; credits: number; usdMicros: number; limites: string[] }
  | { ok: false; raison: string };

export function prixClipDuPlan(e: { contenu: ContenuVersion; shotId: string; modele?: string | null }): PrixClipPlan {
  const c = choixClipDuPlan(e);
  if (!c.ok) return { ok: false, raison: c.motif };
  const t = tarifClip({ modele: c.choix.modele, dureeS: c.choix.dureeS, audio: c.choix.audio, resolution: c.choix.resolution });
  if (!t.ok) return { ok: false, raison: t.motif };
  return {
    ok: true, modele: c.choix.modele, libelleModele: entreeCatalogueVideo(c.choix.modele)?.libelle ?? c.choix.modele,
    dureeS: c.choix.dureeS, audio: c.choix.audio, credits: t.tarif.credits, usdMicros: t.tarif.usdMicros, limites: c.limites,
  };
}

/* ───────────────────────────── Requête fal ──────────────────────────────── */

export type RequeteFalAnimation =
  | { ok: true; modele: string; corps: Record<string, unknown>; operations: string[]; expurge: Record<string, unknown>; empreinte: string; limites: string[] }
  | { ok: false; code: 'INVALID_SCHEMA' | 'MISSING_REFERENCE' | 'UNSUPPORTED_CAPABILITY'; motif: string; cibles: string[] };

/**
 * Le corps fal d'une animation, par FAMILLE du modèle devisé (`corpsFalVideo`) ·
 * Kling : `prompt`, `image_url`, `duration` "5" | "10", `negative_prompt`
 * (ratio déduit de l'image) ; Veo : `duration` "4s" | "6s" | "8s",
 * `aspect_ratio`, `resolution`, `generate_audio` explicite, `negative_prompt`.
 * `modele` (celui du worker) ne sert qu'à un instantané `studio_clip/1`.
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
  const modele = p.modele ?? e.modele;
  const m = entreeCatalogueVideo(modele);
  // Un instantané d'avant le catalogue n'a ni ratio ni durée Veo : jamais envoyé à Veo.
  if (p.modele === null && m && m.famille !== 'kling') return { ok: false, code: 'INVALID_SCHEMA', motif: `instantané studio_clip/1 (5 s, sans ratio) incompatible avec ${m.libelle} · redemande un devis`, cibles: [p.operation] };
  const s = e.source;
  if (!s || s.assetId !== p.source.assetId) return { ok: false, code: 'MISSING_REFERENCE', motif: 'image clé non résolue · aucune substitution', cibles: [p.source.assetId] };
  if (s.etat !== 'autorise') return { ok: false, code: 'MISSING_REFERENCE', motif: `image clé indisponible · ${s.motif}`, cibles: [s.assetId] };
  if (s.sha256 !== p.source.sha256) return { ok: false, code: 'MISSING_REFERENCE', motif: 'image clé modifiée depuis le devis · aucune substitution', cibles: [s.assetId] };
  if (!adresseTransmissible(s.url) || s.url.startsWith('data:')) return { ok: false, code: 'MISSING_REFERENCE', motif: 'image clé sans adresse transmissible au fournisseur', cibles: [s.assetId] };
  const famille = m?.famille ?? 'kling';
  const corps = corpsFalVideo({
    famille, prompt: p.consigne, imageUrl: s.url, dureeS: p.dureeS, negatif: p.interdits.join(', '),
    ratio: p.ratio, resolution: p.resolution, audio: p.audio,
  });
  const expurge: Record<string, unknown> = { ...corps, modele, image_url: { assetId: s.assetId, sha256: s.sha256 } };
  const limites = famille === 'kling'
    ? ['ratio déduit de l’image clé par le modèle', `durée ${p.dureeS} s`, ...(m ? [] : ['modèle hors catalogue · corps Kling'])]
    : [`ratio ${p.ratio}`, `durée ${p.dureeS} s`, `résolution ${p.resolution}`, p.audio ? 'voix native · à valider à l’écoute' : 'muet'];
  return { ok: true, modele, corps, operations: [p.operation], expurge, empreinte: empreinteContenu(expurge), limites };
}
