/**
 * Admissibilité de l'équipe plateforme, rendue VISIBLE · pur, sans base ni UI.
 *
 * Depuis la PR #1106 (SEC-10 / E5), un compte d'équipe n'a les droits de
 * portée plateforme (crédits illimités, Connaissances, écriture de l'équipe ;
 * puis, suivi de #1108, formule Business forcée, levée des verrous de formule
 * et lecture de la dépense plateforme · `privilegesEquipe` ; puis la face
 * équipe de TOUT rôle, gradés compris, et la lecture de `/admin/equipe`)
 * que s'il est ADMISSIBLE (`plateformeAdmissible` · fondateur de la liste
 * codée, ou compte créé AVANT l'inscription de son e-mail dans
 * `platform_staff`). Effet assumé : un membre invité avant d'avoir un compte
 * perd ces droits jusqu'à ce qu'on le retire puis le réinscrive.
 *
 * Ce module tranche ce qu'on en DIT :
 *  · `admissibiliteMembre` · par membre, sur `/admin/equipe` · admissible ou
 *    non, la date de création du compte (ou « aucun compte »), et la consigne
 *    de réinscription quand elle s'applique ;
 *  · `messageNonAdmissible` · le message dédié au membre concerné (tout rôle
 *    d'équipe non admissible), au lieu d'un refus « réservé aux Admin »
 *    adressé à quelqu'un qui EST Admin, ou d'une perte silencieuse ;
 *  · `vueEquipeAdmin` · ce que `/admin/equipe` montre à la session · l'écran
 *    complet, le message seul, ou rien ;
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

/** Ce que lit le membre concerné · accès total (Admin+, Admin), non admissible. */
export const MESSAGE_NON_ADMISSIBLE =
  'Ton compte a été créé après ton inscription à l’équipe · tes crédits illimités, la formule Business, l’accès d’équipe à toutes les fonctions, les Connaissances, la dépense de la plateforme et la liste de l’équipe sont fermés, tu as le rôle et la formule de ton espace. Fais « Mot de passe oublié » sur ton adresse et reconnecte-toi, puis demande à un fondateur de te réinscrire.';

/** Ce que lit le membre concerné · rôle GRADÉ (Manager…), non admissible. */
export const MESSAGE_GRADE_NON_ADMISSIBLE =
  'Ton compte a été créé après ton inscription à l’équipe · ton accès d’équipe (les rubriques de ton rôle, sans verrou de formule) et la liste de l’équipe sont fermés, tu as le rôle et la formule de ton espace. Fais « Mot de passe oublié » sur ton adresse et reconnecte-toi, puis demande à un fondateur de te réinscrire.';

/**
 * Adresse de la liste des fondateurs de l'ENVIRONNEMENT (`FOUNDER_EMAILS`),
 * sans inscription dans l'équipe · cette liste n'ouvre plus rien
 * (`pouvoirFondateur`, « Codé seul »). Ce que le message dit fermé est ce que
 * ce compte n'a pas · rien de ce qu'il n'a jamais eu.
 */
export const MESSAGE_FONDATEUR_HORS_CODE =
  'Ton adresse figure dans la liste des fondateurs de l’environnement, sans inscription dans l’équipe · cette liste n’ouvre plus aucun accès : le Tour de contrôle, les dépenses IA, les formules et les dons de crédits, les crédits illimités, la formule Business, l’accès d’équipe, les Connaissances et la liste de l’équipe sont fermés, tu as le rôle et la formule de ton espace. Les pouvoirs fondateur sont réservés aux fondateurs inscrits dans le code. Pour rejoindre l’équipe, fais « Mot de passe oublié » sur ton adresse et reconnecte-toi, puis demande à un fondateur de t’inscrire dans l’équipe.';

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
 * La consigne est donnée à TOUT rôle non admissible · depuis « Fermer
 * aussi », un rôle gradé non admissible perd sa face équipe
 * (`privilegesEquipe`) · il se réinscrit comme un Admin.
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
  const ferme = estAccesTotal(f.role)
    ? 'crédits illimités, formule Business, accès d’équipe à toutes les fonctions, Connaissances, dépense de la plateforme et liste de l’équipe fermés.'
    : 'accès d’équipe (les rubriques de son rôle, sans verrou de formule) et liste de l’équipe fermés.';
  const pourquoi = cree
    ? `Compte créé après son inscription · ${ferme}`
    : 'Pas encore de compte · le compte qu’il créera sera postérieur, donc non admissible. Attends que son compte existe.';
  return { statut, admissible, libelle: 'Non admissible', compte, consigne: `${pourquoi} ${CONSIGNE_REINSCRIPTION}` };
}

/** Le message dédié au membre concerné · tout rôle d'équipe NON admissible. Sinon `null`. */
export function messageNonAdmissible(equipe: EquipeLue): string | null {
  if (!equipe || equipe.plateformeAdmissible === true) return null;
  if (equipe.inscritEquipe === false) return MESSAGE_FONDATEUR_HORS_CODE;
  return estAccesTotal(equipe.role) ? MESSAGE_NON_ADMISSIBLE : MESSAGE_GRADE_NON_ADMISSIBLE;
}

/**
 * Le refus des Connaissances, dit par sa vraie raison · `null` quand l'accès
 * est ouvert. Un rôle gradé n'y a jamais droit · son refus reste celui du
 * rôle, admissible ou non.
 */
export function refusConnaissances(equipe: EquipeLue): string | null {
  if (peutGererConnaissances(equipe)) return null;
  return (equipe && estAccesTotal(equipe.role) ? messageNonAdmissible(equipe) : null) ?? REFUS_CONNAISSANCES;
}

/**
 * Ce que `/admin/equipe` montre à la session · LA règle de la page et de son
 * entrée de sous-navigation.
 *
 *  · `complete` · accès total ADMISSIBLE (fondateur codé compris) · la
 *    matrice, la liste de l'équipe (e-mails, préinscrits sans compte
 *    compris), l'admissibilité de chacun et le registre d'audit ;
 *  · `message` · tout compte d'équipe NON admissible · le message qui lui dit
 *    quoi faire (`messageNonAdmissible`), rien d'autre. Sur main c05b74a0,
 *    l'accès total suffisait · un compte capteur lisait les e-mails
 *    préinscrits sans compte, qu'il pouvait capter à leur tour, et l'audit ;
 *  · `refus` · aucun rôle d'équipe, ou rôle gradé admissible (la page ne
 *    l'a jamais concerné) · renvoyé à l'accueil.
 */
export type VueEquipeAdmin = 'complete' | 'message' | 'refus';

export function vueEquipeAdmin(equipe: EquipeLue): VueEquipeAdmin {
  if (!equipe) return 'refus';
  if (equipe.plateformeAdmissible !== true) return messageNonAdmissible(equipe) ? 'message' : 'refus';
  return estAccesTotal(equipe.role) ? 'complete' : 'refus';
}
