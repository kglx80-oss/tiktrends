import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Message 55 · les droits DÉJÀ définis de la feature `jarvis` (rôle Membre,
 * offre Core, matrice d'équipe) gardent la conversation · AVANT toute lecture.
 *
 * Constat reproduit avant correction : la route, la page et la lecture du fil
 * ne vérifiaient que `roleAtLeast(member)` · un membre d'un espace Starter, ou
 * un membre d'équipe `freelance` (pas de rubrique Jarvis), recevait dans la
 * consigne les connaissances de portée plateforme.
 *
 * On vérifie des RÉSULTATS :
 *  - la route rend 403, son corps ne contient rien d'autre que « Accès refusé. »,
 *    aucune ligne d'`app_settings` n'a été lue (relevé au niveau de la base,
 *    pas d'une fonction), la marque active n'a pas été lue, rien n'est parti
 *    vers le (faux) fournisseur ;
 *  - les parcours autorisés reçoivent bien les connaissances applicables ;
 *  - la page refusée rend l'écran de refus, sans marque ni connaissance.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), brand: randomUUID(), user: randomUUID(), ws2: randomUUID(), brand2: randomUUID() };
});
const h = vi.hoisted(() => ({
  session: null as unknown,
  tablesLues: [] as string[],
  marqueLue: 0,
  consigne: 0,
  pourReponse: 0,
  titres: 0,
}));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { getTableName } = await import('drizzle-orm');
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const reel = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  // Chaque `select().from(table)` est relevé · c'est la LECTURE qu'on observe,
  // pas l'appel d'une fonction de la lib.
  const db = new Proxy(reel, {
    get(t, k) {
      if (k === 'select') {
        return (...a: unknown[]) => {
          const b = (t.select as unknown as (...x: unknown[]) => Record<string | symbol, unknown>)(...a);
          return new Proxy(b, {
            get(bt, bk) {
              if (bk === 'from') return (tab: Parameters<typeof getTableName>[0], ...r: unknown[]) => { h.tablesLues.push(getTableName(tab)); return (bt.from as (...x: unknown[]) => unknown)(tab, ...r); };
              const v = bt[bk];
              return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(bt) : v;
            },
          });
        };
      }
      const v = (t as unknown as Record<string | symbol, unknown>)[k];
      return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(t) : v;
    },
  });
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({
  getActiveBrand: async () => { h.marqueLue++; return { id: ids.brand, name: 'MarqueNeva55', logoUrl: null, url: null, category: null }; },
}));
vi.mock('../lib/jarvis-connaissances', async (importOriginal) => {
  const a = await importOriginal<typeof import('../lib/jarvis-connaissances')>();
  return {
    ...a,
    consigneAvecConnaissances: (...x: Parameters<typeof a.consigneAvecConnaissances>) => { h.consigne++; return a.consigneAvecConnaissances(...x); },
    connaissancesPourReponse: (...x: Parameters<typeof a.connaissancesPourReponse>) => { h.pourReponse++; return a.connaissancesPourReponse(...x); },
    titresDesSources: (...x: Parameters<typeof a.titresDesSources>) => { h.titres++; return a.titresDesSources(...x); },
  };
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { db, schema } from '@tiktrends/db';
import { creerConnaissance, publierVersion, validerSaisie, type SaisieConnaissance, type Connaissance } from '@tiktrends/core';
import { POST } from '../app/api/jarvis/chat/route';
import { chatThreadAction } from '../app/actions/jarvis-chat';
import { invaliderConnaissances } from '../lib/jarvis-connaissances';
import JarvisPage from '../app/(app)/jarvis/page';
import SourcesPage from '../app/(app)/jarvis/sources/page';
import { demarrerMockFournisseur } from './lot19b-mock-fournisseur';
// L2 · la consigne de Jarvis vient du registre : une release doit être publiée.
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { publierRegistreDeTest } from './l2-outils';

const T = '2026-10-05T08:00:00.000Z';
function publiee(id: string, o: Partial<SaisieConnaissance>): Connaissance {
  const v = validerSaisie({ titre: 'T', type: 'savoir', texte: 'x', origine: { mode: 'saisie' }, portee: { niveau: 'plateforme' }, ...o });
  if (!v.ok) throw new Error(v.erreur);
  const p = publierVersion(creerConnaissance(id, v.valeur, 'equipe@agence.test', T), 1, 'equipe@agence.test', T);
  if (!p.ok) throw new Error(p.erreur);
  return p.valeur;
}

/** Ce qu'un refus ne doit JAMAIS laisser passer · titres et contenus des trois portées. */
const SECRETS = ['TITRE_PLATEFORME_55', 'TEXTE_PLATEFORME_55', 'TITRE_ESPACE_55', 'TEXTE_ESPACE_55', 'TITRE_MARQUE_55', 'TEXTE_MARQUE_55', 'MarqueNeva55'];

const base = (o: Record<string, unknown>) => ({ user: { id: ids.user, email: 'membre@client.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', ...o });
const REFUSES: Array<[string, () => unknown]> = [
  ['membre d’un espace Starter', () => base({ role: 'member', plan: 'starter', equipe: null })],
  ['membre d’équipe freelance (offre Business)', () => base({ role: 'member', plan: 'business', equipe: { role: 'freelance', matrice: {} } })],
  ['client_viewer (offre Business)', () => base({ role: 'client_viewer', plan: 'business', equipe: null })],
  // Sans élargissement · la matrice ouvre Jarvis au rôle d'équipe « membre »,
  // mais le rôle d'ESPACE reste lecture seule · refusé comme avant.
  ['client_viewer membre d’équipe « membre » (rubrique Jarvis)', () => base({ role: 'client_viewer', plan: 'business', equipe: { role: 'membre', matrice: {} } })],
];
const AUTORISES: Array<[string, () => unknown]> = [
  ['fondateur (espace Starter)', () => base({ role: 'owner', plan: 'starter', user: { id: ids.user, email: 'kguilbaux@agence-glx.fr', name: null }, equipe: { role: 'adminplus', matrice: {} } })],
  ['membre d’un espace Core', () => base({ role: 'member', plan: 'core', equipe: null })],
  ['membre d’un espace Plus', () => base({ role: 'member', plan: 'plus', equipe: null })],
];

let mock: Awaited<ReturnType<typeof demarrerMockFournisseur>>;
const remiser = () => { h.tablesLues = []; h.marqueLue = 0; h.consigne = 0; h.pourReponse = 0; h.titres = 0; };
const poser = async (q = 'Comment itérer ?') => {
  const res = await POST(new Request('http://local/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: q }) }));
  return { status: res.status, type: res.headers.get('content-type'), texte: await res.text() };
};

beforeAll(async () => {
  await publierRegistreDeTest(depotPrompts);
  mock = await demarrerMockFournisseur(() => 'Réponse simulée.');
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = mock.url;
  delete process.env.AI_SPEND_CAP_USD;
  await db.insert(schema.workspaces).values([{ id: ids.ws, name: 'Démo' }, { id: ids.ws2, name: 'Autre' }]);
  await db.insert(schema.users).values({ id: ids.user, email: 'membre@client.test' });
  await db.insert(schema.brands).values([{ id: ids.brand, workspaceId: ids.ws, name: 'MarqueNeva55' }, { id: ids.brand2, workspaceId: ids.ws2, name: 'Autre' }]);
  const K = [
    publiee('55555555-0000-4000-8000-000000000001', { titre: 'TITRE_PLATEFORME_55', texte: 'TEXTE_PLATEFORME_55' }),
    publiee('55555555-0000-4000-8000-000000000002', { titre: 'TITRE_ESPACE_55', texte: 'TEXTE_ESPACE_55', portee: { niveau: 'espace', workspaceId: ids.ws } }),
    publiee('55555555-0000-4000-8000-000000000003', { titre: 'TITRE_MARQUE_55', texte: 'TEXTE_MARQUE_55', portee: { niveau: 'marque', workspaceId: ids.ws, brandId: ids.brand } }),
    publiee('55555555-0000-4000-8000-000000000004', { titre: 'TITRE_AILLEURS_55', texte: 'TEXTE_AILLEURS_55', portee: { niveau: 'marque', workspaceId: ids.ws2, brandId: ids.brand2 } }),
  ];
  await db.insert(schema.appSettings).values(K.map((c) => ({ key: `connaissance:${c.id}`, value: c })));
  invaliderConnaissances();
});
afterAll(async () => { await mock.fermer(); });
beforeEach(remiser);

describe('a · route /api/jarvis/chat · refus serveur réel, AVANT toute lecture', () => {
  for (const [nom, session] of REFUSES) {
    it(`${nom} → 403, rien lu, rien transmis`, async () => {
      h.session = session();
      const envoyees = mock.recues.length;
      const r = await poser();
      expect(r.status, 'le refus n’est pas un 403').toBe(403);
      expect(r.type).toBe('application/json');
      expect(JSON.parse(r.texte)).toEqual({ error: 'Accès refusé.' });
      for (const sec of SECRETS) expect(r.texte).not.toContain(sec);
      expect(h.tablesLues, 'une table a été lue avant le refus').toEqual([]);
      expect(h.tablesLues).not.toContain('app_settings');
      expect(h.marqueLue, 'la marque active a été lue avant le refus').toBe(0);
      expect(h.consigne, 'la consigne a été composée avant le refus').toBe(0);
      expect(mock.recues.length, 'une requête est partie vers le fournisseur').toBe(envoyees);
    });
  }
});

describe('a · chatThreadAction · même porte, aucun titre ni type renvoyé', () => {
  for (const [nom, session] of REFUSES) {
    it(`${nom} → refus, rien lu`, async () => {
      h.session = session();
      const r = await chatThreadAction();
      expect(r.thread).toBeUndefined();
      expect(r.error).toBeTruthy();
      const json = JSON.stringify(r);
      for (const sec of SECRETS) expect(json).not.toContain(sec);
      expect(h.tablesLues).toEqual([]);
      expect(h.marqueLue + h.pourReponse + h.titres).toBe(0);
    });
  }
});

describe('b · parcours autorisés inchangés · la consigne porte les connaissances applicables', () => {
  for (const [nom, session] of AUTORISES) {
    it(`${nom} · route 200, plateforme + espace + marque dans la consigne, rien d’ailleurs`, async () => {
      h.session = session();
      const r = await poser();
      expect(r.status).toBe(200);
      const sys = mock.recues[mock.recues.length - 1]!.system;
      for (const t of ['TEXTE_PLATEFORME_55', 'TEXTE_ESPACE_55', 'TEXTE_MARQUE_55']) expect(sys).toContain(t);
      expect(sys).not.toContain('TEXTE_AILLEURS_55');
      // L'observateur de lectures voit bien `app_settings` quand l'accès est ouvert.
      expect(h.tablesLues).toContain('app_settings');
    });
    it(`${nom} · le fil renvoie les titres inclus`, async () => {
      h.session = session();
      const r = await chatThreadAction();
      const titres = r.thread?.contexte.connaissances?.inclus.map((i) => i.titre) ?? [];
      expect(titres).toEqual(expect.arrayContaining(['TITRE_PLATEFORME_55', 'TITRE_ESPACE_55', 'TITRE_MARQUE_55']));
      expect(titres).not.toContain('TITRE_AILLEURS_55');
    });
  }
});

describe('c · pages refusées · l’écran de refus existant, aucune donnée', () => {
  const pages: Array<[string, () => Promise<React.ReactElement>, string]> = [
    ['/jarvis', () => JarvisPage(), 'Jarvis'],
    ['/jarvis/sources', () => SourcesPage(), 'Sources de Jarvis'],
  ];
  for (const [chemin, page, titre] of pages) {
    for (const [nom, session] of REFUSES) {
      it(`${chemin} · ${nom}`, async () => {
        h.session = session();
        const html = renderToStaticMarkup(await page());
        expect(html).toContain(`>${titre}</h1>`);
        expect(html).toMatch(/Fonctionnalité incluse dès l(’|'|&#x27;)abonnement Core|Accès réservé/);
        for (const sec of SECRETS) expect(html).not.toContain(sec);
        expect(h.tablesLues).toEqual([]);
        expect(h.marqueLue).toBe(0);
      });
    }
  }
  it('Starter · la raison est l’offre · client_viewer et freelance · le rôle', async () => {
    h.session = REFUSES[0]![1]();
    expect(renderToStaticMarkup(await JarvisPage())).toContain('Jarvis est disponible à partir du plan Core');
    for (const i of [1, 2]) {
      h.session = REFUSES[i]![1]();
      expect(renderToStaticMarkup(await JarvisPage())).toContain('Ton rôle ne permet pas d');
    }
  });
  it('autorisé · /jarvis rend la conversation, pas le refus', async () => {
    h.session = AUTORISES[1]![1]();
    const html = renderToStaticMarkup(await JarvisPage());
    expect(html).toContain('MarqueNeva55');
    expect(html).not.toContain('Accès réservé');
    expect(html).not.toContain('Fonctionnalité incluse');
  });
});
