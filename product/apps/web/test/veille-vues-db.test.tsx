import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * Veille · vues enregistrées · sur une VRAIE base (pglite, migrations réelles)
 * avec les VRAIES actions (`app/actions/veille-vues`) et la VRAIE page
 * « Pubs du moment ». On lit la base après le geste et le HTML rendu · jamais
 * la présence d'un appel. Isolation entre personnes ET entre espaces, garde de
 * la Veille (rôle, offre), refus des paramètres hors liste.
 */
const etat = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => null }));
vi.mock('../lib/veille-recette-base', () => ({ baseUrlRecette: () => undefined, cleEffective: () => undefined }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/veille',
}));

import { db, schema, eq } from '@tiktrends/db';
import { PLAFOND_VUES_VEILLE } from '@tiktrends/core';
import { garderVueVeille, renommerVueVeilleAction, supprimerVueVeille } from '../app/actions/veille-vues';
import { cleVuesVeille } from '../lib/veille-vues';
import VeilleSpatiale from '../app/(spatial)/sp/veille/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

type Role = 'owner' | 'admin' | 'member' | 'client_viewer';
type Plan = 'starter' | 'core' | 'plus' | 'business';
interface Personne { ws: string; user: string; nom: string }

async function espace(plan: Plan = 'business'): Promise<string> {
  const ws = randomUUID();
  await db.insert(schema.workspaces).values({ id: ws, name: 'Espace test', plan });
  return ws;
}
async function membre(ws: string, nom: string, role: Role = 'member', user: string = randomUUID()): Promise<Personne> {
  const [deja] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, user));
  if (!deja) await db.insert(schema.users).values({ id: user, email: `${nom}.${user.slice(0, 8)}@exemple.invalid`, name: nom });
  await db.insert(schema.workspaceMembers).values({ workspaceId: ws, userId: user, role });
  return { ws, user, nom };
}
const agir = (p: Personne, role: Role = 'member', plan: Plan = 'business') => {
  etat.session = { workspaceId: p.ws, workspaceName: 'Espace test', role, plan, user: { id: p.user, email: `${p.nom}.${p.user.slice(0, 8)}@exemple.invalid`, name: p.nom } };
};
const ligne = async (p: Personne) => (await db.select({ value: schema.appSettings.value }).from(schema.appSettings)
  .where(eq(schema.appSettings.key, cleVuesVeille(p.ws, p.user))))[0]?.value as { vues: Array<{ id: string; nom: string; params: Record<string, string> }> } | undefined;
const nomsEnBase = async (p: Personne) => (await ligne(p))?.vues.map((v) => v.nom) ?? [];

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const page = async (sp: Record<string, string> = {}) => renderToStaticMarkup(
  <FournisseurSpatial value={CTX}>{(await VeilleSpatiale({ searchParams: Promise.resolve(sp) })) as ReactElement}</FournisseurSpatial>,
);
/** Les onglets de la barre de vue, tels que rendus (libellé + état pressé). */
const onglets = (html: string) => {
  const bloc = /<div class="xtabs" role="group" aria-label="Vue">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
  return [...bloc.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => `${m[2]!.replace(/<[^>]+>/g, '')}${/aria-pressed="true"/.test(m[1]!) ? ' *' : ''}`);
};

beforeEach(() => { etat.session = null; vi.stubEnv('TRENDTRACK_API_KEY', ''); });

