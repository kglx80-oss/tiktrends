'use client';

/**
 * Proposer le partage au bon moment · quand une créa vient de gagner.
 *
 * ── Pourquoi ici ─────────────────────────────────────────────────────────────
 *
 * Le partage au client (carte en marque blanche) vivait uniquement en haut de
 * la carte · un bouton toujours là, jamais rappelé au moment qui compte. Or le
 * moment où l'agence a envie de montrer un résultat, c'est quand une créa gagne.
 * On pose donc l'invitation dans le panneau d'arbitrage, sur le verdict gagnant.
 *
 * ── Découplé du panneau de partage ───────────────────────────────────────────
 *
 * Le panneau de partage (`SharePanel`) n'est monté qu'à côté, en haut de la
 * carte, et il tire des actions serveur. Plutôt que de le remonter dans le
 * drawer (et d'y traîner ses imports serveur), on lance un événement · le
 * `ShareButton` l'écoute et ouvre le panneau. Ce composant-ci ne dépend de rien
 * de serveur · il reste rendable et testable.
 *
 * ── Jamais un bouton muet ────────────────────────────────────────────────────
 *
 * Le panneau de partage n'existe que pour un admin (l'action de création est
 * réservée). Proposer « Partager » à qui ne le peut pas ouvrirait sur rien · on
 * n'affiche donc l'invite que quand `peutPartager` est vrai.
 */

/** Événement d'ouverture du partage · lancé ici, écouté par le `ShareButton`. */
export const OUVRIR_PARTAGE = 'tt:ouvrir-partage';

export function PartageGagnante({ gagnante, peutPartager }: { gagnante: boolean; peutPartager: boolean }) {
  if (!gagnante || !peutPartager) return null;
  return (
    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(126,232,191,.35)', background: 'rgba(126,232,191,.07)' }}>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
        Cette créa gagne · montre le résultat au client. La carte partagée n’expose que ce qui a été testé et ce qui a gagné, en marque blanche · jamais l’outil.
      </div>
      <button
        type="button"
        onClick={() => { try { window.dispatchEvent(new CustomEvent(OUVRIR_PARTAGE)); } catch { /* pas de fenêtre */ } }}
        style={{ marginTop: 9, padding: '8px 15px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}
      >
        Partager au client
      </button>
    </div>
  );
}
