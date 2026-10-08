/**
 * Studios · F-A · la règle du plafond de dépense, telle que le WORKER l'applique.
 *
 * Pur. Le worker ne peut pas importer `apps/web/lib/spend-guard.ts` (fichier
 * `server-only`, client Anthropic, base du processus web). Il applique donc la
 * MÊME règle sur la MÊME table (`ai_spend`), avec le MÊME plafond
 * (`AI_SPEND_CAP_USD`) et la MÊME fenêtre (30 jours glissants) :
 *
 *  · la décision est `checkBudget` du noyau, celle que la barrière web appelle ;
 *  · le plafond se lit comme `spendCapUsd()` du web : absent ou vide ⇒ 50 $,
 *    illisible ou négatif ⇒ 50 $ (jamais l'infini), sinon la valeur ;
 *  · le coût d'une soumission vient de la grille studio (`GRILLE_STUDIO`),
 *    elle-même dérivée de `FIXED_COSTS` : aucun prix n'est écrit ici.
 *
 * L'égalité avec la barrière web n'est pas une promesse : un test du web
 * (`fa-plafond-commun.test.ts`) compare `spendCapUsd()` et `plafondDepenseUsd()`
 * sur une table de valeurs, et prouve en base que les dépenses web et worker se
 * cumulent contre UN seul plafond.
 */

import { sha256Hex } from '../version';
import { GRILLE_STUDIO, type ProfilOperation } from '../execution/tarifs';

/** Défaut en dur de `apps/web/lib/spend-guard.ts` (`DEFAULT_CAP_USD`) · même valeur, comparée par test. */
export const PLAFOND_DEFAUT_USD = 50;
/** Fenêtre glissante de `spend-guard.ts` (`WINDOW_DAYS`). */
export const FENETRE_PLAFOND_JOURS = 30;

/** `AI_SPEND_CAP_USD` lu exactement comme `spendCapUsd()` de la barrière web. */
export function plafondDepenseUsd(brut: string | undefined | null): number {
  if (brut === undefined || brut === null || brut === '') return PLAFOND_DEFAUT_USD;
  const n = Number(brut);
  return Number.isFinite(n) && n >= 0 ? n : PLAFOND_DEFAUT_USD;
}

/** Début de la fenêtre du plafond à l'instant `maintenant`. */
export function debutFenetrePlafond(maintenant: Date): Date {
  return new Date(maintenant.getTime() - FENETRE_PLAFOND_JOURS * 86_400_000);
}

export type CoutSoumission =
  | { ok: true; usd: number; usdMicros: number; images: number }
  | { ok: false; motif: string };

/**
 * Le coût PLAFOND d'une soumission d'image, en dollars, depuis la grille
 * studio. Seules les opérations `image_generation` partent chez le fournisseur
 * image ; les nœuds `calcul` sont inclus (0 $) et ne partent pas. Un profil
 * sans tarif (voix) ou hors du fournisseur image (animation) est refusé : on
 * ne réserve pas un prix qu'on ne sait pas dire.
 */
export function coutSoumissionImage(operations: ReadonlyArray<{ operation: string; profil: ProfilOperation }>): CoutSoumission {
  let micros = 0;
  let images = 0;
  for (const o of operations) {
    if (o.profil === 'calcul') continue;
    if (o.profil !== 'image_generation') return { ok: false, motif: `opération ${o.operation} (${o.profil}) hors du fournisseur image` };
    const t = GRILLE_STUDIO.image_generation.usdMicros;
    if (t === null) return { ok: false, motif: 'aucun tarif image dans la grille' };
    micros += t;
    images += 1;
  }
  if (images === 0) return { ok: false, motif: 'aucune image à générer dans ce job' };
  return { ok: true, usd: micros / 1_000_000, usdMicros: micros, images };
}

/**
 * Identifiant de la ligne `ai_spend` d'un job studio · DÉRIVÉ du job (UUID de
 * forme v8, SHA-256 de `ai_spend:studio-job:<id>`). Trois effets, sans colonne
 * nouvelle :
 *  · une seconde réservation pour le même job retombe sur la même ligne
 *    (clé primaire) : jamais deux dépenses comptées pour un job ;
 *  · l'annulation d'une dépense non facturée retrouve sa ligne sans mémoire ;
 *  · la ligne est reliée au job pour l'enquête, sans changer le libellé
 *    `action` (les « postes de dépense » restent groupés).
 */
export function idDepenseDuJob(jobId: string): string {
  const h = sha256Hex(`ai_spend:studio-job:${jobId}`);
  const variante = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Le job d'une clé fournisseur `tt-studio-<uuid>` (`cleFournisseurDuJob`) · `null` sinon. */
export function jobDeCleFournisseur(cle: string): string | null {
  const m = /^tt-studio-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(cle);
  return m ? m[1]!.toLowerCase() : null;
}
