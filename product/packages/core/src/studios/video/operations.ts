/**
 * Studios · L6-A · opérations de montage sur un contenu vidéo.
 *
 * Pur. Chaque opération reçoit le contenu d'une version et rend SOIT un
 * nouveau contenu VALIDÉ (`validerContenuVersion`) accompagné du patch JSON
 * Pointer qui y mène (chemins sur identifiants stables, `/shots` et
 * `/timeline` seulement), du bilan des durées et des signalements, SOIT un
 * refus qui dit quoi faire. Le contenu d'entrée n'est jamais modifié. Le
 * serveur reste juge : il rejoue l'opération sur SA version courante.
 *
 * Ce que chaque geste touche (le graphe L1 le prouve, `impactVideo`) :
 *  · `ordre`     · `shots.order` et la timeline recalée · montage, mix,
 *                  sous-titres, export ; aucune image, aucune animation
 *                  (VIDEO-08) ;
 *  · `narration` · la narration d'UN plan, sa durée recalculée et dite, la
 *                  timeline recalée · sa voix et les assemblages ; images
 *                  clés identiques (VIDEO-05) ;
 *  · `sans_texte`· texte écran vidé, sous-titres coupés, aucune piste de
 *                  surimpression ; l'éventuel texte DÉJÀ incrusté dans une
 *                  image produite est signalé, jamais promis retiré (VIDEO-09) ;
 *  · `musique`   · `timeline.music` seule · mix et export (VIDEO-10) ;
 *  · `plan`      · les champs d'un plan (visuel ⇒ son image clé) ;
 *  · `scenario`  · un nouveau jeu de plans (storyboard retenu ou saisie).
 */

import { estIdStable, validerContenuVersion, type ContenuVersion, type PlanStudio, type ViolationStudio } from '../document';
import type { ChangementPatch } from '../patch';
import { jsonCanonique } from '../version';
import {
  lirePlanSaisi, dureeNarrationMs, dureeLisible, dureePlanMs, CHAMPS_TEXTE_PLAN, DUREE_PLAN_MIN_MS, DUREE_PLAN_MAX_MS, PLANS_MAX,
  type SaisiePlan,
} from './plans';
import { timelineDesPlans, dureeTotaleMs } from './timeline';

export const CHEMINS_VIDEO: readonly string[] = ['/shots', '/timeline'];
/** Gain musical · en dB, borné (un gain positif au-delà de +6 dB écrête presque toujours). */
export const GAIN_MUSIQUE_MIN_DB = -60;
export const GAIN_MUSIQUE_MAX_DB = 6;

export type OperationVideo =
  | { type: 'scenario'; plans: Array<{ shotId: string } & Partial<SaisiePlan>> }
  | { type: 'plan'; shotId: string; champs: Partial<SaisiePlan> }
  | { type: 'ordre'; ordre: string[] }
  | { type: 'narration'; shotId: string; narration: string }
  | { type: 'sans_texte' }
  | { type: 'musique'; musique: { assetId: string; gainDb: number } | null };

export type CodeRefusVideo = 'PLAN_INTROUVABLE' | 'VALEUR_INVALIDE' | 'CONTENU_INVALIDE' | 'AUCUN_CHANGEMENT';

export interface DureePlanBilan { shotId: string; rang: number; avantMs: number | null; apresMs: number | null }
export interface BilanDurees { avantMs: number; apresMs: number; plans: DureePlanBilan[]; phrase: string }

export type ResultatOperationVideo =
  | { ok: true; contenu: ContenuVersion; changes: ChangementPatch[]; libelle: string; durees: BilanDurees; signalements: string[] }
  | { ok: false; code: CodeRefusVideo; message: string; violations: ViolationStudio[] };

const copie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const meme = (a: unknown, b: unknown) => { try { return jsonCanonique(a) === jsonCanonique(b); } catch { return false; } };
const echapper = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const refus = (code: CodeRefusVideo, message: string, violations: ViolationStudio[] = []): ResultatOperationVideo => ({ ok: false, code, message, violations });
const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Les références qu'un plan peut citer · fiches d'identité et produit (photo comprise) du projet. */
export function referencesDuProjet(c: Pick<ContenuVersion, 'characterRefs' | 'productRef'>): Set<string> {
  const s = new Set(Object.keys(c.characterRefs));
  if (c.productRef) {
    s.add(c.productRef.productId);
    if (typeof c.productRef.assetId === 'string') s.add(c.productRef.assetId);
  }
  return s;
}

