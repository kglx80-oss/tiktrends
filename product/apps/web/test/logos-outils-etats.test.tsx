import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
// Les actions serveur touchent la base · seul le RENDU nous intéresse ici.
vi.mock('../app/actions/connections', () => {
  const rien = async () => ({});
  return {
    connectShopifyAction: rien, syncShopifyAction: rien, disconnectShopifyAction: rien,
    connectMetaAction: rien, syncMetaAction: rien, disconnectMetaAction: rien, selectMetaAccountAction: rien,
  };
});

import { DataConnections } from '../app/(app)/connections/DataConnections';
import { ToastProvider } from '../components/Toast';
import type { ConnectionState } from '../app/actions/connections';

/**
 * Lot A (#120) · les logos changent, les ÉTATS des intégrations ne bougent pas.
 *
 * ── Ce qu'on empêche ────────────────────────────────────────────────────────
 *
 * Remplacer une pastille par un logo est une retouche d'apparence. Elle ne doit
 * rien changer à ce que la carte DIT · à brancher, compte à choisir, connecté à
 * synchroniser, connecté données à jour, ni aux gestes offerts (Connecter,
 * OAuth, Synchroniser, Déconnecter). On fige le TEXTE VISIBLE de chaque état,
 * relevé sur `main` AVANT le lot, et on le compare au rendu d'aujourd'hui.
 * Le logo (SVG) est retiré du texte · lui seul a le droit de changer.
 */

