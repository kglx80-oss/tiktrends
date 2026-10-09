// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * F1 · garde UI des interrupteurs, au HTML RENDU des vraies pages (pglite).
 *
 *  · l'atelier d'un projet ne LIE pas un écran coupé : il le nomme « non
 *    activé pour cet espace », sans `href` (aucun lien mort) ;
 *  · une page coupée ouverte par URL directe le dit (et propose des portes qui
 *    existent : projet, écran historique, support) ;
 *  · la voix coupée laisse lire les modes de parole sans pouvoir les changer ;
 *  · la page ADMIN lit l'état par espace, et la refuse à un owner d'espace.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null, listBrands: async () => [] }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); }, useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq } from '@tiktrends/db';
import { cleInterrupteursEspace } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { projetTest } from './l3-harnais';
import ProjetsPage from '../app/(app)/studio/projets/page';
import ProjetPage from '../app/(app)/studio/projets/[id]/page';
import VideoPage from '../app/(app)/studio/projets/[id]/video/page';
import ImagePage from '../app/(app)/studio/projets/[id]/image/page';
import IdentitesPage from '../app/(app)/studio/projets/[id]/identites/page';
import TextesPage from '../app/(app)/studio/projets/[id]/textes/page';
import InterrupteursPage from '../app/(app)/admin/studios-interrupteurs/page';
import { ParcoursNonActive } from '../components/studios/image/ParcoursImage';

