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
 *  · le coût d'une soumission d'image vient de la grille studio
 *    (`GRILLE_STUDIO`, dérivée de `FIXED_COSTS`) ; celui d'un clip, du
 *    catalogue vidéo (`tarifDuClip`, prix à la seconde × durée du modèle
 *    devisé) : aucun prix n'est écrit ici.
 *
 * L'égalité avec la barrière web n'est pas une promesse : un test du web
 * (`fa-plafond-commun.test.ts`) compare `spendCapUsd()` et `plafondDepenseUsd()`
 * sur une table de valeurs, et prouve en base que les dépenses web et worker se
 * cumulent contre UN seul plafond.
 */

import { sha256Hex } from '../version';
import { GRILLE_STUDIO, type ProfilOperation } from '../execution/tarifs';
import { rienNaEteFacture } from '../../spend-refund';
import { lireParametresClip, tarifDuClip } from './fal-video';

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

export type CoutSoumissionStudio =
  | { ok: true; usd: number; usdMicros: number; medias: number; poste: 'fal_image' | 'fal_video'; /** Modèle dont le prix est réservé (clip) · `null` pour les images. */ modele: string | null }
  | { ok: false; motif: string };

/**
 * Le coût PLAFOND d'une soumission studio, image OU animation · un job porte
 * des images (au tarif image chacune) ou UN clip, jamais un mélange. Le clip
 * se réserve à son tarif catalogue (`tarifDuClip` : prix à la seconde du
 * modèle devisé × durée, voix comprise), relevé au plancher de l'ancien
 * forfait (`FIXED_COSTS.fal_video`) tant qu'aucune facture fal de ce modèle
 * n'est rapprochée (`reserveClipUsdMicros`). Un modèle hors catalogue n'a pas
 * de tarif : rien n'est réservé ni envoyé. Sans paramètres lisibles, rien
 * n'est réservé. La voix (sans tarif) est refusée : on ne réserve pas un prix
 * qu'on ne sait pas dire.
 *
 * `clip.modele` · le modèle que le worker a préparé ; il ne décide que pour un
 * instantané `studio_clip/1` (sans modèle devisé).
 */
export function coutSoumissionStudio(
  operations: ReadonlyArray<{ operation: string; profil: ProfilOperation }>,
  clip?: { parametres: unknown; modele: string | null } | null,
): CoutSoumissionStudio {
  const payantes = operations.filter((o) => o.profil !== 'calcul');
  const clips = payantes.filter((o) => o.profil === 'animation');
  if (clips.length === 0) {
    const c = coutSoumissionImage(operations);
    return c.ok ? { ok: true, usd: c.usd, usdMicros: c.usdMicros, medias: c.images, poste: 'fal_image', modele: null } : c;
  }
  if (clips.length !== payantes.length) return { ok: false, motif: 'un job d’animation ne porte que des clips' };
  if (clips.length !== 1) return { ok: false, motif: 'un seul clip par job' };
  if (!clip) return { ok: false, motif: 'paramètres du clip absents · aucun tarif à réserver' };
  const lu = lireParametresClip(clip.parametres);
  if (!lu.ok) return { ok: false, motif: `paramètres du clip illisibles · ${lu.violations.join(' · ')}` };
  if (lu.parametres.operation !== clips[0]!.operation) return { ok: false, motif: 'les paramètres ne correspondent pas au clip du job' };
  const t = tarifDuClip(lu.parametres, clip.modele);
  if (!t.ok) return { ok: false, motif: t.motif };
  return { ok: true, usd: t.tarif.reserveUsdMicros / 1_000_000, usdMicros: t.tarif.reserveUsdMicros, medias: 1, poste: 'fal_video', modele: t.modele };
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

/* ── R2 · appel texte (Anthropic) · quand une réservation se libère ────────── */

/**
 * Statuts HTTP d'un REFUS CERTAIN du fournisseur texte, et leur famille
 * (`ErrorFamily` du site, classée par `spend-refund.ts`).
 *
 * La réservation d'un appel texte (son coût MAXIMAL) est prise avant l'envoi.
 * Elle ne se libère que si l'on SAIT que rien n'a été facturé. Le client
 * `@anthropic-ai/sdk` (0.27.3, `core.js` · `shouldRetry`) rejoue de lui-même
 * les statuts 408, 409, 429, ≥ 500 et les coupures réseau : un échec final sur
 * l'un d'eux peut suivre une tentative incertaine (coupure après envoi) ; il
 * n'est donc PAS certain, la réservation reste. Les statuts ci-dessous ne sont
 * jamais rejoués : la requête a été refusée à la porte, avant tout calcul, et
 * une tentative antérieure du même corps l'aurait été aussi.
 *  · 400, 422 · demande malformée · famille `requete` ;
 *  · 401, 403 · clé absente ou refusée · famille `acces`.
 * Une erreur sans statut (coupure, délai, abandon, erreur inconnue) garde la
 * réservation : le doute se paie.
 */
export const REFUS_CERTAINS_TEXTE: Readonly<Record<number, 'requete' | 'acces'>> = {
  400: 'requete', 422: 'requete', 401: 'acces', 403: 'acces',
};

/** La réservation d'un appel texte échoué peut-elle être rendue ? */
export function reservationTexteLiberable(statut: unknown): boolean {
  if (typeof statut !== 'number' || !Number.isInteger(statut)) return false;
  const famille = REFUS_CERTAINS_TEXTE[statut];
  return famille !== undefined && rienNaEteFacture(famille);
}
