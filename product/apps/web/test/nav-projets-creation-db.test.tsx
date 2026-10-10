// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * « Nouveau projet » sur `/studio/projets`, au RÉSULTAT, sur une vraie base (pglite).
 *
 * Le défaut · `creerProjet` n'était appelé par aucune interface · hors Veille,
 * impossible de créer un projet. On rend la VRAIE page, on la monte (jsdom),
 * on clique le bouton, on valide le formulaire · puis on LIT la base : une
 * ligne `studio_projects` existe pour la marque active, et l'écran ouvre ce
 * projet. Puis les états où le geste ne peut pas aboutir · jamais un bouton mort.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  active: null as { id: string; name: string } | null,
  pousses: [] as string[],
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
  useRouter: () => ({ refresh: () => {}, push: (u: string) => { h.pousses.push(u); }, replace: () => {} }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq, and } from '@tiktrends/db';
import { cleInterrupteursEspace } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import ProjetsPage from '../app/(app)/studio/projets/page';

const ids = h.ids;
const page = () => ProjetsPage({ searchParams: Promise.resolve({}) });
const statique = async () => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(await page()); return d; };

/** Monte la vraie page (ses composants clients vivants) · le bouton est celui que l'on voit. */
async function monter() {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  const el = await page();
  await act(async () => { racine.render(el); });
  return { hote, fermer: async () => { await act(async () => { racine.unmount(); }); hote.remove(); } };
}
async function cliquer(el: Element | null) {
  expect(el, 'élément à cliquer absent').not.toBeNull();
  await act(async () => { (el as HTMLElement).click(); });
}
async function soumettre() {
  const f = document.querySelector('form[data-formulaire="nouveau-projet"]');
  expect(f, 'formulaire « Nouveau projet » absent').not.toBeNull();
  await act(async () => { f!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  // L'action serveur est asynchrone (transaction pglite) · on laisse la file se vider.
  for (let i = 0; i < 20 && !h.pousses.length && !document.querySelector('[data-formulaire="nouveau-projet"] [role="alert"]'); i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
}
async function changerTitre(v: string) {
  const i = document.querySelector('#np-titre') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); });
}
const projetsDe = (brandId: string, userId: string) => db.select().from(schema.studioProjects)
  .where(and(eq(schema.studioProjects.brandId, brandId), eq(schema.studioProjects.ownerId, userId)));

beforeAll(async () => { await semer(db, schema, ids); });
beforeEach(() => { h.pousses = []; h.session = session(ids, 'ua'); h.active = { id: ids.brandA1, name: 'Marque A1' }; });
afterEach(async () => {
  document.body.innerHTML = '';
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, cleInterrupteursEspace(ids.wsA)));
});

describe('/studio/projets · « Nouveau projet » crée vraiment un projet', () => {
  it('le bouton est sur la page (membre, marque active)', async () => {
    const d = await statique();
    const b = d.querySelector('button[data-nouveau-projet="pret"]');
    expect(b, 'bouton « Nouveau projet » absent de la liste des projets').not.toBeNull();
    expect(b!.textContent).toBe('Nouveau projet');
    expect(d.querySelector('a[href="/veille"]')?.textContent).toBe('Créer depuis la Veille');
  });

  it('clic → formulaire → une ligne studio_projects pour la marque ACTIVE, puis le projet s’ouvre', async () => {
    expect(await projetsDe(ids.brandA1, ids.ua)).toHaveLength(0);
    const { hote, fermer } = await monter();
    await cliquer(hote.querySelector('button[data-nouveau-projet="pret"]'));
    expect((document.querySelector('#np-titre') as HTMLInputElement).value).toBe('Pub statique · Marque A1');
    await changerTitre('Rentrée · accroche chiffrée');
    await soumettre();

    const lignes = await projetsDe(ids.brandA1, ids.ua);
    expect(lignes, 'aucun projet écrit en base après le clic').toHaveLength(1);
    expect(lignes[0]).toMatchObject({ workspaceId: ids.wsA, brandId: ids.brandA1, kind: 'ads', title: 'Rentrée · accroche chiffrée' });
    expect(lignes[0]!.currentVersionId, 'projet sans version courante').not.toBeNull();
    expect(h.pousses, 'le projet créé ne s’ouvre pas').toEqual([`/studio/projets/${lignes[0]!.id}`]);
    await fermer();
  });

  it('refus du serveur (marque hors portée du membre restreint) · son message s’affiche, rien n’est écrit', async () => {
    h.session = session(ids, 'ur');
    h.active = { id: ids.brandA2, name: 'Marque A2' };
    const { hote, fermer } = await monter();
    await cliquer(hote.querySelector('button[data-nouveau-projet="pret"]'));
    await soumettre();
    const alerte = document.querySelector('[data-formulaire="nouveau-projet"] [role="alert"]');
    expect(alerte?.textContent).toContain('Projet introuvable · vérifie la marque active');
    expect(alerte?.textContent).toMatch(/identifiant support : st_/);
    expect(await projetsDe(ids.brandA2, ids.ur)).toHaveLength(0);
    expect(h.pousses).toEqual([]);
    // La saisie reste · on peut corriger et réessayer.
    expect((document.querySelector('#np-titre') as HTMLInputElement).value).toBe('Pub statique · Marque A2');
    await fermer();
  });
});

describe('jamais de bouton mort', () => {
  it('sans marque active · on le dit, avec la porte vers les marques', async () => {
    h.active = null;
    const d = await statique();
    expect(d.querySelector('button[data-nouveau-projet]')).toBeNull();
    const e = d.querySelector('[data-nouveau-projet="sans-marque"]');
    expect(e?.textContent).toContain('choisis une marque active');
    expect(e?.querySelector('a[href="/brands"]')?.textContent).toBe('Choisir une marque');
  });

  it('lecture seule (équipe, rôle d’espace lecteur) · on le dit, et le serveur refuse aussi', async () => {
    h.session = session(ids, 'uv', { equipe: { role: 'membre', matrice: {}, plateformeAdmissible: false } as SessionTest['equipe'] });
    const d = await statique();
    expect(d.querySelector('button[data-nouveau-projet]')).toBeNull();
    expect(d.querySelector('[data-nouveau-projet="lecture-seule"]')?.textContent).toContain('pas d’en créer');
    const { creerProjet } = await import('../app/actions/studios/projets');
    const r = await creerProjet({ brandId: ids.brandA1, kind: 'ads', title: 'Forcé' });
    expect(!r.ok && r.code).toBe('FORBIDDEN');
  });

  it('capacité « projets » coupée · la page dit « non activé », aucun bouton', async () => {
    const value = { actives: [], coupees: ['projets'] };
    await db.insert(schema.appSettings).values({ key: cleInterrupteursEspace(ids.wsA), value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
    const d = await statique();
    expect(d.querySelector('[data-etat="non-active"]')?.getAttribute('data-capacites')).toBe('projets');
    expect(d.querySelector('[data-nouveau-projet]')).toBeNull();
  });
});