/** Le texte visible d'un rendu · sans les SVG (logos), sans les balises. */
function texteVisible(html: string): string {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function rendre(state: ConnectionState | null, brandName: string | null, oauth = false): string {
  return renderToStaticMarkup(
    <ToastProvider>
      <DataConnections initial={state} brandName={brandName} metaOAuth={oauth} shopifyOAuth={oauth} />
    </ToastProvider>,
  );
}

const vide: ConnectionState = {
  shopify: { connected: false, domain: null, insights: null, syncedAt: null },
  meta: { connected: false, adAccountId: null, insights: null, accounts: [], syncedAt: null },
  syncedAt: null,
};

const shopifyIns = { revenue30d: 12500, orders30d: 210, aov30d: 59.5, currency: 'EUR', topProducts: [{ title: 'Sérum Neva', revenue: 4200 }] } as never;
const metaIns = { spend30d: 3100, roas30d: 2.4, purchases30d: 120, accountName: 'Neva · FR', topAds: [{ name: 'UGC matin', roas: 3.1 }] } as never;

const ETATS: Record<string, { state: ConnectionState | null; brand: string | null; oauth?: boolean }> = {
  sans_marque: { state: null, brand: null },
  a_connecter: { state: vide, brand: 'Neva' },
  a_connecter_oauth: { state: vide, brand: 'Neva', oauth: true },
  connecte_sans_donnees: {
    state: { ...vide, shopify: { connected: true, domain: 'neva.myshopify.com', insights: null, syncedAt: null }, meta: { connected: true, adAccountId: 'act_1', insights: null, accounts: [], syncedAt: null } },
    brand: 'Neva',
  },
  compte_a_choisir: {
    state: { ...vide, meta: { connected: true, adAccountId: null, insights: null, accounts: [{ id: 'act_1', name: 'Neva FR', currency: 'EUR' }, { id: 'act_2', name: 'Neva DE', currency: 'EUR' }] as never, syncedAt: null } },
    brand: 'Neva',
  },
  operationnel: {
    state: { ...vide, shopify: { connected: true, domain: 'neva.myshopify.com', insights: shopifyIns, syncedAt: null }, meta: { connected: true, adAccountId: 'act_1', insights: metaIns, accounts: [], syncedAt: null } },
    brand: 'Neva',
  },
};

/**
 * Le texte de chaque état, RELEVÉ sur `main` (01e31c8) avant le lot A, par ce
 * même rendu. Ne pas « mettre à jour » ces chaînes pour faire passer le test ·
 * s'il échoue, c'est qu'un état d'intégration a changé.
 */
const ATTENDU: Record<string, string> = {
  sans_marque:
    "Choisis une marque active pour brancher ses données. Shopify remonte les ventes, Meta les performances · chaque marque a ses propres comptes. Sélectionne-en une, ou crée-la, pour commencer à connecter. Choisir une marque",
  a_connecter:
    "Shopify · ventes Domaine de la boutique Token Admin API · app perso (shpat_…) Connecter Shopify → Paramètres → Applications et canaux de vente → Développer des applications → créer une app, scopes lecture (orders, products), installer, copier le token Admin API. Meta Ads · performance ID compte publicitaire Token d'accès · System User (BM) Connecter Business Manager → Paramètres → Utilisateurs système → générer un token avec la permission ads_read, sur le compte publicitaire.",
  a_connecter_oauth:
    "Shopify · ventes Domaine de la boutique Connexion en un clic (OAuth) ou par token Token Admin API · app perso (shpat_…) Connecter Shopify → Paramètres → Applications et canaux de vente → Développer des applications → créer une app, scopes lecture (orders, products), installer, copier le token Admin API. Meta Ads · performance Connexion en un clic (OAuth) ou par token ID compte publicitaire Token d'accès · System User (BM) Connecter Business Manager → Paramètres → Utilisateurs système → générer un token avec la permission ads_read, sur le compte publicitaire.",
  connecte_sans_donnees:
    "Shopify · ventes CONNECTÉ · À SYNCHRONISER neva.myshopify.com Lance une synchro pour remonter les ventes. ↻ Synchroniser Déconnecter Meta Ads · performance CONNECTÉ · À SYNCHRONISER act_1 Lance une synchro pour remonter les performances. ↻ Synchroniser Déconnecter",
  compte_a_choisir:
    "Shopify · ventes Domaine de la boutique Token Admin API · app perso (shpat_…) Connecter Shopify → Paramètres → Applications et canaux de vente → Développer des applications → créer une app, scopes lecture (orders, products), installer, copier le token Admin API. Meta Ads · performance COMPTE À CHOISIR Compte publicitaire · 2 accessibles Choisis un compte… Neva FR · EUR Neva DE · EUR Sélectionne le compte à analyser pour cette marque. Lance une synchro pour remonter les performances. ↻ Synchroniser Déconnecter",
  operationnel:
    "Shopify · ventes CONNECTÉ · DONNÉES À JOUR neva.myshopify.com CA 30 j 12 500 EUR Commandes 210 Panier moyen 59,5 EUR Top produits Sérum Neva 4 200 EUR ↻ Synchroniser Déconnecter Meta Ads · performance CONNECTÉ · DONNÉES À JOUR Neva · FR Dépense 30 j 3 100 € ROAS 2.4× Achats 120 Top créas (ROAS) UGC matin 3.1× ↻ Synchroniser Déconnecter",
};

describe('Connexions · les états des intégrations sont ceux d’avant le lot logos', () => {
  for (const [nom, e] of Object.entries(ETATS)) {
    it(`état « ${nom} » · même texte, mêmes gestes`, () => {
      const texte = texteVisible(rendre(e.state, e.brand, e.oauth));
      expect(texte, `l'état « ${nom} » d'une intégration a changé de texte`).toBe(ATTENDU[nom]);
    });
  }
});

describe('Connexions · les deux sources de données portent leur logo officiel', () => {
  for (const nom of ['a_connecter', 'operationnel'] as const) {
    it(`état « ${nom} » · Shopify et Meta avec leur logo, pas une pastille vide`, () => {
      const e = ETATS[nom]!;
      const html = rendre(e.state, e.brand, e.oauth);
      expect(html, 'Shopify sans son logo officiel').toContain('data-logo="officiel" data-outil="shopify"');
      expect(html, 'Meta Ads sans son logo officiel').toContain('data-logo="officiel" data-outil="meta"');
    });
  }
});
