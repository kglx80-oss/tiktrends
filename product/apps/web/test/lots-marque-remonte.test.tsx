// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CDC v8 · F01 (lots) · changer de marque ne doit pas laisser les LOTS de la
 * marque précédente dans `/adsmap/lots`.
 *
 * Comme `AdsStudio`, `Lots` sème son état à la monte · `liste = useState(batches)`,
 * `choisi = useState(batches[0]?.id)`. La bascule de marque passe par un
 * rafraîchissement SOUPLE (`router.refresh()`) · les composants serveur se
 * recalculent (nouveaux `batches`), mais l'arbre client n'est pas remonté · la
 * liste et la sélection restent celles de l'ancienne marque jusqu'à un
 * rechargement complet, et les actions agissent alors dans le mauvais contexte.
 * Le correctif · une clé par marque sur `Lots`, qui force le remontage.
 *
 * On prouve les DEUX moitiés · le mécanisme (un état semé une fois reste bloqué
 * à clé stable, bascule à clé changée) et l'adoption (la page monte `Lots` avec
 * une clé liée à l'id de la marque).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Modèle fidèle du défaut · la liste des lots ET la sélection sont semées UNE
// FOIS depuis les props, exactement comme `Lots`.
function LotsSemes({ batches }: { batches: Array<{ id: string; label: string }> }) {
  const [liste] = useState(batches);
  const [choisi] = useState<string | null>(batches[0]?.id ?? null);
  return (
    <div>
      <p data-testid="choisi">{choisi ?? 'aucun'}</p>
      <ul>{liste.map((b) => <li key={b.id}>{b.label}</li>)}</ul>
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

describe('F01 (lots) · le remontage par marque ré-ensemence les lots et la sélection', () => {
  const klorea = [{ id: 'k1', label: '[ADSMAP] TEST Klorea B29' }, { id: 'k2', label: 'Lot Klorea 2' }];
  const neva: Array<{ id: string; label: string }> = [];

  it('clé STABLE · les props changent mais les lots restent ceux de l’ancienne marque (le défaut)', () => {
    monter(<LotsSemes key="figee" batches={klorea} />);
    act(() => { root!.render(<LotsSemes key="figee" batches={neva} />); });
    // Rafraîchissement souple simulé · même clé · l'état semé n'a pas bougé.
    expect(container!.textContent).toContain('TEST Klorea B29');
    expect(container!.querySelector('[data-testid=choisi]')!.textContent).toBe('k1');
  });

  it('clé PAR MARQUE · changer la clé remonte · Neva affiche « aucun lot », Klorea ses 2 (le correctif)', () => {
    monter(<LotsSemes key="klorea" batches={klorea} />);
    act(() => { root!.render(<LotsSemes key="neva" batches={neva} />); });
    expect(container!.textContent).not.toContain('TEST Klorea B29');
    expect(container!.querySelector('[data-testid=choisi]')!.textContent).toBe('aucun');
    // Et retour · Klorea retrouve ses lots et sa sélection.
    act(() => { root!.render(<LotsSemes key="klorea" batches={klorea} />); });
    expect(container!.textContent).toContain('TEST Klorea B29');
    expect(container!.querySelector('[data-testid=choisi]')!.textContent).toBe('k1');
  });

  it('adoption · la page des lots monte `Lots` avec une clé liée à la marque', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(join(here, '../app/(app)/adsmap/lots/page.tsx'), 'utf8');
    expect(page).toMatch(/<Lots\s+key=\{brand\.id\}/);
  });
});