/** Rang (1, 2, …) d'un plan dans l'ordre du montage · pour les phrases de l'écran. */
export const rangDuPlan = (c: Pick<ContenuVersion, 'shots'>, shotId: string): number => c.shots.order.indexOf(shotId) + 1;

/* ──────────────────────────────── Patch ──────────────────────────────────── */

/**
 * Le patch de `avant` à `apres` sur `/shots` et `/timeline` · un changement
 * par champ de plan touché, l'ordre en un bloc, la timeline en un bloc (elle
 * est dérivée et recalculée, jamais éditée champ par champ).
 */
export function changementsVideo(avant: ContenuVersion, apres: ContenuVersion, raison: string): ChangementPatch[] {
  const out: ChangementPatch[] = [];
  const pose = (op: ChangementPatch['op'], path: string, v: unknown) => out.push({ op, path, newValue: op === 'remove' ? null : copie(v), reason: raison });
  const a = avant.shots.byId;
  const b = apres.shots.byId;
  for (const id of Object.keys(a).sort()) if (!(id in b)) pose('remove', `/shots/byId/${echapper(id)}`, null);
  for (const id of Object.keys(b).sort()) {
    const ch = `/shots/byId/${echapper(id)}`;
    if (!(id in a)) { pose('add', ch, b[id]); continue; }
    const pa = a[id] as unknown as Record<string, unknown>;
    const pb = b[id] as unknown as Record<string, unknown>;
    for (const k of Object.keys(pa).sort()) if (!(k in pb)) pose('remove', `${ch}/${k}`, null);
    for (const k of Object.keys(pb).sort()) {
      if (!(k in pa)) pose('add', `${ch}/${k}`, pb[k]);
      else if (!meme(pa[k], pb[k])) pose('replace', `${ch}/${k}`, pb[k]);
    }
  }
  if (!meme(avant.shots.order, apres.shots.order)) pose('replace', '/shots/order', apres.shots.order);
  if (!meme(avant.timeline, apres.timeline)) pose('replace', '/timeline', apres.timeline);
  return out;
}

/* ──────────────────────────────── Durées ─────────────────────────────────── */

function bilanDurees(avant: ContenuVersion, apres: ContenuVersion): BilanDurees {
  const ids = [...new Set([...apres.shots.order, ...avant.shots.order])];
  const plans: DureePlanBilan[] = ids.map((sid) => {
    const pa = avant.shots.byId[sid];
    const pb = apres.shots.byId[sid];
    return { shotId: sid, rang: apres.shots.order.indexOf(sid) + 1 || avant.shots.order.indexOf(sid) + 1, avantMs: pa ? dureePlanMs(pa) : null, apresMs: pb ? dureePlanMs(pb) : null };
  });
  const avantMs = dureeTotaleMs(avant);
  const apresMs = dureeTotaleMs(apres);
  const changes = plans.filter((p) => p.avantMs !== null && p.apresMs !== null && p.avantMs !== p.apresMs);
  const detail = changes.map((p) => `plan ${p.rang} : ${dureeLisible(p.avantMs!)} → ${dureeLisible(p.apresMs!)}`).join(' · ');
  const phrase = avantMs === apresMs
    ? `Durée totale inchangée · ${dureeLisible(apresMs)}${detail ? ` (${detail})` : ''}.`
    : `Durée totale ${dureeLisible(avantMs)} → ${dureeLisible(apresMs)}${detail ? ` (${detail})` : ''}.`;
  return { avantMs, apresMs, plans, phrase };
}

/* ─────────────────────────────── Conclure ────────────────────────────────── */

