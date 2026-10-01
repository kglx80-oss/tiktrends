import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 11 · /billing et /credits pour un compte illimité. Constaté au lot 10 ·
 * le rail disait « Illimité » et la case Crédits de /billing « ◈ 0 / 24 000 » ;
 * le pied renvoyait au Support (« écris-nous ») alors qu'un ticket reste dans
 * l'espace ; l'historique vide promettait une dépense à chaque génération à un
 * compte dont les générations ne débitent rien.
 *
 * On REND les pages (session simulée, aucune base, aucun réseau) et on lit le
 * HTML. `illimite` pilote `unlimitedCredits` · les deux branches sont rendues.
 */
const etat = { illimite: true };
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace', role: 'owner', plan: 'business', user: { id: 'u', email: 'demo@exemple.invalid' } }) }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/founder', () => ({ isFounder: () => true }));
vi.mock('../lib/credits', () => ({ unlimitedCredits: () => etat.illimite }));
vi.mock('../lib/stripe', () => ({ stripeConfigured: () => false, planPurchasable: () => false }));
vi.mock('../app/actions/stripe', () => ({ createCheckoutAction: async () => {}, createPortalAction: async () => {} }));

import BillingPage from '../app/(app)/billing/page';
import CreditsPage from '../app/(app)/credits/page';

const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/\s+/g, ' ');
const rendre = async (P: typeof BillingPage) => texte(renderToStaticMarkup(await P({ searchParams: Promise.resolve({}) })));

describe('/billing · un compte illimité lit « Illimité »', () => {
  it('la case Crédits dit « Illimité », plus « ◈ 0 / 24 000 »', async () => {
    etat.illimite = true;
    const t = await rendre(BillingPage);
    const caseCredits = t.slice(t.indexOf('Crédits'), t.indexOf('Crédits') + 60);
    expect(caseCredits, 'illimité affiché comme un solde nul').not.toMatch(/◈ 0/);
    expect(caseCredits).toMatch(/Illimité · formule 24 000 \/ mois/);
  });
  it('un compte au barème garde son solde sur l’allocation', async () => {
    etat.illimite = false;
    const t = await rendre(BillingPage);
    expect(t).toMatch(/◈ 0 \/ 24 000/);
  });
  it('le pied ne renvoie plus à un Support qui ne reçoit pas la demande', async () => {
    const t = await rendre(BillingPage);
    expect(t, 'promesse d’un contact qui n’existe pas').not.toMatch(/écris-nous/i);
    expect(t).toContain('un ticket au support reste dans ton espace');
  });
});

describe('/credits · historique vide', () => {
  it('illimité · pas de promesse de dépense par génération', async () => {
    etat.illimite = true;
    const t = await rendre(CreditsPage);
    expect(t, 'dépense promise à un compte illimité').not.toContain('se dépensent à chaque génération');
    expect(t).toContain('tes générations ne débitent pas de crédits');
  });
  it('au barème · la dépense par génération reste dite', async () => {
    etat.illimite = false;
    const t = await rendre(CreditsPage);
    expect(t).toContain('se dépensent à chaque génération');
  });
});
