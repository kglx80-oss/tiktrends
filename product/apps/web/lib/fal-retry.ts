import { reessaiPermis } from '@tiktrends/core';
import { errorFamily } from './user-error';

/**
 * Ce qu'on rejoue, et ce qu'on ne rejoue pas.
 *
 * ── Ce que ça coûtait ────────────────────────────────────────────────────────
 *
 * Chaque scène tentait deux fois, chaque tentative pouvant aller jusqu'à
 * quatre-vingt-dix secondes. Une série de douze pubs dont la demande est
 * fautive faisait donc attendre plus de dix minutes avant de rendre un message
 * qui n'expliquait rien.
 *
 * ── La distinction ───────────────────────────────────────────────────────────
 *
 * Un `4xx` porte sur la DEMANDE — modèle inconnu, paramètre refusé, référence
 * illisible. La seconde tentative envoie la même demande, donc reçoit la même
 * réponse. Les délais et les `5xx` portent sur le MOMENT · eux méritent leur
 * seconde chance.
 *
 * Vit ici et pas dans le `catch` de l'action · un fichier `'use server'` ne peut
 * exporter que des fonctions async, donc une règle qui y reste ne se teste pas.
 */
export function refusDefinitif(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? '');
  // Les bornes de mot évitent de prendre « 1080x1350 » pour un code d'erreur ·
  // nos propres messages sont pleins de dimensions.
  return /\b4\d\d\b/.test(m);
}

/**
 * Un délai dépassé ne se rejoue pas.
 *
 * ── Ce que la seconde tentative coûte vraiment ───────────────────────────────
 *
 * Quand notre échéance tombe, le fournisseur n'a pas arrêté de travailler · il
 * finit l'image et la facture. Rejouer en lance donc une SECONDE, qui sera
 * facturée aussi, pour une attente doublée et le même risque d'échec.
 *
 * On paierait deux images pour n'en afficher aucune.
 *
 * ── Ce qui reste rejouable ───────────────────────────────────────────────────
 *
 * Plus rien depuis R3 (voir `inutileDeReessayer`) : une `5xx` ou une coupure
 * réseau ne prouvent pas que rien n'a été produit ni facturé.
 */
export function delaiDepasse(e: unknown): boolean {
  const m = (e instanceof Error ? `${e.name} ${e.message}` : String(e ?? '')).toLowerCase();
  return /timeout|timedout|aborted|abort ?error|etimedout|deadline/.test(m);
}

/**
 * Les raisons de ne pas retenter · la demande est fautive, l'attente est déjà
 * payée, ou la première tentative a PU être facturée.
 *
 * ── R3 · aucun réessai payant implicite ──────────────────────────────────────
 *
 * Une 5xx, une coupure réseau, une erreur non classée : rien ne prouve que fal
 * n'a pas produit (et facturé) l'image avant que la réponse se perde. Le
 * rejouer soumettait une SECONDE génération, payée elle aussi. La règle vit
 * dans le noyau (`reessaiPermis`) : un réessai n'est permis que si l'échec est
 * un refus certain avant traitement (`rienNaEteFacture`) ou si la requête est
 * idempotente côté fournisseur · un appel synchrone `fal.run` ne l'est pas.
 */
export function inutileDeReessayer(e: unknown): boolean {
  return refusDefinitif(e) || delaiDepasse(e) || !reessaiPermis({ famille: errorFamily(e), idempotent: false });
}
