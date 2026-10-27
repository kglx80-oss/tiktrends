// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Nouveau projet ouvre le wizard du prototype du 21 octobre.
 * La navigation de secours, les accès historiques et les droits restent couverts.
 * Les vraies lectures de pages ne doivent jamais créer de projet au GET.
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
  usePathname: () => '/studio/projets',
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq, and } from '@tiktrends/db';
import { cleInterrupteursEspace } from '@tiktrends/core';
import { session, semer } from './studios-semis';
// Vague 2 · la liste et l'écran de concept ne sont plus servis que par Spatial (pages V5 retirées) ·
// la préparation `/studio/projets/nouveau` (assistant V5) reste une page V5.
import ProjetsPage from '../app/(spatial)/sp/studio/projets/page';
import NouveauConceptPage from '../app/(spatial)/sp/studio/projets/nouveau/concept/page';
import { avecSpatial } from './spatial/fournisseur';
import PreparerProjetPage from '../app/(app)/studio/projets/nouveau/page';
import { AssistantDepuisContexte } from '../components/studios/projet/AssistantDepuisContexte';

const ids = h.ids;
const CONCEPT = '/studio/projets/nouveau';
const projetsPage = () => ProjetsPage({ searchParams: Promise.resolve({}) });
const rendu = async (el: Promise<import('react').ReactElement>) => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(avecSpatial(await el)); return d; };
const projetsDe = (brandId: string, userId: string) => db.select().from(schema.studioProjects)
  .where(and(eq(schema.studioProjects.brandId, brandId), eq(schema.studioProjects.ownerId, userId)));

beforeAll(async () => { await semer(db, schema, ids); });
beforeEach(() => { h.session = session(ids, 'ua'); h.active = { id: ids.brandA1, name: 'Marque A1' }; });
afterEach(async () => {
  document.body.innerHTML = '';
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, cleInterrupteursEspace(ids.wsA)));
});

describe('/studio/projets · l’entrée « Nouveau concept créatif » navigue, ne crée pas sur place', () => {
  it('la liste porte un lien de secours vers le wizard (membre, marque active) · aucun formulaire au rendu', async () => {
    const d = await rendu(projetsPage());
    const cta = d.querySelector('a.ctanew');
    expect(cta, 'lien « Nouveau projet » absent de la liste').not.toBeNull();
    expect(cta!.getAttribute('href')).toBe(CONCEPT);
    expect(cta!.textContent).toContain('Nouveau projet');
    expect(d.querySelector('a[href="/veille"]')?.textContent).toBe('Veille');
    // Plus de modale Titre/Type ouverte depuis la liste.
    expect(d.querySelector('form[data-formulaire="nouveau-projet"]')).toBeNull();
    expect(d.querySelector('#np-titre')).toBeNull();
  });

  it('rendre l’écran de concept n’écrit AUCUNE ligne `studio_projects` · accroche + composeur à envoi réel', async () => {
    // GUARD #1 (garde-le vert) · le GET n'écrit RIEN · la création est DIFFÉRÉE
    // au premier message (PR3), elle ne part pas au rendu.
    const avant = (await projetsDe(ids.brandA1, ids.ua)).length;
    const d = await rendu(NouveauConceptPage());
    expect((await projetsDe(ids.brandA1, ids.ua)).length, 'l’ouverture de l’écran a écrit en base').toBe(avant);
    expect(d.querySelector('[data-concept="pret"] [data-accroche]')?.textContent).toBe('Que veux-tu créer pour Marque A1 ?');
    expect(d.querySelector('[data-composeur] textarea')).not.toBeNull();
    // L'envoi est RÉEL (plus « à venir ») mais désactivé tant que la saisie est
    // vide · au rendu, il n'écrit rien (vérifié ci-dessus).
    expect(d.querySelector('[data-envoi="a-venir"]')).toBeNull();
    const envoi = d.querySelector('[data-envoi="pret"]') as HTMLButtonElement | null;
    expect(envoi, 'bouton d’envoi absent').not.toBeNull();
    expect(envoi!.disabled, 'l’envoi devrait être désactivé tant que la saisie est vide').toBe(true);
    expect(d.querySelector('form')).toBeNull();
  });
});

describe('jamais de porte morte', () => {
  it('sans marque active · on le dit, avec la porte vers les marques', async () => {
    h.active = null;
    const d = await rendu(projetsPage());
    expect(d.querySelector('a.ctanew')).toBeNull();
    const e = d.querySelector('[data-nouveau-projet="sans-marque"]');
    expect(e?.textContent).toContain('choisis une marque active');
    expect(e?.querySelector('a[href="/brands"]')?.textContent).toBe('Choisir une marque');
  });

  it('lecture seule (équipe, rôle d’espace lecteur) · on le dit, et le serveur refuse aussi', async () => {
    h.session = session(ids, 'uv', { equipe: { role: 'membre', matrice: {}, plateformeAdmissible: false } as SessionTest['equipe'] });
    const d = await rendu(projetsPage());
    expect(d.querySelector('a.ctanew')).toBeNull();
    expect(d.querySelector('[data-nouveau-projet="lecture-seule"]')?.textContent).toContain('pas d’en créer');
    const { creerProjet } = await import('../app/actions/studios/projets');
    const r = await creerProjet({ brandId: ids.brandA1, kind: 'ads', title: 'Forcé' });
    expect(!r.ok && r.code).toBe('FORBIDDEN');
  });

  it('capacité « projets » coupée · la page dit « non activé », aucun lien', async () => {
    const value = { actives: [], coupees: ['projets'] };
    await db.insert(schema.appSettings).values({ key: cleInterrupteursEspace(ids.wsA), value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
    const d = await rendu(projetsPage());
    expect(d.querySelector('.tile h3')?.textContent).toBe('Non activé pour cet espace');
    expect(d.querySelector('[data-nouveau-projet], a.ctanew')).toBeNull();
  });
});

describe('pas de 4e porte orpheline · l’assistant « depuis zéro » ne double plus l’entrée cliente', () => {
  it('sans contexte, rend le même assistant sans écrire au GET', async () => {
    const avant = (await projetsDe(ids.brandA1, ids.ua)).length;
    const page = await PreparerProjetPage({ searchParams: Promise.resolve({}) });
    expect(page.type).toBe(AssistantDepuisContexte);
    expect(page.props.etat).toMatchObject({ etat: 'pret', marque: { id: ids.brandA1 } });
    expect((await projetsDe(ids.brandA1, ids.ua)).length).toBe(avant);
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
