/**
 * Consulter n'écrit rien · les règles qui bornent ce qu'une LECTURE a le droit
 * de demander (BASE-03 du cahier Studios v1.0).
 *
 * Module pur · ni base, ni réseau, ni modèle. Exporté par `@tiktrends/core`.
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

/**
 * Les pays que la Veille propose · la liste de l'écran `/veille`, recopiée ici
 * pour borner ce qui a le droit d'être rangé.
 */
export const PAYS_VEILLE = ['FR', 'BE', 'CH', 'DE', 'ES', 'IT', 'GB', 'NL', 'PT', 'US', 'CA'] as const;

/**
 * « Ce qui scale » peut-il ranger cette recherche dans le cache PERSISTANT ?
 *
 * ── Pourquoi un cache rangé au rendu reste toléré, et à quelle condition ─────
 *
 * Le cache (`app_settings`, clé `veille:<pays>:<niche>`) n'est pas une donnée
 * métier · c'est la copie, partagée entre espaces, d'une réponse du fournisseur
 * de veille, datée, régénérable, sans effet sur ce qu'un client possède. Il
 * existe pour NE PAS repayer le fournisseur à chaque visite. Le supprimer au
 * nom de « consulter n'écrit rien » ferait payer chaque consultation.
 *
 * Mais il n'était pas borné · chaque `?q=` inventé ajoutait une ligne de cent
 * créas. On ne range donc plus que l'ensemble FINI des niches proposées à
 * l'écran (dont la niche par défaut), dans les pays proposés : au plus
 * `niches × pays` lignes, réécrites au plus toutes les six heures. Une
 * recherche libre passe par le cache mémoire, borné lui aussi.
 */
export function veillePersistable(pays: string, niche: string, nichesProposees: readonly string[]): boolean {
  const p = pays.trim().toUpperCase();
  const n = niche.trim().toLowerCase();
  if (!(PAYS_VEILLE as readonly string[]).includes(p)) return false;
  return nichesProposees.some((x) => x.trim().toLowerCase() === n);
}
