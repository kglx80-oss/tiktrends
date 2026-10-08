/**
 * Studios · L6-A · le scénario d'une vidéo en PLANS (cahier 01 §4.5 ; VIDEO-01).
 *
 * Pur. Un plan garde chaque dimension dans SON champ (`$defs.Shot` de
 * 03-CONTRATS) : fonction narrative, sujet, action, cadrage, caméra, lumière,
 * décor, références, narration (ce qui est DIT), texte écran (ce qui est LU),
 * mode de parole et durée. Rien n'est fusionné : changer la narration ne
 * touche pas l'image clé, retirer le texte écran ne touche pas la voix.
 *
 * Deux chemins mènent aux plans, avec la MÊME validation :
 *  · `plansDepuisStoryboard` · la sortie VALIDÉE de la tâche `storyboard.plan`
 *    (registre, release, barrière de dépense), identifiants pris dans ceux que
 *    le serveur a alloués ;
 *  · `lirePlanSaisi` · la saisie manuelle de l'écran (chemin sans modèle).
 *
 * ── Durées ───────────────────────────────────────────────────────────────────
 *
 * Tant que la voix réelle n'existe pas, la durée d'un plan parlé est une
 * ESTIMATION à partir du nombre de mots (`MOTS_PAR_SECONDE_NARRATION`) ; elle
 * est dite « estimée » à l'écran. La durée RÉELLE (`actualDurationMs`) vient
 * de la prise de voix mesurée et prime dès qu'elle existe. Ce débit n'a pas pu
 * être mesuré ici (aucune voix produite, 0 $) : c'est un débit de lecture
 * publicitaire courant en français, environ 150 mots par minute. La mesure
 * réelle le remplacera plan par plan.
 */

import { estIdStable, type ModeParole, type PlanStudio, type ViolationStudio } from '../document';

/** ≈ 150 mots par minute · estimation, remplacée par la durée réelle de la prise. */
export const MOTS_PAR_SECONDE_NARRATION = 2.5;
/** Bornes d'un plan publicitaire · un plan sous une seconde ne se lit pas, au-delà d'une minute ce n'est plus un plan. */
export const DUREE_PLAN_MIN_MS = 1000;
export const DUREE_PLAN_MAX_MS = 60_000;
/** Bornes du contrat `storyboard_plan_input` (03-CONTRATS) · reprises, pas inventées. */
export const PLANS_MAX = 20;
export const DUREE_CIBLE_MIN_MS = 1000;
export const DUREE_CIBLE_MAX_MS = 180_000;
const TEXTE_MAX = 12_000;
const TEXTES_ECRAN_MAX = 100;

export const MODES_PAROLE: readonly ModeParole[] = ['none', 'voiceover', 'lipsync'];
export const LIBELLES_MODE_PAROLE: Readonly<Record<ModeParole, string>> = {
  none: 'Sans voix',
  voiceover: 'Voix off',
  lipsync: 'Parole synchronisée',
};

/** Les champs qu'un plan expose à l'édition, chacun le sien. */
export const CHAMPS_TEXTE_PLAN = ['purpose', 'subject', 'action', 'framing', 'camera', 'lighting', 'environment', 'narration'] as const;
export type ChampTextePlan = typeof CHAMPS_TEXTE_PLAN[number];
export const LIBELLES_CHAMP_PLAN: Readonly<Record<ChampTextePlan | 'onScreenText' | 'estimatedDurationMs' | 'speechMode', string>> = {
  purpose: 'Fonction narrative',
  subject: 'Sujet',
  action: 'Action',
  framing: 'Cadrage',
  camera: 'Caméra',
  lighting: 'Lumière',
  environment: 'Décor',
  narration: 'Narration (dite)',
  onScreenText: 'Texte écran (lu)',
  estimatedDurationMs: 'Durée',
  speechMode: 'Parole',
};
/** Sans eux, l'image clé du plan n'a rien à montrer. */
export const CHAMPS_PLAN_OBLIGATOIRES: readonly ChampTextePlan[] = ['subject', 'action', 'camera'];

/** Nombre de mots · un mot porte au moins une lettre ou un chiffre. */
export function compterMots(texte: string): number {
  return texte.split(/\s+/u).filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
}

/** Durée estimée d'une narration, arrondie au dixième de seconde supérieur · 0 sans narration. */
export function dureeNarrationMs(texte: string): number {
  const mots = compterMots(texte);
  if (mots === 0) return 0;
  return Math.ceil((mots / MOTS_PAR_SECONDE_NARRATION) * 10) * 100;
}

/** « 3,2 s » · jamais de flottant affiché brut. */
export function dureeLisible(ms: number): string {
  return `${(Math.round(ms / 100) / 10).toFixed(1).replace('.', ',')} s`;
}

