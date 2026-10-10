import type { ChangementLisible } from '@tiktrends/core';
import { mini, texte } from './styles';
import { tuile } from '../../ui';

/**
 * Avant / après PAR CHEMIN · l'avant vient de la version de base (serveur),
 * jamais du modèle. Deux colonnes qui s'empilent sous 520 px : aucun
 * défilement horizontal à 390. Tout texte est rendu échappé (React) : une
 * valeur ou une raison hostile s'affiche, elle ne s'exécute pas (SEC-04).
 */

const OP: Readonly<Record<ChangementLisible['op'], string>> = { add: 'Ajout', replace: 'Modification', remove: 'Suppression' };

export function AvantApres({ changements }: { changements: ChangementLisible[] }) {
  if (changements.length === 0) return <p style={mini}>Aucun changement lisible.</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Changements proposés">
      {changements.map((c, i) => (
        <li key={`${c.chemin}-${i}`} style={{ ...tuile, padding: 12, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>
            {c.libelle} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· {OP[c.op]}</span>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ ...mini, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Avant</p>
              <p style={{ ...texte, whiteSpace: 'pre-wrap', textDecoration: c.op === 'add' ? 'none' : 'line-through', textDecorationColor: 'var(--muted)' }}>{c.avant}</p>
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ ...mini, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--accent-strong)' }}>Après</p>
              <p style={{ ...texte, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{c.apres}</p>
            </div>
          </div>
          {c.raison && <p style={mini}>Raison · {c.raison}</p>}
          <p style={{ ...mini, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{c.chemin}</p>
        </li>
      ))}
    </ul>
  );
}
