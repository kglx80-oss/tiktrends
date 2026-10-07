/**
 * Consulter n'écrit rien · les règles qui bornent ce qu'une LECTURE a le droit
 * de demander (BASE-03 du cahier Studios v1.0).
 *
 * Module pur · ni base, ni réseau, ni modèle. Importé par chemin
 * (`@tiktrends/core/src/lectures-pures`) pour ne pas toucher l'index du noyau
 * pendant le chantier L0.
 *
 * ── Le défaut que ça borne (#125) ────────────────────────────────────────────
 *
 * `GET /api/ad/<id>?r=` acceptait n'importe quelle valeur. Le ratio n'était
 * filtré que pour les DIMENSIONS ; la clé de cache, elle, recopiait la valeur
 * brute. `?r=a`, `?r=b`, `?r=c`... produisaient chacun une composition
 * satori de plusieurs secondes, un objet dans le bucket et une entrée de plus
 * dans la ligne de la génération · une croissance sans borne qu'un simple
 * membre de l'espace pouvait provoquer.
 */

/** Les ratios que l'écran demande réellement · `AdsStudio` n'en propose pas d'autre. */
export const RATIOS_RENDU = ['4:5', '1:1', '9:16'] as const;
export type RatioRendu = (typeof RATIOS_RENDU)[number];

export type DemandeRendu =
  | { ok: true; ratio: RatioRendu | null; vignette: boolean }
  | { ok: false; raison: string };

/**
 * Lit `?r=` et `?t=` d'une demande de rendu · refuse tout ce qui n'est pas connu.
 *
 * - `r` absent ou vide · le format de la recette (`ratio: null`), comme avant.
 * - `t` absent, vide ou `0` · plein format ; `1` · vignette.
 *
 * Refuser plutôt que retomber sur le défaut : un repli silencieux servirait une
 * image qu'on n'a pas demandée sous une adresse qui en promet une autre, et
 * chaque valeur inventée resterait un rendu de plus.
 */
export function lireDemandeRendu(r: string | null | undefined, t: string | null | undefined): DemandeRendu {
  const ratio = r ?? '';
  if (ratio !== '' && !(RATIOS_RENDU as readonly string[]).includes(ratio)) {
    return { ok: false, raison: `Ratio inconnu · attendu ${RATIOS_RENDU.join(', ')}.` };
  }
  const vignette = t ?? '';
  if (vignette !== '' && vignette !== '0' && vignette !== '1') {
    return { ok: false, raison: 'Paramètre de vignette inconnu · attendu 1 ou 0.' };
  }
  return { ok: true, ratio: ratio === '' ? null : (ratio as RatioRendu), vignette: vignette === '1' };
}
