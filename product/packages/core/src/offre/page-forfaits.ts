/**
 * L'offre · la page Forfaits V2 (Réglages · Forfaits), servie sous
 * `TARIFS_V2`. Pur · la page ne fait que poser ces valeurs dans les classes de
 * la maquette (`docs/spatial/reference/forfaits.html`).
 *
 * Trois forfaits (Essentiel, Pro, Agence), bascule mensuel / annuel (−30 %),
 * prix TTC, crédits inclus, droits RÉELS (`lignesDroits`, appliqués au
 * serveur), « Plan actuel », recharges au prix du forfait. Le prix en euros ne
 * se lit qu'ici et au moment d'acheter une recharge (décision du 29/10, point 1).
 */
import { BAREME_V2 } from './bareme';
import { forfaitApresEcheance } from './bascule';
import { droitsDuForfait, lignesFonctionsDroits, lignesLimites } from './droits';
import {
  FORFAIT_V2_MIS_EN_AVANT, FORFAITS_V2, FORFAITS_V2_ORDRE, REMISE_ANNUELLE_V2, RANG_FORFAIT, estForfaitV2, prixEcheanceTtc, prixMensuelTtc,
  type CleForfaitV2, type Facturation,
} from './forfaits';

export type BoutonForfaitV2 =
  | { type: 'desactive'; libelle: string }
  | { type: 'portail'; libelle: string; primaire: boolean }
  | { type: 'abonnement'; libelle: string };

/** Ce que chaque forfait ouvre en plus du précédent · les accès réels (`minPlan`, même rang que Core / Plus / Business). */
export const ACCES_FORFAIT_V2: Readonly<Record<CleForfaitV2, readonly string[]>> = {
  essentiel: ['Studios · pub, image, vidéo, textes', 'Jarvis · règles maison', 'Veille & Radar créatif', 'Bibliothèque'],
  pro: ['Tout Essentiel', 'Résultats · Adsmap complet'],
  agence: ['Tout Pro', 'Membres & rôles avancés'],
};

export const libelleFacturation = (f: Facturation) => (f === 'annuel' ? 'Annuel' : 'Mensuel');
export const ENGAGEMENT_V2 = 'Sans engagement, annulable à tout moment';
export const ETIQUETTE_POPULAIRE_V2 = 'Le plus populaire';
export const TITRE_CHANGER_FORFAIT_V2 = 'Changer de forfait';

export const REMISE_ANNUELLE_LIBELLE = `−${Math.round(REMISE_ANNUELLE_V2 * 100)} %`;

const euros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;

export function lireFacturation(v: unknown): Facturation {
  return v === 'annuel' ? 'annuel' : 'mensuel';
}

export function boutonForfaitV2(p: {
  forfait: CleForfaitV2; actuel: string; facturation: Facturation; proprietaire: boolean; paiement: boolean; abonne: boolean; achetable: boolean;
}): BoutonForfaitV2 {
  if (p.forfait === p.actuel) return { type: 'desactive', libelle: 'Plan actuel' };
  if (!p.proprietaire) return { type: 'desactive', libelle: 'Le propriétaire gère la formule' };
  if (!p.paiement) return { type: 'desactive', libelle: 'Bientôt disponible' };
  const nom = FORFAITS_V2[p.forfait].libelle;
  // Abonné actuel · son équivalent V2 lui est appliqué à l'échéance, sans geste (décision du 29/10, point 5).
  if (p.abonne && forfaitApresEcheance(p.actuel) === p.forfait) return { type: 'desactive', libelle: 'Le tien à ta prochaine échéance' };
  if (p.abonne) {
    const monte = RANG_FORFAIT[p.forfait] > (RANG_FORFAIT[p.actuel as keyof typeof RANG_FORFAIT] ?? 0);
    return { type: 'portail', libelle: monte ? `Passer à ${nom}` : `Revenir à ${nom}`, primaire: monte };
  }
  if (!p.achetable) return { type: 'desactive', libelle: 'Bientôt' };
  return p.facturation === 'annuel'
    ? { type: 'abonnement', libelle: `S’abonner · ${euros(prixEcheanceTtc(p.forfait, 'annuel'))} / an` }
    : { type: 'abonnement', libelle: `S’abonner · ${euros(prixEcheanceTtc(p.forfait, 'mensuel'))} / mois` };
}

