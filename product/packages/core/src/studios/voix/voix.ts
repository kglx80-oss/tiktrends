/**
 * Studios · L6-B · voix : capacité honnête, modes de parole, texte prononcé
 * exact, temps recalculés (cahier 01 §4.5 ; recettes VIDEO-06, VIDEO-07).
 *
 * Pur.
 *
 * ── Ce qui est disponible, et pourquoi ────────────────────────────────────────
 *
 * Une capacité n'est disponible que si DEUX choses existent : un tarif dans
 * l'offre (`GRILLE_STUDIO.speech`, dérivé de `CREDIT_COSTS` : aucun débit de
 * voix n'existe) ET un fournisseur branché dans le dépôt (aucun adaptateur de
 * synthèse vocale ni de parole synchronisée : `FOURNISSEURS_VOIX` est vide).
 * Aujourd'hui, donc : la synthèse vocale est INDISPONIBLE, la parole
 * synchronisée (lipsync) est INDISPONIBLE et n'est jamais simulée. La voix off
 * reste un mode proposé : la voix est posée sur les images, sans mouvement des
 * lèvres ; sa prise vient d'un fichier existant (mesuré ici), jamais d'une
 * génération inventée.
 *
 * ── Texte prononcé ───────────────────────────────────────────────────────────
 *
 * La voix ne prononce que la narration VALIDÉE (le champ `narration` du plan
 * dans la version courante, relu par le serveur). La sortie de `voice.prepare`
 * passe une seconde garde (`garderTexteVoix`), en plus du contrôle du
 * registre : texte prononcé STRICTEMENT égal à la narration (aucun préambule,
 * aucune reformulation, aucune annonce), direction vocale hors du texte,
 * prononciations portant sur des mots du texte, voix et langue inchangées.
 */

import { GRILLE_STUDIO, type TarifProfil } from '../execution/tarifs';
import type { ContenuVersion, ModeParole } from '../document';
import type { ChangementPatch } from '../patch';

/** Fournisseurs branchés dans le dépôt, par capacité · vide = aucun adaptateur (F-A ne route que l'image). */
export const FOURNISSEURS_VOIX: Readonly<{ synthese: readonly string[]; lipsync: readonly string[] }> = { synthese: [], lipsync: [] };

export interface CapacitesVoix {
  synthese: { disponible: boolean; raison: string };
  lipsync: { disponible: boolean; raison: string };
}

/** Disponibilité dérivée du tarif ET du fournisseur · jamais l'un sans l'autre. */
export function capacitesVoix(e: { tarif?: TarifProfil; fournisseurs?: { synthese: readonly string[]; lipsync: readonly string[] } } = {}): CapacitesVoix {
  const tarif = e.tarif ?? GRILLE_STUDIO.speech;
  const f = e.fournisseurs ?? FOURNISSEURS_VOIX;
  const tarife = tarif.credits !== null && tarif.usdMicros !== null;
  const synthese = !tarife
    ? { disponible: false, raison: 'La synthèse vocale n’est pas disponible · aucun tarif de voix n’existe dans l’offre et aucun fournisseur de voix n’est branché.' }
    : f.synthese.length === 0
      ? { disponible: false, raison: 'La synthèse vocale n’est pas disponible · aucun fournisseur de voix n’est branché.' }
      : { disponible: true, raison: '' };
  const lipsync = !synthese.disponible
    ? { disponible: false, raison: 'La parole synchronisée (lipsync) n’est pas disponible · elle demande une voix produite et un fournisseur de synchronisation labiale, et aucun n’est branché. Elle n’est jamais simulée.' }
    : f.lipsync.length === 0
      ? { disponible: false, raison: 'La parole synchronisée (lipsync) n’est pas disponible · aucun fournisseur de synchronisation labiale n’est branché. Elle n’est jamais simulée.' }
      : { disponible: true, raison: '' };
  return { synthese, lipsync };
}

export interface ModeParoleOffert {
  mode: ModeParole;
  libelle: string;
  description: string;
  disponible: boolean;
  raison: string;
}

/**
 * Les trois modes, dans l'ordre de l'écran. La voix off est toujours proposée
 * (elle n'exige pas de synchronisation) ; le lipsync n'est choisissable que si
 * la capacité existe.
 */
