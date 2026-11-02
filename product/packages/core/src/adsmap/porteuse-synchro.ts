/**
 * ADSMAP · sur quelle créa la synchro a-t-elle le droit d'écrire les mesures
 * d'une ad ?
 *
 * La synchro écrit l'instance de régie (dépense, ROAS, journées…) sur la créa
 * porteuse de l'ad. Le lien brut `ads.creative_id` peut pointer sur la créa
 * d'une AUTRE marque (import, ancienne donnée incohérente) · y écrire ferait
 * recevoir à cette marque les mesures d'une autre, et polluerait ses résultats
 * sans que personne ne le voie.
 *
 * Trois cas, et un seul autorise l'écriture telle quelle :
 *  - `propre`    · le lien pointe sur une créa de la marque (lue par la jointure
 *                  bornée) · on y écrit ;
 *  - `a_creer`   · pas de lien · la synchro crée la coquille DE LA MARQUE ;
 *  - `etrangere` · le lien pointe hors de la marque · on n'écrit RIEN sur cette
 *                  créa, et on ne réécrit pas le lien non plus (modifier la
 *                  donnée est une réparation, elle se décide ailleurs).
 */
export type PorteuseSynchro =
  | { cas: 'propre'; creativeId: string }
  | { cas: 'a_creer' }
  | { cas: 'etrangere'; creativeId: string };

/**
 * @param lien            `ads.creative_id` tel qu'il est en base (brut).
 * @param creaDeLaMarque  l'identifiant de la créa lu par la jointure BORNÉE à la
 *                        marque · `null` quand la créa liée est d'une autre marque.
 */
export function porteuseSynchro(lien: string | null, creaDeLaMarque: string | null): PorteuseSynchro {
  if (!lien) return { cas: 'a_creer' };
  if (creaDeLaMarque === lien) return { cas: 'propre', creativeId: lien };
  return { cas: 'etrangere', creativeId: lien };
}

/** La phrase du compte rendu de synchro · `null` quand aucune ad n'a été écartée. */
export function phraseCreasEtrangeres(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const ads = n === 1 ? '1 ad liée' : `${n} ads liées`;
  const ses = n === 1 ? 'ses mesures' : 'leurs mesures';
  return `${ads} à la créa d’une autre marque · ${ses} ne sont pas écrites sur cette créa, et le lien reste à réparer.`;
}
