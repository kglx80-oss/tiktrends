// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L'entrée « Nouveau concept créatif » sur `/studio/projets`, au RÉSULTAT, sur
 * une vraie base (pglite). Mandat Kevin du 20/10.
 *
 * Ce qui a changé · le CTA n'ouvre PLUS une modale Titre/Type qui crée le projet
 * sur-le-champ · il NAVIGUE vers l'écran de concept (`/studio/projets/nouveau/
 * concept`), qui n'écrit RIEN et n'appelle RIEN au GET. On rend les VRAIES pages
 * et on LIT la base :
 *  · la liste porte un LIEN vers l'écran de concept (plus de formulaire) ;
 *  · rendre l'écran de concept n'écrit AUCUNE ligne `studio_projects` ;
 *  · les portes mortes restent dites (sans marque, lecture seule, capacité) ;
 *  · l'écriture canonique `creerProjet` n'a PAS bougé · appelée, elle crée.
 */

const h = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  active: null as { id: string; name: string } | null,
}));
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
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => h.active, listBrands: async () => [] }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect ${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq, and } from '@tiktrends/db';
import { cleInterrupteursEspace } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import ProjetsPage from '../app/(app)/studio/projets/page';
import NouveauConceptPage from '../app/(app)/studio/projets/nouveau/concept/page';
import PreparerProjetPage from '../app/(app)/studio/projets/nouveau/page';

const ids = h.ids;
const CONCEPT = '/studio/projets/nouveau/concept';
const projetsPage = () => ProjetsPage({ searchParams: Promise.resolve({}) });
const rendu = async (el: ReturnType<typeof projetsPage>) => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(await el); return d; };
const projetsDe = (brandId: string, userId: string) => db.select().from(schema.studioProjects)
  .where(and(eq(schema.studioProjects.brandId, brandId), eq(schema.studioProjects.ownerId, userId)));

beforeAll(async () => { await semer(db, schema, ids); });
beforeEach(() => { h.session = session(ids, 'ua'); h.active = { id: ids.brandA1, name: 'Marque A1' }; });
afterEach(async () => {
  document.body.innerHTML = '';
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, cleInterrupteursEspace(ids.wsA)));
});

describe('/studio/projets · l’entrée « Nouveau concept créatif » navigue, ne crée pas sur place', () => {
  it('la liste porte un LIEN vers l’écran de concept (membre, marque active) · aucune modale', async () => {
    const d = await rendu(projetsPage());
    const cta = d.querySelector('a[data-nouveau-projet="pret"]');
    expect(cta, 'lien « Nouveau concept créatif » absent de la liste').not.toBeNull();
    expect(cta!.getAttribute('href')).toBe(CONCEPT);
    expect(cta!.textContent).toContain('Nouveau concept créatif');
    expect(d.querySelector('a[href="/veille"]')?.textContent).toBe('Créer depuis la Veille');
    // Plus de modale Titre/Type ouverte depuis la liste.
    expect(d.querySelector('form[data-formulaire="nouveau-projet"]')).toBeNull();
    expect(d.querySelector('#np-titre')).toBeNull();
  });

  it('rendre l’écran de concept n’écrit AUCUNE ligne `studio_projects` · accroche + composeur inerte', async () => {
    const avant = (await projetsDe(ids.brandA1, ids.ua)).length;
    const d = await rendu(NouveauConceptPage());
    expect((await projetsDe(ids.brandA1, ids.ua)).length, 'l’ouverture de l’écran a écrit en base').toBe(avant);
    expect(d.querySelector('[data-concept="pret"] [data-accroche]')?.textContent).toBe('Que veux-tu créer pour Marque A1 ?');
    expect(d.querySelector('[data-composeur] textarea')).not.toBeNull();
    const envoi = d.querySelector('[data-envoi="a-venir"]') as HTMLButtonElement | null;
    expect(envoi?.disabled, 'l’envoi n’est pas désactivé').toBe(true);
    expect(d.querySelector('form')).toBeNull();
  });
});

describe('jamais de porte morte', () => {
  it('sans marque active · on le dit, avec la porte vers les marques', async () => {
    h.active = null;
    const d = await rendu(projetsPage());
    expect(d.querySelector('a[data-nouveau-projet="pret"]')).toBeNull();
    const e = d.querySelector('[data-nouveau-projet="sans-marque"]');
    expect(e?.textContent).toContain('choisis une marque active');
    expect(e?.querySelector('a[href="/brands"]')?.textContent).toBe('Choisir une marque');
  });

  it('lecture seule (équipe, rôle d’espace lecteur) · on le dit, et le serveur refuse aussi', async () => {
    h.session = session(ids, 'uv', { equipe: { role: 'membre', matrice: {}, plateformeAdmissible: false } as SessionTest['equipe'] });
    const d = await rendu(projetsPage());
    expect(d.querySelector('a[data-nouveau-projet="pret"]')).toBeNull();
    expect(d.querySelector('[data-nouveau-projet="lecture-seule"]')?.textContent).toContain('pas d’en créer');
    const { creerProjet } = await import('../app/actions/studios/projets');
    const r = await creerProjet({ brandId: ids.brandA1, kind: 'ads', title: 'Forcé' });
    expect(!r.ok && r.code).toBe('FORBIDDEN');
  });

  it('capacité « projets » coupée · la page dit « non activé », aucun lien', async () => {
    const value = { actives: [], coupees: ['projets'] };
    await db.insert(schema.appSettings).values({ key: cleInterrupteursEspace(ids.wsA), value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
    const d = await rendu(projetsPage());
    expect(d.querySelector('[data-etat="non-active"]')?.getAttribute('data-capacites')).toBe('projets');
    expect(d.querySelector('[data-nouveau-projet]')).toBeNull();
  });
});

describe('pas de 4e porte orpheline · l’assistant « depuis zéro » ne double plus l’entrée cliente', () => {
  it('un membre qui arrive sur l’ancien assistant SANS contexte est mené à l’écran de concept', async () => {
    // Le membre « ua » n'est pas de l'équipe interne (ADMIN+ en secours) · sa
    // création « depuis zéro » passe par l'écran de concept, jamais par deux
    // portes concurrentes.
    await expect(PreparerProjetPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow('redirect /studio/projets/nouveau/concept');
  });

  it('un lien AVEC contexte (angle repris d’une annonce) n’est PAS dévié · le flux de reprise reste entier', async () => {
    // Un contexte dans l'adresse (ici l'angle) · la page le relit et sert la
    // préparation, elle ne redirige pas vers l'écran de concept.
    await expect(PreparerProjetPage({ searchParams: Promise.resolve({ angle: 'Hook témoignage' }) }))
      .resolves.toBeTruthy();
  });
});

describe('l’écriture canonique n’a pas bougé', () => {
  it('`creerProjet` crée vraiment une ligne `studio_projects` pour la marque active', async () => {
    const avant = (await projetsDe(ids.brandA1, ids.ua)).length;
    const { creerProjet } = await import('../app/actions/studios/projets');
    const r = await creerProjet({ brandId: ids.brandA1, kind: 'ads', title: 'Rentrée · accroche chiffrée' });
    expect(r.ok, 'creerProjet a échoué').toBe(true);
    const lignes = await projetsDe(ids.brandA1, ids.ua);
    expect(lignes.length).toBe(avant + 1);
    const cree = lignes.find((l) => l.title === 'Rentrée · accroche chiffrée');
    expect(cree, 'projet créé introuvable').toMatchObject({ workspaceId: ids.wsA, brandId: ids.brandA1, kind: 'ads' });
    expect(cree!.currentVersionId, 'projet sans version courante').not.toBeNull();
  });
});
