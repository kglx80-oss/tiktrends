/**
 * V5 · A4a · la bascule sombre / clair / auto, côté client.
 *
 * La règle (cookie, valeurs, défaut, durée, résolution d'« auto ») vit dans le
 * noyau (`@tiktrends/core` · `themes.ts`). Le layout racine la lit AU RENDU
 * SERVEUR et pose `data-theme` (et `data-theme-pref`) sur `<html>` dès le
 * premier octet · aucun flash ; en « auto », son script de `<head>`
 * (`scriptThemeAuto`) résout le thème avant la peinture et suit l'appareil. Ce
 * module ne fait que le geste client · poser le cookie (pour les prochains
 * rendus serveur), la préférence et le thème résolu (pour l'écran tout de
 * suite) et la couleur de la barre du navigateur.
 *
 * Branché par la coquille (pop-up profil, palette ⌘K) et les Réglages
 * (section « Apparence ») · `ChoixTheme`, `Palette`.
 * Aucun `router.refresh()` n'est nécessaire · rien d'autre que `<html>` et la
 * barre du navigateur ne dépend du thème côté serveur.
 */
import {
  ATTRIBUT_PREFERENCE_THEME, ATTRIBUT_THEME, COULEUR_BARRE, MEDIA_SYSTEME_CLAIR,
  preferenceDepuisCookie, themeCookieString, themeDepuisCookie, themeOppose, themeResolu,
  type PreferenceTheme, type Theme,
} from '@tiktrends/core';

/** Le thème actuellement posé sur `<html>` · même règle que le cookie
 *  (seul « clair » vaut clair). */
export function themeCourant(doc: Document = document): Theme {
  return themeDepuisCookie(doc.documentElement.getAttribute(ATTRIBUT_THEME));
}

/** La préférence posée sur `<html>` · `data-theme-pref`, sinon le thème posé. */
export function preferenceCourante(doc: Document = document): PreferenceTheme {
  const r = doc.documentElement;
  return preferenceDepuisCookie(r.getAttribute(ATTRIBUT_PREFERENCE_THEME) ?? r.getAttribute(ATTRIBUT_THEME));
}

/** L'appareil est-il réglé en clair ? · faux sans `matchMedia`. */
function systemeClair(doc: Document): boolean {
  try { return doc.defaultView?.matchMedia?.(MEDIA_SYSTEME_CLAIR).matches === true; } catch { return false; }
}

/** Pose une préférence · cookie d'un an, préférence et thème résolu sur
 *  `<html>`, barre du navigateur (`barres` · la couleur de chaque thème, celles
 *  de l'ancienne interface par défaut, `COULEUR_BARRE_SPATIALE` sous Spatial).
 *  Rend la préférence posée. En « auto », le changement de réglage de
 *  l'appareil est suivi par le script du layout racine. */
export function appliquerTheme(p: PreferenceTheme, doc: Document = document, barres: Record<Theme, string> = COULEUR_BARRE): PreferenceTheme {
  try { doc.cookie = themeCookieString(p); } catch { /* cookie indisponible · l'écran bascule quand même */ }
  const theme = themeResolu(p, systemeClair(doc));
  doc.documentElement.setAttribute(ATTRIBUT_PREFERENCE_THEME, p);
  doc.documentElement.setAttribute(ATTRIBUT_THEME, theme);
  doc.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', barres[theme]));
  return p;
}

/** Passe à l'autre thème et rend celui qui est désormais posé. */
export function basculerTheme(doc: Document = document): Theme {
  const t = themeOppose(themeCourant(doc));
  appliquerTheme(t, doc);
  return t;
}
