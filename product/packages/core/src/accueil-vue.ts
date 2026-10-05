/**
 * L'Accueil réunit le Pilotage · lot 19A.
 *
 * ── Ce que le propriétaire a demandé ─────────────────────────────────────────
 *
 * « Regrouper Pilotage dans Accueil et intégrer Analytics à Accueil », sans
 * simple raccourci, sans doublon de calcul, sans perte de capacité. L'Accueil
 * (`/dashboard`) porte donc deux VUES · l'Accueil d'aujourd'hui (défaut) et
 * l'Analytics complet (`?vue=analytics`), rendu par les mêmes composants et les
 * mêmes calculs qu'avant. `/analytics` reste une route valide · elle redirige
 * vers la vue, paramètres compris.
 *
 * ── Ce que ce module décide ──────────────────────────────────────────────────
 *
 *  1. QUELLE vue, à partir de quels paramètres · seule la valeur exacte
 *     `analytics` (première occurrence) ouvre l'Analytics · toute autre valeur,
 *     absente ou inconnue, retombe sur l'Accueil d'aujourd'hui.
 *  2. Pour QUEL rôle · le sélecteur n'existe que si le rôle ouvre la rubrique
 *     Analytics (la même matrice que le rail, `cheminOuvert`). Un rôle qui ne
 *     l'ouvre pas ne voit AUCUN sélecteur · son Accueil est rendu à l'identique.
 *  3. Les adresses · chaque onglet ne change QUE `vue` · les autres paramètres
 *     traversent, dans leur ordre. La redirection de `/analytics` fait de même.
 *
 * ── Ce qu'il NE fait PAS ─────────────────────────────────────────────────────
 *
 * Il n'invente aucun refus. `/analytics` n'a jamais porté de garde de rôle
 * (seule la session était exigée · le rail taisait l'entrée, la page s'ouvrait
 * quand même à l'adresse tapée). `?vue=analytics` rend donc exactement ce que
 * ce rôle obtenait avant sur `/analytics` · la vue, sans onglet. Les droits ne
 * bougent pas ; ce module ne protège rien.
 *
 * Le fragment (`#…`) n'est pas un paramètre · le serveur ne le reçoit jamais.
 * Le navigateur le reporte de lui-même sur la cible d'une redirection qui n'en
 * porte pas (RFC 9110 §10.2.2) · `/analytics#attribution` arrive donc sur
 * `/dashboard?vue=analytics#attribution`, où la même ancre existe.
 *
 * Pur · ni base, ni réseau, ni navigateur.
 */

export type VueAccueil = 'accueil' | 'analytics';

/** Le paramètre de requête qui porte la vue · réservé à l'Accueil. */
export const PARAM_VUE_ACCUEIL = 'vue';

/** La route de l'Accueil · celle qui porte les vues. */
export const CHEMIN_ACCUEIL = '/dashboard';

/** La rubrique dont le rôle doit disposer pour voir le sélecteur (matrice du rail). */
export const RUBRIQUE_ANALYTICS = '/analytics';

/** Les vues, dans l'ordre du sélecteur · l'Accueil d'abord, c'est le défaut. */
export const VUES_ACCUEIL: ReadonlyArray<{ vue: VueAccueil; libelle: string }> = [
  { vue: 'accueil', libelle: 'Accueil' },
  { vue: 'analytics', libelle: 'Analytics' },
];

/** Les paramètres tels que Next les livre à une page (`searchParams` résolu). */
export type ParamsRequete = Readonly<Record<string, string | readonly string[] | undefined>>;

/** Les paires clé/valeur, dans l'ordre reçu · une clé répétée garde chaque valeur. */
function paires(params: ParamsRequete): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (typeof v === 'string') out.push([k, v]);
    else for (const x of v) out.push([k, x]);
  }
  return out;
}

/** La vue demandée · `analytics` seulement si c'est la PREMIÈRE valeur de `vue`. */
export function lireVueAccueil(params: ParamsRequete): VueAccueil {
  const v = params[PARAM_VUE_ACCUEIL];
  const premiere = typeof v === 'string' ? v : v?.[0];
  return premiere === 'analytics' ? 'analytics' : 'accueil';
}

/**
 * L'adresse d'une vue · `vue` en tête (absent pour l'Accueil, qui garde son URL
 * nue), puis tous les autres paramètres, dans leur ordre, valeurs répétées
 * comprises. Une `vue` reçue est remplacée, jamais doublée.
 */
export function hrefVueAccueil(vue: VueAccueil, params: ParamsRequete = {}): string {
  const p = new URLSearchParams();
  if (vue !== 'accueil') p.append(PARAM_VUE_ACCUEIL, vue);
  for (const [k, v] of paires(params)) if (k !== PARAM_VUE_ACCUEIL) p.append(k, v);
  const s = p.toString();
  return s ? `${CHEMIN_ACCUEIL}?${s}` : CHEMIN_ACCUEIL;
}

/** La cible de l'ancienne route `/analytics` · la vue Analytics de l'Accueil, paramètres préservés. */
export function redirectionAnalytics(params: ParamsRequete = {}): string {
  return hrefVueAccueil('analytics', params);
}

export interface OngletAccueil {
  vue: VueAccueil;
  libelle: string;
  href: string;
  actif: boolean;
}

export interface ResolutionAccueil {
  /** La vue à rendre. */
  vue: VueAccueil;
  /** Le sélecteur · VIDE quand le rôle n'ouvre pas Analytics (aucun sélecteur à un seul choix). */
  onglets: OngletAccueil[];
}

/**
 * LA règle · quelle vue, quels onglets, pour ce rôle et ces paramètres.
 * `ouvert` est la lecture de la matrice des rôles (`cheminOuvert` sur les
 * ouvertures du rail) · un verrou de FORMULE n'est pas un refus de rôle.
 */
export function resoudreAccueil(p: { params: ParamsRequete; ouvert: (href: string) => boolean }): ResolutionAccueil {
  const vue = lireVueAccueil(p.params);
  const onglets = p.ouvert(RUBRIQUE_ANALYTICS)
    ? VUES_ACCUEIL.map((o) => ({ vue: o.vue, libelle: o.libelle, href: hrefVueAccueil(o.vue, p.params), actif: o.vue === vue }))
    : [];
  return { vue, onglets };
}