/** La durée qui compte au montage · la réelle si la prise existe, l'estimée sinon. */
export function dureePlanMs(p: Pick<PlanStudio, 'estimatedDurationMs' | 'actualDurationMs'>): number {
  return typeof p.actualDurationMs === 'number' ? p.actualDurationMs : p.estimatedDurationMs;
}

/* ───────────────────────────── Saisie d'un plan ──────────────────────────── */

export interface SaisiePlan {
  purpose: string;
  subject: string;
  action: string;
  framing: string;
  camera: string;
  lighting: string;
  environment: string;
  narration: string;
  onScreenText: string[];
  speechMode: ModeParole;
  estimatedDurationMs: number;
  referenceIds: string[];
}

export type LecturePlan = { ok: true; plan: PlanStudio } | { ok: false; violations: ViolationStudio[] };

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const nettoyer = (x: unknown): string | null => (typeof x === 'string' ? x.trim() : null);

/**
 * Un plan à partir d'une saisie (écran) ou d'un plan rendu par le modèle ·
 * même règle des deux côtés. `referencesPermises` : les seuls identifiants
 * qu'un plan peut citer (fiches d'identité et produit du projet).
 */
export function lirePlanSaisi(x: unknown, shotId: string, referencesPermises: ReadonlySet<string>, chemin = `/shots/byId/${shotId}`): LecturePlan {
  const v: ViolationStudio[] = [];
  if (!estIdStable(shotId)) return { ok: false, violations: [{ chemin, raison: 'identifiant de plan instable ou interdit' }] };
  if (!estObjet(x)) return { ok: false, violations: [{ chemin, raison: 'plan attendu' }] };
  const textes: Partial<Record<ChampTextePlan, string>> = {};
  for (const k of CHAMPS_TEXTE_PLAN) {
    const t = nettoyer(x[k] ?? '');
    if (t === null || t.length > TEXTE_MAX) { v.push({ chemin: `${chemin}/${k}`, raison: `texte attendu (${TEXTE_MAX} caractères au plus)` }); continue; }
    textes[k] = t;
  }
  for (const k of CHAMPS_PLAN_OBLIGATOIRES) {
    if (textes[k] === '') v.push({ chemin: `${chemin}/${k}`, raison: `${LIBELLES_CHAMP_PLAN[k]} à renseigner · l’image clé du plan en dépend` });
  }
  let onScreenText: string[] = [];
  const ecran = x.onScreenText ?? [];
  if (!Array.isArray(ecran) || ecran.length > TEXTES_ECRAN_MAX || !ecran.every((t) => typeof t === 'string' && t.length <= TEXTE_MAX)) {
    v.push({ chemin: `${chemin}/onScreenText`, raison: 'liste de textes attendue' });
  } else onScreenText = ecran.map((t: string) => t.trim()).filter((t) => t.length > 0);
  const speechMode = x.speechMode ?? 'none';
  if (!MODES_PAROLE.includes(speechMode as ModeParole)) v.push({ chemin: `${chemin}/speechMode`, raison: 'mode de parole none, voiceover ou lipsync' });
  const duree = x.estimatedDurationMs;
  if (typeof duree !== 'number' || !Number.isInteger(duree) || duree < DUREE_PLAN_MIN_MS || duree > DUREE_PLAN_MAX_MS) {
    v.push({ chemin: `${chemin}/estimatedDurationMs`, raison: `durée entière entre ${DUREE_PLAN_MIN_MS} et ${DUREE_PLAN_MAX_MS} ms` });
  }
  if (speechMode === 'none' && (textes.narration ?? '') !== '') {
    v.push({ chemin: `${chemin}/narration`, raison: 'plan sans voix · cette narration ne serait jamais dite (choisis voix off ou retire-la)' });
  }
  const refs = x.referenceIds ?? [];
  let referenceIds: string[] = [];
  if (!Array.isArray(refs) || refs.length > 100 || !refs.every((r) => typeof r === 'string')) v.push({ chemin: `${chemin}/referenceIds`, raison: 'liste d’identifiants attendue' });
  else {
    referenceIds = [...new Set(refs as string[])];
    const inconnues = referenceIds.filter((r) => !estIdStable(r) || !referencesPermises.has(r));
    if (inconnues.length) v.push({ chemin: `${chemin}/referenceIds`, raison: `référence inconnue du projet · ${inconnues.join(', ')}` });
  }
  if (v.length) return { ok: false, violations: v };
  return {
    ok: true,
    plan: {
      shotId, purpose: textes.purpose!, subject: textes.subject!, action: textes.action!, framing: textes.framing!, camera: textes.camera!,
      lighting: textes.lighting!, environment: textes.environment!, referenceIds, narration: textes.narration!, onScreenText,
      speechMode: speechMode as ModeParole, estimatedDurationMs: duree as number,
    },
  };
}

