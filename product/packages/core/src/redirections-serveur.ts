/**
 * Les redirections SERVEUR · adresses retirées dont la destination ne dépend
 * que du chemin et des paramètres de l'adresse (ni session, ni marque, ni rôle).
 *
 * Pur · ni base, ni réseau. Lu par `apps/web/middleware.ts`.
 *
 * ── Le défaut réparé ─────────────────────────────────────────────────────────
 *
 * Mesuré en build de production locale · une PAGE sous `(app)` qui appelle
 * `redirect()` passe par la coquille et son `loading.tsx` · le flux est déjà
 * parti quand la redirection est levée · la réponse sort en `200` avec
 * `NEXT_REDIRECT;replace;<cible>;307;` et un `<meta http-equiv="refresh">`.
 * Au navigateur, le routeur Next bascule en navigation complète en pleine
 * hydratation et React lève l'erreur #310 · « Application error » s'affiche
 * jusqu'au rechargement. Servies ici, depuis le middleware, AVANT tout rendu,
 * ces adresses répondent une vraie 307 HTTP.
 *
 * ── Ce qui N'EST PAS ici ─────────────────────────────────────────────────────
 *
 * Les redirections CONDITIONNELLES (session, marque active, rôle, formule)
 * restent dans leurs pages · le middleware ne lit ni la base ni la session, et
 * aucune règle d'accès n'est dupliquée. `/analytics` est déjà une 307 (route
 * handler, `redirectionAnalytics`).
 *
 * Mesuré en build de production locale (`/adsmap/tri`, aucune marque active) ·
 * déplacer le contrôle dans un `layout.tsx` de segment ne suffit pas (toujours
 * `200` + `NEXT_REDIRECT`), même en retirant `(app)/loading.tsx` · la coquille
 * enveloppe toute page dans une frontière Suspense (`AppShell`), sous laquelle
 * aucune redirection n'est une 307. Seul `(app)/layout.tsx`, hors de ces
 * frontières, émet une vraie 307 (son renvoi vers `/login`).
 *
 * Les pages `redirect()` de ces adresses restent en FILET (même règle, même
 * cible) si le middleware venait à ne pas tourner. Depuis le retrait de
 * l'ancienne interface, celles des Studios vivent HORS coquille
 * (`app/studio/…`, aucun layout ni `loading.tsx`) · celle de `/adsmap/jarvis`
 * est la page Spatiale. Garde `middleware-redirections` · chaque adresse, sa
 * cible exacte, page et middleware d'accord.
 */

import { destinationAncienneAdresse } from './studios/anciennes-adresses';

/** Les paramètres d'une adresse, dans la forme que Next donne à une page (valeurs répétées en tableau). */
export type ParamsAdresse = Record<string, string | string[] | undefined>;

/** Ancien écran Jarvis d'Adsmap · réuni à `/jarvis` (la page `adsmap/jarvis` le disait déjà). */
export const CHEMIN_JARVIS = '/jarvis';

/**
 * Chaque adresse servie en 307 par le middleware, et sa cible. L'ordre et la
 * liste font foi · le `matcher` du middleware doit les couvrir TOUTES (un test
 * le vérifie avec le vrai appariement de Next), et rien d'autre.
 */
export const REDIRECTIONS_SERVEUR: Readonly<Record<string, (p: ParamsAdresse) => string>> = {
  // Anciennes adresses de création (retrait des studios, 10/10) · contexte repris.
  '/studio': (p) => destinationAncienneAdresse('/studio', p),
  '/studio/ads': (p) => destinationAncienneAdresse('/studio/ads', p),
  '/studio/image': (p) => destinationAncienneAdresse('/studio/image', p),
  '/studio/video': (p) => destinationAncienneAdresse('/studio/video', p),
  '/studio/textes': (p) => destinationAncienneAdresse('/studio/textes', p),
  // Ancien écran Jarvis sous Adsmap · la page ne reprenait aucun paramètre.
  '/adsmap/jarvis': () => CHEMIN_JARVIS,
};

export const CHEMINS_REDIRIGES_SERVEUR = Object.keys(REDIRECTIONS_SERVEUR);

/** Une recherche brute (`?a=1&a=2`) dans la forme que Next donne à une page · `{ a: ['1', '2'] }`. */
export function paramsDepuisRecherche(recherche: string | URLSearchParams): ParamsAdresse {
  const sp = typeof recherche === 'string' ? new URLSearchParams(recherche.startsWith('?') ? recherche.slice(1) : recherche) : recherche;
  const p: ParamsAdresse = {};
  for (const [k, v] of sp) {
    const deja = p[k];
    p[k] = deja === undefined ? v : Array.isArray(deja) ? [...deja, v] : [deja, v];
  }
  return p;
}

/**
 * La cible d'une adresse retirée, ou `null` quand le chemin n'en est pas une
 * (la requête passe alors inchangée). La cible est un chemin RELATIF du même
 * site · jamais un hôte, jamais une adresse retirée (aucune boucle).
 */
export function redirectionServeur(chemin: string, recherche: string | URLSearchParams = ''): string | null {
  const regle = Object.prototype.hasOwnProperty.call(REDIRECTIONS_SERVEUR, chemin) ? REDIRECTIONS_SERVEUR[chemin] : undefined;
  return regle ? regle(paramsDepuisRecherche(recherche)) : null;
}
