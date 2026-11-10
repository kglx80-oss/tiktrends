// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Lot 14 V5 · Tour de contrôle · recherche, exports, segments, incidents · sur
 * une VRAIE base (pglite + migrations du dépôt, 0075 comprise), par les VRAIES
 * actions (`app/actions/tour-controle.ts`, porte `porteAdminGeste`) et les
 * VRAIES pages rendues (Inscriptions & comptes, Revenus & MRR, Incidents) · on
 * lit le DOM.
 *
 *  · recherche · casse et accents ignorés, saisie bornée, pages de 50, page
 *    hors bornes ramenée à la dernière ;
 *  · segments · calculés (payants, essais, impayés), effectif sur la puce ;
 *  · export = la table affichée (toutes pages du filtre), cellule par cellule ·
 *    « =1+1 » neutralisé, aucun secret de la ligne d'espace (Stripe, Drive),
 *    aucune adresse brute ;
 *  · incidents · déclarer, annoter, clore, relus à l'écran et dans l'export ·
 *    jamais supprimés (la base refuse) ;
 *  · refus · admin d'espace non fondateur, fondateur sans rôle admin, sans
 *    session · aucune donnée lue ni écrite, aucun nom cité ;
 *  · aucun écran hors Tour de contrôle n'importe ces lectures.
 * 0 $ · aucun modèle, aucun appel réseau.
 */
const etat = vi.hoisted(() => ({ session: null as unknown }));
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  return { eclat: u(), brume: u(), formule: u(), adresse: u(), uF: u(), uA: u(), lots: Array.from({ length: 60 }, () => u()) };
});

vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect:${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_noStore: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }), depensesAReconcilier: async () => ({ lignes: [] }) }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { celluleSansFuite, parseCsv } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import { annoterIncidentAction, cloreIncidentAction, exporterTourAction, ouvrirIncidentAction } from '../app/actions/tour-controle';

const FONDATEUR = 'kguilbaux@agence-glx.fr';
const session = (email: string, role = 'owner', uid = ids.uF) => ({ user: { id: uid, email, name: 'K' }, workspaceId: ids.eclat, workspaceName: 'Maison Éclat', plan: 'business', role, equipe: null });
const fondateur = () => session(FONDATEUR);
const SECRETS = ['sub_SECRET', 'cus_SECRET', 'jeton-drive-SECRET', 'proprio@lumen.example', FONDATEUR];

beforeAll(async () => {
  const jour = (i: number) => new Date(Date.UTC(2026, 5, 1) + i * 3_600_000);
  await db!.insert(schema.workspaces).values([
    { id: ids.eclat, name: 'Maison Éclat', plan: 'core', createdAt: new Date(Date.UTC(2026, 9, 4)), onboardedAt: new Date(Date.UTC(2026, 9, 5)), stripeCustomerId: 'cus_SECRET_1', stripeSubscriptionId: 'sub_SECRET_1', subscriptionStatus: 'active', driveRefreshToken: 'jeton-drive-SECRET', creditsBalance: 900 },
    { id: ids.brume, name: 'ATELIER BRUME', plan: 'plus', createdAt: new Date(Date.UTC(2026, 9, 3)), trialEndsAt: new Date(Date.UTC(2099, 0, 1)), creditsBalance: 50 },
    { id: ids.formule, name: '=1+1 Studio', plan: 'core', createdAt: new Date(Date.UTC(2026, 9, 2)), stripeSubscriptionId: 'sub_SECRET_3', subscriptionStatus: 'past_due', creditsBalance: 10 },
    { id: ids.adresse, name: 'Contact proprio@lumen.example', plan: 'starter', createdAt: new Date(Date.UTC(2026, 9, 1)) },
    ...ids.lots.map((id, i) => ({ id, name: `Lot ${String(i + 1).padStart(2, '0')}`, plan: 'starter', createdAt: jour(60 - i) })),
  ]);
  await db!.insert(schema.users).values([{ id: ids.uF, email: FONDATEUR, name: 'Kevin' }, { id: ids.uA, email: 'client@exemple.invalid', name: 'Client' }]);
  await db!.insert(schema.workspaceMembers).values([{ workspaceId: ids.eclat, userId: ids.uF, role: 'owner' }, { workspaceId: ids.brume, userId: ids.uA, role: 'admin' }]);
  await db!.insert(schema.creditLedger).values([{ workspaceId: ids.eclat, delta: -100, reason: 'Génération', createdAt: new Date() }]);
});
afterEach(() => { etat.session = null; });

