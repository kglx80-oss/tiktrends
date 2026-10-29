import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Équipe · retirer un membre, changer son rôle · sur une VRAIE base (pglite,
 * migrations réelles) et les VRAIES actions. On lit la base après le geste
 * (adhésion, compte, contenus, journal d'audit) et le HTML de la VRAIE page
 * `/team` Spatiale · jamais la présence d'un appel.
 */
const etat = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/mailer', () => ({ appUrl: () => 'https://app.exemple.invalid' }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/team',
}));

import { db, schema, eq, and } from '@tiktrends/db';
import { RAISON_REFUS_MEMBRE } from '@tiktrends/core';
import { changerRoleMembreAction, retirerMembreAction } from '../app/actions/membres';
import EquipeSpatiale from '../app/(spatial)/sp/team/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

type Role = 'owner' | 'admin' | 'member' | 'client_viewer';
interface Espace { ws: string; ids: Record<string, string> }

async function espace(roles: Record<string, Role>): Promise<Espace> {
  const ws = randomUUID();
  await db.insert(schema.workspaces).values({ id: ws, name: 'Espace test', plan: 'business' });
  const ids: Record<string, string> = {};
  for (const [nom, role] of Object.entries(roles)) {
    const id = randomUUID(); ids[nom] = id;
    await db.insert(schema.users).values({ id, email: `${nom}.${ws.slice(0, 8)}@exemple.invalid`, name: nom });
    await db.insert(schema.workspaceMembers).values({ workspaceId: ws, userId: id, role });
  }
  return { ws, ids };
}
const agir = (e: Espace, nom: string, role: Role) => {
  etat.session = { workspaceId: e.ws, workspaceName: 'Espace test', role, plan: 'business', user: { id: e.ids[nom], email: `${nom}.${e.ws.slice(0, 8)}@exemple.invalid`, name: nom } };
};
const fd = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
const roleDe = async (e: Espace, nom: string) => (await db.select({ role: schema.workspaceMembers.role }).from(schema.workspaceMembers)
  .where(and(eq(schema.workspaceMembers.workspaceId, e.ws), eq(schema.workspaceMembers.userId, e.ids[nom]!))))[0]?.role ?? null;
const journal = async (e: Espace) => db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.workspaceId, e.ws));

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Propriétaire' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const page = async () => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{await EquipeSpatiale()}</FournisseurSpatial>);
/** Le `<select>` de rôle d'un membre, tel que rendu. */
const menu = (html: string, nom: string) => new RegExp(`<select aria-label="Rôle de ${nom}"[^>]*>`).exec(html)?.[0] ?? '';
const croix = (html: string, nom: string) => new RegExp(`<button class="btn sm icon" type="button" aria-label="Retirer ${nom}"[^>]*>`).exec(html)?.[0] ?? '';

beforeEach(() => { etat.session = null; });

describe('Équipe · retrait d’un membre', () => {
  it('un admin retire un membre · l’adhésion disparaît, le compte et ses contenus restent, le journal le dit', async () => {
    const e = await espace({ proprio: 'owner', admin: 'admin', marine: 'member' });
    const asset = randomUUID();
    await db.insert(schema.assets).values({ id: asset, workspaceId: e.ws, uploaderUserId: e.ids.marine, name: 'visuel.png', url: 'https://exemple.invalid/v.png' });
    agir(e, 'admin', 'admin');
    await expect(retirerMembreAction(fd({ userId: e.ids.marine! }))).rejects.toThrow('REDIRECT /team?ok=membre_retire');
    expect(await roleDe(e, 'marine')).toBeNull();
    expect((await db.select().from(schema.users).where(eq(schema.users.id, e.ids.marine!))).length, 'le compte reste').toBe(1);
    const [a] = await db.select().from(schema.assets).where(eq(schema.assets.id, asset));
    expect(a?.uploaderUserId, 'ce qu’il a créé reste à l’espace, attribué').toBe(e.ids.marine);
    const j = await journal(e);
    expect(j.map((x) => [x.action, x.targetId, x.versionBefore, x.versionAfter, x.actorId])).toEqual([['equipe.membre.retire', e.ids.marine, 'member', null, e.ids.admin]]);
  });

  it('un membre n’en retire aucun · refusé, rien d’écrit', async () => {
    const e = await espace({ proprio: 'owner', marine: 'member', paul: 'member' });
    agir(e, 'marine', 'member');
    await expect(retirerMembreAction(fd({ userId: e.ids.paul! }))).rejects.toThrow('REDIRECT /team?e=forbidden');
    expect(await roleDe(e, 'paul')).toBe('member');
    expect(await journal(e)).toEqual([]);
  });

  it('un client en lecture n’en retire aucun · refusé', async () => {
    const e = await espace({ proprio: 'owner', lecteur: 'client_viewer', paul: 'member' });
    agir(e, 'lecteur', 'client_viewer');
    await expect(retirerMembreAction(fd({ userId: e.ids.paul! }))).rejects.toThrow('REDIRECT /team?e=forbidden');
    expect(await roleDe(e, 'paul')).toBe('member');
  });

  it('le seul propriétaire ne se retire pas, et un admin ne le retire pas', async () => {
    const e = await espace({ proprio: 'owner', admin: 'admin' });
    agir(e, 'proprio', 'owner');
    await expect(retirerMembreAction(fd({ userId: e.ids.proprio! }))).rejects.toThrow('REDIRECT /team?e=soi');
    agir(e, 'admin', 'admin');
    await expect(retirerMembreAction(fd({ userId: e.ids.proprio! }))).rejects.toThrow('REDIRECT /team?e=proprietaire');
    expect(await roleDe(e, 'proprio')).toBe('owner');
    expect(await journal(e)).toEqual([]);
  });

  it('une personne d’un AUTRE espace · introuvable ici, son adhésion là-bas intacte', async () => {
    const a = await espace({ proprio: 'owner' });
    const b = await espace({ autre: 'member' });
    agir(a, 'proprio', 'owner');
    await expect(retirerMembreAction(fd({ userId: b.ids.autre! }))).rejects.toThrow('REDIRECT /team?e=membre_absent');
    expect(await roleDe(b, 'autre')).toBe('member');
  });
});

