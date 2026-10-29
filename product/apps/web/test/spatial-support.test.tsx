// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ecranSpatial, messagesRetourSupport } from '@tiktrends/core';

/**
 * Vague 4 · « Support » (`/support`, `/support/[id]`) · écrans V5 sans fragment
 * de maquette, portés dans Spatial et EXCLUSIFS (pages V5 retirées). On REND
 * les vraies pages serveur (base pglite, session simulée) et on lit le HTML ·
 * qui voit quel ticket, qui change le statut, ce que dit l'écran.
 *
 * Gardes V5 PORTÉES ici (leurs fichiers ou cas V5 sont retirés) :
 *  · recette #106 (`compte-support-recette`) · aucune promesse d'une équipe
 *    qui ne reçoit pas les tickets, la portée est dite ; le fil a son retour à
 *    la liste, une réponse nommée, des statuts annoncés, un « rouvrir » fidèle ;
 *  · S24 (`support-invite-labels`) · Type, Titre et Message enrobés ;
 *  · `support-sans-emoji` · aucun pictogramme, le type est nommé en mots ;
 *  · `empty-adoption` · une liste vide est une bonne nouvelle (« tout roule »).
 */
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return {
    ws: randomUUID(), autre: randomUUID(), auteur: randomUUID(), voisin: randomUUID(), admin: randomUUID(),
    t1: randomUUID(), t2: randomUUID(), ancien: randomUUID(), resolu: randomUUID(), etranger: randomUUID(),
  };
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
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/support',
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_noStore: () => {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));

import { db, schema } from '@tiktrends/db';
import SupportSpatial from '../app/(spatial)/sp/support/page';
import TicketSpatial from '../app/(spatial)/sp/support/[id]/page';

const qui = (id: string, role: string, ws = ids.ws) => ({ user: { id, email: `${id.slice(0, 6)}@agence.test`, name: 'Personne' }, workspaceId: ws, workspaceName: 'Agence', role, plan: 'core', equipe: null });
const AUTEUR = () => qui(ids.auteur, 'member');
const VOISIN = () => qui(ids.voisin, 'member');
const ADMIN = () => qui(ids.admin, 'admin');

beforeAll(async () => {
  await db!.insert(schema.workspaces).values([{ id: ids.ws, name: 'Agence', plan: 'core' }, { id: ids.autre, name: 'Ailleurs', plan: 'core' }]);
  await db!.insert(schema.users).values([ids.auteur, ids.voisin, ids.admin].map((id) => ({ id, email: `${id.slice(0, 6)}@agence.test`, name: 'Personne' })));
  await db!.insert(schema.tickets).values([
    { id: ids.t1, workspaceId: ids.ws, userId: ids.auteur, authorName: 'Camille', type: 'bug', title: 'Export cassé', body: 'Le PDF ne sort pas', status: 'open' },
    { id: ids.t2, workspaceId: ids.ws, userId: ids.voisin, authorName: 'Sacha', type: 'suggestion', title: 'Idée de filtre', body: 'x', status: 'in_progress' },
    { id: ids.ancien, workspaceId: ids.ws, userId: ids.auteur, authorName: 'Camille', type: 'question', title: 'Ancien ticket', body: 'Corps historique sans message', status: 'open' },
    { id: ids.resolu, workspaceId: ids.ws, userId: ids.auteur, authorName: 'Camille', type: 'question', title: 'Réglé', body: 'q', status: 'resolved' },
    { id: ids.etranger, workspaceId: ids.autre, userId: ids.auteur, authorName: 'Camille', type: 'bug', title: 'Autre espace', body: 'z', status: 'open' },
  ]);
  await db!.insert(schema.ticketMessages).values([
    { ticketId: ids.t1, userId: ids.auteur, authorName: 'Camille', body: 'Le PDF ne sort pas', isStaff: false, createdAt: new Date('2026-10-20T09:00:00Z') },
    { ticketId: ids.t1, userId: ids.admin, authorName: 'Alex', body: 'On regarde', isStaff: true, createdAt: new Date('2026-10-20T10:00:00Z') },
  ]);
});
beforeEach(() => { etat.session = AUTEUR(); });

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const liste = async () => dom(renderToStaticMarkup(await SupportSpatial()));
const fil = async (id: string) => dom(renderToStaticMarkup(await TicketSpatial({ params: Promise.resolve({ id }) })));
const titres = (d: HTMLElement) => [...d.querySelectorAll('[data-geste="tickets"] a strong')].map((x) => x.textContent).sort();