/* ───────────────────────── lecture du DOM ───────────────────────── */

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
type Page = { default: (p: { searchParams?: Promise<Record<string, string>> }) => Promise<React.ReactElement> };
const PAGES: Record<string, () => Promise<unknown>> = {
  signups: () => import('../app/(spatial)/sp/admin/signups/page'),
  finance: () => import('../app/(spatial)/sp/admin/finance/page'),
  incidents: () => import('../app/(spatial)/sp/admin/incidents/page'),
};
const page = async (chemin: string, sp: Record<string, string> = {}) => {
  const m = await PAGES[chemin]!() as Page;
  return dom(renderToStaticMarkup(avecSpatial(await m.default({ searchParams: Promise.resolve(sp) }))));
};
const pageComptes = (sp: Record<string, string> = {}) => page('signups', sp);
/** Les lignes de la table « Comptes » · le texte de chaque cellule, sans la colonne des gestes (vide). */
const lignesComptes = (d: HTMLElement) => [...d.querySelectorAll('#accrows > .atr')].map((r) => [...r.children].filter((c) => !c.classList.contains('aacts')).map((c) => c.textContent ?? ''));
const noms = (d: HTMLElement) => lignesComptes(d).map((l) => l[0]);
/** Le CSV relu · BOM retiré, la neutralisation retirée par l'import du dépôt (`parseCsv`) · le brut est vérifié à part. */
const relire = (csv: string) => parseCsv(csv.replace(/^\uFEFF/, ''), ';');

describe('Lot 14 · Inscriptions & comptes · recherche relue au serveur', () => {
  it('casse et accents ignorés · « eclat », « ÉCLAT » et « Éclat » trouvent « Maison Éclat », « brume » trouve « ATELIER BRUME »', async () => {
    etat.session = fondateur();
    for (const q of ['eclat', 'ÉCLAT', 'Éclat', 'maison   eclat']) expect(noms(await pageComptes({ q })), `recherche « ${q} »`).toEqual(['Maison Éclat']);
    expect(noms(await pageComptes({ q: 'brume' }))).toEqual(['ATELIER BRUME']);
    // Chaque mot doit se trouver · « lot 05 » ne garde que « Lot 05 » (« Lot 50 » ne contient pas « 05 »).
    expect(noms(await pageComptes({ q: 'LOT 05' }))).toEqual(['Lot 05']);
    const rien = await pageComptes({ q: 'introuvable' });
    expect(noms(rien)).toEqual([]);
    expect(rien.textContent).toContain('Aucun compte ne correspond à ce filtre.');
  });

  it('bornes · saisie gardée à 80 caractères, 50 lignes par page, page hors bornes ramenée à la dernière', async () => {
    etat.session = fondateur();
    const longue = await pageComptes({ q: `lot ${'x'.repeat(500)}` });
    expect((longue.querySelector('#auq') as HTMLInputElement).value).toHaveLength(80);
    const p1 = await pageComptes({ q: 'lot' });
    expect(noms(p1)).toHaveLength(50);
    expect(p1.querySelector('[data-pagination="comptes"]')!.textContent).toContain('1 à 50 sur 60 comptes · page 1 sur 2');
    expect(p1.querySelector('[data-pagination="comptes"] a')!.getAttribute('href')).toBe('/admin/signups?q=lot&page=2');
    const p2 = await pageComptes({ q: 'lot', page: '2' });
    expect(noms(p2)).toEqual(Array.from({ length: 10 }, (_, i) => `Lot ${51 + i}`));
    expect(noms(await pageComptes({ q: 'lot', page: '99' }))).toEqual(noms(p2));
    // Sans filtre · 64 espaces, la première page en montre 50 (l'ancienne limite muette de 200 n'existe plus).
    expect(noms(await pageComptes())).toHaveLength(50);
    expect(noms(await pageComptes({ page: '2' }))).toHaveLength(14);
  });
});