function conclure(avant: ContenuVersion, apres: ContenuVersion, libelle: string, signalements: string[] = []): ResultatOperationVideo {
  const final: ContenuVersion = { ...apres, timeline: timelineDesPlans(apres, apres.timeline) };
  // L8-C · un contenu hérité déjà au-delà des limites peut toujours descendre : la base est passée.
  const violations = validerContenuVersion(final, { base: avant });
  if (violations.length) return refus('CONTENU_INVALIDE', 'Le montage obtenu n’est pas valide · rien n’a été modifié.', violations);
  const changes = changementsVideo(avant, final, libelle);
  if (changes.length === 0) return refus('AUCUN_CHANGEMENT', 'Rien ne change · aucune version n’est créée.');
  return { ok: true, contenu: final, changes, libelle, durees: bilanDurees(avant, final), signalements };
}

const planDe = (c: ContenuVersion, shotId: unknown): PlanStudio | null =>
  typeof shotId === 'string' && Object.prototype.hasOwnProperty.call(c.shots.byId, shotId) ? c.shots.byId[shotId]! : null;

const INTROUVABLE = 'Ce plan n’existe plus dans la version courante · recharge le storyboard.';

/** Images ou animations DÉJÀ produites pour un plan (média relié ou sortie livrée). */
function mediasVisuels(c: ContenuVersion, sid: string, existantes: ReadonlySet<string>): boolean {
  const p = c.shots.byId[sid];
  return !!p && (!!p.keyframeAssetId || !!p.clipAssetId || existantes.has(`keyframe:${sid}`) || existantes.has(`clip:${sid}`));
}

/* ───────────────────────────── Opérations ────────────────────────────────── */

export interface OptionsOperationVideo {
  /** Sorties produites et encore valides (`keyframe:s1`, `clip:s1`…) · pour signaler le texte incrusté. */
  sortiesExistantes?: Iterable<string>;
}

