// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ecranSpatial, messagesRetourProfil } from '@tiktrends/core';

/**
 * Vague 4 · « Mon profil » (`/profile`) et « Tagging » (`/tags`) · écrans V5
 * sans fragment de maquette, portés dans Spatial et EXCLUSIFS (pages V5
 * retirées). On REND la vraie page serveur (base pglite, session simulée) et on
 * lit le HTML · droits, valeurs réelles, gestes branchés.
 *
 * Gardes V5 PORTÉES ici (leur fichier V5 est retiré) :
 *  · S24 (`formulaires-labels-lies`) · Nom et E-mail sont enrobés dans leur libellé ;
 *  · `profile-sans-emoji` · aucun pictogramme, le téléversement porte une icône du jeu ;
 *  · recette #106 (`demo-sortie`, `radar-tagging-copie`, `demo-etat-unifie`) ·
 *    Tagging ne présente aucun chiffre d'exemple comme le sien, dit sa limite,
 *    et ne promet aucun branchement de compte.
 */
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), user: randomUUID() };
});
const etat = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error('redirect ' + u); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/profile',
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_noStore: () => {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));

import { db, schema } from '@tiktrends/db';
import ProfilSpatial from '../app/(spatial)/sp/profile/page';
import TaggingSpatial from '../app/(spatial)/sp/tags/page';

const FONDATEUR = 'kguilbaux@agence-glx.fr';
const session = (o: Record<string, unknown> = {}) => ({
  user: { id: ids.user, email: 'membre@agence.test', name: 'Camille Durand' },
  workspaceId: ids.ws, workspaceName: 'Agence Nord', role: 'member', plan: 'core', equipe: null, ...o,
});

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence Nord', plan: 'core' });
  await db!.insert(schema.users).values({ id: ids.user, email: 'membre@agence.test', name: 'Camille Durand', avatarUrl: 'data:image/jpeg;base64,AAAA', hidePersonalInfo: true });
});
beforeEach(() => { etat.session = session(); });

const profil = async () => renderToStaticMarkup(await ProfilSpatial());
const tagging = async () => renderToStaticMarkup(await TaggingSpatial());
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const liens = (html: string) => [...dom(html).querySelectorAll('[data-geste="acces"] a')].map((a) => [a.getAttribute('href'), a.textContent]);

describe('Spatial · Mon profil · servi par Spatial', () => {
  it('servi par Spatial, accent Réglages', () => {
    expect(ecranSpatial('/profile')).toEqual({ interne: '/sp/profile', section: 'reglages' });
  });
});