export function modesParole(c: CapacitesVoix): ModeParoleOffert[] {
  return [
    {
      mode: 'voiceover', libelle: 'Voix off', disponible: true,
      description: 'La voix est posée sur les images, sans mouvement des lèvres. Les images et les clips restent réutilisables si la narration change.',
      raison: c.synthese.disponible ? '' : 'La prise vient d’un fichier audio existant · la synthèse vocale n’est pas branchée.',
    },
    {
      mode: 'lipsync', libelle: 'Parole synchronisée (lipsync)', disponible: c.lipsync.disponible,
      description: 'Le personnage prononce le texte à l’image. Chaque changement de narration refait le clip.',
      raison: c.lipsync.raison,
    },
    { mode: 'none', libelle: 'Sans voix', disponible: true, description: 'Aucune voix · la narration n’est pas prononcée.', raison: '' },
  ];
}

/** Refus d'un mode · `null` si le mode peut être choisi. */
export function refusMode(mode: unknown, c: CapacitesVoix): string | null {
  if (mode !== 'voiceover' && mode !== 'lipsync' && mode !== 'none') return 'mode de parole voix off, lipsync ou sans voix attendu';
  if (mode === 'lipsync' && !c.lipsync.disponible) return c.lipsync.raison;
  return null;
}

const echapper = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
export const cheminModeParole = (shotId: string) => `/shots/byId/${echapper(shotId)}/speechMode`;

/** Changements pour poser un mode sur des plans · seuls les plans qui changent. */
export function changementsModeParole(c: ContenuVersion, shotIds: readonly string[], mode: ModeParole): { ok: true; changes: ChangementPatch[]; allowedPaths: string[] } | { ok: false; raison: string } {
  const inconnus = shotIds.filter((s) => !c.shots.byId[s]);
  if (inconnus.length) return { ok: false, raison: `plan inconnu dans cette version · ${inconnus.join(', ')}` };
  const changes: ChangementPatch[] = shotIds
    .filter((s) => c.shots.byId[s]!.speechMode !== mode)
    .map((s) => ({ op: 'replace', path: cheminModeParole(s), newValue: mode, reason: `Mode de parole du plan ${s} : ${mode}` }));
  return { ok: true, changes, allowedPaths: changes.map((x) => x.path) };
}

/** Plans qui demandent une parole synchronisée alors qu'elle n'existe pas · à basculer explicitement. */
export function plansLipsyncIndisponible(c: ContenuVersion, cap: CapacitesVoix): string[] {
  if (cap.lipsync.disponible) return [];
  return c.shots.order.filter((s) => c.shots.byId[s]?.speechMode === 'lipsync');
}

/* ─────────────────────────── Narration validée ─────────────────────────── */

export type ResultatNarration = { ok: true; texte: string; mode: ModeParole } | { ok: false; raison: string };

/** La SEULE source du texte prononcé · le plan de la version courante, relu par le serveur. */
export function narrationValidee(c: ContenuVersion, shotId: string): ResultatNarration {
  const p = c.shots.byId[shotId];
  if (!p) return { ok: false, raison: 'plan inconnu dans cette version' };
  if (p.speechMode === 'none') return { ok: false, raison: 'ce plan est « sans voix » · aucune narration n’est prononcée' };
  if (p.narration.trim().length === 0) return { ok: false, raison: 'ce plan n’a pas de narration' };
  return { ok: true, texte: p.narration, mode: p.speechMode };
}

/** Sortie `voice_prepare_output.result` (forme validée par le registre). */
export interface SortieVoix {
  spokenText: string;
  voiceId: string;
  language: string;
  deliveryNotes: string;
  pronunciations: Array<{ text: string; pronunciation: string }>;
}

export type CodeGardeVoix = 'PREAMBULE' | 'AJOUT_FINAL' | 'REECRITURE' | 'DIRECTION_DANS_TEXTE' | 'PRONONCIATION_HORS_TEXTE' | 'VOIX_REMPLACEE' | 'LANGUE_ALTEREE';
export interface ViolationVoix { code: CodeGardeVoix; message: string }

const resume = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);