export function appliquerOperationVideo(c: ContenuVersion, op: OperationVideo, o: OptionsOperationVideo = {}): ResultatOperationVideo {
  const existantes = new Set(o.sortiesExistantes ?? []);
  switch (op.type) {
    case 'scenario': {
      if (!Array.isArray(op.plans) || op.plans.length === 0 || op.plans.length > PLANS_MAX) return refus('VALEUR_INVALIDE', `Un scénario compte de 1 à ${PLANS_MAX} plans.`);
      const permis = referencesDuProjet(c);
      const byId: Record<string, PlanStudio> = {};
      const order: string[] = [];
      const v: ViolationStudio[] = [];
      for (const s of op.plans) {
        const id = estObjet(s) && typeof s.shotId === 'string' ? s.shotId : '';
        if (byId[id]) { v.push({ chemin: `/shots/byId/${id}`, raison: 'plan présent deux fois' }); continue; }
        const r = lirePlanSaisi(s, id, permis);
        if (!r.ok) { v.push(...r.violations); continue; }
        byId[id] = r.plan;
        order.push(id);
      }
      if (v.length) return refus('VALEUR_INVALIDE', 'Le scénario n’est pas enregistré · complète les champs signalés.', v);
      return conclure(c, { ...c, shots: { order, byId } }, `Scénario · ${order.length} plan${order.length > 1 ? 's' : ''}`);
    }
    case 'plan': {
      const p = planDe(c, op.shotId);
      if (!p) return refus('PLAN_INTROUVABLE', INTROUVABLE);
      if (!estObjet(op.champs)) return refus('VALEUR_INVALIDE', 'Champs du plan attendus.');
      const r = lirePlanSaisi({ ...p, ...op.champs }, p.shotId, referencesDuProjet(c));
      if (!r.ok) return refus('VALEUR_INVALIDE', 'Le plan n’est pas modifié · corrige les champs signalés.', r.violations);
      // Les médias déjà reliés au plan restent reliés · le graphe dit s'ils valent encore.
      const n: PlanStudio = { ...p, ...r.plan };
      const narrationChangee = n.narration !== p.narration;
      if (narrationChangee && 'actualDurationMs' in p) n.actualDurationMs = null;
      return conclure(c, { ...c, shots: { ...c.shots, byId: { ...c.shots.byId, [p.shotId]: n } } }, `Plan ${rangDuPlan(c, p.shotId)} modifié`);
    }
    case 'ordre': {
      const ordre = op.ordre;
      const ids = Object.keys(c.shots.byId);
      if (!Array.isArray(ordre) || ordre.length !== ids.length || new Set(ordre).size !== ordre.length || !ordre.every((s) => typeof s === 'string' && ids.includes(s))) {
        return refus('VALEUR_INVALIDE', 'Le nouvel ordre doit citer chaque plan une fois, et eux seuls.', [{ chemin: '/shots/order', raison: 'permutation des plans existants attendue' }]);
      }
      const rangs = ordre.map((s) => rangDuPlan(c, s)).join(', ');
      return conclure(c, { ...c, shots: { ...c.shots, order: [...ordre] } }, `Ordre des plans · ${rangs}`);
    }
    case 'narration': {
      const p = planDe(c, op.shotId);
      if (!p) return refus('PLAN_INTROUVABLE', INTROUVABLE);
      if (typeof op.narration !== 'string' || op.narration.length > 12_000) return refus('VALEUR_INVALIDE', 'Narration : texte de 12 000 caractères au plus.');
      const narration = op.narration.trim();
      if (p.speechMode === 'none' && narration) return refus('VALEUR_INVALIDE', 'Ce plan est sans voix · choisis la voix off avant d’écrire une narration.', [{ chemin: `/shots/byId/${p.shotId}/narration`, raison: 'plan sans voix' }]);
      // Durée recalculée : la parole estimée, jamais sous la durée minimale d'un plan.
      const parole = dureeNarrationMs(narration);
      const duree = narration ? Math.min(DUREE_PLAN_MAX_MS, Math.max(DUREE_PLAN_MIN_MS, parole)) : p.estimatedDurationMs;
      const n: PlanStudio = { ...p, narration, estimatedDurationMs: duree };
      // L'ancienne prise ne correspond plus au texte : sa durée réelle n'a plus cours.
      if ('actualDurationMs' in p) n.actualDurationMs = null;
      const r = conclure(c, { ...c, shots: { ...c.shots, byId: { ...c.shots.byId, [p.shotId]: n } } }, narration ? `Narration du plan ${rangDuPlan(c, p.shotId)}` : `Narration du plan ${rangDuPlan(c, p.shotId)} coupée`);
      if (r.ok && !narration) r.signalements.push(`Plan ${rangDuPlan(c, p.shotId)} : plus de narration à dire · durée du plan conservée (${dureeLisible(p.estimatedDurationMs)}).`);
      if (r.ok && narration && parole < DUREE_PLAN_MIN_MS) r.signalements.push(`Plan ${rangDuPlan(c, p.shotId)} : narration courte, durée portée au minimum d’un plan (${dureeLisible(DUREE_PLAN_MIN_MS)}).`);
      return r;
    }
    case 'sans_texte': {
      const byId: Record<string, PlanStudio> = {};
      for (const [sid, p] of Object.entries(c.shots.byId)) byId[sid] = p.onScreenText.length ? { ...p, onScreenText: [] } : p;
      const apres: ContenuVersion = { ...c, shots: { ...c.shots, byId }, timeline: { ...timelineDesPlans(c, c.timeline), subtitles: { enabled: false } } };
      // Le texte d'une image DÉJÀ produite n'est pas un calque : on le signale, on ne promet pas de l'effacer.
      const signalements = c.shots.order.filter((sid) => mediasVisuels(c, sid, existantes))
        .map((sid) => `Plan ${rangDuPlan(c, sid)} : l’image déjà produite peut contenir du texte incrusté · contrôle-la. Il ne sera pas retiré sans retouche ou nouvelle image.`);
      const r = conclure(c, apres, 'Vidéo sans texte · texte écran et sous-titres retirés');
      if (!r.ok) return r;
      return { ...r, signalements };
    }
    case 'musique': {
      const m = op.musique;
      if (m !== null) {
        if (!estObjet(m) || !estIdStable(m.assetId)) return refus('VALEUR_INVALIDE', 'Piste musicale : identifiant de média attendu.');
        if (typeof m.gainDb !== 'number' || !Number.isFinite(m.gainDb) || m.gainDb < GAIN_MUSIQUE_MIN_DB || m.gainDb > GAIN_MUSIQUE_MAX_DB) {
          return refus('VALEUR_INVALIDE', `Gain de la musique entre ${GAIN_MUSIQUE_MIN_DB} et +${GAIN_MUSIQUE_MAX_DB} dB.`);
        }
      }
      if (!c.timeline && c.shots.order.length === 0) return refus('VALEUR_INVALIDE', 'Aucun plan · la musique se règle sur un montage.');
      const musique = m === null ? null : { assetId: m.assetId, gainDb: Math.round(m.gainDb * 10) / 10 };
      const base = timelineDesPlans(c, c.timeline);
      return conclure(c, { ...c, timeline: { ...base, music: musique } }, musique ? `Musique · gain ${musique.gainDb.toString().replace('.', ',')} dB` : 'Musique retirée');
    }
    default:
      return refus('VALEUR_INVALIDE', 'Opération de montage inconnue.');
  }
}