describe('Équipe · changement de rôle', () => {
  it('un propriétaire passe un membre admin · écrit et journalisé avant/après', async () => {
    const e = await espace({ proprio: 'owner', marine: 'member' });
    agir(e, 'proprio', 'owner');
    await expect(changerRoleMembreAction(fd({ userId: e.ids.marine!, role: 'admin' }))).rejects.toThrow('REDIRECT /team?ok=role_change');
    expect(await roleDe(e, 'marine')).toBe('admin');
    expect((await journal(e)).map((x) => [x.action, x.versionBefore, x.versionAfter])).toEqual([['equipe.membre.role', 'member', 'admin']]);
  });

  it('jamais un second propriétaire, jamais un rôle inconnu', async () => {
    const e = await espace({ proprio: 'owner', marine: 'member' });
    agir(e, 'proprio', 'owner');
    await expect(changerRoleMembreAction(fd({ userId: e.ids.marine!, role: 'owner' }))).rejects.toThrow('REDIRECT /team?e=role');
    await expect(changerRoleMembreAction(fd({ userId: e.ids.marine!, role: 'dieu' }))).rejects.toThrow('REDIRECT /team?e=role');
    expect(await roleDe(e, 'marine')).toBe('member');
  });

  it('le seul propriétaire n’est pas rétrogradé ; avec un second, un propriétaire le peut', async () => {
    const e = await espace({ proprio: 'owner', admin: 'admin' });
    agir(e, 'proprio', 'owner');
    await expect(changerRoleMembreAction(fd({ userId: e.ids.proprio!, role: 'admin' }))).rejects.toThrow('REDIRECT /team?e=soi');
    const f = await espace({ p1: 'owner', p2: 'owner' });
    agir(f, 'p1', 'owner');
    await expect(changerRoleMembreAction(fd({ userId: f.ids.p2!, role: 'admin' }))).rejects.toThrow('REDIRECT /team?ok=role_change');
    expect(await roleDe(f, 'p2')).toBe('admin');
    // p1 est désormais le SEUL propriétaire · p2 (admin) ne peut plus rien sur lui.
    agir(f, 'p2', 'admin');
    await expect(changerRoleMembreAction(fd({ userId: f.ids.p1!, role: 'member' }))).rejects.toThrow('REDIRECT /team?e=proprietaire');
    expect(await roleDe(f, 'p1')).toBe('owner');
  });

  it('un membre ne change aucun rôle · refusé, rien d’écrit', async () => {
    const e = await espace({ proprio: 'owner', marine: 'member', paul: 'member' });
    agir(e, 'marine', 'member');
    await expect(changerRoleMembreAction(fd({ userId: e.ids.paul!, role: 'admin' }))).rejects.toThrow('REDIRECT /team?e=forbidden');
    expect(await roleDe(e, 'paul')).toBe('member');
    expect(await journal(e)).toEqual([]);
  });
});

describe('Équipe · la page rend les contrôles ouverts ou fermés selon la même règle', () => {
  it('vue d’un admin · membre ouvert (rôle et croix), propriétaire fermé avec sa raison, aucune mention « pas encore disponible »', async () => {
    const e = await espace({ proprio: 'owner', admin: 'admin', marine: 'member' });
    agir(e, 'admin', 'admin');
    const html = await page();
    expect(html).not.toContain('pas encore disponible');
    expect(menu(html, 'marine')).not.toContain('disabled');
    expect(croix(html, 'marine')).not.toContain('disabled');
    expect(menu(html, 'proprio')).toContain('disabled');
    expect(menu(html, 'proprio')).toContain(`title="${RAISON_REFUS_MEMBRE.proprietaire}"`);
    expect(croix(html, 'proprio')).toContain(`title="${RAISON_REFUS_MEMBRE.proprietaire}"`);
    // « Propriétaire » visible dans le menu, jamais choisissable.
    expect(html).toMatch(/<option value="owner" disabled="">Propriétaire<\/option>/);
  });

  it('vue du seul propriétaire · les autres membres ouverts ; sa propre ligne n’a aucun contrôle', async () => {
    const e = await espace({ proprio: 'owner', marine: 'member' });
    agir(e, 'proprio', 'owner');
    const html = await page();
    expect(menu(html, 'marine')).not.toContain('disabled');
    expect(menu(html, 'proprio')).toBe('');
  });

  it('un membre n’ouvre pas la page (même garde que l’invitation)', async () => {
    const e = await espace({ proprio: 'owner', marine: 'member' });
    agir(e, 'marine', 'member');
    await expect(page()).rejects.toThrow('REDIRECT /dashboard');
  });
});
