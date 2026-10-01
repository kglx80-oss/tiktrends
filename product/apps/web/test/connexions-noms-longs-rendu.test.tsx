import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Recette A (#120) · noms longs synthétiques mesurés en navigateur · à 390 le
 * badge « CONNECTÉ · À SYNCHRONISER » débordait la carte Meta de 16 px (46 à
 * 360), le nom de produit tronqué n'était lisible nulle part et le montant
 * passait sur deux lignes. Le débordement se mesure au navigateur ; ici on lit
 * ce que le RENDU garantit · en-tête qui passe à la ligne, nom complet en titre,
 * montant insécable.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
vi.mock('../app/actions/connections', () => {
  const rien = async () => ({});
  return { connectShopifyAction: rien, syncShopifyAction: rien, disconnectShopifyAction: rien, connectMetaAction: rien, syncMetaAction: rien, disconnectMetaAction: rien, selectMetaAccountAction: rien };
});
import { DataConnections } from '../app/(app)/connections/DataConnections';
import { ToastProvider } from '../components/Toast';
import type { ConnectionState } from '../app/actions/connections';

const LONG = 'Sérum régénérant nuit à l’acide hyaluronique et extrait d’algues bretonnes · flacon recharge 50 ml';
const etat = {
  shopify: { connected: true, domain: 'maison-neva-laboratoire-soins-naturels-bretagne-officiel.myshopify.com', insights: { revenue30d: 1250000, orders30d: 21034, aov30d: 59.43, currency: 'EUR', topProducts: [{ title: LONG, revenue: 420000 }] }, syncedAt: new Date().toISOString() },
  meta: { connected: true, adAccountId: 'act_123456789012345678', insights: null, accounts: [], syncedAt: null },
  syncedAt: null,
} as unknown as ConnectionState;

const html = renderToStaticMarkup(<ToastProvider><DataConnections initial={etat} brandName="Maison Neva · Laboratoire de soins naturels" metaOAuth={false} shopifyOAuth={false} /></ToastProvider>);

describe('Connexions · noms longs', () => {
  it('chaque en-tête de connecteur passe à la ligne (le badge descend sous le titre)', () => {
    const entetes = [...html.matchAll(/<div data-entete-connecteur="[^"]*" style="([^"]+)"/g)].map((m) => m[1]);
    expect(entetes.length, 'en-têtes de connecteur introuvables').toBe(2);
    for (const st of entetes) expect(st, 'en-tête sans retour à la ligne · le badge déborde à 390').toContain('flex-wrap:wrap');
  });
  it('le nom de produit tronqué reste lisible en entier (titre) et son montant ne se coupe pas', () => {
    expect(html).toContain(`title="${LONG.replace(/’/g, '’')}"`);
    expect(html).toMatch(/white-space:nowrap;flex-shrink:0;margin-left:12px">420\s000/);
  });
});
