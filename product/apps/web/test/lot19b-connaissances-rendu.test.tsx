import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  creerConnaissance, publierVersion, nouvelleVersion, retirerConnaissance, validerSaisie, vueConnaissance,
  apercuContextePlateforme, refConnaissance,
  type Connaissance, type SaisieConnaissance, type Resultat,
} from '@tiktrends/core';

/**
 * Lot 19B · ce qu'on VOIT · l'écran Connaissances, le garde de la page, le
 * contexte de Jarvis et la source citée sous une réponse. On rend les
 * composants et on lit le HTML.
 */

const h = vi.hoisted(() => {
  class RedirectErr extends Error { url: string; constructor(url: string) { super(`REDIRECT ${url}`); this.url = url; } }
  return { session: null as unknown, RedirectErr, vue: null as unknown };
});
vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new h.RedirectErr(url); },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock('../app/actions/connaissances', () => ({
  chargerConnaissancesAction: async () => ({ vue: h.vue }),
  creerConnaissanceAction: async () => ({}), nouvelleVersionAction: async () => ({}),
  publierConnaissanceAction: async () => ({}), retirerConnaissanceAction: async () => ({}),
}));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: async () => ({}), clearChatAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-draft', () => ({ draftConceptAction: async () => ({}) }));

import ConnaissancesPage from '../app/(app)/admin/connaissances/page';
import { EcranConnaissances } from '../app/(app)/admin/connaissances/EcranConnaissances';
import { JarvisContexte } from '../app/(app)/jarvis/JarvisContexte';
import { Tour } from '../app/(app)/jarvis/JarvisChat';
import type { VueAdminConnaissances } from '../app/actions/connaissances';