describe('Lot 14 · Inscriptions & comptes · segments calculés', () => {
  it('essais, impayés, payants · chaque puce dit son effectif, la choisie est pressée, une clé inconnue retombe sur « Tous »', async () => {
    etat.session = fondateur();
    expect(noms(await pageComptes({ segment: 'essai' }))).toEqual(['ATELIER BRUME']);
    expect(noms(await pageComptes({ segment: 'impayes' }))).toEqual(['=1+1 Studio']);
    const payants = await pageComptes({ segment: 'payants' });
    expect(noms(payants)).toEqual(['Maison Éclat', '=1+1 Studio']);
    const puces = Object.fromEntries([...payants.querySelectorAll('[data-auf]')].map((b) => [b.getAttribute('data-auf'), b.textContent]));
    expect(puces).toMatchObject({ tous: 'Tous · 64', payants: 'Payants · 2', essai: 'Essais · 1', impayes: 'Impayés · 1', risque: 'À risque · 2', core: 'Core · 2', plus: 'Plus · 1' });
    expect(payants.querySelector('[data-auf="payants"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(payants.textContent).toContain('Formule payante et abonnement Stripe actif ou en retard de paiement.');
    const inconnu = await pageComptes({ segment: 'proprietaires' });
    expect(inconnu.querySelector('[data-auf="tous"]')!.getAttribute('aria-pressed')).toBe('true');
    // Segment ET recherche · « brume » chez les payants · rien.
    expect(noms(await pageComptes({ segment: 'payants', q: 'brume' }))).toEqual([]);
  });
});

describe('Lot 14 · exports · la table affichée, neutralisée, sans fuite', () => {
  it('Comptes · le fichier = les lignes affichées de toutes les pages du filtre, cellule par cellule · « =1+1 » neutralisé · aucun secret, aucune adresse', async () => {
    etat.session = fondateur();
    const affichees = [...lignesComptes(await pageComptes()), ...lignesComptes(await pageComptes({ page: '2' }))];
    expect(affichees).toHaveLength(64);
    const r = await exporterTourAction({ ecran: 'comptes' });
    if (!r.ok) throw new Error(r.message);
    expect(r.lignes).toBe(64);
    const [entete, ...lignes] = relire(r.csv);
    expect(entete).toEqual(['Compte', 'Forfait', 'MRR', 'Crédits utilisés', 'Santé', 'Profil', 'Inscrit le']);
    expect(lignes, 'l’export n’est pas la table affichée').toEqual(affichees.map((l) => l.map(celluleSansFuite)));
    // Le brut · la formule part neutralisée (apostrophe), jamais évaluable.
    expect(r.csv).toMatch(/\r\n'=1\+1 Studio;/);
    expect(r.csv).not.toMatch(/(^|\r\n)=1\+1/);
    for (const s of SECRETS) expect(r.csv, `fuite dans l’export · ${s}`).not.toContain(s);
    expect(r.csv).toContain('Contact [adresse masquée]');
    expect(r.nom).toMatch(/^tour-de-controle_comptes_\d{4}-\d{2}-\d{2}\.csv$/);
    // Le filtre de l'écran est celui de l'export.
    const f = await exporterTourAction({ ecran: 'comptes', q: 'ECLAT', segment: 'payants' });
    expect(f.ok && relire(f.csv).slice(1).map((l) => l[0])).toEqual(['Maison Éclat']);
  });

  it('Rentabilité par abonnement · le fichier = la table de Revenus (forfait et prix séparés en deux colonnes)', async () => {
    etat.session = fondateur();
    const d = await page('finance');
    const affichees = [...d.querySelectorAll('[data-table="rentabilite"] > .atr:not(.ath)')].map((r) => [...r.children].map((c) => c.textContent ?? ''));
    expect(affichees.length).toBeGreaterThan(0);
    const r = await exporterTourAction({ ecran: 'rentabilite' });
    if (!r.ok) throw new Error(r.message);
    const [entete, ...lignes] = relire(r.csv);
    expect(entete).toEqual(['Forfait', 'Prix', 'Abonnés', 'MRR', 'Coût IA / abonné', 'Frais paiement', 'Marge', 'Churn', 'LTV']);
    expect(lignes.map(([f, p, ...reste]) => [`${f} ${p}`, ...reste]), 'l’export n’est pas la table de rentabilité').toEqual(affichees);
    expect(d.querySelector('[data-export="rentabilite"]')!.textContent).toContain('Exporter (CSV)');
  });
});

describe('Lot 14 · incidents déclarés · ouvrir, annoter, clore · jamais supprimés', () => {
  const incidents = async () => db!.select().from(schema.platformIncidents);
  const lignesIncidents = (d: HTMLElement) => [...d.querySelectorAll('[data-ligne-incident]')].map((r) => [...r.children].map((c) => c.textContent ?? ''));

  it('le parcours complet, relu à l’écran et dans l’export', async () => {
    etat.session = fondateur();
    const vide = await ouvrirIncidentAction({ titre: '   ', gravite: 'grave', cause: 'quota', constat: '' });
    expect(vide.ok).toBe(false);
    expect(!vide.ok && vide.erreurs?.map((e) => e.champ)).toEqual(['titre', 'gravite', 'constat']);
    expect(await incidents(), 'une saisie refusée a écrit').toHaveLength(0);

    const o = await ouvrirIncidentAction({ titre: 'Quota fal épuisé', gravite: 'critique', cause: 'quota', constat: 'Les images échouent depuis 9 h' });
    if (!o.ok) throw new Error(o.message);
    let d = await page('incidents');
    expect(lignesIncidents(d)).toHaveLength(1);
    const [l] = lignesIncidents(d);
    expect(l!.slice(0, 7)).toEqual(['Quota fal épuisé', 'Critique', 'Ouvert', 'Quota fournisseur', l![4], 'Kevin', '0']);
    expect(d.querySelector('[data-segment-incident="ouverts"]')!.textContent).toBe('Ouverts · 1');
    expect(d.textContent).toContain('Incidents non clos');

    const n = await annoterIncidentAction({ id: o.id, texte: 'Recharge demandée · voir ops@exemple.invalid' });
    expect(n.ok).toBe(true);
    d = await page('incidents', { segment: 'en-cours' });
    expect(lignesIncidents(d).map((x) => [x[2], x[6]])).toEqual([['En cours', '1']]);
    expect(d.querySelector(`[data-notes="${o.id}"]`)!.textContent).toContain('Recharge demandée');
    expect(d.querySelector(`[data-notes="${o.id}"]`)!.textContent).toContain('Kevin');

    const c = await cloreIncidentAction({ id: o.id, resolution: '=1+1 · crédits rechargés, écrire à ops@exemple.invalid' });
    expect(c.ok).toBe(true);
    const deux = await cloreIncidentAction({ id: o.id, resolution: 'autre' });
    expect(deux).toEqual({ ok: false, message: 'Déjà clos · la première résolution est gardée.' });
    d = await page('incidents', { segment: 'clos' });
    const [clos] = lignesIncidents(d);
    expect(clos![2]).toBe('Clos');
    expect(clos![8]).toBe('=1+1 · crédits rechargés, écrire à ops@exemple.invalid');
    const bouton = d.querySelector(`#incident-${o.id} [data-geste="clore"]`)!;
    expect(bouton.getAttribute('aria-disabled')).toBe('true');
    expect(bouton.parentElement!.textContent).toContain('Déjà clos · un incident clos ne se rouvre pas d’ici, il s’annote.');
    expect((await page('incidents')).textContent).toContain('Aucun incident dans cet état.');

    // Un second incident, resté ouvert · l'export d'un segment ne reprend que ce segment.
    const o2 = await ouvrirIncidentAction({ titre: 'Lenteur Anthropic', gravite: 'mineure', cause: '', constat: 'Réponses lentes' });
    expect(o2.ok).toBe(true);
    expect(lignesIncidents(await page('incidents', { segment: 'clos' })).map((x) => x[0])).toEqual(['Quota fal épuisé']);
    const tous = await exporterTourAction({ ecran: 'incidents', segment: 'tous' });
    expect(tous.ok && relire(tous.csv).slice(1).map((x) => x[0])).toEqual(['Lenteur Anthropic', 'Quota fal épuisé']);
    const e = await exporterTourAction({ ecran: 'incidents', segment: 'clos' });
    if (!e.ok) throw new Error(e.message);
    const [entete, ...lignes] = relire(e.csv);
    expect(entete).toEqual(['Incident', 'Gravité', 'État', 'Cause', 'Ouvert le', 'Ouvert par', 'Notes', 'Clos le', 'Résolution']);
    expect(lignes).toEqual(lignesIncidents(d).map((x) => x.map(celluleSansFuite)));
    expect(e.csv).toContain(";'=1+1 · crédits rechargés, écrire à [adresse masquée]");
    expect(e.csv).not.toContain('ops@exemple.invalid');

    // Jamais supprimé · la base refuse, ligne à ligne comme par vidage.
    const refuse = async (p: PromiseLike<unknown>, nom: string) => {
      const e = await Promise.resolve(p).then(() => null, (x: Error) => x);
      expect(e?.message ?? `${nom} acceptée par la base`, nom).toMatch(/INCIDENT_JAMAIS_SUPPRIME/);
    };
    await refuse(db!.delete(schema.platformIncidents).where(eq(schema.platformIncidents.id, o.id)), 'suppression');
    await refuse(db!.execute(sql`TRUNCATE platform_incidents`), 'vidage');
    const [ligne] = await incidents();
    expect(ligne).toMatchObject({ status: 'clos', resolution: '=1+1 · crédits rechargés, écrire à ops@exemple.invalid', openedBy: ids.uF, closedBy: ids.uF });
    expect((ligne!.notes as unknown[])).toHaveLength(1);
  });
});

describe('Lot 14 · refus · seul le fondateur, admin de son espace, lit et écrit la plateforme', () => {
  const REFUS = 'Réservé au fondateur (plateforme) · rien n’a été lu ni modifié.';
  const nonAdmis = [
    ['admin d’espace non fondateur', () => session('client@exemple.invalid', 'admin', ids.uA)],
    ['fondateur sans rôle admin dans l’espace', () => session(FONDATEUR, 'member')],
    ['sans session', () => null],
  ] as const;

  it.each(nonAdmis)('%s · export, déclaration, note et clôture refusés sans rien lire ni écrire, sans citer aucune donnée', async (_nom, s) => {
    etat.session = fondateur();
    const o = await ouvrirIncidentAction({ titre: 'Témoin', gravite: 'mineure', cause: '', constat: 'Témoin du refus' });
    if (!o.ok) throw new Error(o.message);
    const avant = JSON.stringify(await db!.select().from(schema.platformIncidents));
    etat.session = s();
    for (const ecran of ['comptes', 'rentabilite', 'incidents'] as const) {
      const r = await exporterTourAction({ ecran });
      expect(r, `export ${ecran} accepté hors porte`).toEqual({ ok: false, message: REFUS });
    }
    expect(await ouvrirIncidentAction({ titre: 'Intrus', gravite: 'critique', cause: '', constat: 'x' }), 'déclaration acceptée hors porte').toEqual({ ok: false, message: REFUS });
    expect(await annoterIncidentAction({ id: o.id, texte: 'intrus' }), 'note acceptée hors porte').toEqual({ ok: false, message: REFUS });
    expect(await cloreIncidentAction({ id: o.id, resolution: 'intrus' }), 'clôture acceptée hors porte').toEqual({ ok: false, message: REFUS });
    expect(JSON.stringify(await db!.select().from(schema.platformIncidents)), 'un refus a écrit').toBe(avant);
  });

  it('les trois pages renvoient avant toute lecture · tableau de bord, ou connexion sans session', async () => {
    for (const [, s] of nonAdmis) {
      etat.session = s();
      const attendu = s() ? 'redirect:/dashboard' : 'redirect:/login';
      for (const chemin of ['signups', 'finance', 'incidents']) await expect(page(chemin), chemin).rejects.toThrow(attendu);
    }
  });

  it('aucun écran hors Tour de contrôle n’importe ces lectures ni ces gestes', () => {
    const WEB = join(__dirname, '..');
    const fichiers: string[] = [];
    const parcourir = (d: string) => { for (const n of readdirSync(d)) { if (['node_modules', '.next', 'test'].includes(n)) continue; const p = join(d, n); statSync(p).isDirectory() ? parcourir(p) : /\.tsx?$/.test(n) && fichiers.push(p); } };
    parcourir(WEB);
    const MOTIF = /actions\/tour-controle['"]|\bchargerIncidentsDeclares\b|\bplatformIncidents\b|\bporteAdminGeste\b/;
    const ADMIS = /^(app\/\(spatial\)\/sp\/admin\/|spatial\/vues\/admin\/|app\/actions\/tour-controle\.ts$)/;
    const lecteurs = fichiers.map((f) => relative(WEB, f).split('\\').join('/')).filter((f) => MOTIF.test(readFileSync(join(WEB, f), 'utf8')));
    expect(lecteurs.length, 'le balayage ne voit aucun lecteur · il regarde ailleurs').toBeGreaterThanOrEqual(5);
    expect(lecteurs.filter((f) => !ADMIS.test(f)), 'un écran hors Tour de contrôle lit la plateforme').toEqual([]);
  });
});