describe('Spatial · Mon profil · la page réelle', () => {
  it('sans session · renvoi à la connexion (même garde que la V5)', async () => {
    etat.session = null;
    await expect(profil()).rejects.toThrow('redirect /login');
  });

  it('l’identité vient de la base · nom, e-mail figé, photo, confidentialité', async () => {
    const d = dom(await profil());
    const id = d.querySelector('[data-geste="identite"]')!;
    expect(id, 'tuile Identité absente').not.toBeNull();
    expect((id.querySelector('input[name="name"]') as HTMLInputElement).value).toBe('Camille Durand');
    const mail = [...id.querySelectorAll('input')].find((i) => i.value === 'membre@agence.test') as HTMLInputElement;
    expect(mail?.disabled, 'l’e-mail (identifiant) doit rester figé').toBe(true);
    expect(id.querySelector('[data-avatar] img')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
    expect(id.querySelector('[role="switch"]')?.getAttribute('aria-checked'), 'la confidentialité ne reflète pas la base').toBe('true');
  });

  it('S24 · Nom et E-mail sont enrobés dans leur libellé (association sans id)', async () => {
    const d = dom(await profil());
    const champ = (n: string) => [...d.querySelectorAll('label')].find((l) => l.textContent?.startsWith(n));
    expect(champ('Nom complet')?.querySelector('input[name="name"]') ?? null, 'Nom complet non lié').toBeInstanceOf(HTMLInputElement);
    expect(champ('E-mail')?.querySelector('input') ?? null, 'E-mail non lié').toBeInstanceOf(HTMLInputElement);
  });

  it('aucun pictogramme · le téléversement porte une icône du jeu', async () => {
    // Les tuiles de l'écran · l'en-tête commun garde le « ⌘K » de la maquette.
    const ecran = dom(await profil()).querySelector('.grid2')!;
    const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    expect(PICTO.test(ecran.textContent ?? ''), 'emoji à l’écran').toBe(false);
    const bouton = [...ecran.querySelectorAll('button')].find((b) => b.textContent?.includes('Téléverser une photo'));
    expect(bouton?.querySelector('use')?.getAttribute('href')).toBe('#i-img');
  });

  it('mot de passe · le formulaire de l’action réelle (actuel + nouveau, 8 min.)', async () => {
    const f = dom(await profil()).querySelector('[data-geste="mot-de-passe"] form')!;
    expect(f, 'formulaire absent').not.toBeNull();
    expect((f.querySelector('input[name="current"]') as HTMLInputElement).type).toBe('password');
    expect((f.querySelector('input[name="next"]') as HTMLInputElement).minLength).toBe(8);
  });

  it('chaque retour de `changePasswordAction` a son message', () => {
    const src = readFileSync(join(process.cwd(), 'app/actions/admin.ts'), 'utf8');
    const corps = src.slice(src.indexOf('export async function changePasswordAction'), src.indexOf('/* ------------------------------- Espace'));
    const codes = [...corps.matchAll(/redirect\('\/profile\?(ok|e)=(\w+)'\)/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(codes.sort()).toEqual(['e:current', 'e:weak', 'ok:pw']);
    for (const c of codes) expect(messagesRetourProfil()[c], `${c} sans message`).toBeTruthy();
  });

  it('droits · membre : espace, rôle et formule lus, aucun lien d’administration', async () => {
    const html = await profil();
    const acces = dom(html).querySelector('[data-geste="acces"]')!.textContent;
    expect(acces).toContain('Agence Nord');
    expect(acces).toContain('Core');
    expect(liens(html)).toEqual([]);
  });

  it('droits · administrateur : l’abonnement, pas le Tour de contrôle', async () => {
    etat.session = session({ role: 'admin' });
    expect(liens(await profil())).toEqual([['/billing', 'Abonnement & factures']]);
  });

  it('droits · fondateur administrateur : l’abonnement ET le Tour de contrôle', async () => {
    etat.session = session({ role: 'owner', user: { id: ids.user, email: FONDATEUR, name: 'K' } });
    expect(liens(await profil())).toEqual([['/billing', 'Abonnement & factures'], ['/admin', 'Tour de contrôle']]);
  });

  it('droits · fondateur simple membre de l’espace : rien (la porte de /admin exige l’administration)', async () => {
    etat.session = session({ role: 'member', user: { id: ids.user, email: FONDATEUR, name: 'K' } });
    expect(liens(await profil())).toEqual([]);
  });
});

describe('Spatial · Tagging · aucun chiffre d’exemple, la limite dite', () => {
  it('servi par Spatial, accent de la Veille', () => {
    expect(ecranSpatial('/tags')).toEqual({ interne: '/sp/tags', section: 'veille' });
  });

  it('sans session · renvoi à la connexion', async () => {
    etat.session = null;
    await expect(tagging()).rejects.toThrow('redirect /login');
  });

  it('aucun multiplicateur ni échantillon · la limite est dite · aucune promesse de branchement', async () => {
    const html = await tagging();
    const texte = dom(html).querySelector('.dempty')?.textContent ?? '';
    expect(texte, 'la limite n’est pas dite').toContain('pas encore disponible');
    expect(html, 'un chiffre d’exemple est affiché').not.toMatch(/\d[.,]\d{2}×/);
    expect(html, 'promesse de branchement').not.toMatch(/Branche un compte|Brancher un compte|href="\/connections"/);
  });

  it('sortie réelle · les apprentissages seulement avec Résultats (offre Plus)', async () => {
    expect(dom(await tagging()).querySelector('.dempty a'), 'Core n’a pas Résultats · aucune sortie').toBeNull();
    etat.session = session({ plan: 'plus' });
    expect(dom(await tagging()).querySelector('.dempty a')?.getAttribute('href')).toBe('/adsmap/apprentissages');
  });
});
