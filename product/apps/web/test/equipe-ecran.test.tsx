// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L'écran d'équipe doit VRAIMENT laisser gérer rôles et droits · on rend la
 * VRAIE page Spatiale (« Rôles & droits », `/admin/equipe`, base pglite) et on
 * lit le HTML, pas la présence d'un appel :
 *  - chaque membre se gère · son rôle est présélectionné, on peut retirer un
 *    autre membre, jamais soi-même ;
 *  - la matrice montre une case par rubrique, à l'état RÉEL (défaut du rôle si
 *    aucune ligne, matrice éditée sinon) ;
 *  - les rôles à accès total (Admin+/Admin) n'ont PAS de colonne (jamais
 *    éditables · on ne peut pas se verrouiller hors de l'admin).
 * Spatial · vague 3 · porté de l'écran V5 `EcranEquipe` (retiré).
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
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, usePathname: () => '/admin/equipe', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
// On ne charge pas les vraies actions serveur · on vérifie l'UI (les actions ont leurs propres gardes, `equipe-actions-garde`).
vi.mock('../app/actions/equipe', () => ({ enregistrerStaffAction: async () => {}, retirerStaffAction: async () => {}, enregistrerMatriceAction: async () => {} }));

import { db, schema } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import { avecSpatial } from './spatial/fournisseur';
import DroitsSpatial from '../app/(spatial)/sp/admin/equipe/page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let hote: HTMLDivElement;
let root: Root;
afterEach(async () => { act(() => root.unmount()); hote.remove(); await db.delete(schema.platformRoleRights); });

const ids = h.ids;
const moi = 'ua@studios.test';
beforeAll(async () => {
  await semer(db, schema, ids);
  await db.insert(schema.platformStaff).values([{ email: moi, role: 'adminplus' }, { email: 'dev@agence-glx.fr', role: 'dev' }]);
});

async function monter() {
  h.session = session(ids, 'ua', { role: 'owner', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } as SessionTest['equipe'] });
  const vue = await DroitsSpatial({ searchParams: Promise.resolve({}) });
  hote = document.createElement('div'); document.body.appendChild(hote);
  root = createRoot(hote);
  await act(async () => { root.render(avecSpatial(vue)); });
}
const cliquer = async (e: Element | null) => { expect(e).toBeTruthy(); await act(async () => { (e as HTMLElement).click(); }); };
/** La case de la matrice d'un rôle (libellé affiché) pour une rubrique (libellé). */
const caseMatrice = (rubrique: string, role: string) => hote.querySelector(`button.amc[aria-label="${rubrique} · ${role} : Accès"], button.amc[aria-label="${rubrique} · ${role} : Aucun"]`)?.getAttribute('aria-label')?.split(' : ')[1];

describe('écran équipe · membres', () => {
  it('liste chaque membre · le rôle de Dev est présélectionné quand on le gère', async () => {
    await monter();
    expect(hote.textContent).toContain(moi);
    expect(hote.textContent).toContain('dev@agence-glx.fr');
    await cliquer(hote.querySelector('[aria-label="Gérer dev@agence-glx.fr"]'));
    const f = hote.querySelector('form[data-geste="changer-role"]')!;
    expect((f.querySelector('input[name="email"]') as HTMLInputElement).value).toBe('dev@agence-glx.fr');
    expect((f.querySelector('select[name="role"]') as HTMLSelectElement).value).toBe('dev');
  });

  it('propose de retirer un autre membre, jamais soi-même', async () => {
    await monter();
    await cliquer(hote.querySelector('[aria-label="Gérer dev@agence-glx.fr"]'));
    expect([...hote.querySelectorAll('button')].some((b) => b.textContent === 'Retirer de l’équipe…'), 'on peut retirer un autre').toBe(true);
    await cliquer(hote.querySelector('.paywrap'));
    act(() => root.unmount()); hote.remove();
    await monter();
    await cliquer(hote.querySelector(`[aria-label="Gérer ${moi}"]`));
    expect([...hote.querySelectorAll('button')].some((b) => b.textContent === 'Retirer de l’équipe…'), 'on ne se retire pas soi-même').toBe(false);
  });
});

describe('écran équipe · matrice des droits', () => {
  it('suit les défauts quand aucune ligne n’existe (Membre voit Studios, pas Adsmap)', async () => {
    await monter();
    expect(caseMatrice('Studios', 'Membre'), 'Membre voit Studios par défaut').toBe('Accès');
    expect(caseMatrice('Adsmap', 'Membre'), 'Membre ne voit pas Adsmap par défaut').toBe('Aucun');
  });

  it('la matrice éditée prime sur les défauts', async () => {
    await db.insert(schema.platformRoleRights).values({ role: 'membre', rubriques: ['studio', 'adsmap'] });
    await monter();
    expect(caseMatrice('Adsmap', 'Membre'), 'la ligne ouvre Adsmap').toBe('Accès');
    act(() => root.unmount()); hote.remove();
    await db.delete(schema.platformRoleRights);
    await db.insert(schema.platformRoleRights).values({ role: 'membre', rubriques: [] });
    await monter();
    expect(caseMatrice('Studios', 'Membre'), 'la ligne vide referme Studios').toBe('Aucun');
  });

  it('les rôles à accès total n’ont pas de colonne (jamais éditables)', async () => {
    await monter();
    const entetes = [...hote.querySelectorAll('.amxr.h > span')].map((s) => s.textContent).filter(Boolean);
    expect(entetes).toContain('Membre');
    expect(entetes).not.toContain('Admin+');
    expect(entetes).not.toContain('Admin');
  });
});
