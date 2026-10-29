/**
 * L'offre · la bascule des abonnés actuels vers l'offre V2, à leur échéance
 * (décision du 29/10, point 5). Pur.
 *
 * Un abonné Core, Plus ou Business garde son prix ET ses droits jusqu'à sa
 * prochaine échéance · aucun droit acquis n'est retiré avant. À l'échéance,
 * il passe à l'équivalent (Core → Essentiel, Plus → Pro, Business → Agence).
 * Le préavis s'affiche dans Réglages · Forfaits dès que `TARIFS_V2` est posé.
 *
 * Starter (gratuit, sans abonnement) n'a pas d'équivalent payant · il n'est
 * PAS basculé ici (proposition dans la PR, non appliquée).
 */
import { droitsDuForfait, lignesDroits } from './droits';
import { BASCULE_FORFAIT_V2, FORFAITS_ACTUELS, FORFAITS_V2, type CleForfaitV2 } from './forfaits';

export interface PreavisBascule {
  depuis: 'core' | 'plus' | 'business';
  vers: CleForfaitV2;
  titre: string;
  texte: string;
  /** Ce que le forfait d'arrivée ouvre · les lignes de droits réelles. */
  droits: string[];
}

const DATE_FR = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

export function forfaitApresEcheance(plan: string | null | undefined): CleForfaitV2 | null {
  return plan === 'core' || plan === 'plus' || plan === 'business' ? BASCULE_FORFAIT_V2[plan] : null;
}

/** Le préavis d'un abonné actuel · `null` sans `TARIFS_V2`, sans abonnement, ou hors Core/Plus/Business. */
export function preavisBascule(o: { plan: string | null | undefined; tarifsV2: boolean; abonne: boolean; finPeriode: Date | null }): PreavisBascule | null {
  const vers = forfaitApresEcheance(o.plan);
  if (!o.tarifsV2 || !o.abonne || !vers) return null;
  const depuis = o.plan as 'core' | 'plus' | 'business';
  const a = FORFAITS_ACTUELS[depuis], b = FORFAITS_V2[vers];
  const quand = o.finPeriode ? `jusqu’au ${DATE_FR(o.finPeriode)}` : 'jusqu’à ta prochaine échéance';
  return {
    depuis, vers,
    titre: `Ton forfait ${a.libelle} évolue à ta prochaine échéance`,
    texte: `Ton forfait ${a.libelle} est conservé tel quel, prix et droits compris, ${quand}. Ensuite, il passe au forfait ${b.libelle} · ${b.prixMensuelTtc.toLocaleString('fr-FR')} € par mois TTC, ${b.creditsMois.toLocaleString('fr-FR')} crédits par mois. Rien à faire de ton côté · tu peux changer de forfait ou résilier avant depuis « Gérer mon abonnement ».`,
    droits: lignesDroits(droitsDuForfait(vers)),
  };
}