const ok = <T,>(r: Resultat<T>): T => { if (!r.ok) throw new Error(r.erreur); return r.valeur; };
const s = (o: Partial<SaisieConnaissance>) => ok(validerSaisie({
  titre: 'T', type: 'instruction', texte: 'x', origine: { mode: 'saisie' }, portee: { niveau: 'plateforme' }, ...o,
}));
const T = '2026-10-05T08:00:00.000Z';
const ID = (k: number) => `0000000${k}-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
const LONG = 'Méthode d’itération sur les gagnantes avec un titre extrêmement long qui doit passer à la ligne sans déborder de la carte ni la grille';

function fixtures(): Connaissance[] {
  // v1 publiée → v2 publiée (v1 retirée) → v3 brouillon en attente.
  let a = creerConnaissance(ID(1), s({ titre: LONG, type: 'methode', texte: 'Une variable à la fois.', origine: { mode: 'fichier', fichier: 'methode.md' } }), 'equipe@agence.test', T);
  a = ok(publierVersion(a, 1, 'equipe@agence.test', T));
  a = ok(nouvelleVersion(a, s({ titre: LONG, type: 'methode', texte: 'Une variable, puis deux.' }), 1, 'equipe@agence.test', T));
  a = ok(publierVersion(a, 2, 'equipe@agence.test', T));
  a = ok(nouvelleVersion(a, s({ titre: LONG, type: 'methode', texte: 'Brouillon v3.' }), 2, 'equipe@agence.test', T));
  const b = creerConnaissance(ID(2), s({ titre: 'Chiffres du marché', type: 'donnees', texte: 'CPM moyen' }), 'equipe@agence.test', T);
  const c = ok(retirerConnaissance(ok(publierVersion(creerConnaissance(ID(3), s({ titre: 'Ancienne consigne' }), 'e', T), 1, 'e', T)), 'e', T));
  return [a, b, c];
}

function vue(liste: Connaissance[]): VueAdminConnaissances {
  return {
    items: liste.map((c) => ({ ...vueConnaissance(c), usage: c.id === ID(1) ? { [refConnaissance(ID(1), 2)]: { inclus: 4, cite: 1, dernierInclus: T, dernierCite: T } } : {} })),
    apercu: apercuContextePlateforme(liste),
  };
}

const rendu = (v: VueAdminConnaissances) => renderToStaticMarkup(<EcranConnaissances vueInitiale={v} espaces={[]} marques={[]} />);

describe('écran Connaissances · publié, inclus, cité, distincts et visibles', () => {
  const html = rendu(vue(fixtures()));

  it('chaque état se lit · publiée (avec sa version), brouillon en attente, retirée', () => {
    expect(html).toContain('Publiée · v2');
    expect(html).toContain('Brouillon v3 en attente');
    expect(html).toContain('>Retirée<');
    expect(html).toContain('>Brouillon<');
  });

  it('inclus et cité sont comptés séparément, sur la version en service', () => {
    expect(html).toContain('incluse dans 4 réponse(s)');
    expect(html).toContain('citée 1 fois');
    expect(html).toContain('Incluse en entier');
  });

  it('l’aperçu dit ce que Jarvis lit, face au plafond mesuré', () => {
    expect(html).toMatch(/Portée plateforme · <b[^>]*>\d[\d\s ]* \/ 6[\s ]000<\/b> caractères/);
    expect(html).toContain('1 connaissance(s) incluse(s) dans le contexte de chaque réponse');
  });

  it('le retrait est dit sans promesse d’oubli rétroactif', () => {
    expect(html).toContain('n’entre plus dans les réponses suivantes, y compris dans une conversation déjà ouverte');
    expect(html).toContain('Les réponses déjà données ne sont pas réécrites');
  });

  it('consignes et sources sont distinguées dans le choix du type', () => {
    expect(html).toContain('label="Comment Jarvis répond (éditorial)"');
    expect(html).toContain('label="Documents sources"');
  });

  it('un nom long passe à la ligne dans sa carte', () => {
    const h3 = html.match(/<h3 [^>]*>([^<]*)<\/h3>/g)?.find((x) => x.includes(LONG)) ?? '';
    expect(h3).toContain(LONG);
    expect(h3).toContain('overflow-wrap:anywhere');
  });

  it('vide · un état qui explique et renvoie au formulaire', () => {
    const vide = rendu(vue([]));
    expect(vide).toContain('Aucune connaissance pour l’instant.');
    expect(vide).toContain('aucune connaissance publiée en portée plateforme');
  });
});

describe('page · le garde lit le rôle d’ÉQUIPE, jamais le rôle d’espace', () => {
  beforeEach(() => { h.vue = vue(fixtures()); });
  const base = { user: { id: 'u', email: 'x@y.test', name: null }, workspaceId: 'w', workspaceName: 'W', role: 'owner', plan: 'plus' };
  const url = async () => { try { await ConnaissancesPage(); return '(pas de redirect)'; } catch (e) { if (e instanceof h.RedirectErr) return e.url; throw e; } };

  it('owner d’espace (aucun rôle d’équipe) → /dashboard', async () => {
    h.session = { ...base, equipe: null };
    expect(await url()).toBe('/dashboard');
  });
  it('admin d’espace → /dashboard', async () => {
    h.session = { ...base, role: 'admin', equipe: undefined };
    expect(await url()).toBe('/dashboard');
  });
  it('sans session → /login', async () => {
    h.session = null;
    expect(await url()).toBe('/login');
  });
  it('Admin plateforme · la page se rend avec ses connaissances', async () => {
    h.session = { ...base, role: 'member', equipe: { role: 'admin', matrice: {} } };
    const html = renderToStaticMarkup(await ConnaissancesPage());
    expect(html).toContain('<h1');
    expect(html).toContain('Connaissances');
    expect(html).toContain('Chiffres du marché');
  });
});

describe('Jarvis · ce qui entre, ce qui est cité', () => {
  it('le contexte montre les connaissances incluses, leur portée, et le retrait sans promesse d’oubli', () => {
    const html = renderToStaticMarkup(
      <JarvisContexte
        contexte={{ brandId: 'b', identity: null, rules: null, hooks: null, connaissances: { inclus: [{ ref: 'Kaaaa-v1', titre: 'Itérer une gagnante', type: 'methode', tronquee: true }], horsPlace: 2 } }}
        brandName="Neva" measuredAds={0} onClose={() => {}}
      />,
    );
    expect(html).toContain('Connaissances de l’équipe');
    expect(html).toContain('portée · équipe plateforme');
    expect(html).toContain('Itérer une gagnante');
    expect(html).toContain('Méthode d’itération · tronquée');
    expect(html).toContain('2 autre(s) n’ont pas tenu');
    expect(html).toContain('les réponses déjà données ne sont pas réécrites');
  });

  it('sous une réponse · la source citée s’affiche par son titre, le marqueur disparaît, l’inconnue est ignorée', () => {
    const html = renderToStaticMarkup(
      <Tour
        turn={{ id: '1', role: 'assistant', content: 'Isole l’accroche.\n[[SOURCE:Kaaaa-v1]]\n[[SOURCE:Kbbbb-v2]]\n[[SOURCE:Kzzzz-v9]]', at: T }}
        sources={{ 'Kaaaa-v1': { titre: 'Itérer une gagnante', enService: true }, 'Kbbbb-v2': { titre: 'Ancienne', enService: false } }}
      />,
    );
    expect(html).toContain('Isole l’accroche.');
    expect(html).not.toContain('[[SOURCE');
    expect(html).toContain('Cité ·');
    expect(html).toContain('Itérer une gagnante');
    expect(html).toContain('Ancienne · retirée depuis');
    expect(html).not.toContain('Kzzzz');
  });
});