describe('Veille · vues · créer, lister, supprimer (vraies actions, vraie base)', () => {
  it('garder une vue l’écrit dans la ligne de CETTE personne, avec les paramètres canoniques · la page la montre, signalée sur son adresse', async () => {
    const ws = await espace();
    const marine = await membre(ws, 'marine');
    agir(marine);
    const r = await garderVueVeille({ nom: '  Belgique   vidéo ', params: { country: 'be', media: 'video', cpm: '9' } });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const l = await ligne(marine);
    expect(l?.vues.map((v) => [v.nom, v.params])).toEqual([['Belgique vidéo', { media: 'video', country: 'BE' }]]);

    const ici = await page({ country: 'BE', media: 'video' });
    expect(onglets(ici)).toEqual(['Toutes les pubs', 'Tendance', 'Suivies', 'Belgique vidéo *', 'Nouvelle vue']);
    const ailleurs = await page({});
    expect(onglets(ailleurs), 'hors de son adresse, la vue ne doit pas être signalée').toEqual(['Toutes les pubs *', 'Tendance', 'Suivies', 'Belgique vidéo', 'Nouvelle vue']);
    expect(ailleurs, 'la Veille dit encore « pas encore disponible » pour les vues').not.toMatch(/pas encore disponible/);
    expect(ailleurs).not.toMatch(/<button[^>]*class="xnew"[^>]*disabled/);
  });

  it('supprimer retire la vue de la base et de la page · une vue inconnue se dit introuvable', async () => {
    const ws = await espace();
    const paul = await membre(ws, 'paul');
    agir(paul);
    const a = await garderVueVeille({ nom: 'Suisse', params: { country: 'CH' } });
    const b = await garderVueVeille({ nom: 'Images', params: { media: 'image' } });
    expect(a.ok && b.ok).toBe(true);
    const id = a.ok ? a.id : '';
    expect(await supprimerVueVeille({ id })).toMatchObject({ ok: true });
    expect(await nomsEnBase(paul)).toEqual(['Images']);
    expect(onglets(await page())).toEqual(['Toutes les pubs *', 'Tendance', 'Suivies', 'Images', 'Nouvelle vue']);
    expect(await supprimerVueVeille({ id })).toEqual({ ok: false, error: 'Vue introuvable · recharge la page.' });
  });

  it('renommer · nom validé, doublon refusé', async () => {
    const ws = await espace();
    const lea = await membre(ws, 'lea');
    agir(lea);
    const a = await garderVueVeille({ nom: 'Suisse', params: { country: 'CH' } });
    await garderVueVeille({ nom: 'Images', params: { media: 'image' } });
    const id = a.ok ? a.id! : '';
    expect(await renommerVueVeilleAction({ id, nom: 'images' })).toEqual({ ok: false, error: 'Une vue s’appelle déjà « Images ».' });
    expect(await renommerVueVeilleAction({ id, nom: 'Suisse romande' })).toMatchObject({ ok: true });
    expect(await nomsEnBase(lea)).toEqual(['Suisse romande', 'Images']);
  });

  it('paramètres hors liste, doublon de filtres et plafond · refusés, rien d’écrit', async () => {
    const ws = await espace();
    const zoe = await membre(ws, 'zoe');
    agir(zoe);
    expect(await garderVueVeille({ nom: 'Page 3', params: { q: 'sérum', page: '3' } })).toEqual({ ok: false, error: 'Le paramètre « page » n’est pas gardé dans une vue.' });
    expect(await garderVueVeille({ nom: 'Autre espace', params: { q: 'sérum', workspaceId: randomUUID() } })).toEqual({ ok: false, error: 'Le paramètre « workspaceId » n’est pas gardé dans une vue.' });
    expect(await garderVueVeille({ nom: 'Rien', params: {} })).toMatchObject({ ok: false });
    expect(await ligne(zoe), 'un refus a écrit une ligne').toBeUndefined();

    expect(await garderVueVeille({ nom: 'Sérums', params: { q: 'sérum' } })).toMatchObject({ ok: true });
    expect(await garderVueVeille({ nom: 'Sérums bis', params: { q: 'sérum', cpm: '9' } })).toEqual({ ok: false, error: 'Ces filtres sont déjà gardés dans la vue « Sérums ».' });
    for (let i = 1; i < PLAFOND_VUES_VEILLE; i++) expect((await garderVueVeille({ nom: `Vue ${i}`, params: { q: `terme ${i}` } })).ok).toBe(true);
    expect(await garderVueVeille({ nom: 'Une de trop', params: { q: 'neuf' } })).toEqual({ ok: false, error: `Tu gardes déjà ${PLAFOND_VUES_VEILLE} vues · supprimes-en une pour en garder une nouvelle.` });
    expect((await nomsEnBase(zoe)).length).toBe(PLAFOND_VUES_VEILLE);
  });
});

