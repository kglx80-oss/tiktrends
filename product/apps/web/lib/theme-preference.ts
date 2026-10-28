/**
 * V5 · A4a · la bascule clair / sombre, côté client.
 *
 * La règle (cookie, valeurs, défaut, durée) vit dans le noyau
 * (`@tiktrends/core` · `themes.ts`). Le layout racine la lit AU RENDU SERVEUR
 * et pose `data-theme` sur `<html>` dès le premier octet · aucun flash. Ce
 * module ne fait que le geste client · poser le cookie (pour les prochains
 * rendus serveur), l'attribut (pour l'écran tout de suite) et la couleur de la
 * barre du navigateur.
 *
 * Branché par la coquille (commande « Thème » du profil, P02) ·
 *   import { basculerTheme } from '../lib/theme-preference';
 *   <button onClick={() => basculerTheme()}>…</button>
 * Aucun `router.refresh()` n'est nécessaire · rien d'autre que `<html>` et la
 * barre du navigateur ne dépend du thème côté serveur.
 */
import { ATTRIBUT_THEME, COULEUR_BARRE, themeCookieString, themeDepuisCookie, themeOppose, type Theme } from '@tiktrends/core';

/** Le thème actuellement posé sur `<html>` · même règle que le cookie
 *  (seul « clair » vaut clair). */
export function themeCourant(doc: Document = document): Theme {
  return themeDepuisCookie(doc.documentElement.getAttribute(ATTRIBUT_THEME));
}

/** Pose un thème · cookie d'un an, attribut sur `<html>`, barre du navigateur
 *  (`barres` · la couleur de chaque thème, celles de l'ancienne interface par
 *  défaut, `COULEUR_BARRE_SPATIALE` sous Spatial). Rend le thème posé. */
export function appliquerTheme(theme: Theme, doc: Document = document, barres: Record<Theme, string> = COULEUR_BARRE): Theme {
  try { doc.cookie = themeCookieString(theme); } catch { /* cookie indisponible · l'écran bascule quand même */ }
  doc.documentElement.setAttribute(ATTRIBUT_THEME, theme);
  doc.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', barres[theme]));
  return theme;
}

/** Passe à l'autre thème et rend celui qui est désormais posé. */
export function basculerTheme(doc: Document = document): Theme {
  return appliquerTheme(themeOppose(themeCourant(doc)), doc);
}
