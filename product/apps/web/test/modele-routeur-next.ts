/**
 * Modèle FIDÈLE du patch d'historique de Next 15.5 (app-router.js) · un
 * `replaceState` dont l'état porte `__NA` passe sans synchroniser le routeur ;
 * sinon le routeur adopte l'URL (canonique). Après une action serveur qui
 * revalide, le routeur réécrit l'URL depuis SA canonique (`reecrire`).
 */
export function installerModeleRouteurNext() {
  const origine = window.history.replaceState.bind(window.history);
  let canonique = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState = function (data: unknown, unused: string, url?: string | URL | null) {
    const interne = !!(data && typeof data === 'object' && (data as { __NA?: unknown }).__NA);
    if (!interne && url) canonique = String(url);
    return origine(data, unused, url);
  };
  return {
    canonique: () => canonique,
    reecrire: () => origine({ __NA: true }, '', canonique),
    desinstaller: () => { window.history.replaceState = origine; },
  };
}
