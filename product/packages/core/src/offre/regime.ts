/**
 * L'offre · le régime tarifaire d'un espace, et le prix en crédits des appels
 * IA aujourd'hui gratuits (décision du 29/10, point 4). Pur.
 *
 * Deux régimes :
 *  · `actuel` · le barème d'aujourd'hui ; les appels texte des Studios, la
 *    conversation Jarvis, le contrôle visuel, le radar, le brouillon de concept
 *    et la relecture restent INCLUS (aucun débit) ;
 *  · `v2` · le barème recalibré (`BAREME_V2`) ; ces appels se débitent en
 *    crédits, au prix annoncé AVANT le clic.
 *
 * Le régime `v2` ne s'applique qu'à un espace sur un forfait V2 (Essentiel,
 * Pro, Agence) ET quand l'interrupteur serveur `TARIFS_V2` est posé. Un abonné
 * actuel garde le régime d'aujourd'hui jusqu'à son échéance (point 5) · aucun
 * droit acquis n'est retiré. Sans `TARIFS_V2`, tout espace est en `actuel` :
 * rien ne change de ce que le client paie (garde `offre-regime.test.ts`).
 */
import { CREDIT_COSTS, type CreditAction } from '../credits';
import { BAREME_V2, creditsPourCoutUsd, creditsPourCoutUsdMicros, type ActionBareme } from './bareme';
import { estForfaitV2 } from './forfaits';

export type RegimeTarifaire = 'actuel' | 'v2';

/** L'interrupteur serveur · `TARIFS_V2=1` (ou `true`). Absent = comportement d'aujourd'hui. */
export function tarifsV2Actifs(env: Record<string, string | undefined>): boolean {
  const v = (env.TARIFS_V2 ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'oui';
}

export function regimeTarifaire(plan: string | null | undefined, tarifsV2: boolean): RegimeTarifaire {
  return tarifsV2 && estForfaitV2(plan) ? 'v2' : 'actuel';
}

/**
 * Le prix en crédits d'une action à prix fixe, selon le régime · `null` =
 * incluse (aucun débit). En `actuel`, une action absente du barème
 * d'aujourd'hui (conversation Jarvis, brouillon de concept) reste incluse.
 */
export function coutActionRegime(action: ActionBareme, regime: RegimeTarifaire, unites = 1): number | null {
  const n = Math.max(1, Math.ceil(unites));
  if (regime === 'v2') return BAREME_V2[action] * n;
  const actuel = (CREDIT_COSTS as Partial<Record<string, number>>)[action];
  return actuel === undefined ? null : CREDIT_COSTS[action as CreditAction] * n;
}

/**
 * Le prix ANNONCÉ d'un appel à coût variable (textes des Studios, relecture,
 * contrôle visuel) · `null` en régime actuel (inclus), sinon les crédits de la
 * borne annoncée (dollars, calculés par le serveur avant le clic).
 */
export function creditsAppelAnnonce(regime: RegimeTarifaire, annonceUsd: number): number | null {
  return regime === 'v2' ? Math.max(1, creditsPourCoutUsd(annonceUsd)) : null;
}

/** Même chose depuis des micro-dollars entiers (le contrôle visuel). */
export function creditsAppelAnnonceMicros(regime: RegimeTarifaire, annonceUsdMicros: number): number | null {
  return regime === 'v2' ? Math.max(1, creditsPourCoutUsdMicros(annonceUsdMicros)) : null;
}

/**
 * Le débit FINAL d'un appel réservé au prix annoncé · le coût réel converti
 * au plus juste, jamais plus que l'annonce (le client ne paie jamais plus que
 * ce qu'il a lu avant le clic), jamais moins d'un crédit pour un appel parti.
 * Le reste de la réservation est rendu.
 */
export function debitApresAppel(annonce: number, coutReelUsd: number | null): number {
  const a = Math.max(0, Math.floor(annonce));
  if (a === 0) return 0;
  if (coutReelUsd === null || !Number.isFinite(coutReelUsd)) return a; // coût réel inconnu · l'annonce, rien de plus
  return Math.min(a, Math.max(1, creditsPourCoutUsd(coutReelUsd)));
}

/** L'annonce sous le champ de Jarvis, AVANT l'envoi · en crédits. */
export function annonceConversationJarvis(regime: RegimeTarifaire): string {
  const n = coutActionRegime('jarvis_message', regime);
  return n === null
    ? 'Conversation incluse · aucun crédit débité par message.'
    : `${n.toLocaleString('fr-FR')} crédits au plus par message · ajustés au coût réel, rendus si Jarvis ne répond pas.`;
}

/** Le prix du brouillon de concept Jarvis (Adsmap), dit sur le bouton AVANT le clic. */
export function annonceBrouillonJarvis(regime: RegimeTarifaire): string {
  const n = coutActionRegime('brouillon_concept', regime);
  return n === null ? 'inclus, aucun crédit débité' : `${n.toLocaleString('fr-FR')} crédits`;
}

/** Une créa décrite par le radar Adsmap · incluse aujourd'hui, `asset_analysis` en V2. */
export function creditsAnalyseRadar(regime: RegimeTarifaire): number | null {
  return regime === 'v2' ? BAREME_V2.asset_analysis : null;
}

/**
 * La mention d'un appel texte (Studios, relecture) AVANT le clic · le montant
 * affiché est une ESTIMATION (le texte réel n'est connu qu'à l'envoi) · la
 * borne exacte est réservée à l'envoi, le débit ajusté au coût réel.
 */
export function mentionAppelTexte(regime: RegimeTarifaire, estimationUsd: number): string {
  const n = creditsAppelAnnonce(regime, estimationUsd);
  if (n === null) return 'Appel IA · inclus · aucun crédit débité';
  return `Appel IA · environ ${n.toLocaleString('fr-FR')} crédit${n > 1 ? 's' : ''} (estimation) · ajustés au coût réel`;
}