describe('Veille · vues · isolation', () => {
  it('entre personnes · chacune ne voit et ne supprime que les siennes', async () => {
    const ws = await espace();
    const marine = await membre(ws, 'marine');
    const paul = await membre(ws, 'paul');
    agir(marine);
    const vm = await garderVueVeille({ nom: 'De Marine', params: { country: 'FR' } });
    agir(paul);
    expect(onglets(await page()), 'Paul voit la vue de Marine').toEqual(['Toutes les pubs *', 'Tendance', 'Suivies', 'Nouvelle vue']);
    // Paul tente de supprimer la vue de Marine par son identifiant · introuvable chez lui, intacte chez elle.
    expect(await supprimerVueVeille({ id: vm.ok ? vm.id : '' })).toEqual({ ok: false, error: 'Vue introuvable · recharge la page.' });
    expect(await renommerVueVeilleAction({ id: vm.ok ? vm.id : '', nom: 'Volée' })).toMatchObject({ ok: false });
    expect(await nomsEnBase(marine)).toEqual(['De Marine']);
    // Même nom, mêmes filtres · permis chez Paul (ses vues sont les siennes).
    expect(await garderVueVeille({ nom: 'De Marine', params: { country: 'FR' } })).toMatchObject({ ok: true });
    agir(marine);
    expect(onglets(await page())).toEqual(['Toutes les pubs *', 'Tendance', 'Suivies', 'De Marine', 'Nouvelle vue']);
  });

  it('entre espaces · la même personne a des vues séparées dans chaque espace', async () => {
    const a = await espace();
    const b = await espace();
    const ida = await membre(a, 'ida');
    const idaB = await membre(b, 'ida', 'member', ida.user);
    agir(ida);
    const v = await garderVueVeille({ nom: 'Espace A', params: { media: 'video' } });
    agir(idaB);
    expect(onglets(await page())).toEqual(['Toutes les pubs *', 'Tendance', 'Suivies', 'Nouvelle vue']);
    expect(await supprimerVueVeille({ id: v.ok ? v.id : '' })).toMatchObject({ ok: false });
    expect(await nomsEnBase(ida)).toEqual(['Espace A']);
    expect(await ligne(idaB)).toBeUndefined();
    // Ses vues dans B n'écrasent jamais celles de A.
    expect(await garderVueVeille({ nom: 'Espace B', params: { media: 'image' } })).toMatchObject({ ok: true });
    agir(ida);
    expect(onglets(await page())).toEqual(['Toutes les pubs *', 'Tendance', 'Suivies', 'Espace A', 'Nouvelle vue']);
    expect(await nomsEnBase(idaB)).toEqual(['Espace B']);
  });
});

describe('Veille · vues · la garde de la Veille (rôle, offre)', () => {
  it('offre sans Veille · refusé, rien d’écrit · rôle client en lecture · refusé · sans session · refusé', async () => {
    const ws = await espace('starter');
    const sam = await membre(ws, 'sam');
    agir(sam, 'member', 'starter');
    expect(await garderVueVeille({ nom: 'X', params: { q: 'x' } })).toEqual({ ok: false, error: 'La Veille est incluse dès l’offre Core · un propriétaire de l’espace peut changer d’offre dans Réglages.' });
    const ws2 = await espace();
    const lecteur = await membre(ws2, 'lecteur', 'client_viewer');
    agir(lecteur, 'client_viewer');
    expect(await garderVueVeille({ nom: 'X', params: { q: 'x' } })).toEqual({ ok: false, error: 'Ton rôle ne permet pas d’utiliser la Veille · demande à un administrateur de l’espace.' });
    etat.session = null;
    expect(await supprimerVueVeille({ id: 'x' })).toMatchObject({ ok: false });
    expect(await ligne(sam)).toBeUndefined();
    expect(await ligne(lecteur)).toBeUndefined();
  });
});
