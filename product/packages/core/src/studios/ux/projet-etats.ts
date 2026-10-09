import type { CodeErreurStudio } from '../erreurs';

/**
 * L8-B · UX-03 · ce qu'un écran de projet dit APRÈS un échec, et quelle est la
 * prochaine action. Pur · ni navigateur, ni base, ni réseau.
 *
 * ── Ce que la recette a mesuré (local, base synthétique, 1280 et 390 × 720) ──
 *
 * | Écran · geste hors ligne                     | Avant                                                   |
 * | -------------------------------------------- | ------------------------------------------------------- |
 * | Préparer une création · Créer le projet      | bouton figé sur « Création… », aucun message, à vie      |
 * | IA et Studios · Importer en brouillon         | « Application error » · écran entier perdu, saisie perdue |
 * | Studio vidéo · Enregistrer ce changement      | message juste, mais hors de la vue et focus perdu        |
 * | Identités · Enregistrer la fiche              | idem                                                    |
 * | Studio vidéo · conflit de version             | « recharge-le » écrit, aucun bouton pour le faire        |
 *
 * La règle : un échec n'efface jamais la saisie, dit ce qui s'est passé PUIS
 * ce qu'il faut faire, et quand la prochaine action est un geste de l'écran
 * (recharger, réessayer), elle est un BOUTON, pas une phrase. Le statut est
 * porté par un MOT (`mot`) · la couleur (`ton`) ne fait que l'appuyer.
 */

/** Échec côté navigateur · la requête n'est jamais arrivée, ou sa réponse n'est pas revenue. */
export const ECHEC_RESEAU_STUDIO = 'NETWORK' as const;
export type CodeEchecEcran = CodeErreurStudio | typeof ECHEC_RESEAU_STUDIO;

export type ProchaineActionStudio =
  | 'reessayer'
  | 'recharger'
  | 'corriger'
  | 'attendre'
  | 'se-reconnecter'
  | 'demander-acces'
  | 'revenir-aux-projets'
  | 'aucune';

export interface EtatEchecStudio {
  /** Le statut en un mot · jamais la couleur seule. */
  mot: string;
  ton: 'warn' | 'err' | 'info';
  action: ProchaineActionStudio;
  /** Libellé du bouton quand l'action est un geste de l'écran · `null` quand le message suffit. */
  libelleAction: string | null;
  /** Lien de l'action quand elle quitte l'écran (reconnexion, liste des projets). */
  lien: string | null;
}

const T: Readonly<Record<CodeEchecEcran, EtatEchecStudio>> = {
  NETWORK: { mot: 'Hors ligne', ton: 'err', action: 'reessayer', libelleAction: 'Réessayer', lien: null },
  AUTH_REQUIRED: { mot: 'Session expirée', ton: 'err', action: 'se-reconnecter', libelleAction: 'Se reconnecter', lien: '/login' },
  FORBIDDEN: { mot: 'Accès refusé', ton: 'err', action: 'demander-acces', libelleAction: null, lien: null },
  NOT_FOUND: { mot: 'Introuvable', ton: 'err', action: 'revenir-aux-projets', libelleAction: 'Revenir aux projets', lien: '/studio/projets' },
  VERSION_CONFLICT: { mot: 'Conflit de version', ton: 'warn', action: 'recharger', libelleAction: 'Recharger la version courante', lien: null },
  INVALID_SCHEMA: { mot: 'À corriger', ton: 'warn', action: 'corriger', libelleAction: null, lien: null },
  UNSUPPORTED_CAPABILITY: { mot: 'Indisponible', ton: 'info', action: 'aucune', libelleAction: null, lien: null },
  MISSING_REFERENCE: { mot: 'Référence manquante', ton: 'warn', action: 'corriger', libelleAction: null, lien: null },
  INVARIANT_CONFLICT: { mot: 'À corriger', ton: 'warn', action: 'corriger', libelleAction: null, lien: null },
  QUOTE_EXPIRED: { mot: 'Devis expiré', ton: 'warn', action: 'corriger', libelleAction: null, lien: null },
  BUDGET_EXCEEDED: { mot: 'Plafond atteint', ton: 'warn', action: 'attendre', libelleAction: null, lien: null },
  RATE_LIMITED: { mot: 'Trop de demandes', ton: 'warn', action: 'reessayer', libelleAction: 'Réessayer', lien: null },
  PROVIDER_UNCERTAIN: { mot: 'Vérification en cours', ton: 'info', action: 'attendre', libelleAction: null, lien: null },
  PERSISTENCE_FAILED: { mot: 'Non enregistré', ton: 'err', action: 'reessayer', libelleAction: 'Réessayer', lien: null },
  QUALITY_REVIEW_REQUIRED: { mot: 'À relire', ton: 'warn', action: 'corriger', libelleAction: null, lien: null },
};

/** L'état d'échec d'un code · un code inconnu (forme inattendue) est traité comme une panne réseau : rien n'est confirmé. */
export function etatEchecStudio(code: string | null | undefined): EtatEchecStudio {
  return (code && (T as Record<string, EtatEchecStudio>)[code]) || T.NETWORK;
}

/** Les gestes d'un écran de projet qui peuvent échouer en route. */
export type GesteEcranProjet = 'creation' | 'enregistrement' | 'chargement' | 'proposition' | 'export' | 'commande';

const RIEN: Readonly<Record<GesteEcranProjet, string>> = {
  creation: 'rien n’a été créé',
  enregistrement: 'rien n’a été enregistré',
  chargement: 'rien n’a été chargé',
  proposition: 'aucune proposition n’a été demandée',
  export: 'rien n’a été exporté',
  commande: 'rien n’a été modifié',
};

/**
 * Le message d'une panne réseau (hors ligne, serveur injoignable) · ce qui
 * s'est passé, ce qui n'a PAS eu lieu, puis quoi faire. La saisie reste.
 */
export function messageHorsLigneStudio(geste: GesteEcranProjet): string {
  return `Connexion perdue · ${RIEN[geste]}. Vérifie ta connexion puis réessaie · ta saisie est conservée.`;
}
