import { MECHANISM_LABEL } from '../../adsmap/proposal-taxonomy';
import { HOOK_LABEL, OPENING_LABEL } from '../../adsmap/asset-taxonomy';

/**
 * Résultats · ce qu'un écran affiche d'une valeur machine. Vu au banc riche
 * (27/10) : la carte (« · problem_agitate »), le radar (« la mécanique ·
 * before_after ») et la fiche d'un test (« 41.9 % ») montraient la valeur brute.
 * Pur.
 */

const LIBELLES: Readonly<Record<string, string>> = { ...HOOK_LABEL, ...OPENING_LABEL, ...MECHANISM_LABEL };

/** Le libellé d'un mécanisme d'angle, d'un type d'ouverture ou d'accroche · un code inconnu perd ses tirets bas, jamais affiché tel quel. */
export function libelleMecanique(code: string | null | undefined): string | null {
  if (!code || !code.trim()) return null;
  const c = code.trim();
  return Object.prototype.hasOwnProperty.call(LIBELLES, c) ? LIBELLES[c]! : c.replace(/_+/g, ' ');
}

/** Un taux (0..1) en pourcentage à la française, une décimale · `absent` quand il n'y a pas de mesure. */
export function pourcentFr(v: number | null | undefined, absent: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return absent;
  return `${(v * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
