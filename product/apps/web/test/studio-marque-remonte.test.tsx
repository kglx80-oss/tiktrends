// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CDC v8 · F01 · changer de marque ne doit pas laisser la galerie et le produit
 * de la marque précédente.
 *
 * La bascule passe par `setActiveBrand` + `router.refresh()` · un rafraîchissement
 * SOUPLE. Les composants serveur se recalculent, mais l'arbre client n'est pas
 * remonté · un composant qui sème son état depuis ses props À LA MONTE (comme
 * `AdsStudio` · `useState(initial)`, `useState(products)`) garde alors l'ancienne
 * marque. Le correctif · une clé par marque sur `AdsStudio`, qui force le
 * remontage et ré-ensemence TOUT le contexte client ensemble.
 *
 * On prouve les DEUX moitiés :
 *   1. comportement · un composant « semé une fois » reste bloqué sur l'ancienne
 *      marque quand seules ses props changent (clé stable), et bascule bien quand
 *      la clé suit la marque · c'est le mécanisme sur lequel repose le correctif ;
 *   2. adoption · la page de Pubs IA monte réellement `AdsStudio` avec une clé
 *      liée à l'id de la marque active.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Modèle fidèle du défaut · l'état de galerie et de produit est semé UNE FOIS
// depuis les props, exactement comme `AdsStudio`.
function GalerieSemee({ ads, produit }: { ads: string[]; produit: string }) {
  const [items] = useState(ads);
  const [prod] = useState(produit);
  return (
    <div>
      <p data-testid="produit">{prod}</p>
      <ul>{items.map((a) => <li key={a}>{a}</li>)}</ul>
    </div>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  container = null; root = null;
});

function monter(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(node); });
}

describe('F01 · le remontage par marque ré-ensemence la galerie et le produit', () => {
  const neva = { ads: ['Fatigué à 14h', 'Ton cerveau a besoin de temps'], produit: 'NURO | FOCUS & BOOST' };
  const klorea = { ads: ['Votre piscine vire au vert'], produit: 'Klorea | Piscine' };

  it('clé STABLE · les props changent mais l’état reste sur l’ancienne marque (le défaut)', () => {
    monter(<GalerieSemee key="figee" {...neva} />);
    act(() => { root!.render(<GalerieSemee key="figee" {...klorea} />); });
    // Rafraîchissement souple simulé · même clé · l'état semé n'a pas bougé.
    expect(container!.querySelector('[data-testid=produit]')!.textContent).toBe('NURO | FOCUS & BOOST');
    expect(container!.textContent).toContain('Fatigué à 14h');
    expect(container!.textContent).not.toContain('Votre piscine vire au vert');
  });

  it('clé PAR MARQUE · changer la clé remonte et ré-ensemence tout (le correctif)', () => {
    monter(<GalerieSemee key="neva" {...neva} />);
    act(() => { root!.render(<GalerieSemee key="klorea" {...klorea} />); });
    expect(container!.querySelector('[data-testid=produit]')!.textContent).toBe('Klorea | Piscine');
    expect(container!.textContent).toContain('Votre piscine vire au vert');
    expect(container!.textContent).not.toContain('Fatigué à 14h');
  });

  it('adoption · la page de Pubs IA monte AdsStudio avec une clé liée à la marque', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(join(here, '../app/(app)/studio/ads/page.tsx'), 'utf8');
    expect(page).toMatch(/<AdsStudio\s+key=\{brand\?\.id/);
  });
});
