import { getSession } from '../../../../lib/auth';
import { canAccess, FEATURES } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { MarketPanel } from '../MarketPanel';

/**
 * La mémoire marché de Jarvis · à sa destination, la Veille.
 *
 * ── Pourquoi ici ─────────────────────────────────────────────────────────────
 *
 * « Ce que fait le marché » décrit les créas des concurrents avec la même grille
 * que les tiennes · c'est exactement le prolongement de la Veille (la
 * bibliothèque concurrentielle) : on cherche des pubs qui tournent au-dessus, on
 * lit ce que le marché en fait ici, sous la même toiture (direction validée).
 *
 * ── Ce qui ne bouge pas ──────────────────────────────────────────────────────
 *
 * La mémoire marché reste derrière l'offre Plus (`adsmap`) · un compte qui n'y
 * avait pas droit ne la voit pas apparaître parce qu'elle a changé de page. Sans
 * accès ni marque active, la section ne rend RIEN. Même composant, même action,
 * même barrière de dépense sur « Apprendre des marques suivies ».
 */
const adsmap = FEATURES.find((f) => f.key === 'adsmap')!;

export async function SectionMarche() {
  const s = await getSession();
  if (!s) return null;
  if (!canAccess(effectiveAccess(s), adsmap)) return null;
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return null;

  return (
    <section aria-label="Mémoire marché de Jarvis" style={{ marginTop: 30, borderTop: '1px solid var(--line)', paddingTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Mémoire marché de Jarvis</h2>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--muted)', maxWidth: 760, lineHeight: 1.55 }}>
        Ce que Jarvis a retenu des créas concurrentes que tu suis · décrit avec la même grille que les
        tiennes, et confronté à tes propres chiffres.
      </p>
      <MarketPanel />
    </section>
  );
}
