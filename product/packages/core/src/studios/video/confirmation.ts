/**
 * Studio vidéo · confirmer un changement de montage APRÈS son aperçu.
 *
 * Le geste se fait en deux temps : l'écran calcule l'impact (noyau) sur la
 * version qu'il affiche, puis la personne confirme. Entre les deux, la vue se
 * relit seule (relecture toutes les 4 s tant qu'un job travaille, ou après
 * n'importe quel autre geste). Deux règles en découlent, pures :
 *
 *  · `decisionConfirmationApercu` · un aperçu calculé sur la version N ne se
 *    confirme pas quand la vue montre la version M ≠ N : l'impact affiché ne
 *    décrit plus ce qui serait écrit. L'aperçu est à recalculer.
 *  · `estRejeuEcriture` · le serveur reçoit toujours la version de l'APERÇU
 *    (version attendue). Si la réponse de la première demande s'est perdue
 *    et que la personne relance, la version courante est déjà la fille directe
 *    de cette base, écrite par la même personne, au contenu exactement
 *    attendu : c'est la même écriture, rien n'est écrit une seconde fois.
 *    Tout autre écart reste un conflit.
 */

export interface VersionApercue { id: string; n: number }

export const MESSAGE_APERCU_PERIME =
  'Le projet a changé depuis cet aperçu · recalcule l’aperçu avant d’enregistrer, rien n’a été écrit.';

/**
 * Réponse perdue pendant l'enregistrement · on ne sait pas si le serveur a
 * écrit. Dire « rien n'a été enregistré » serait faux une fois sur deux ;
 * la relance est sûre (`estRejeuEcriture`).
 */
export const MESSAGE_REPONSE_PERDUE_MONTAGE =
  'Connexion perdue · la réponse du serveur n’est pas arrivée, l’enregistrement a pu aboutir. Réessaie : une demande déjà enregistrée n’est jamais écrite deux fois.';

export type DecisionConfirmationApercu = { ok: true } | { ok: false; message: string };

/** L'aperçu se confirme seulement sur la version qui l'a produit. */
export function decisionConfirmationApercu(apercu: VersionApercue, courante: VersionApercue): DecisionConfirmationApercu {
  if (apercu.id === courante.id) return { ok: true };
  return { ok: false, message: `${MESSAGE_APERCU_PERIME} Aperçu calculé sur la version ${apercu.n}, le projet est en version ${courante.n}.` };
}

export interface EntreeRejeu {
  /** La version attendue envoyée avec la demande (celle de l'aperçu). */
  baseId: string;
  /** Qui relance. */
  auteurId: string;
  /** Empreinte du contenu que la demande produirait sur sa base. */
  empreinteAttendue: string;
  /** La version courante du projet au moment de la relance. */
  courante: { parentId: string | null; authorId: string | null; contentHash: string };
}

/** La version courante EST le résultat de cette même demande, déjà écrit. */
export function estRejeuEcriture(e: EntreeRejeu): boolean {
  return e.courante.parentId === e.baseId
    && e.courante.authorId === e.auteurId
    && e.courante.contentHash === e.empreinteAttendue;
}

/**
 * Gestes de l'atelier vidéo dont le serveur reconnaît la relance d'une écriture
 * déjà faite (`estRejeuEcriture`, `deja: true`) : enregistrer un changement de
 * montage, retenir la consigne d'un plan. Leur réponse perdue se dit avec
 * `MESSAGE_REPONSE_PERDUE_MONTAGE` (« a pu aboutir »), jamais « rien n'a été
 * enregistré ».
 */
export function ecritureVideoReconnue(nom: string): boolean {
  return nom === 'confirmer' || nom.startsWith('retenir:');
}

/**
 * Gestes de l'atelier vidéo que « Réessayer » peut rejouer sans rien dépenser :
 * enregistrer un changement de montage (relance sûre, `estRejeuEcriture`),
 * retenir une consigne, demander un devis (gratuit). Un appel texte payant
 * (storyboard, consigne) ne se rejoue jamais par ce bouton · son prix est
 * annoncé à côté de son propre bouton. « Lancer » garde sa clé de clic.
 */
export function gesteVideoReessayable(nom: string): boolean {
  return nom === 'confirmer' || nom.startsWith('retenir:') || nom.startsWith('devis:') || nom.startsWith('devis-clip:');
}
