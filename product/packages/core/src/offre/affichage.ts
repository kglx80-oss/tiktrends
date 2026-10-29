/**
 * L'offre · ce que le CLIENT lit d'un prix · toujours en crédits. Pur.
 *
 * Décision du 29/10, point 1 · plus aucun montant en euros ou en dollars côté
 * client, sauf le prix d'un forfait au moment de le choisir et celui d'une
 * recharge au moment de l'acheter. Le dollar reste au serveur (plafond interne
 * `sousPlafond`) et à l'Admin (coût réel).
 *
 * Un appel IA qui ne débite aucun crédit aujourd'hui le DIT (« inclus »), il ne
 * se tait pas · le jour où il est facturé (interrupteur `TARIFS_V2`), la même
 * mention porte son prix en crédits, annoncé avant le clic.
 */

/** « 1 crédit », « 40 crédits », « 20 000 crédits » · séparateur français. */
export function formatCredits(n: number): string {
  const v = Math.max(0, Math.round(n));
  return `${v.toLocaleString('fr-FR')} crédit${v > 1 ? 's' : ''}`;
}

/** Un appel inclus · aucun crédit débité. */
export const MENTION_INCLUS = 'Inclus · aucun crédit débité';

/**
 * La mention d'un appel IA AVANT le clic · `credits` null = inclus (aucun
 * débit), sinon le prix en crédits, borné (« au plus » : une borne réservée,
 * le non-consommé rendu).
 */
export function mentionAppelIA(credits: number | null, o: { auPlus?: boolean } = {}): string {
  if (credits === null || credits <= 0) return `Appel IA · ${MENTION_INCLUS.toLowerCase()}`;
  return `Appel IA · ${formatCredits(credits)}${o.auPlus === false ? '' : ' au plus'}`;
}

/** La phrase sous le total d'un devis Studios · ce que les crédits deviennent. */
export function phraseCreditsDevis(credits: number): string {
  return credits > 0
    ? 'Réservés à l’approbation, rendus s’ils ne sont pas consommés'
    : 'Aucun crédit débité · le devis reste à approuver';
}

/** La case du contrôle visuel · le prix dit AVANT le clic, en crédits. */
export function libelleCaseControleVisuel(creditsParImage: number | null): string {
  return creditsParImage === null || creditsParImage <= 0
    ? 'Contrôle visuel de l’image livrée · inclus, aucun crédit débité · décocher pour s’en passer'
    : `Contrôle visuel de l’image livrée · ${formatCredits(creditsParImage)} au plus par image, ajoutés au devis · décocher pour s’en passer`;
}

/** Le radar Adsmap · combien de créas il décrit au plus par nuit, et ce que cela coûte. */
export function mentionRadar(analysesParNuit: number, creditsParAnalyse: number | null): { parNuit: string; bouton: string } {
  const n = Math.max(0, Math.round(analysesParNuit));
  const creas = `${n.toLocaleString('fr-FR')} créa${n > 1 ? 's' : ''}`;
  if (creditsParAnalyse === null || creditsParAnalyse <= 0) {
    return { parNuit: `Jusqu’à ${creas} décrite${n > 1 ? 's' : ''} par nuit · ${MENTION_INCLUS.toLowerCase()}`, bouton: '' };
  }
  const total = formatCredits(n * creditsParAnalyse);
  return { parNuit: `Jusqu’à ${creas} décrite${n > 1 ? 's' : ''} par nuit · ${total} au plus par nuit`, bouton: ` · au plus ${total} par nuit` };
}