/* ───────────────────────── Lecture d'une opération reçue ─────────────────── */

const CHAMPS_SAISIE = [...CHAMPS_TEXTE_PLAN, 'onScreenText', 'speechMode', 'estimatedDurationMs', 'referenceIds'] as const;

function champsSaisie(x: unknown): Partial<SaisiePlan> | null {
  if (!estObjet(x)) return null;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(x)) {
    if (!(CHAMPS_SAISIE as readonly string[]).includes(k)) return null;
    out[k] = x[k];
  }
  return out as Partial<SaisiePlan>;
}

/** Une opération venue du navigateur · forme seulement (le contenu est jugé par `appliquerOperationVideo`). */
export function lireOperationVideo(x: unknown): { ok: true; operation: OperationVideo } | { ok: false; message: string } {
  if (!estObjet(x) || typeof x.type !== 'string') return { ok: false, message: 'Opération de montage attendue.' };
  switch (x.type) {
    case 'scenario': {
      if (!Array.isArray(x.plans) || x.plans.length > PLANS_MAX) return { ok: false, message: `Un scénario compte de 1 à ${PLANS_MAX} plans.` };
      const plans: Array<{ shotId: string } & Partial<SaisiePlan>> = [];
      for (const p of x.plans) {
        if (!estObjet(p) || typeof p.shotId !== 'string') return { ok: false, message: 'Chaque plan porte son identifiant.' };
        const { shotId, ...reste } = p;
        const ch = champsSaisie(reste);
        if (!ch) return { ok: false, message: 'Champ de plan inconnu.' };
        plans.push({ shotId: shotId as string, ...ch });
      }
      return { ok: true, operation: { type: 'scenario', plans } };
    }
    case 'plan': {
      const ch = champsSaisie(x.champs);
      if (typeof x.shotId !== 'string' || !ch) return { ok: false, message: 'Plan et champs connus attendus.' };
      return { ok: true, operation: { type: 'plan', shotId: x.shotId, champs: ch } };
    }
    case 'ordre':
      return Array.isArray(x.ordre) && x.ordre.every((s) => typeof s === 'string') ? { ok: true, operation: { type: 'ordre', ordre: x.ordre as string[] } } : { ok: false, message: 'Ordre des plans attendu.' };
    case 'narration':
      return typeof x.shotId === 'string' && typeof x.narration === 'string' ? { ok: true, operation: { type: 'narration', shotId: x.shotId, narration: x.narration } } : { ok: false, message: 'Plan et narration attendus.' };
    case 'sans_texte':
      return { ok: true, operation: { type: 'sans_texte' } };
    case 'musique': {
      if (x.musique === null) return { ok: true, operation: { type: 'musique', musique: null } };
      const m = x.musique;
      return estObjet(m) && typeof m.assetId === 'string' && typeof m.gainDb === 'number'
        ? { ok: true, operation: { type: 'musique', musique: { assetId: m.assetId, gainDb: m.gainDb } } }
        : { ok: false, message: 'Piste musicale et gain attendus.' };
    }
    default:
      return { ok: false, message: 'Opération de montage inconnue.' };
  }
}

/** La vidéo est-elle en mode sans texte ? Aucun texte écran, sous-titres coupés. */
export function estSansTexte(c: Pick<ContenuVersion, 'shots' | 'timeline'>): boolean {
  return c.timeline?.subtitles.enabled === false && Object.values(c.shots.byId).every((p) => p.onScreenText.length === 0);
}
