/**
 * Admissibilité de l'équipe plateforme, rendue VISIBLE · pur, sans base ni UI.
 *
 * Depuis la PR #1106 (SEC-10 / E5), un compte d'équipe n'a les droits de
 * portée plateforme (crédits illimités, Connaissances, écriture de l'équipe ;
 * puis, suivi de #1108, formule Business forcée, levée des verrous de formule
 * et lecture de la dépense plateforme · `privilegesEquipe`)
 * que s'il est ADMISSIBLE (`plateformeAdmissible` · fondateur de la liste
 * codée, ou compte créé AVANT l'inscription de son e-mail dans
 * `platform_staff`). Effet assumé : un membre invité avant d'avoir un compte
 * perd ces droits jusqu'à ce qu'on le retire puis le réinscrive.
 *
 * Ce module tranche ce qu'on en DIT :
 *  · `admissibiliteMembre` · par membre, sur `/admin/equipe` · admissible ou
 *    non, la date de création du compte (ou « aucun compte »), et la consigne
 *    de réinscription quand elle s'applique ;
 *  · `messageNonAdmissible` · le message dédié au membre concerné (accès
 *    total, non admissible), au lieu d'un refus « réservé aux Admin » adressé
 *    à quelqu'un qui EST Admin, ou d'une perte de crédits silencieuse ;
 *  · `refusConnaissances` · la vraie raison du refus des Connaissances.
 *
 * La consigne exige une preuve qui porte sur le COMPTE, pas sur l'adresse.
 * Le produit ne vérifie jamais l'e-mail à la création d'un compte
 * (inscription libre, ou invitation acceptée par celui qui voit le lien) :
 * appeler la vraie personne, qui confirme détenir l'adresse, puis réinscrire,
 * rendrait admissible le compte du CAPTEUR (relecture de #1108). Demander
 * hors du produit « Mot de passe oublié » sur l'adresse puis une reconnexion
 * prouve que le compte est à elle : le lien part sur l'adresse, et
 * `resetPasswordAction` incrémente `sessionEpoch`, ce qui coupe toute autre
 * session ouverte sur le compte.
 */

import { plateformeAdmissible } from './studios/securite';
import { ROLES_ACCES_TOTAL } from './equipe-plateforme';
import { peutGererConnaissances } from './connaissances';
import { adminDateCourte } from './spatial/admin/format';

/**
 * `inscritEquipe` · `false` quand le rôle vient de la liste des fondateurs de
 * l'ENVIRONNEMENT (`FOUNDER_EMAILS`) sans ligne `platform_staff` · aucune
 * inscription, donc jamais « créé après ton inscription ».
 */
type EquipeLue = { role: string; plateformeAdmissible?: boolean; inscritEquipe?: boolean } | null | undefined;

const estAccesTotal = (role: string) => (ROLES_ACCES_TOTAL as readonly string[]).includes(role);

/** Ce que doit faire celui qui réinscrit · une preuve qui porte sur le COMPTE, demandée hors du produit. */
export const CONSIGNE_REINSCRIPTION =
  'Avant de la réinscrire, demande-lui hors du produit (appel, message direct) de faire « Mot de passe oublié » sur cette adresse puis de se reconnecter · c’est ce qui prouve que le compte est à elle et ferme toute autre session ouverte dessus. Ensuite, retire-la puis réinscris-la.';

/** Ce que lit le membre concerné · accès total, non admissible. */
export const MESSAGE_NON_ADMISSIBLE =
  'Ton compte a été créé après ton inscription à l’équipe · tes crédits illimités, les Connaissances et l’accès d’équipe à toutes les fonctions sont fermés, tu as la formule de ton espace. Fais « Mot de passe oublié » sur ton adresse et reconnecte-toi, puis demande à un fondateur de te réinscrire.';

