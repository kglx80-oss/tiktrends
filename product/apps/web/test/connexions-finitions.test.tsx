// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CIBLE_TACTILE_MIN, CIBLE_POINTEUR_FIN_MIN } from '@tiktrends/core';

/**
 * Recette A (#120) · finitions de Connexions, composants MONTÉS (jsdom) · on lit
 * ce qu'on voit et ce qui change au geste.
 * - la flèche d'une catégorie suit l'état ouvert / fermé ;
 * - l'en-tête de catégorie fait 44 au doigt, garde 24 à la souris ;
 * - un champ de jeton est masqué par défaut, « Afficher » le révèle et revient.
 * Chaînes factices seulement · aucune soumission.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
const soumis = vi.hoisted(() => ({ n: 0 }));
vi.mock('../app/actions/connections', () => {
  const rien = async () => { soumis.n++; return {}; };
  return { connectShopifyAction: rien, syncShopifyAction: rien, disconnectShopifyAction: rien, connectMetaAction: rien, syncMetaAction: rien, disconnectMetaAction: rien, selectMetaAccountAction: rien };
});
import { CategorieFeuilleDeRoute } from '../app/(app)/connections/CategorieFeuilleDeRoute';
import { DataConnections } from '../app/(app)/connections/DataConnections';
import { ToastProvider } from '../components/Toast';
import type { ConnectionState } from '../app/actions/connections';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });

function pointeur(tactile: boolean) {
  window.matchMedia = ((q: string) => ({ matches: tactile, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}
function monter(node: React.ReactNode) {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  act(() => { root!.render(node); });
}

describe('Feuille de route · catégorie', () => {
  it('la flèche suit l’état · ouverte ▾, fermée ▸, rouverte ▾', () => {
    pointeur(false);
    monter(<CategorieFeuilleDeRoute cat="Publicité" nombre={6}><p>tuiles</p></CategorieFeuilleDeRoute>);
    const d = el!.querySelector('details')!; const fleche = () => el!.querySelector('[data-fleche]')!.textContent;
    expect(d.open).toBe(true); expect(fleche()).toBe('▾');
    act(() => { d.open = false; d.dispatchEvent(new Event('toggle')); });
    expect(fleche(), 'la flèche ne suit pas la fermeture').toBe('▸');
    act(() => { d.open = true; d.dispatchEvent(new Event('toggle')); });
    expect(fleche()).toBe('▾');
  });

  it('44 px au doigt, densité desktop (24) à la souris', () => {
    pointeur(true);
    monter(<CategorieFeuilleDeRoute cat="CRM" nombre={3}><p /></CategorieFeuilleDeRoute>);
    expect(el!.querySelector('summary')!.style.minHeight, 'en-tête trop petit au doigt').toBe(`${CIBLE_TACTILE_MIN}px`);
    act(() => { root!.unmount(); }); el!.remove();
    pointeur(false);
    monter(<CategorieFeuilleDeRoute cat="CRM" nombre={3}><p /></CategorieFeuilleDeRoute>);
    expect(el!.querySelector('summary')!.style.minHeight, 'densité desktop perdue').toBe(`${CIBLE_POINTEUR_FIN_MIN}px`);
  });
});

describe('Connexions · champs de jeton masqués', () => {
  const vide = { shopify: { connected: false, domain: null, insights: null, syncedAt: null }, meta: { connected: false, adAccountId: null, insights: null, accounts: [], syncedAt: null }, syncedAt: null } as unknown as ConnectionState;

  for (const id of ['conn-shopify-token', 'conn-meta-token']) {
    it(`${id} · masqué par défaut, « Afficher » révèle, « Masquer » remasque, rien n’est soumis`, () => {
      pointeur(false); soumis.n = 0;
      monter(<ToastProvider><DataConnections initial={vide} brandName="Neva" metaOAuth={false} shopifyOAuth={false} /></ToastProvider>);
      const champ = el!.querySelector(`#${id}`) as HTMLInputElement;
      expect(champ.type, 'jeton en clair par défaut').toBe('password');
      expect(champ.labels?.[0]?.textContent, 'champ sans nom accessible').toMatch(/Token/);
      const bouton = el!.querySelector(`button[aria-controls="${id}"]`) as HTMLButtonElement;
      expect(bouton.getAttribute('aria-label')).toBe('Afficher le token');
      expect(parseFloat(bouton.style.minHeight)).toBeGreaterThanOrEqual(CIBLE_TACTILE_MIN);
      act(() => { bouton.click(); });
      expect(champ.type).toBe('text');
      expect(bouton.getAttribute('aria-label')).toBe('Masquer le token');
      act(() => { bouton.click(); });
      expect(champ.type).toBe('password');
      expect(soumis.n, 'basculer l’affichage a déclenché une action').toBe(0);
    });
  }
});