/**
 * Seconde garde sur la sortie de `voice.prepare` · le texte prononcé est
 * STRICTEMENT la narration validée. Le défaut est NOMMÉ (préambule, ajout
 * final, réécriture) pour que l'écran dise ce qui a été refusé.
 */
export function garderTexteVoix(e: { narration: string; voiceId: string; language: string; sortie: SortieVoix }): ViolationVoix[] {
  const v: ViolationVoix[] = [];
  const s = e.sortie;
  if (s.spokenText !== e.narration) {
    const i = s.spokenText.indexOf(e.narration);
    if (i > 0) v.push({ code: 'PREAMBULE', message: `Préambule ajouté avant la narration : « ${resume(s.spokenText.slice(0, i).trim())} » · refusé, seule la narration validée est prononcée.` });
    else if (i === 0) v.push({ code: 'AJOUT_FINAL', message: `Texte ajouté après la narration : « ${resume(s.spokenText.slice(e.narration.length).trim())} » · refusé.` });
    else v.push({ code: 'REECRITURE', message: 'Le texte prononcé n’est pas la narration validée (reformulée ou tronquée) · refusé, aucune réécriture n’est acceptée.' });
  }
  const notes = s.deliveryNotes.trim();
  if (notes.length >= 6 && s.spokenText.includes(notes)) v.push({ code: 'DIRECTION_DANS_TEXTE', message: 'La direction vocale est mêlée au texte prononcé · elle reste séparée.' });
  for (const p of s.pronunciations) {
    if (!p.text || !s.spokenText.includes(p.text)) v.push({ code: 'PRONONCIATION_HORS_TEXTE', message: `Prononciation pour « ${resume(p.text)} », absent du texte prononcé.` });
  }
  if (s.voiceId !== e.voiceId) v.push({ code: 'VOIX_REMPLACEE', message: 'La voix choisie a été remplacée · refusé.' });
  if (s.language !== e.language) v.push({ code: 'LANGUE_ALTEREE', message: 'La langue a été changée · refusé.' });
  return v;
}

/* ─────────────────────────────── Temps ──────────────────────────────────── */

export interface TempsPlan {
  shotId: string;
  estimeMs: number;
  /** Durée mesurée de la prise (en-tête du fichier) · `null` sans prise lisible. */
  mesureMs: number | null;
  /** Durée retenue pour le montage · la prise ne se coupe pas : max(estimée, mesurée). */
  retenuMs: number;
  depassementMs: number;
}

export interface TempsVoix {
  plans: TempsPlan[];
  cibleMs: number;
  totalMs: number;
  depassementMs: number;
  message: string;
}

const secondes = (msx: number) => `${(msx / 1000).toFixed(2).replace('.', ',')} s`;

/**
 * Temps recalculés à partir des durées MESURÉES · la cible est la somme des
 * durées estimées du storyboard. Une prise plus longue que son plan allonge le
 * plan (on ne coupe pas une phrase) et le dépassement est dit.
 */
export function recalculerTemps(c: ContenuVersion, mesures: Readonly<Record<string, number | null>>): TempsVoix {
  const plans: TempsPlan[] = c.shots.order.filter((s) => c.shots.byId[s]).map((s) => {
    const p = c.shots.byId[s]!;
    const mesure = mesures[s] ?? null;
    const retenu = mesure === null ? p.estimatedDurationMs : Math.max(p.estimatedDurationMs, mesure);
    return { shotId: s, estimeMs: p.estimatedDurationMs, mesureMs: mesure, retenuMs: retenu, depassementMs: retenu - p.estimatedDurationMs };
  });
  const cibleMs = plans.reduce((a, p) => a + p.estimeMs, 0);
  const totalMs = plans.reduce((a, p) => a + p.retenuMs, 0);
  const depassementMs = totalMs - cibleMs;
  const message = depassementMs > 0
    ? `Durée recalculée ${secondes(totalMs)} pour une cible de ${secondes(cibleMs)} · dépassement de ${secondes(depassementMs)}.`
    : `Durée recalculée ${secondes(totalMs)} · dans la cible de ${secondes(cibleMs)}.`;
  return { plans, cibleMs, totalMs, depassementMs, message };
}

export { secondes as formatSecondes };
