import { BrandTile } from './BrandIcons';

/**
 * Une carte du catalogue de connecteurs · ceux qui ne sont pas encore branchables.
 *
 * ── Pourquoi ça mérite un composant ──────────────────────────────────────────
 *
 * Le catalogue affichait une cinquantaine de connecteurs, chacun avec un bouton
 * « + Connecter » désactivé. Un bouton grisé n'annonce pas une feuille de route ·
 * il se lit comme cinquante boutons cassés. Personne ne survole pour lire le
 * `title` qui disait « bientôt ». La promesse (« on branchera tout ça ») était
 * là, mais rendue sur le ton d'une panne.
 *
 * On remplace le bouton mort par un statut clair · « Bientôt ». Pas un geste
 * refusé, une intention affichée. La carte devient vendeuse au lieu d'inquiéter.
 */

export interface ConnecteurAVenir {
  name: string;
  color: string;
  glyph: string;
  /** Meta Ads, TikTok Ads · en tête de la feuille de route. */
  priority?: boolean;
}

export function ConnecteurBientot({ c }: { c: ConnecteurAVenir }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '12px 14px' }}>
      <BrandTile name={c.name} color={c.color} glyph={c.glyph} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
        {c.priority && <div style={{ fontSize: 11, color: 'var(--accent-strong)', fontWeight: 600 }}>Prioritaire</div>}
      </div>
      {/* Un statut, pas un bouton · rien à cliquer, donc rien qui promette un clic. */}
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '.04em', padding: '4px 10px', borderRadius: 999,
        color: 'var(--ink-2)', background: 'var(--paper)', border: '1px solid var(--line-2)', whiteSpace: 'nowrap',
      }}>
        Bientôt
      </span>
    </div>
  );
}
