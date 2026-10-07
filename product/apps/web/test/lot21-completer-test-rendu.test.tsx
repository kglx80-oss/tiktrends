// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Lot 21 · « Compléter le test » (rupture R1, audit lot 20) · RÉSULTAT au rendu
 * et en base.
 *
 * Mesuré avant (bc33cec8) · le tiroir d'une ad incomplète disait « Ces
 * éléments ne se saisissent pas encore dans l'outil », aucune action n'écrivait
 * hypothèse, variable, offre ni page, et la ligne d'itération promettait « avec
 * l'offre et la page héritées » alors qu'elles étaient toujours nulles.
 *
 * Base Postgres réelle (pglite, migrations du dépôt), actions serveur RÉELLES
 * (garde `adsmapGuard` comprise · seules la session et la marque active sont
 * simulées), tiroir monté pour de vrai (jsdom). On lit le HTML, on remplit le
 * formulaire comme un utilisateur, puis on lit les LIGNES.
 */
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), neva: randomUUID(), autre: randomUUID(), vide: randomUUID(), user: randomUUID() };
});
const session = vi.hoisted(() => ({ role: 'member' as string, plan: 'plus' as string, marque: 'neva' as 'neva' | 'autre' | 'vide' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.user, email: 'membre@agence.test', name: 'Membre' },
    workspaceId: ids.ws, workspaceName: 'Agence', role: session.role, plan: session.plan, equipe: null,
  }),
}));
vi.mock('../lib/brands', () => ({
  getActiveBrand: async () => ({ id: ids[session.marque], name: session.marque === 'neva' ? 'Neva' : 'Autre', workspaceId: ids.ws }),
}));
// L'action RÉELLE, comptée · le nombre de requêtes parties est un résultat (double clic).
const envois = vi.hoisted(() => ({ n: 0 }));
vi.mock('../app/actions/adsmap-completer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/actions/adsmap-completer')>();
  return { ...actual, completerTestAction: async (...a: Parameters<typeof actual.completerTestAction>) => { envois.n++; return actual.completerTestAction(...a); } };
});
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { STATUT_NON_COMPLETABLE } from '@tiktrends/core';
import { AdDrawer } from '../app/(app)/adsmap/AdDrawer';
import { completerTestAction } from '../app/actions/adsmap-completer';
import { prepareBatchAction } from '../app/actions/adsmap-batch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const produits: Record<string, string> = {};

async function ad(brandId: string, variantCode: string, o: Partial<typeof schema.ads.$inferInsert> = {}): Promise<string> {
  const [persona] = await db!.insert(schema.personas).values({ brandId, name: 'P' }).returning();
  const [desire] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: persona!.id, label: 'D' }).returning();
  const [angle] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: desire!.id, label: 'Angle ' + variantCode, mechanism: 'demo' }).returning();
  const [concept] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: angle!.id, title: 'Concept ' + variantCode }).returning();
  const [a] = await db!.insert(schema.ads).values({ workspaceId: ids.ws, conceptId: concept!.id, variantCode, ...o }).returning();
  return a!.id;
}
const lireAd = async (id: string) => (await db!.select().from(schema.ads).where(eq(schema.ads.id, id)))[0]!;
const compter = async () => ({
  offres: Number((await db!.select({ n: sql<number>`count(*)` }).from(schema.offers))[0]!.n),
  pages: Number((await db!.select({ n: sql<number>`count(*)` }).from(schema.landingPages))[0]!.n),
});

