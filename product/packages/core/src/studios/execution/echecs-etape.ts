/**
 * Studios · L3 · un job fautif ne bloque plus la file (I1), et les adresses
 * remises au fournisseur tiennent le temps de sa file (I5).
 *
 * Pur · ni base, ni réseau, ni horloge (l'heure est passée par l'appelant).
 *
 * ── I1 · une exception sur UN job ────────────────────────────────────────────
 *
 * Avant, une exception levée par l'étape d'un job (bogue d'un adaptateur,
 * instantané illisible, base qui casse) remontait du tour entier ; la boucle
 * l'avalait et le job fautif, en tête de file (`heartbeatAt asc nulls first`),
 * recommençait au tour suivant · plus aucun job neuf n'était réclamé sur la
 * plateforme. Désormais le worker l'attrape PAR JOB, la journalise, compte
 * l'échec dans `studio_jobs.error.echecsEtape` et repousse le job
 * (`heartbeatAt` = prochain essai, le tour ne prend pas un battement futur) ;
 * une étape réussie remet le compteur à zéro.
 *
 * Recul · 20 s (le délai d'une lecture fal, `DELAI_LECTURE_FAL_MS`, et d'une
 * relecture S3 du worker · un essai ne repart jamais avant qu'une lecture ait
 * pu expirer), doublé à chaque échec, plafonné à 10 min.
 *
 * La borne N · mesurée contre le seuil « bloquée » du suivi opérationnel
 * (`SEUIL_TACHE_BLOQUEE_MIN`, 30 min, DÉRIVÉ des délais du worker, #1072) · une
 * exception qui persiste au-delà de 30 min de reculs n'est plus passagère (une
 * base qui redémarre, un déploiement, une coupure réseau tiennent en
 * minutes) · N = le plus petit nombre d'échecs dont les reculs cumulés
 * couvrent 30 min :
 *
 * | échecs | reculs cumulés avant l'échec suivant |
 * | ------ | ------------------------------------ |
 * |   6    | 20 + 40 + 80 + 160 + 320 = 620 s     |
 * |   7    | 620 + 600 = 1 220 s                  |
 * |   8    | 1 220 + 600 = **1 820 s ≥ 1 800 s**  |
 *
 * **N = 8**. Au huitième échec consécutif, `failed` · crédits du client
 * rendus ; coût fournisseur retenu dès que l'envoi a pu partir
 * (`facture_sans_livrable`), aucun sinon (`echec_sans_frais`).
 *
 * ── I5 · adresses signées remises à fal ──────────────────────────────────────
 *
 * fal lit ses sources (photo produit, image clé d'un clip) au DÉBUT du
 * traitement, pas à la soumission · une requête qui attend en file au-delà
 * de la validité de l'adresse échoue. Aucune mesure de l'attente fal au dépôt
 * (le proxy de la session bloque fal) · la plus longue attente que le produit
 * a acceptée d'un clip de la file fal est celle où l'ancien studio vidéo le
 * coupait, 15 min (`DELAI_VIDEO_HISTORIQUE_MS`) · marge 4 · **3 600 s**, sous
 * le plafond propre aux adresses de fournisseur du stockage (une heure,
 * `DUREE_LIEN_FOURNISSEUR_MAX_S`, le reste des liens restant à 900 s).
 */

import type { ActeurJob, EtatJob } from '../machines';
import type { IssueFinanciere } from './registre';
import type { PreuveSoumission } from './deroulement';
import { SEUIL_TACHE_BLOQUEE_MIN } from '../../spatial/admin/taches-admin';
import { DELAI_VIDEO_HISTORIQUE_MS } from '../creations-historiques';

export const RECUL_ETAPE_BASE_MS = 20_000;
export const RECUL_ETAPE_MAX_MS = 10 * 60_000;

/** Le délai avant l'essai qui suit le `n`-ième échec consécutif (n ≥ 1). */
export function reculEtapeMs(n: number): number {
  const k = Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : 1;
  return Math.min(RECUL_ETAPE_MAX_MS, RECUL_ETAPE_BASE_MS * 2 ** Math.min(k - 1, 30));
}

/** Le plus petit N dont les reculs cumulés (échecs 1 à N − 1) couvrent le seuil « bloquée » · 8 (tableau de l'en-tête). */
export const ECHECS_ETAPE_MAX: number = (() => {
  let cumul = 0;
  for (let n = 1; n < 1_000; n++) {
    if (cumul >= SEUIL_TACHE_BLOQUEE_MIN * 60_000) return n;
    cumul += reculEtapeMs(n);
  }
  return 1_000;
})();

export function lireEchecsEtape(erreur: unknown): number {
  const n = erreur && typeof erreur === 'object' ? (erreur as { echecsEtape?: unknown }).echecsEtape : null;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

export type SuiteEchecEtape =
  | { suite: 'reculer'; echecs: number; prochainEssai: Date }
  | { suite: 'echouer'; echecs: number; acteur: ActeurJob; issue: IssueFinanciere };

/** Un échec de plus sur l'étape d'un job · reculer, ou conclure à la borne. */
export function suiteEchecEtape(e: { erreur: unknown; etat: EtatJob; preuve: PreuveSoumission; maintenant: Date }): SuiteEchecEtape {
  const echecs = lireEchecsEtape(e.erreur) + 1;
  if (echecs < ECHECS_ETAPE_MAX) return { suite: 'reculer', echecs, prochainEssai: new Date(e.maintenant.getTime() + reculEtapeMs(echecs)) };
  const acteur: ActeurJob = e.etat === 'persisting' ? 'finaliseur' : e.etat === 'reconciliation_required' ? 'reconciliateur' : 'worker';
  const issue: IssueFinanciere = e.etat === 'persisting' || e.etat === 'reconciliation_required' || e.preuve !== 'aucune' ? 'facture_sans_livrable' : 'echec_sans_frais';
  return { suite: 'echouer', echecs, acteur, issue };
}

/* ───────────────────────────── I5 ───────────────────────────── */

export const MARGE_URL_FOURNISSEUR = 4;
/** Validité des adresses signées remises au fournisseur · 3 600 s. */
export const DUREE_URL_FOURNISSEUR_S = (MARGE_URL_FOURNISSEUR * DELAI_VIDEO_HISTORIQUE_MS) / 1000;