export interface CarteForfaitV2 {
  cle: CleForfaitV2;
  nom: string;
  accroche: string;
  prix: string;
  periode: string;
  /** Annuel · le montant réellement prélevé, une fois par an · `null` en mensuel. */
  sousPrix: string | null;
  /** « Sans engagement, annulable à tout moment » · sous le bouton. */
  engagement: string;
  credits: string;
  /** Ce que le forfait ouvre (accès réels et droits). */
  fonctions: string[];
  /** Ce qui est compté et refusé au serveur au-delà (marques, concurrents, durée vidéo). */
  limites: string[];
  /** L'étiquette de la carte mise en avant. */
  etiquette: string | null;
  actuelle: boolean;
  miseEnAvant: boolean;
  bouton: BoutonForfaitV2;
}

export function cartesForfaitsV2(o: {
  plan: string; facturation: Facturation; proprietaire: boolean; paiement: boolean; abonne: boolean;
  achetable: (forfait: CleForfaitV2, facturation: Facturation) => boolean;
}): CarteForfaitV2[] {
  return FORFAITS_V2_ORDRE.map((cle) => {
    const f = FORFAITS_V2[cle];
    return {
      cle, nom: f.libelle, accroche: f.accroche,
      prix: euros(prixMensuelTtc(cle, o.facturation)),
      periode: '/ mois TTC',
      sousPrix: o.facturation === 'annuel' ? `soit ${euros(prixEcheanceTtc(cle, 'annuel'))} TTC prélevés une fois par an` : null,
      engagement: ENGAGEMENT_V2,
      credits: f.creditsMois.toLocaleString('fr-FR'),
      fonctions: [...ACCES_FORFAIT_V2[cle], ...lignesFonctionsDroits(droitsDuForfait(cle))],
      limites: lignesLimites(droitsDuForfait(cle)),
      actuelle: o.plan === cle,
      miseEnAvant: cle === FORFAIT_V2_MIS_EN_AVANT,
      etiquette: cle === FORFAIT_V2_MIS_EN_AVANT ? ETIQUETTE_POPULAIRE_V2 : null,
      bouton: boutonForfaitV2({ forfait: cle, actuel: o.plan, facturation: o.facturation, proprietaire: o.proprietaire, paiement: o.paiement, abonne: o.abonne, achetable: o.achetable(cle, o.facturation) }),
    };
  });
}

/** Le forfait dont un espace lit les recharges V2 · un abonné V2 le sien, sinon aucun (il garde les recharges d'aujourd'hui). */
export function forfaitRechargesV2(plan: string): CleForfaitV2 | null {
  return estForfaitV2(plan) ? plan : null;
}

/** La FAQ de la page V2 · au barème V2 réel. */
export function faqForfaitsV2(): Array<{ question: string; reponse: string }> {
  const b = BAREME_V2;
  return [
    { question: 'Que deviennent mes crédits non utilisés ?', reponse: 'Les crédits du forfait sont remis à niveau à chaque échéance mensuelle. Les crédits achetés en recharge restent, sans date limite.' },
    { question: 'Puis-je changer de forfait à tout moment ?', reponse: 'Oui, sans engagement, depuis « Gérer mon abonnement » : le portail de paiement sécurisé gère le changement de forfait et la résiliation.' },
    { question: 'Comment sont comptés les crédits ?', reponse: `${b.image} crédits pour une image, ${b.video} pour 5 secondes de vidéo, ${b.jarvis_message} au plus pour un message à Jarvis. Chaque prix est annoncé avant le clic.` },
  ];
}