describe('Spatial · Support · servi par Spatial', () => {
  it('liste et fil servis par Spatial, accent Réglages', () => {
    expect(ecranSpatial('/support')).toEqual({ interne: '/sp/support', section: 'reglages' });
    expect(ecranSpatial('/support/abc')).toEqual({ interne: '/sp/support/abc', section: 'reglages' });
  });
});

describe('Spatial · Support · la liste', () => {
  it('sans session · renvoi à la connexion', async () => {
    etat.session = null;
    await expect(liste()).rejects.toThrow('redirect /login');
  });

  it('un membre ne voit que SES tickets de l’espace', async () => {
    expect(titres(await liste())).toEqual(['Ancien ticket', 'Export cassé', 'Réglé']);
  });

  it('un administrateur voit tous les tickets de SON espace, avec leur auteur', async () => {
    etat.session = ADMIN();
    const d = await liste();
    expect(titres(d)).toEqual(['Ancien ticket', 'Export cassé', 'Idée de filtre', 'Réglé']);
    expect(d.querySelector('[data-geste="tickets"]')!.textContent).toContain('Sacha');
  });

  it('liste vide · une bonne nouvelle (« tout roule »)', async () => {
    etat.session = qui(ids.voisin, 'member', ids.autre);
    const t = (await liste()).querySelector('[data-geste="tickets"]')!.textContent;
    expect(t).toContain('tout roule');
  });

  it('#106 · la portée est dite, aucune promesse d’une équipe qui ne reçoit pas les tickets', async () => {
    const d = await liste();
    expect(d.querySelector('[data-geste="portee"]')?.textContent).toContain('il n’est pas transmis automatiquement à l’équipe TikTrends');
    expect(d.textContent).not.toMatch(/On te répond|on te répond vite|on répond vite|Notre équipe te répond/);
  });

  it('S24 · Type, Titre et Message enrobés · le formulaire de l’action réelle', async () => {
    const f = (await liste()).querySelector('[data-geste="nouveau-ticket"] form')!;
    const champ = (n: string) => [...f.querySelectorAll('label')].find((l) => l.textContent?.startsWith(n))?.querySelector('select, input, textarea') ?? null;
    expect(champ('Type')?.getAttribute('name')).toBe('type');
    expect(champ('Titre')?.getAttribute('name')).toBe('title');
    expect(champ('Message')?.getAttribute('name')).toBe('body');
    expect([...f.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Question', 'Bug', 'Suggestion']);
  });

  it('G10 (planche v4) · le champ Message est le champ multi-ligne de la maquette · `.field` ne stylant que `input` et `select`, un `textarea` nu tombait en chasse fixe sur 36 px', async () => {
    const css = readFileSync(join(__dirname, '..', 'spatial', 'spatial.css'), 'utf8');
    expect(css, '`.field` style désormais `textarea` · relire G10').not.toMatch(/\.field textarea/);
    const ta = /(?:^|\n)\.ta\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(ta, 'la classe `.ta` de la maquette a changé').toMatch(/min-height:90px/);
    expect(ta).toMatch(/font:14px\/1\.5 var\(--sf\)/);
    const f = (await liste()).querySelector('[data-geste="nouveau-ticket"] form')!;
    const message = [...f.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Message'))?.querySelector('textarea');
    expect(message?.getAttribute('name')).toBe('body');
    expect(message?.classList.contains('ta'), 'champ Message sans la classe `.ta` · police à chasse fixe, 36 px de haut').toBe(true);
  });

  it('aucun pictogramme · le type est nommé en mots', async () => {
    const zone = (await liste()).querySelector('.grid2')!;
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2728}\u{2726}\u{FE0F}]/u.test(zone.textContent ?? '')).toBe(false);
    expect([...zone.querySelectorAll('[data-geste="tickets"] .pill')].map((p) => p.textContent)).toContain('Bug');
  });
});

