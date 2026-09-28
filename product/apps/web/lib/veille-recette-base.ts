import 'server-only';

/**
 * Base de source ALTERNATIVE, réservée à la recette locale.
 *
 * ── Pourquoi une garde stricte, et pas un simple passthrough ──────────────────
 *
 * La recette visuelle de /veille a besoin d'une source qui réponde en local (un
 * mock qui sert des créas de démonstration avec des médias locaux). Exposer une
 * variable « base URL » lue partout en production élargirait le périmètre d'une
 * PR visuelle · un opérateur pourrait rediriger la vraie source vers un hôte
 * arbitraire. On refuse ça · trois verrous cumulés, chacun bloquant :
 *
 *  1. JAMAIS en production (`NODE_ENV === 'production'` → rien).
 *  2. Opt-in EXPLICITE · sans `VEILLE_RECETTE=1`, rien.
 *  3. Hôte LOOPBACK uniquement · 127.0.0.1 / localhost / ::1 · un hôte distant
 *     est refusé, donc aucune vraie clé n'est jamais dirigée vers un tiers par
 *     ce chemin.
 *
 * Hors recette, la fonction renvoie `undefined` et l'intégration retombe sur son
 * URL par défaut · le comportement de production ne change pas.
 */
export function baseUrlRecette(): string | undefined {
  // 1. Jamais en production.
  if (process.env.NODE_ENV === 'production') return undefined;
  // 2. Opt-in explicite.
  if (process.env.VEILLE_RECETTE !== '1') return undefined;
  const url = process.env.TRENDTRACK_BASE_URL;
  if (!url) return undefined;
  // 3. Hôte loopback uniquement.
  let h: URL;
  try { h = new URL(url); } catch { return undefined; }
  const host = h.hostname.replace(/^\[|\]$/g, ''); // dénude un IPv6 littéral
  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!loopback) return undefined;
  return url;
}