const ids = h.ids;
let projet = '';
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const reglage = async (value: unknown) => {
  await db.insert(schema.appSettings).values({ key: cleInterrupteursEspace(ids.wsA), value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
};
const defauts = () => { for (const k of ['STUDIOS_CAPACITES_GENERALES', 'STUDIOS_CAPACITES_COUPEES', 'STUDIOS_ESPACES_PILOTES', 'STUDIOS_CAPACITES_PILOTES']) vi.stubEnv(k, ''); };

beforeAll(async () => {
  await semer(db, schema, ids);
  projet = (await projetTest(db, ids, ids.brandA1, ids.ua)).projectId;
});
beforeEach(() => { h.session = session(ids, 'ua'); defauts(); });
afterEach(async () => { vi.unstubAllEnvs(); await db.delete(schema.appSettings).where(eq(schema.appSettings.key, cleInterrupteursEspace(ids.wsA))); });

describe('atelier du projet · filtrage de la navigation', () => {
  it('défauts · la vidéo n’est pas un lien, elle se dit « non activé pour cet espace » ; le reste mène à son écran', async () => {
    const d = dom(renderToStaticMarkup(await ProjetPage({ params: Promise.resolve({ id: projet }), searchParams: Promise.resolve({}) })));
    const nav = d.querySelector('nav[aria-label="Atelier du projet"]')!;
    expect([...nav.querySelectorAll('a')].map((a) => a.getAttribute('data-atelier'))).toEqual(['image', 'produit', 'textes', 'identites', 'export']);
    expect(nav.querySelector(`a[href$="/video"]`), 'lien mort vers la vidéo coupée').toBeNull();
    const coupee = nav.querySelector('[data-atelier="video"]')!;
    expect(coupee.tagName).toBe('SPAN');
    expect(coupee.getAttribute('aria-disabled')).toBe('true');
    expect(coupee.textContent).toBe('Vidéo · storyboard et montage · non activé pour cet espace');
  });

  it('espace pilote vidéo · le lien revient', async () => {
    await reglage({ actives: ['video'], coupees: [] });
    const d = dom(renderToStaticMarkup(await ProjetPage({ params: Promise.resolve({ id: projet }), searchParams: Promise.resolve({}) })));
    expect(d.querySelector(`nav[aria-label="Atelier du projet"] a[href="/studio/projets/${projet}/video"]`)?.textContent).toBe('Vidéo · storyboard et montage');
    expect(d.textContent).not.toContain('non activé pour cet espace');
  });
});

describe('URL directe d’un écran coupé · la page le dit', () => {
  it('vidéo · « Non activé pour cet espace », retour au projet, Vidéo IA historique proposée', async () => {
    const d = dom(renderToStaticMarkup(await VideoPage(params(projet))));
    const s = d.querySelector('[data-etat="non-active"]')!;
    expect(s.getAttribute('data-capacites')).toBe('video');
    expect(s.querySelector('h1')?.textContent).toBe('Vidéo · storyboard et images clés');
    expect(s.querySelector('[role="status"]')?.textContent).toContain('Non activé pour cet espace');
    expect(s.textContent).toContain('Rien n’a été écrit ni débité.');
    const liens = [...s.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(liens).toEqual([
      ['‹ Projet', `/studio/projets/${projet}`],
      ['Revenir au projet', `/studio/projets/${projet}`],
      ['Ouvrir Vidéo IA', '/studio/video'],
      ['Écrire au support', '/support'],
    ]);
  });

  it('éditeur coupé en urgence pour l’espace · la page image le dit (et pas « Document indisponible »)', async () => {
    await reglage({ actives: [], coupees: ['editeur'] });
    const d = dom(renderToStaticMarkup(await ImagePage(params(projet))));
    expect(d.querySelector('[data-etat="non-active"]')?.getAttribute('data-capacites')).toBe('editeur');
    expect(d.textContent).not.toContain('Document indisponible');
    expect(d.textContent).toContain('Coupé par l’équipe de la plateforme.');
  });

  it('textes coupés · la sous-page passe par RefusProjet, qui rend le même écran', async () => {
    await reglage({ actives: [], coupees: ['textes'] });
    const d = dom(renderToStaticMarkup(await TextesPage(params(projet))));
    expect(d.querySelector('[data-etat="non-active"]')?.getAttribute('data-capacites')).toBe('textes');
    expect(d.querySelector('a[href="/studio/textes"]')?.textContent).toBe('Ouvrir Textes IA');
  });

  it('projets coupés · la liste le dit et renvoie au Studio historique', async () => {
    await reglage({ actives: [], coupees: ['projets'] });
    const d = dom(renderToStaticMarkup(await ProjetsPage({ searchParams: Promise.resolve({}) })));
    expect(d.querySelector('[data-etat="non-active"]')?.getAttribute('data-capacites')).toBe('projets');
    expect(d.querySelector('a[href="/studio"]')?.textContent).toBe('‹ Studio IA');
  });
});

describe('voix coupée · lire oui, changer non', () => {
  it('le panneau voix le dit ; aucun sélecteur de mode n’est actif', async () => {
    const d = dom(renderToStaticMarkup(await IdentitesPage(params(projet))));
    expect(d.querySelector('[data-zone="voix"] [data-etat="non-active"]')?.textContent).toContain('Voix · non activé pour cet espace.');
    for (const s of d.querySelectorAll('[data-zone="voix"] select')) expect(s.hasAttribute('disabled')).toBe(true);
    await reglage({ actives: ['voix'], coupees: [] });
    const actif = dom(renderToStaticMarkup(await IdentitesPage(params(projet))));
    expect(actif.querySelector('[data-zone="voix"] [data-etat="non-active"]')).toBeNull();
  });
});

describe('parcours image coupé · un état, pas une erreur', () => {
  it('aucun geste offert, le message du serveur est dit', () => {
    const d = dom(renderToStaticMarkup(<ParcoursNonActive message="« Génération d’images » · non activé pour cet espace. Rien n’a été écrit ni débité." />));
    expect(d.querySelector('[data-etat="non-active"] h2')?.textContent).toBe('Génération d’images · non activé pour cet espace');
    expect(d.querySelector('[role="alert"]')).toBeNull();
    expect(d.querySelectorAll('button').length).toBe(0);
  });
});

describe('ADMIN · lecture des interrupteurs par espace', () => {
  const plateforme = () => session(ids, 'ua', { role: 'owner', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } as SessionTest['equipe'] });

  it('un owner d’espace voit le refus, aucune donnée', async () => {
    h.session = session(ids, 'ua', { role: 'owner' });
    const d = dom(renderToStaticMarkup(await InterrupteursPage({ searchParams: Promise.resolve({}) })));
    expect(d.querySelector('[data-etat="acces-refuse"]')?.textContent).toContain('Accès réservé à l’équipe de la plateforme.');
    expect(d.querySelector('[data-espace]')).toBeNull();
    expect(d.querySelector('[data-capacite]')).toBeNull();
  });

  it('la plateforme lit l’état général, l’environnement et le détail d’un espace pilote', async () => {
    h.session = plateforme();
    vi.stubEnv('STUDIOS_CAPACITES_GENERALES', 'controle_visuel nimporte');
    await reglage({ actives: ['video'], coupees: ['textes'] });
    const d = dom(renderToStaticMarkup(await InterrupteursPage({ searchParams: Promise.resolve({ espace: ids.wsA }) })));
    const etat = (sel: string) => { const e = d.querySelector(sel)!.querySelector('[data-active]')!; return [e.getAttribute('data-active'), e.textContent]; };
    expect(etat('[data-capacite="generation_image"]')).toEqual(['non', 'Coupée · défaut']);
    expect(etat('[data-capacite="controle_visuel"]')).toEqual(['oui', 'Active · généralisée (environnement)']);
    expect(etat('[data-capacite="projets"]')).toEqual(['oui', 'Active · défaut']);
    expect(d.querySelector('[data-env="STUDIOS_CAPACITES_GENERALES"]')?.textContent).toContain('ignorées (inconnues) : nimporte');
    expect(etat('[data-detail-capacite="video"]')).toEqual(['oui', 'Active · espace pilote (réglage plateforme)']);
    expect(etat('[data-detail-capacite="textes"]')).toEqual(['non', 'Coupée · coupée pour cet espace (réglage plateforme)']);
    expect(d.querySelector('[data-formulaire="interrupteurs"] select[name="video"] option[selected]')?.textContent).toBe('Allumée (pilote)');
    expect(d.querySelector('[data-formulaire="interrupteurs"] select[name="benchmark_reel"]'), 'capacité de plateforme réglable par espace').toBeNull();
    expect(d.querySelector(`[data-espace="${ids.wsA}"]`)?.textContent).toContain('Vidéo · storyboard et images clés · active');
  });
});
