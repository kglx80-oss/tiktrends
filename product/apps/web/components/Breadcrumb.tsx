'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { breadcrumb, isBrandScoped } from '../lib/navigation';

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
export function Breadcrumb({ brandName }: { brandName: string | null }) {
  const pathname = usePathname() || '/';
  const crumbs = breadcrumb(pathname, { brandName, brandScoped: isBrandScoped(pathname) });
  if (!crumbs.length) return null;

  return (
    <nav
      aria-label="Fil d’Ariane"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '0 36px', margin: '18px 0 -8px', maxWidth: 1320,
        fontSize: 12, lineHeight: 1.4,
      }}
    >
      {crumbs.map((c, i) => {
        const dernier = i === crumbs.length - 1;
        return (
          <span key={`${c.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ color: 'var(--line-2)' }} aria-hidden>›</span>}
            {c.href ? (
              <Link href={c.href} style={{ color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>
                {c.label}
              </Link>
            ) : (
              <span
                // Le dernier maillon est la page courante · on le dit aux
                // lecteurs d'écran plutôt que de le laisser deviner.
                aria-current={dernier ? 'page' : undefined}
                style={{ color: dernier ? 'var(--ink-2)' : 'var(--muted)', fontWeight: dernier ? 700 : 600 }}
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
