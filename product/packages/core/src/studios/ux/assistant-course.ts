import type { SaisieFormat } from './assistant-projet';

/**
 * Assistant V5 · Lot 2c · les règles PURES des réponses de mutation perdues et
 * des courses réseau du devis. Elles vivent au noyau (testables, sans réseau)
 * parce qu'elles tranchent une décision métier dangereuse : que promettre quand
 * on ne SAIT pas, et quand un devis reçu n'est plus celui qu'on affiche.
 *
 * Le principe, appris cher : on ne promet JAMAIS une absence d'effet qu'on ne
 * peut pas garantir. Une réponse de mutation perdue (réseau coupé après l'envoi)
 * a PU être acceptée côté serveur · le dire « rien n'a été fait » rouvrirait le
 * bouton et risquerait un double lancement / double débit.
 */

/**
 * Réponse PERDUE d'une mutation PAYANTE (confirmation / lancement d'image) · le
 * lancement a pu être accepté ET débité. État honnête : INCERTAIN · on
 * verrouille toute nouvelle tentative et on exige un rechargement pour consulter
 * l'état serveur réel (tâches + budget) avant d'agir. Message EXACT, figé ici.
 */
export const MESSAGE_LANCEMENT_INCERTAIN =
  'La réponse du serveur n’a pas été reçue. Le lancement peut avoir été accepté et le débit est incertain. Recharge le projet pour consulter les tâches et le budget avant toute nouvelle tentative.';

/**
 * Réponse PERDUE d'une mutation GRATUITE (demande de devis) · aucune promesse
 * d'absence d'effet · on dit l'état INCONNU et on invite à relire le projet.
 */
export const MESSAGE_DEVIS_INCONNU =
  'L’état du devis n’a pas pu être confirmé · relis le projet.';

/**
 * Peut-on (re)lancer la confirmation ? NON tant que l'état est incertain · la
 * garde est la même que l'écran applique au premier geste de `confirmer`.
 */
export function peutConfirmerLancement(incertain: boolean): boolean {
  return !incertain;
}

/**
 * La signature des CHOIX qui déterminent un devis (format de sortie + relecture).
 * Deux demandes de devis sont « les mêmes choix » ssi leurs signatures sont
 * égales · c'est ce qu'on compare entre la demande et la réponse.
 */
export function signatureChoixDevis(s: SaisieFormat): string {
  return `${s.format}|${s.relectureAuto ? 'relu' : 'brut'}`;
}

export type RaisonDevisRejete = 'obsolete' | 'perime' | 'non-correle';

export type VerdictDevisRecu =
  | { accepte: true }
  | { accepte: false; raison: RaisonDevisRejete };

/**
 * Un devis REÇU est-il recevable, face aux courses réseau (promesses retardées,
 * arrivées dans le désordre) ? Trois rejets, dans cet ordre :
 *
 *  · `obsolete` · une demande plus récente a été lancée depuis (numéro de
 *    séquence dépassé) · la réponse d'une demande périmée ne doit RIEN afficher ;
 *  · `perime` · les choix affichés ont changé entre la demande et la réponse ·
 *    le devis ne correspond plus à ce qu'on voit à l'écran, on l'ignore ;
 *  · `non-correle` · le devis relu n'est PAS celui que CETTE demande a créé
 *    (identifiant différent) · c'est « le dernier devis du projet », pas le
 *    nôtre · on refuse de le présenter comme courant.
 *
 * Sinon seulement : accepté.
 */
export function verdictDevisRecu(e: {
  seqDemande: number;
  seqCourant: number;
  signatureDemande: string;
  signatureAffichee: string;
  devisCreeId: string | null;
  devisReluId: string | null;
}): VerdictDevisRecu {
  if (e.seqDemande !== e.seqCourant) return { accepte: false, raison: 'obsolete' };
  if (e.signatureDemande !== e.signatureAffichee) return { accepte: false, raison: 'perime' };
  if (!e.devisCreeId || !e.devisReluId || e.devisReluId !== e.devisCreeId) return { accepte: false, raison: 'non-correle' };
  return { accepte: true };
}

/* ───────────── Devis INDICATIF · un CALCUL, 0 $, aucune action serveur ──────── */

/**
 * Le « devis vivant » d'un projet NEUF.
 *
 * ── Le défaut réparé ─────────────────────────────────────────────────────────
 *
 * Depuis un projet neuf (assistant, étape Format), le SEUL devis câblé était le
 * devis SERVEUR immuable (`demanderDevisImage`). Il exige une consigne image
 * COMPILÉE et RETENUE · or la compilation est un appel texte PAYANT que le
 * parcours neuf ne fait pas. Résultat : « Voir le devis serveur » renvoyait
 * « Aucune consigne image retenue… » et le projet neuf n'atteignait AUCUN
 * montant affiché avant un clic payant. La promesse V5 (« devis recalculé à
 * chaque changement », maquette B23) restait hors de portée.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Un devis est d'abord un CALCUL. À partir des montants que le serveur a DÉJÀ
 * renvoyés pour ce projet (prix d'une image de la grille · `prixImage`, borne
 * du contrôle visuel par image · `borneControleVisionParImageMicros`), on
 * assemble ce que coûterait la production d'UNE image dans le format choisi,
 * avec ou sans relecture. Ce montant s'affiche AVANT tout clic payant, se
 * recalcule quand la relecture change, et n'écrit, n'appelle, ne dépense RIEN.
 *
 * Aucune valeur n'est inventée : on n'ASSEMBLE que des montants déjà mesurés
 * ailleurs. Le devis serveur (étape suivante) fige ce prix et reste la SEULE
 * voie vers une génération · lui seul exige la consigne compilée.
 */
export interface LigneDevisIndicatif {
  /** Discriminant stable · l'écran et la garde s'y accrochent, jamais au libellé. */
  cle: 'image' | 'relecture';
  libelle: string;
  usdMicros: number;
  /** `true` · montant BORNÉ (grille / borne du contrôle visuel), jamais une estimation floue. */
  borne: boolean;
}

export interface DevisIndicatif {
  lignes: LigneDevisIndicatif[];
  credits: number;
  usdMicros: number;
}

export function devisIndicatifImage(e: {
  prix: { credits: number; usdMicros: number };
  relectureDisponible: boolean;
  relectureAuto: boolean;
  borneRelectureParImageUsdMicros: number;
}): DevisIndicatif {
  const lignes: LigneDevisIndicatif[] = [
    { cle: 'image', libelle: 'Image · publicité', usdMicros: Math.max(0, Math.trunc(e.prix.usdMicros)), borne: true },
  ];
  // La relecture n'entre au calcul que si le serveur sait l'exécuter ici ET
  // qu'elle est cochée · même condition que la ligne du devis serveur (R3).
  if (e.relectureDisponible && e.relectureAuto && e.borneRelectureParImageUsdMicros > 0) {
    lignes.push({ cle: 'relecture', libelle: 'Relecture automatique · par image', usdMicros: Math.trunc(e.borneRelectureParImageUsdMicros), borne: true });
  }
  return {
    lignes,
    // La relecture est à 0 crédit (le prix en crédits de l'offre ne change pas).
    credits: Math.max(0, Math.trunc(e.prix.credits)),
    usdMicros: lignes.reduce((s, l) => s + l.usdMicros, 0),
  };
}