/** Fondateur déclaré par l'environnement (`FOUNDER_EMAILS`), sans inscription dans l'équipe. */
export const MESSAGE_FONDATEUR_HORS_CODE =
  'Ton accès d’équipe vient de la liste des fondateurs de l’environnement, sans inscription dans l’équipe · tes crédits illimités, les Connaissances et l’accès d’équipe à toutes les fonctions sont fermés, tu as la formule de ton espace. Fais « Mot de passe oublié » sur ton adresse et reconnecte-toi, puis demande à un fondateur de t’inscrire dans l’équipe.';

/** Refus général des Connaissances · client, rôle gradé. */
export const REFUS_CONNAISSANCES =
  'Réservé à l’équipe plateforme (Admin+ ou Admin) · un rôle d’espace, même propriétaire, ne suffit pas.';

export type StatutAdmissibilite = 'fondateur' | 'admissible' | 'compte-posterieur' | 'sans-compte';

export interface AdmissibiliteMembre {
  statut: StatutAdmissibilite;
  admissible: boolean;
  /** « Admissible », « Admissible · fondateur », « Non admissible »… */
  libelle: string;
  /** « compte créé le 3 oct. 2026 » ou « aucun compte ». */
  compte: string;
  /** La consigne de réinscription · `null` quand il n'y a rien à faire. */
  consigne: string | null;
}

function dateLisible(d: Date | string | null | undefined): Date | null {
  if (d === null || d === undefined) return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isFinite(x.getTime()) ? x : null;
}

/**
 * Par membre de `platform_staff` · mêmes faits, même verdict que la session
 * (`equipeDeSession` → `plateformeAdmissible`, aucune vérification d'e-mail).
 * La consigne n'est donnée qu'aux rôles à accès total : pour un rôle gradé,
 * l'admissibilité n'ouvre rien (les permissions plateforme, les crédits
 * illimités et l'écriture de l'équipe exigent l'accès total).
 */
export function admissibiliteMembre(f: {
  role: string;
  fondateurCode: boolean;
  compteCreeLe: Date | string | null | undefined;
  staffInscritLe: Date | string | null | undefined;
}): AdmissibiliteMembre {
  const admissible = plateformeAdmissible({ fondateurCode: f.fondateurCode, emailVerifie: null, compteCreeLe: f.compteCreeLe, staffInscritLe: f.staffInscritLe });
  const cree = dateLisible(f.compteCreeLe);
  const compte = cree ? `compte créé le ${adminDateCourte(cree)} ${cree.getFullYear()}` : 'aucun compte';
  if (f.fondateurCode) return { statut: 'fondateur', admissible, libelle: 'Admissible · fondateur', compte, consigne: null };
  if (admissible) return { statut: 'admissible', admissible, libelle: 'Admissible', compte, consigne: null };

  const statut: StatutAdmissibilite = cree ? 'compte-posterieur' : 'sans-compte';
  if (!estAccesTotal(f.role)) return { statut, admissible, libelle: 'Non admissible · sans effet pour ce rôle', compte, consigne: null };
  const pourquoi = cree
    ? 'Compte créé après son inscription · crédits illimités, Connaissances, accès d’équipe à toutes les fonctions et dépense de la plateforme fermés.'
    : 'Pas encore de compte · le compte qu’il créera sera postérieur, donc non admissible. Attends que son compte existe.';
  return { statut, admissible, libelle: 'Non admissible', compte, consigne: `${pourquoi} ${CONSIGNE_REINSCRIPTION}` };
}

/** Le message dédié au membre concerné · accès total ET non admissible. Sinon `null`. */
export function messageNonAdmissible(equipe: EquipeLue): string | null {
  if (!equipe || !estAccesTotal(equipe.role) || equipe.plateformeAdmissible === true) return null;
  return equipe.inscritEquipe === false ? MESSAGE_FONDATEUR_HORS_CODE : MESSAGE_NON_ADMISSIBLE;
}

/** Le refus des Connaissances, dit par sa vraie raison · `null` quand l'accès est ouvert. */
export function refusConnaissances(equipe: EquipeLue): string | null {
  if (peutGererConnaissances(equipe)) return null;
  return messageNonAdmissible(equipe) ?? REFUS_CONNAISSANCES;
}
