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
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/billing' }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace', role: 'owner', plan: 'business', user: { id: 'u', email: 'demo@exemple.invalid' } }) }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/founder', () => ({ isFounder: () => true }));
vi.mock('../lib/credits', () => ({ unlimitedCredits: () => etat.illimite }));
vi.mock('../lib/stripe', () => ({ stripeConfigured: () => false, planPurchasable: () => false }));
vi.mock('../app/actions/stripe', () => ({ createCheckoutAction: async () => {}, createPortalAction: async () => {}, createTopupCheckoutAction: async () => {} }));

import ForfaitsSpatial from '../app/(spatial)/sp/billing/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
// Vague 4 · l'écran V5 `/credits` est retiré · la garde lit l'écran Spatial.
import CreditsPage from '../app/(spatial)/sp/credits/page';

const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/\s+/g, ' ');
const rendre = async (P: typeof CreditsPage) => texte(renderToStaticMarkup(<FournisseurSpatial value={CTX}>{await P()}</FournisseurSpatial>));
const CTX: CtxSpatial = { utilisateur: { nom: 'D', initiales: 'D', email: 'demo@exemple.invalid', role: 'Propriétaire' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
// L'anneau de l'en-tête (coquille) est neutralisé · seul celui de l'écran est lu.
const forfaits = async () => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{await ForfaitsSpatial({})}</FournisseurSpatial>).replace(/<a class="credit"[^]*?<\/a>/, '');

/*
 * Vague 2 · l'écran V5 `/billing` est retiré · la garde est portée sur l'écran
 * Spatial (`app/(spatial)/sp/billing/page.tsx`), seul à servir `/billing`.
 */
describe('/billing · un compte illimité lit « Illimité »', () => {
  it('l’anneau dit « ∞ » et le texte « illimités », plus un solde nul', async () => {
    etat.illimite = true;
    const html = await forfaits();
    expect(html).toContain('<span>∞</span>');
    const t = texte(html);
    expect(t).toContain('Crédits illimités sur ce compte.');
    expect(t, 'illimité présenté comme épuisé').not.toContain('Crédits bientôt épuisés');
  });
  it('un compte au barème garde son solde réel', async () => {
    etat.illimite = false;
    const html = await forfaits();
    expect(html).toContain('<span>0</span>');
    expect(texte(html)).not.toContain('Crédits illimités');
  });
  it('aucune promesse d’un contact qui n’existe pas', async () => {
    expect(texte(await forfaits()), 'promesse d’un contact qui n’existe pas').not.toMatch(/écris-nous/i);
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