/** Identifiants de nouveaux plans · jamais un identifiant déjà porté par le projet (aucune confusion de médias). */
export function idsPlansAlloues(existants: Iterable<string>, n: number): string[] {
  const pris = new Set(existants);
  const out: string[] = [];
  for (let i = 1; out.length < Math.max(0, Math.min(n, PLANS_MAX)); i++) {
    const id = `s${i}`;
    if (!pris.has(id)) out.push(id);
  }
  return out;
}

/** Arc narratif par défaut d'un formulaire vierge · une proposition, éditable. */
export function fonctionParDefaut(rang: number, total: number): string {
  if (rang === 0) return 'Accroche';
  if (rang === total - 1) return 'Appel à l’action';
  return total > 3 && rang === 1 ? 'Problème' : 'Preuve';
}

/** Valeurs d'un formulaire de plan vierge (chemin manuel) · rien n'est enregistré tant que les champs obligatoires sont vides. */
export function saisieVierge(rang: number, total: number, dureeCibleMs: number, speechMode: ModeParole): SaisiePlan {
  const duree = Math.min(DUREE_PLAN_MAX_MS, Math.max(DUREE_PLAN_MIN_MS, Math.round(dureeCibleMs / Math.max(1, total) / 100) * 100));
  return {
    purpose: fonctionParDefaut(rang, total), subject: '', action: '', framing: '', camera: '', lighting: '', environment: '',
    narration: '', onScreenText: [], speechMode, estimatedDurationMs: duree, referenceIds: [],
  };
}

/* ───────────────────────────── Storyboard (modèle) ───────────────────────── */

export type ResultatStoryboard =
  | { ok: true; plans: PlanStudio[]; totalMs: number; avertissements: string[] }
  | { ok: false; cause: 'questions'; questions: string[] }
  | { ok: false; cause: 'invalide'; violations: ViolationStudio[] };

/**
 * Les plans d'une sortie `storyboard.plan` déjà validée par le registre
 * (schéma + contrôles sémantiques). On revérifie ici ce que le projet exige :
 * identifiants ALLOUÉS par le serveur, références du projet, champs
 * obligatoires, mode sans texte, durée totale cohérente.
 */
export function plansDepuisStoryboard(sortie: unknown, o: { idsAlloues: readonly string[]; referencesPermises: ReadonlySet<string>; sansTexte: boolean }): ResultatStoryboard {
  if (!estObjet(sortie)) return { ok: false, cause: 'invalide', violations: [{ chemin: '/result', raison: 'sortie attendue' }] };
  if (sortie.status !== 'ready' || !estObjet(sortie.result)) {
    const q = Array.isArray(sortie.questions) ? sortie.questions.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
    return { ok: false, cause: 'questions', questions: q };
  }
  const r = sortie.result;
  const shots = Array.isArray(r.shots) ? r.shots : [];
  const v: ViolationStudio[] = [];
  if (shots.length === 0) v.push({ chemin: '/result/shots', raison: 'aucun plan rendu' });
  if (shots.length > o.idsAlloues.length) v.push({ chemin: '/result/shots', raison: `${shots.length} plans pour ${o.idsAlloues.length} demandés` });
  const vus = new Set<string>();
  const plans: PlanStudio[] = [];
  shots.forEach((s: unknown, i: number) => {
    const id = estObjet(s) && typeof s.shotId === 'string' ? s.shotId : '';
    const ch = `/result/shots/${i}`;
    if (!o.idsAlloues.includes(id)) { v.push({ chemin: `${ch}/shotId`, raison: `identifiant « ${id} » non alloué par le serveur` }); return; }
    if (vus.has(id)) { v.push({ chemin: `${ch}/shotId`, raison: 'plan rendu deux fois' }); return; }
    vus.add(id);
    const p = lirePlanSaisi(s, id, o.referencesPermises, ch);
    if (!p.ok) { v.push(...p.violations); return; }
    if (o.sansTexte && p.plan.onScreenText.length) v.push({ chemin: `${ch}/onScreenText`, raison: 'mode sans texte · aucun texte écran' });
    plans.push(p.plan);
  });
  const total = plans.reduce((t, p) => t + p.estimatedDurationMs, 0);
  if (typeof r.estimatedTotalMs === 'number' && v.length === 0 && r.estimatedTotalMs !== total) v.push({ chemin: '/result/estimatedTotalMs', raison: `total ${r.estimatedTotalMs} ms ≠ somme des plans ${total} ms` });
  if (v.length) return { ok: false, cause: 'invalide', violations: v };
  const avertissements: string[] = [];
  if (typeof r.durationCaveat === 'string' && r.durationCaveat.trim()) avertissements.push(r.durationCaveat.trim().slice(0, 500));
  for (const p of plans) {
    const parole = dureeNarrationMs(p.narration);
    if (parole > p.estimatedDurationMs) avertissements.push(`Plan ${p.shotId} : la narration demande environ ${dureeLisible(parole)} pour ${dureeLisible(p.estimatedDurationMs)} prévues.`);
  }
  return { ok: true, plans, totalMs: total, avertissements };
}
