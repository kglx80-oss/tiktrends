/**
 * La grammaire VIDÉO qui gagne dans une catégorie · la fondation du loop vidéo.
 *
 * ── L'autre moitié du cap produit ────────────────────────────────────────────
 *
 * « Créer des créatives winneuses, STATIQUE ET VIDÉO. » Tout le poumon construit
 * jusqu'ici sert le statique (mise en page, charte). La veille décrit pourtant
 * déjà la grammaire vidéo des concurrents · accroche parlée, ouverture, personne
 * à l'écran. Elle n'était jamais AGRÉGÉE pour guider une création.
 *
 * Ce module fait pour la vidéo ce que `grammaireLayout` fait pour le statique ·
 * il distille, d'un lot de créas concurrentes, ce qui REVIENT chez les gagnantes.
 * C'est la FONDATION · le moteur de génération vidéo, lui, est un chantier à part
 * (il demande un modèle vidéo et de la dépense). Ici, zéro dépense, pur.
 *
 * ── Même discipline que le statique ──────────────────────────────────────────
 *
 * Un minimum d'effectif et une majorité franche par dimension · sous ça, le
 * silence. On réutilise les seuils de `grammaire-layout` · c'est la même règle,
 * elle n'a pas à diverger.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import type { HookType, OpeningType, Talent } from './asset-taxonomy';
import { HOOK_LABEL, OPENING_LABEL, TALENT_LABEL } from './asset-taxonomy';
import { MIN_MARCHE, SEUIL_DOMINANT, type LigneGrammaire } from './grammaire-layout';

/** Une observation vidéo · les dimensions que la veille décrit déjà, en colonnes. */
export interface ObservationVideo {
  hookType: HookType | null;
  openingType: OpeningType | null;
  talent: Talent | null;
}

export interface GrammaireVideo {
  hookType: HookType | null;
  openingType: OpeningType | null;
  talent: Talent | null;
  n: number;
}

/** La valeur dominante d'une dimension, ou `null` · même règle que le statique. */
function dominante<T extends string>(valeurs: readonly (T | null)[]): T | null {
  const vues = valeurs.filter((v): v is T => v !== null);
  if (vues.length < MIN_MARCHE) return null;
  const comptes = new Map<T, number>();
  for (const v of vues) comptes.set(v, (comptes.get(v) ?? 0) + 1);
  let meilleure: T | null = null;
  let max = 0;
  for (const [v, c] of comptes) if (c > max) { max = c; meilleure = v; }
  return meilleure !== null && max / vues.length > SEUIL_DOMINANT ? meilleure : null;
}

export function grammaireVideo(obs: readonly ObservationVideo[]): GrammaireVideo {
  return {
    hookType: dominante(obs.map((o) => o.hookType)),
    openingType: dominante(obs.map((o) => o.openingType)),
    talent: dominante(obs.map((o) => o.talent)),
    n: obs.length,
  };
}

/** La grammaire vidéo en clair · une ligne par dimension qui a tranché. */
export function resumeGrammaireVideo(g: GrammaireVideo): LigneGrammaire[] {
  const lignes: LigneGrammaire[] = [];
  if (g.hookType) lignes.push({ axe: 'Accroche', valeur: HOOK_LABEL[g.hookType] });
  if (g.openingType) lignes.push({ axe: 'Ouverture', valeur: OPENING_LABEL[g.openingType] });
  if (g.talent) lignes.push({ axe: 'À l’écran', valeur: TALENT_LABEL[g.talent] });
  return lignes;
}

/**
 * Le brief vidéo distillé · l'ossature que le futur moteur de génération vidéo
 * suivra. En anglais, comme les autres consignes de génération. Vide tant que
 * rien ne domine.
 */
export function briefVideo(g: GrammaireVideo): string[] {
  const parts = [
    g.openingType ? `open on a ${OPENING_LABEL[g.openingType].toLowerCase()}` : '',
    g.hookType ? `lead with a ${HOOK_LABEL[g.hookType].toLowerCase()} hook` : '',
    g.talent ? `feature ${TALENT_LABEL[g.talent].toLowerCase()}` : '',
  ].filter(Boolean);
  if (!parts.length) return [];
  return [`In this product category, the videos that keep running tend to ${parts.join('; ')}. Lean that way unless the product demands otherwise.`];
}