let desc: PropertyDescriptor | undefined;
beforeAll(async () => {
  desc = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { configurable: true, get(this: HTMLElement) { return this.parentNode as Element | null; } });
  await db!.insert(schema.users).values({ id: ids.user, email: 'membre@agence.test', name: 'Membre' });
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'plus' });
  await db!.insert(schema.brands).values([
    { id: ids.neva, workspaceId: ids.ws, name: 'Neva' },
    { id: ids.autre, workspaceId: ids.ws, name: 'Autre' },
    { id: ids.vide, workspaceId: ids.ws, name: 'Sans produit' },
  ]);
  const ps = await db!.insert(schema.products).values([
    { brandId: ids.neva, name: 'Sérum Neva', price: 29.9, url: 'https://neva.example/serum' },
    { brandId: ids.neva, name: 'Baume Neva', price: 19, url: null },
    { brandId: ids.autre, name: 'Produit d’une autre marque', price: 5, url: 'https://autre.example/p' },
  ]).returning();
  for (const p of ps) produits[p.name] = p.id;
});
afterAll(() => { if (desc) Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', desc); });
beforeEach(() => { session.role = 'member'; session.plan = 'plus'; session.marque = 'neva'; });

// ── Montage du tiroir et gestes d'utilisateur ────────────────────────────────

const montes: Array<() => Promise<void>> = [];
afterEach(async () => { while (montes.length) await montes.pop()!(); });

async function attendre(cond: () => boolean, quoi: string) {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  }
  throw new Error(`jamais vu · ${quoi}`);
}

async function ouvrir(adId: string) {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  await act(async () => { racine.render(<AdDrawer adId={adId} onClose={() => {}} onChanged={() => {}} />); });
  const dialogue = () => document.querySelector('[role="dialog"]') as HTMLElement;
  await attendre(() => !!dialogue() && !(dialogue().textContent ?? '').includes('Chargement…'), 'la fiche chargée');
  montes.push(async () => { await act(async () => { racine.unmount(); }); hote.remove(); });
  return dialogue();
}

const champ = (racine: HTMLElement, libelle: string) => {
  const label = [...racine.querySelectorAll('label')].find((l) => (l.textContent ?? '').startsWith(libelle));
  const id = label?.getAttribute('for');
  return (id ? racine.ownerDocument.getElementById(id) : null) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
};
async function saisir(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, valeur: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function cliquer(el: Element | null | undefined) {
  if (!el) throw new Error('élément absent');
  await act(async () => { (el as HTMLElement).click(); });
}
const formulaire = (d: HTMLElement) => d.querySelector('[data-completer-test]') as HTMLElement | null;

// ── Garde de rendu ───────────────────────────────────────────────────────────

describe('Le tiroir d’une ad incomplète porte le formulaire « Compléter le test »', () => {
  it('formulaire rendu (hypothèse, variable, produit, confirmations), plus la phrase d’impasse', async () => {
    const id = await ad(ids.neva, 'r1');
    const d = await ouvrir(id);
    const f = formulaire(d);
    expect(f, 'le formulaire « Compléter le test » n’est pas rendu').not.toBeNull();
    expect(d.textContent, 'la fiche dit encore que rien ne se saisit').not.toContain('ne se saisissent pas encore dans l’outil');
    expect(d.textContent).toContain('À compléter avant tout test · l’hypothèse testée, la variable testée, l’offre et la page de destination');
    const hyp = champ(f!, 'Hypothèse testée') as HTMLTextAreaElement;
    expect(hyp, 'champ hypothèse sans étiquette liée').not.toBeNull();
    expect(hyp.value, 'l’hypothèse est préremplie').toBe('');
    const variable = champ(f!, 'Variable testée') as HTMLSelectElement;
    expect([...variable.options].map((o) => o.value), 'le témoin est proposé comme variable').not.toContain('none_control');
    expect(f!.textContent, '« offre » sans son contexte').toContain('le produit vendu dans cette publicité et son prix · rien à voir avec ton abonnement');
    await attendre(() => !!champ(f!, 'Produit'), 'le choix du produit');
    await saisir(champ(f!, 'Produit')!, produits['Sérum Neva']!);
    expect((champ(f!, 'Prix affiché dans la pub') as HTMLInputElement).value, 'prix non prérempli depuis le produit').toBe('29,90');
    expect((champ(f!, 'Adresse de la page de destination') as HTMLInputElement).value).toBe('https://neva.example/serum');
    expect(f!.textContent).toContain('Je confirme l’offre · Sérum Neva · 29,90 €');
    expect(f!.textContent).toContain('Je confirme la page de destination · https://neva.example/serum');
    const cases = [...f!.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(cases.map((c) => c.checked), 'une valeur est confirmée à la place de l’utilisateur').toEqual([false, false]);
    // Charte des cadres · le formulaire est une tuile (--line, r-md), ses champs des contrôles.
    expect(f!.getAttribute('style')).toContain('border: 1px solid var(--line); border-radius: var(--r-md)');
    // Aucune écriture tant que rien n'est envoyé.
    expect(await compter()).toEqual({ offres: 0, pages: 0 });
  });

  it('remplir, confirmer, enregistrer · l’ad est complète en base, statut inchangé, et « Préparer » la fait passer prête', async () => {
    const [lot] = await db!.insert(schema.batches).values({ workspaceId: ids.ws, brandId: ids.neva, number: 1 }).returning();
    const id = await ad(ids.neva, 'r2', { batchId: lot!.id });
    const d = await ouvrir(id);
    const f = formulaire(d)!;
    await saisir(champ(f, 'Hypothèse testée')!, 'Une preuve chiffrée en ouverture fera passer le hook rate de 22 % à 28 %.');
    await saisir(champ(f, 'Variable testée')!, 'hook');
    await attendre(() => !!champ(f, 'Produit'), 'le choix du produit');
    await saisir(champ(f, 'Produit')!, produits['Sérum Neva']!);
    for (const c of f.querySelectorAll('input[type="checkbox"]')) await cliquer(c);
    const bouton = [...f.querySelectorAll('button[type="submit"]')][0]!;
    // Double clic · une seule requête, une seule écriture.
    const avantEnvois = envois.n;
    await act(async () => { (bouton as HTMLElement).click(); (bouton as HTMLElement).click(); });
    await attendre(() => (f.textContent ?? '').includes('Enregistré · le test est complet'), 'le message de succès');
    const a = await lireAd(id);
    expect(a.hypothesis).toBe('Une preuve chiffrée en ouverture fera passer le hook rate de 22 % à 28 %.');
    expect(a.testedVariable).toBe('hook');
    expect(a.offerId, 'l’offre n’est pas rattachée').not.toBeNull();
    expect(a.landingPageId, 'la page n’est pas rattachée').not.toBeNull();
    expect(a.status, 'l’action a écrit le statut · « Préparer » doit rester la seule porte').toBe('draft');
    const [offre] = await db!.select().from(schema.offers).where(eq(schema.offers.id, a.offerId!));
    expect(offre).toMatchObject({ brandId: ids.neva, label: 'Sérum Neva', price: 29.9 });
    const [page] = await db!.select().from(schema.landingPages).where(eq(schema.landingPages.id, a.landingPageId!));
    expect(page).toMatchObject({ brandId: ids.neva, url: 'https://neva.example/serum', pageType: 'pdp' });
    expect(envois.n - avantEnvois, 'le double clic envoie deux requêtes').toBe(1);
    expect(await compter(), 'le double clic a dupliqué l’offre ou la page').toEqual({ offres: 1, pages: 1 });
    // La boucle reprend · « Préparer » (admin) fait passer l'ad prête · la contrainte SQL l'accepte.
    session.role = 'admin';
    const prep = await prepareBatchAction(lot!.id);
    expect(prep.error).toBeUndefined();
    expect((await lireAd(id)).status, 'l’ad complétée ne passe pas « prête »').toBe('ready');
  });

  it('produit sans adresse · la confirmation de page est fermée, le manque reste dit après l’enregistrement', async () => {
    const id = await ad(ids.neva, 'r3');
    const d = await ouvrir(id);
    const f = formulaire(d)!;
    await saisir(champ(f, 'Hypothèse testée')!, 'Le baume en démonstration fera monter le CTR de 0,9 % à 1,3 %.');
    await saisir(champ(f, 'Variable testée')!, 'proof');
    await attendre(() => !!champ(f, 'Produit'), 'le choix du produit');
    await saisir(champ(f, 'Produit')!, produits['Baume Neva']!);
    expect((champ(f, 'Adresse de la page de destination') as HTMLInputElement).value, 'repli silencieux sur une adresse').toBe('');
    expect(f.textContent).toContain('Ce produit n’a pas d’adresse · la page de destination reste à compléter');
    const [caseOffre, casePage] = [...f.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(casePage!.disabled, 'on peut confirmer une page sans adresse').toBe(true);
    await cliquer(caseOffre);
    await cliquer(f.querySelector('button[type="submit"]'));
    await attendre(() => (f.textContent ?? '').includes('Enregistré · reste à compléter la page de destination'), 'le manque dit');
    const a = await lireAd(id);
    expect(a.offerId).not.toBeNull();
    expect(a.landingPageId, 'une page a été inventée').toBeNull();
    expect(d.textContent).toContain('À compléter avant tout test · la page de destination');
  });

  it('marque sans produit · état vide qui dit quoi faire, hypothèse et variable restent saisissables', async () => {
    session.marque = 'vide';
    const id = await ad(ids.vide, 'r4');
    const d = await ouvrir(id);
    const f = formulaire(d)!;
    await attendre(() => !!f.querySelector('[data-completer-vide]'), 'l’état vide');
    expect(f.querySelector('[data-completer-vide]')!.textContent).toContain('Aucun produit dans cette marque');
    expect(champ(f, 'Hypothèse testée')).not.toBeNull();
  });

  it('ligne 437 · une gagnante sans offre ni page ne promet plus d’héritage', async () => {
    const id = await ad(ids.neva, 'r5', { status: 'done' });
    await db!.insert(schema.verdicts).values({ adId: id, workspaceId: ids.ws, computed: 'winner', validated: 'winner', status: 'validated', comparable: true });
    const d = await ouvrir(id);
    await cliquer([...d.querySelectorAll('button')].find((b) => b.textContent === 'Créer l’itération'));
    expect(d.textContent, 'la fiche promet une offre et une page héritées qui n’existent pas').not.toContain('héritées');
    expect(d.textContent).toContain('L’itération naît en brouillon, sans offre ni page de destination');
    expect(formulaire(d), 'une ad close propose de compléter son test').toBeNull();
  });
});

// ── Garde d'action (base réelle) ─────────────────────────────────────────────

const saisieComplete = (adId: string, produitId = produits['Sérum Neva']!) => ({
  adId, hypothesis: 'Une preuve chiffrée en ouverture fera passer le hook rate de 22 % à 28 %.', testedVariable: 'hook',
  produitId, offre: { prix: '29,90', confirmee: true }, page: { url: 'https://neva.example/serum', confirmee: true },
});

describe('completerTestAction · refus sans aucune écriture, succès sans toucher au statut', () => {
  it('ad d’une autre marque · refusée, zéro ligne écrite', async () => {
    const id = await ad(ids.autre, 'x1');
    const avant = await compter();
    const r = await completerTestAction(saisieComplete(id));
    expect(r.ok, 'une ad d’une autre marque a été complétée').toBeUndefined();
    expect(r.error).toBeTruthy();
    expect(await compter()).toEqual(avant);
    expect((await lireAd(id)).hypothesis).toBeNull();
  });

  it('produit d’une autre marque · refusé, zéro ligne écrite', async () => {
    const id = await ad(ids.neva, 'x2');
    const avant = await compter();
    const r = await completerTestAction(saisieComplete(id, produits['Produit d’une autre marque']!));
    expect(r.error).toBe('Choisis le produit vendu dans la pub · il doit appartenir à la marque active.');
    expect(await compter()).toEqual(avant);
  });

  it('ad prête ou en test · refusée, zéro ligne écrite', async () => {
    const [o] = await db!.insert(schema.offers).values({ workspaceId: ids.ws, brandId: ids.neva, label: 'Existante' }).returning();
    const [p] = await db!.insert(schema.landingPages).values({ workspaceId: ids.ws, brandId: ids.neva, url: 'https://neva.example/existante', label: 'Existante' }).returning();
    for (const status of ['ready', 'live'] as const) {
      const id = await ad(ids.neva, 'x3' + status, { status, hypothesis: 'Posée avant le test.', testedVariable: 'hook', offerId: o!.id, landingPageId: p!.id });
      const avant = await compter();
      const r = await completerTestAction({ ...saisieComplete(id), hypothesis: 'Une autre hypothèse qui écraserait la première.' });
      expect(r.error, `une ad ${status} a été complétée`).toBe(STATUT_NON_COMPLETABLE);
      expect(await compter()).toEqual(avant);
      expect(await lireAd(id)).toMatchObject({ status, hypothesis: 'Posée avant le test.' });
    }
  });

  it('rôle insuffisant (lecteur client) · refusé, zéro ligne écrite', async () => {
    const id = await ad(ids.neva, 'x4');
    session.role = 'client_viewer';
    const avant = await compter();
    const r = await completerTestAction(saisieComplete(id));
    expect(r.error, 'un lecteur client complète un test').toBe('Ton rôle ne permet pas d’accéder à Adsmap.');
    expect(await compter()).toEqual(avant);
    expect((await lireAd(id)).hypothesis).toBeNull();
  });

  it('variable « témoin » · refusée, zéro ligne écrite', async () => {
    const id = await ad(ids.neva, 'x5');
    const avant = await compter();
    const r = await completerTestAction({ ...saisieComplete(id), testedVariable: 'none_control' });
    expect(r.error).toBe('Le témoin n’est pas une variable testée · choisis ce que cette ad change.');
    expect(await compter()).toEqual(avant);
    expect((await lireAd(id)).testedVariable).toBeNull();
  });

  it('succès · hypothèse, variable, offre et page posées, statut inchangé, offre et page réutilisées', async () => {
    const id = await ad(ids.neva, 'x6', { status: 'proposed' });
    const r = await completerTestAction(saisieComplete(id));
    expect(r).toEqual({ ok: true, manques: [] });
    const a = await lireAd(id);
    expect(a).toMatchObject({ status: 'proposed', testedVariable: 'hook', hypothesis: 'Une preuve chiffrée en ouverture fera passer le hook rate de 22 % à 28 %.' });
    expect(a.offerId).not.toBeNull();
    expect(a.landingPageId).not.toBeNull();
    // Un second test du même produit reprend la même offre et la même page.
    const avant = await compter();
    const id2 = await ad(ids.neva, 'x7');
    expect((await completerTestAction(saisieComplete(id2))).ok).toBe(true);
    const b = await lireAd(id2);
    expect([b.offerId, b.landingPageId], 'offre ou page dupliquée').toEqual([a.offerId, a.landingPageId]);
    expect(await compter()).toEqual(avant);
    // Nouvel essai après une réponse perdue · rien de neuf, rien de dupliqué.
    expect(await completerTestAction(saisieComplete(id2))).toEqual({ ok: true, manques: [], dejaEnregistre: true });
    expect(await compter()).toEqual(avant);
  });

  it('échec en cours d’écriture (ad sortie du brouillon entre-temps) · ni offre ni page orpheline, ad intacte', async () => {
    const id = await ad(ids.neva, 'x8');
    const [conflit] = await db!.insert(schema.products).values({ brandId: ids.neva, name: 'Produit conflit', price: 7, url: 'https://neva.example/conflit' }).returning();
    // Simule un « Préparer » concurrent · à l'insertion de l'offre, l'ad change de statut.
    await db!.execute(sql.raw(`CREATE OR REPLACE FUNCTION lot21_conflit() RETURNS trigger AS $$
      BEGIN UPDATE adsmap_ads SET status = 'paused' WHERE id = '${id}'; RETURN NEW; END; $$ LANGUAGE plpgsql`));
    await db!.execute(sql.raw(`CREATE TRIGGER lot21_conflit AFTER INSERT ON adsmap_offers FOR EACH ROW WHEN (NEW.label = 'Produit conflit') EXECUTE FUNCTION lot21_conflit()`));
    const avant = await compter();
    const r = await completerTestAction({ ...saisieComplete(id, conflit!.id), page: { url: 'https://neva.example/conflit', confirmee: true } });
    await db!.execute(sql.raw('DROP TRIGGER lot21_conflit ON adsmap_offers'));
    await db!.execute(sql.raw('DROP FUNCTION lot21_conflit()'));
    expect(r.error).toBe(STATUT_NON_COMPLETABLE);
    expect(await compter(), 'une offre ou une page orpheline est restée').toEqual(avant);
    expect(await db!.select().from(schema.offers).where(and(eq(schema.offers.brandId, ids.neva), eq(schema.offers.label, 'Produit conflit')))).toEqual([]);
    expect(await lireAd(id)).toMatchObject({ status: 'draft', hypothesis: null, offerId: null, landingPageId: null });
  });
});
