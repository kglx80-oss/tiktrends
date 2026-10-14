'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { breadcrumb, filEnTete, isBrandScoped } from '../lib/navigation';
import { CIBLE_TACTILE_MIN, CADRE_PAGE, gouttiereCss } from '@tiktrends/core';

/**
 * Le fil d'Ariane.
 *
 * ── Rendu UNE fois, dans la coquille ─────────────────────────────────────────
 *
 * Vingt et une pages portaient leur propre lien de retour, écrit à la main.
 * Vingt et une occasions de diverger, et elles avaient divergé. Ici le fil est
 * posé au-dessus du contenu par la coquille · une page nouvelle l'obtient sans
 * rien écrire, et ne peut pas l'écrire autrement.
 *
 * ── Ce qu'il n'affiche pas ───────────────────────────────────────────────────
 *
 * Rien, sur les racines de section. « Espace › Membres » au-dessus de l'écran
 * Membres occupe une ligne et n'apprend rien à personne · le rail montre déjà
 * où l'on est. Le fil sert quand on est DESCENDU quelque part.
 *
 * La seule exception est un écran qui dépend de la marque : là, le fil dit de
 * quelle marque on parle, et cette information-là manque vraiment.
 */
export function Breadcrumb({ brandName, brandId, brands = [], enTete = false }: {
  brandName: string | null;
  /**
   * V5 (H01) · le fil vit DANS l'en-tête (14 px, sans cadre de page) et nomme
   * aussi l'écran courant sur une racine (`filEnTete`). Faux · la rangée de page
   * d'avant (mobile, où l'en-tête n'a pas la place).
   */
  enTete?: boolean;
  brandId?: string | null;
  /** Toutes les marques du compte · sert à nommer la marque CONSULTÉE sur sa
   *  fiche (le fil doit dire la marque de l'URL, pas l'active). */
  brands?: Array<{ id: string; name: string }>;
}) {
  const pathname = usePathname() || '/';
  // Lot 19A · sur l'Accueil, la recherche choisit l'écran (`?vue=analytics`).
  const recherche = useSearchParams()?.toString() ?? '';
  const resolveBrand = (id: string) => brands.find((b) => b.id === id)?.name ?? null;
  const opts = { brandName, brandId, resolveBrand, brandScoped: isBrandScoped(pathname), recherche };
  const crumbs = enTete ? filEnTete(pathname, opts) : breadcrumb(pathname, opts);
  if (!crumbs.length) return null;
  const lienStyle = { display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, color: enTete ? 'var(--ink-2)' : 'var(--muted)', textDecoration: 'none', fontWeight: enTete ? 400 : 600, whiteSpace: enTete ? 'nowrap' : undefined } as const;

  return (
    <nav
      aria-label="Fil d’Ariane"
      data-zone={enTete ? 'fil-en-tete' : undefined}
      style={enTete ? {
        // V5 · dans la colonne gauche de l'en-tête · une ligne · si elle manque
        // de place, seul le dernier maillon se tronque (ellipse, nom complet au
        // titre de la page), les liens de remontée restent entiers.
        display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', fontSize: 14, lineHeight: 1.5,
      } : {
        // `position: relative` + `zIndex` · la marge basse négative fait remonter
        // le contenu de page de 8px SUR le fil · sans ça, il recouvrait le bas des
        // liens et interceptait une partie des clics (« on ne peut pas cliquer »).
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        // Sur l'axe du cadre de page (`CADRE_PAGE`) · même largeur, même
        // gouttière, centré comme le <main> · le premier maillon tombe
        // exactement au-dessus du titre. Mesuré avant (lot 19) · 36 px fixes
        // et 1320 non centré · le fil partait 24 px À GAUCHE du titre à 1440
        // et 4 px à DROITE à 1280.
        padding: `0 ${gouttiereCss()}`, margin: '18px auto -8px', maxWidth: CADRE_PAGE.largeurMax, boxSizing: 'border-box',
        fontSize: 12, lineHeight: 1.4,
      }}
    >
      {crumbs.map((c, i) => {
        const dernier = i === crumbs.length - 1;
        return (
          <span key={`${c.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: enTete ? 8 : 6, minWidth: 0, flexShrink: dernier ? 1 : 0 }}>
            {i > 0 && <span style={{ color: 'var(--line-2)' }} aria-hidden>›</span>}
            {c.href ? (
              // Même chemin, autre recherche (« Accueil » depuis la vue Analytics) ·
              // le routeur client ne termine pas cette transition (noyau
              // `chargementCompletRequis`) · le navigateur la fait. Même style.
              c.href.split('?')[0] === pathname ? (
                <a href={c.href} style={lienStyle}>
                  {c.label}
                </a>
              ) : (
              <Link href={c.href} style={lienStyle}>
                {c.label}
              </Link>
              )
            ) : (
              <span
                // Le dernier maillon est la page courante · on le dit aux
                // lecteurs d'écran plutôt que de le laisser deviner.
                aria-current={dernier ? 'page' : undefined}
                style={enTete
                  ? { color: dernier ? 'var(--ink)' : 'var(--ink-2)', fontWeight: dernier ? 500 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                  : { color: dernier ? 'var(--ink-2)' : 'var(--muted)', fontWeight: dernier ? 700 : 600 }}
              >
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