describe('Spatial · Support · le fil d’un ticket', () => {
  it('l’auteur lit son fil · messages réels, équipe marquée, retour à la liste', async () => {
    const d = await fil(ids.t1);
    expect(d.querySelector('a[href="/support"]')?.textContent).toContain('Tous les tickets');
    const msgs = [...d.querySelectorAll('.savmsg')];
    expect(msgs.map((m) => m.querySelector('p')?.textContent)).toEqual(['Le PDF ne sort pas', 'On regarde']);
    expect(msgs.map((m) => m.classList.contains('a'))).toEqual([false, true]);
  });

  it('un autre membre de l’espace · renvoyé à la liste (interdit)', async () => {
    etat.session = VOISIN();
    await expect(fil(ids.t1)).rejects.toThrow('redirect /support?e=forbidden');
  });

  it('un ticket d’un autre espace · introuvable, même pour son auteur', async () => {
    await expect(fil(ids.etranger)).rejects.toThrow('notFound');
  });

  it('statut · réservé à l’administrateur, statut courant annoncé (aria-pressed)', async () => {
    expect((await fil(ids.t1)).querySelector('[data-geste="statut"]'), 'un membre change le statut').toBeNull();
    etat.session = ADMIN();
    const g = (await fil(ids.t1)).querySelector('[data-geste="statut"]')!;
    const b = [...g.querySelectorAll('button')].map((x) => [x.textContent, x.getAttribute('aria-pressed')]);
    expect(b).toEqual([['Ouvert', 'true'], ['En cours', 'false'], ['Résolu', 'false']]);
    expect([...g.querySelectorAll('input[name="status"]')].map((i) => (i as HTMLInputElement).value)).toEqual(['open', 'in_progress', 'resolved']);
  });

  it('G11 (planche finale) · la bulle `.sm` de la maquette n’atteint ni les boutons de statut ni les avatars du fil', async () => {
    // `.sm{padding:12px 14px;max-width:85%}` (bulle de message) touche `.btn.sm` et `.savav.sm` · mesuré au banc :
    // « En cours » sur deux lignes (bouton à 85 % de son formulaire), avatars 30 × 30 avec 2 px de contenu.
    etat.session = ADMIN();
    const d = await fil(ids.t1);
    const boutons = [...d.querySelectorAll<HTMLElement>('[data-geste="statut"] button')];
    expect(boutons.map((b) => b.textContent)).toEqual(['Ouvert', 'En cours', 'Résolu']);
    expect(boutons.map((b) => b.style.maxWidth), '« En cours » passe sur deux lignes · bouton limité à 85 % de son formulaire').toEqual(['none', 'none', 'none']);
    expect(boutons.map((b) => b.style.padding), 'la marge du bouton (`.btn.sm`) doit rester celle de la maquette').toEqual(['', '', '']);
    const avatars = [...d.querySelectorAll<HTMLElement>('.savmsg .savav')];
    expect(avatars.length).toBe(2);
    expect(avatars.map((a) => a.style.padding), 'initiales rognées · la marge de la bulle (12 px 14 px) mange l’avatar de 30 px').toEqual(['0px', '0px']);
  });

  it('réponse nommée selon le rôle', async () => {
    const aria = async () => (await fil(ids.t1)).querySelector('[data-geste="repondre"] textarea')?.getAttribute('aria-label');
    expect(await aria()).toBe('Ton message dans le fil');
    etat.session = ADMIN();
    expect(await aria()).toBe('Ta réponse dans le fil');
  });

  it('ticket résolu · le membre peut écrire, sans promesse de réouverture automatique', async () => {
    const t = (await fil(ids.resolu)).textContent ?? '';
    expect(t).toContain('un admin de l’espace peut le rouvrir');
    expect(t).not.toContain('Réponds ci-dessous pour le rouvrir');
  });

  it('ancien ticket sans message · son corps tient lieu d’ouverture', async () => {
    expect([...(await fil(ids.ancien)).querySelectorAll('.savmsg p')].map((p) => p.textContent)).toEqual(['Corps historique sans message']);
  });
});

describe('Spatial · Support · retours des actions', () => {
  it('chaque `?ok=` / `?e=` de `app/actions/support.ts` a son message', () => {
    const src = readFileSync(join(process.cwd(), 'app/actions/support.ts'), 'utf8');
    const codes = [...new Set([...src.matchAll(/\?(ok|e)=(\w+)/g)].map((m) => `${m[1]}:${m[2]}`))];
    expect(codes.length).toBeGreaterThanOrEqual(8);
    for (const c of codes) expect(messagesRetourSupport()[c], `${c} sans message`).toBeTruthy();
  });
});
