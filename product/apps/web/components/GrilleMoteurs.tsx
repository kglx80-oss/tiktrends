import { VignetteMoteurVue } from './VignetteMoteurVue';

/**
 * Le choix d'un modèle d'image, en grille de cartes · la version légère du
 * sélecteur, pour les studios qui n'ont ni prix ni mesure locale à montrer (le
 * studio Image). Même langage visuel que le studio Pubs IA · chaque modèle avec
 * l'exemple qui incarne sa force, plutôt qu'une ligne de menu déroulant.
 *
 * Pur affichage · pilote par rappel, aucune action serveur, aucune règle (la
 * vignette vient du noyau). Rendu et lu en test.
 */
export function GrilleMoteurs({ moteurs, valeur, onChoisir }: {
  moteurs: { key: string; label: string; recommended?: boolean }[];
  valeur: string;
  onChoisir: (key: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
      {moteurs.map((m) => {
        const on = valeur === m.key;
        return (
          <button
            key={m.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChoisir(m.key)}
            style={{
              display: 'grid', gap: 0, padding: 0, textAlign: 'left', overflow: 'hidden',
              borderRadius: 14, cursor: 'pointer',
              border: `1.5px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`,
              background: on ? 'rgba(230,0,126,.05)' : 'var(--paper)',
              boxShadow: on ? '0 0 0 3px rgba(230,0,126,.12)' : 'none',
            }}
          >
            <VignetteMoteurVue moteurKey={m.key} recommande={!!m.recommended} />
            <span style={{ display: 'block', padding: '9px 11px 11px', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
