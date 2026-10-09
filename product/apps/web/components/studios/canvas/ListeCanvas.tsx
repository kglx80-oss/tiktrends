'use client';

import { entreesDeCarte, sortiesDeCarte, LIBELLES_ETAPE_CANVAS, LIBELLES_NATURE_CANVAS, type ModeleCanvas } from '@tiktrends/core';
import { LIBELLE_MEDIA } from './DetailCarte';
import { mini, pastilleNature, rangee, styleCarte } from './styles';

/**
 * Vue liste guidée · l'équivalent du canvas, par défaut sur mobile et au
 * clavier. MÊMES cartes, MÊME ordre (celui du modèle : étape, puis rangée),
 * mêmes liens écrits en toutes lettres (« lit 3 · alimente 2 »), même détail.
 */
export function ListeCanvas({ modele, selection, onChoisir }: { modele: ModeleCanvas; selection: string | null; onChoisir: (id: string) => void }) {
  return (
    <ol data-vue-canvas="liste" aria-label="Cartes du projet, dans l’ordre des étapes" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
      {modele.etapes.map((etape, i) => {
        const cartes = modele.cartes.filter((c) => c.etape === etape);
        return (
          <li key={etape} style={{ display: 'grid', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Étape {i + 1} · {LIBELLES_ETAPE_CANVAS[etape]}</h3>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {cartes.map((c) => {
                const lit = entreesDeCarte(modele, c.id).length;
                const alimente = sortiesDeCarte(modele, c.id).length;
                const media = LIBELLE_MEDIA[c.media];
                return (
                  <li key={c.id}>
                    <button type="button" data-carte={c.id} aria-pressed={selection === c.id} onClick={() => onChoisir(c.id)}
                      style={{ ...styleCarte(c.nature, selection === c.id), width: '100%' }}>
                      <span style={{ ...rangee, gap: 6 }}>
                        <span style={pastilleNature}>{LIBELLES_NATURE_CANVAS[c.nature]}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{c.titre}</span>
                      </span>
                      <span style={mini}>
                        Lit {lit} · alimente {alimente}{media ? ` · ${media}` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
