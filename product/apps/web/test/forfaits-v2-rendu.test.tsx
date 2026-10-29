// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Page Forfaits · l'offre V2 n'existe que sous `TARIFS_V2` (garde-fou de mise
 * en ligne, 29/10). On rend la VRAIE page serveur (`app/(spatial)/sp/billing`)
 * et on lit le HTML :
 *  · sans l'interrupteur · exactement l'offre d'aujourd'hui (4 formules, prix,
 *    « / mois HT », Annuel désactivé, recharges 19 / 79 / 279 €), rien de V2 ;
 *  · avec · Essentiel / Pro / Agence, TTC, annuel −30 %, droits réels, « Plan
 *    actuel », recharges au prix du forfait.
 * Mutations faites (restaurées) · `v2` forcé à vrai dans la page ⇒ « sans
 * l'interrupteur » tombe ; `cartesForfaitsV2` ignorant la facturation ⇒ « annuel » tombe.
 */
const etat = vi.hoisted(() => ({ plan: 'core' as string, role: 'owner' }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, usePathname: () => '/billing', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@tiktrends/db', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/db')>()), db: null }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', plan: etat.plan, role: etat.role, user: { id: 'u', email: 'client@exemple.fr' } }) }));

const { default: Page } = await import('../app/(spatial)/sp/billing/page');
const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const CTX = { utilisateur: { nom: 'T', initiales: 'T', email: 't@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const texte = (h: string) => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s/g, ' ');

async function rendre(params: Record<string, string> = {}) {
  const el = await Page({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(<FournisseurSpatial value={CTX}>{el}</FournisseurSpatial>);
}
const cartes = (html: string) => [...html.matchAll(/<article[^>]*class="tile plan[^"]*"[^>]*>([\s\S]*?)<\/article>/g)].map((m) => texte(m[1]!));

afterEach(() => { delete process.env.TARIFS_V2; delete process.env.STRIPE_SECRET_KEY; etat.plan = 'core'; });

describe('Forfaits · sans TARIFS_V2, l’offre d’aujourd’hui', () => {
  it('quatre formules, prix et « / mois HT » inchangés, Annuel désactivé, recharges 19 / 79 / 279 €, rien de V2', async () => {
    const html = await rendre({ facturation: 'annuel' });
    const c = cartes(html);
    expect(c.map((x) => x.split('|').filter(Boolean)[0] === 'Plan actuel' ? x.split('|').filter(Boolean)[1] : x.split('|').filter(Boolean)[0])).toEqual(['Starter', 'Core', 'Plus', 'Business']);
    expect(c[1]).toContain('|99 €|/ mois HT|');
    expect(c[2]).toContain('|299 €|/ mois HT|');
    expect(html).toMatch(/<button type="button" aria-pressed="false" disabled="" title="La facturation annuelle n’est pas proposée">Annuel<\/button>/);
    for (const p of ['19 €', '79 €', '279 €']) expect(texte(html)).toContain(p);
    expect(html).not.toMatch(/Essentiel|Agence|TTC|data-facturation|data-sous-prix|data-engagement|data-liste|Le plus populaire|Changer de forfait/);
    expect(html).toContain('<h2>Changer de plan</h2>');
  });
});

describe('Forfaits · avec TARIFS_V2, l’offre V2', () => {
  it('mensuel · Essentiel / Pro / Agence à 29 / 49 / 129 € TTC, crédits et droits réels', async () => {
    process.env.TARIFS_V2 = '1';
    const c = cartes(await rendre());
    expect(c).toHaveLength(3);
    expect(c[0]).toContain('|Essentiel|Pour lancer ses premières créas winneuses|29 €|/ mois TTC|');
    expect(c[1]).toContain('|Pro|Pour itérer vite sur plusieurs marques|49 €|/ mois TTC|');
    expect(c[2]).toContain('|Agence|Pour produire à volume pour ses clients|129 €|/ mois TTC|');
    expect(c[0]).toContain('4 000 crédits / mois');
    expect(c[0]).toContain('|1 marque|');
    expect(c[1]).toContain('|3 marques|');
    expect(c[1]).toContain('|Vidéo jusqu’à 30 s|');
    expect(c[2]).toContain('|20 concurrents suivis par marque|');
  });

  it('annuel −30 % · prix ramené au mois et montant annuel prélevé · Pro est le plan actuel d’un abonné Pro', async () => {
    process.env.TARIFS_V2 = '1';
    etat.plan = 'pro';
    const html = await rendre({ facturation: 'annuel' });
    const c = cartes(html);
    expect(c[0]).toContain('|20,30 €|/ mois TTC|soit 243,60 € TTC prélevés une fois par an|');
    expect(c[1]).toContain('|Plan actuel|');
    expect(c[2]).toContain('|90,30 €|');
    expect(html).toContain('data-facturation="annuel"');
    expect(html).toMatch(/aria-current="page"[^>]*>Annuel/);
    // Recharges au prix du forfait Pro (4,50 € les 1 000 crédits).
    expect(texte(html)).toContain('9 €');
    expect(texte(html)).toContain('22,50 €');
  });

  it('la carte façon référence · nom, phrase, prix TTC / mois, crédits, Fonctions puis Limites, bouton, « Sans engagement, annulable à tout moment » ; « Le plus populaire » sur Pro seul ; « Changer de forfait »', async () => {
    process.env.TARIFS_V2 = '1';
    etat.plan = 'starter';
    const html = await rendre();
    expect(html).toContain('<h2>Changer de forfait</h2>');
    const c = cartes(html);
    expect(c[0]).toMatch(/^\|Essentiel\|Pour lancer ses premières créas winneuses\|29 €\|\/ mois TTC\|.*4 000 crédits \/ mois\|.*\|Fonctions\|.*\|Limites\|1 marque\|1 concurrent suivi par marque\|Vidéo jusqu’à 15 s\|.*Sans engagement, annulable à tout moment\|$/);
    expect(c.map((x) => x.startsWith('|Le plus populaire|'))).toEqual([false, true, false]);
    expect(c.every((x) => x.includes('|Sans engagement, annulable à tout moment|'))).toBe(true);
    expect(c[1]).toContain('|Fonctions|Tout Essentiel|Résultats · Adsmap complet|Clone de pubs vidéo|');
    expect(c[2]).toContain('|Limites|20 marques|20 concurrents suivis par marque|Vidéo jusqu’à 60 s|');
  });

  it('un espace Core sous TARIFS_V2 · aucune carte « Plan actuel » V2, ses recharges d’aujourd’hui (19 / 79 / 279 €) jusqu’à l’échéance', async () => {
    process.env.TARIFS_V2 = '1';
    etat.plan = 'core';
    const html = await rendre();
    expect(cartes(html).some((x) => x.includes('|Plan actuel|'))).toBe(false);
    for (const p of ['19 €', '79 €', '279 €']) expect(texte(html)).toContain(p);
  });

  it('paiement configuré · une carte V2 se vend dès que SON prix est posé (« S’abonner » au prix de l’échéance), sinon « Bientôt », jamais un bouton qui échoue', async () => {
    process.env.TARIFS_V2 = '1';
    process.env.STRIPE_SECRET_KEY = 'sk_test_factice';
    process.env.STRIPE_PRICE_PRO_MENSUEL = 'price_pro_m';
    etat.plan = 'starter';
    try {
      const c = cartes(await rendre());
      expect(c[1]).toContain('|S’abonner · 49 € / mois|');
      expect(c[0]).toContain('|Bientôt|');
      expect(c[2]).toContain('|Bientôt|');
      expect(cartes(await rendre({ facturation: 'annuel' }))[1]).toContain('|Bientôt|'); // le prix ANNUEL de Pro n'est pas posé
    } finally { delete process.env.STRIPE_PRICE_PRO_MENSUEL; }
  });
});
