// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { cloneElement, type ReactElement } from 'react';

/**
 * Suivi opérationnel · tâches de génération (RJ JB01) et registre d'audit
 * (RJ AR06) · sur une VRAIE base (pglite + migrations du dépôt), par les
 * VRAIES actions (`exporterTourAction`, porte `porteAdminGeste`) et les
 * VRAIES pages rendues · on lit le DOM.
 *
 *  · tâches semées dans CHAQUE état · segments justes, « bloquée » au-delà de
 *    30 min, pas à 30 min pile (horloge INJECTÉE · `Date` figée sur T0, les
 *    semis datés AVANT T0, jamais « à venir ») ;
 *  · une vraie tâche (devis, approbation, worker simulé) · libellé
 *    « Génération · Image », JAMAIS « studio.generation » (ici ET dans la
 *    tuile Tâches du projet), coût lu au registre ;
 *  · export = la table affichée · « =1+1 » neutralisé, aucun secret, aucune
 *    adresse, aucun lien du stockage ;
 *  · « Déclarer un incident » · formulaire de #1070 pré-rempli, RIEN écrit
 *    avant le clic ;
 *  · registre · portée, filtre « sensibles » = la liste fermée, recherche
 *    (acteur, action, cible), export ;
 *  · refus · admin d'espace non fondateur, fondateur sans rôle admin, sans
 *    session · rien lu, rien cité.
 * 0 $ · aucun modèle, aucun appel réseau (fournisseur simulé).
 */
const h = vi.hoisted(() => ({ session: null as unknown, marque: null as { id: string; name: string } | null }));
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  return {
    wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u(), uF: u(), uE: u(),
    pB: u(), vB: u(), echec: u(), bloquee: u(), limite: u(), recente: u(), rapprocher: u(), annulee: u(), ciblE3: u(),
  };
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
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => h.marque, listBrands: async () => [] }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }), depensesAReconcilier: async () => ({ lignes: [] }) }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { db, eq, schema } from '@tiktrends/db';
import { ACTIONS_SENSIBLES, celluleSansFuite, parseCsv } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import { semer, session, type IdsStudios } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, KEYFRAMES } from './l4c-harnais';
import { exporterTourAction, ouvrirIncidentAction } from '../app/actions/tour-controle';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const FONDATEUR = 'kguilbaux@agence-glx.fr';
const fondateur = (equipe: unknown = null) => ({ user: { id: ids.uF, email: FONDATEUR, name: 'Kevin' }, workspaceId: ids.wsA, workspaceName: 'Espace A', plan: 'business', role: 'owner', equipe });
/** L'horloge INJECTÉE · toutes les pages et les exports se lisent à T0, les semis sont datés avant. */
const T0 = new Date('2026-01-15T10:00:00.000Z');
const MIN = 60_000;
const avant = (ms: number) => new Date(T0.getTime() - ms);
const SECRETS = ['SECRETSECRET', 'ops@exemple.invalid', 'adresse-brute.stockage.test', 'TOKEN-SECRET', 'assets/ws-secret', FONDATEUR, 'proprio@lumen.example'];
const S = { projetA: '', jobReel: '' };

beforeAll(async () => {
  await semer(db, schema, ids as unknown as IdsStudios);
  await db!.insert(schema.users).values([{ id: ids.uF, email: FONDATEUR, name: 'Kevin' }, { id: ids.uE, email: 'elodie@exemple.invalid', name: 'Élodie' }]);
  await db!.insert(schema.workspaceMembers).values([{ workspaceId: ids.wsA, userId: ids.uF, role: 'owner' }]);
  await db!.update(schema.workspaces).set({ name: 'Maison Éclat' }).where(eq(schema.workspaces.id, ids.wsB));

  // Une VRAIE tâche · devis, approbation, worker simulé · `studio.generation`, instantané à deux images, registre réservé puis réglé.
  h.marque = { id: ids.brandA1, name: 'Marque A1' };
  const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · suivi opérationnel' });
  S.projetA = p.projectId;
  S.jobReel = await lancerLot(db, ctxDe(ids as unknown as IdsStudios, 'ua'), p.projectId, KEYFRAMES(2));
  await executer(db, S.jobReel);

  // Tâches semées dans chaque état, sur un projet de l'espace B · datées AVANT T0.
  await db!.insert(schema.studioProjects).values({ id: ids.pB, workspaceId: ids.wsB, brandId: ids.brandB1, title: '=1+1 Lumière', kind: 'image' });
  await db!.insert(schema.studioProjectVersions).values({ id: ids.vB, projectId: ids.pB, workspaceId: ids.wsB, brandId: ids.brandB1, n: 1, schemaVersion: 1, content: { titre: 'x' }, contentHash: 'a'.repeat(64) });
  const job = (id: string, state: string, creeLe: Date, error: unknown = null) => ({
    id, projectId: ids.pB, projectVersionId: ids.vB, workspaceId: ids.wsB, brandId: ids.brandB1, state: state as 'queued', operation: 'studio.generation',
    idempotencyKey: id, inputHash: 'b'.repeat(64), snapshot: { lignes: [{ operation: 'keyframe:s_image' }] }, createdAt: creeLe, updatedAt: creeLe, error,
  });
  await db!.insert(schema.studioJobs).values([
    job(ids.echec, 'failed', avant(120 * MIN), { issue: 'echec_sans_frais', motif: 'refus certain du fournisseur · https://adresse-brute.stockage.test/tt/assets/ws-secret/a.png · clé sk-ant-api03-SECRETSECRET · écrire à ops@exemple.invalid' }),
    job(ids.bloquee, 'running', avant(30 * MIN + 1_000)),
    job(ids.limite, 'running', avant(30 * MIN)),
    job(ids.recente, 'queued', avant(5 * MIN)),
    job(ids.rapprocher, 'reconciliation_required', avant(180 * MIN)),
    job(ids.annulee, 'cancelled', avant(24 * 60 * MIN)),
  ]);
  const L = (jobId: string, kind: string, credits: number, usdMicros: number) => ({ workspaceId: ids.wsB, brandId: ids.brandB1, jobId, kind: kind as 'reserve', credits, usdMicros, ref: `${jobId}:${kind}` });
  await db!.insert(schema.studioBudgetLedger).values([L(ids.echec, 'reserve', 8, 80_000), L(ids.echec, 'release', 8, 80_000), L(ids.rapprocher, 'reserve', 40, 600_000)]);

  // Le registre · gestes de plateforme, une action sensible d'un espace, du bruit d'espace (hors registre), un rapprochement.
  const A = (o: Partial<typeof schema.studioAuditEvents.$inferInsert> & { action: string }) => ({ effectiveRole: 'owner', targetType: 'prompt_release', targetId: 'rel-1', reason: '', traceId: 't', ...o });
  await db!.insert(schema.studioAuditEvents).values([
    A({ actorId: ids.uF, workspaceId: null, action: 'prompt.release.publier', occurredAt: avant(10 * MIN), reason: '=1+1 mise en production · voir ops@exemple.invalid', details: { releaseHash: 'abc', token: 'TOKEN-SECRET', lien: 'https://adresse-brute.stockage.test/tt/x' } }),
    A({ actorId: ids.uE, workspaceId: null, action: 'prompt.version.brouillon', occurredAt: avant(20 * MIN), targetType: 'prompt_template', targetId: 'jarvis.chat@1.2.0' }),
    A({ actorId: ids.ub, workspaceId: ids.wsB, action: 'equipe.membre.role', occurredAt: avant(30 * MIN), targetType: 'workspace_member', targetId: ids.ciblE3 }),
    A({ actorId: ids.ua, workspaceId: ids.wsA, action: 'studios.interrupteurs', occurredAt: avant(40 * MIN), targetType: 'workspace', targetId: ids.wsA }),
    A({ actorId: ids.ua, workspaceId: ids.wsA, brandId: ids.brandA1, action: 'project.create', occurredAt: avant(50 * MIN), targetType: 'studio_project', targetId: 'hors-registre' }),
  ]);
  const [ligne] = await db!.insert(schema.aiSpend).values({ workspaceId: null, provider: 'fal', model: 'fal_image', action: 'studio.generation', estimatedUsd: 0.08, actualUsd: 0.08, reconcileReason: 'délai' }).returning();
  await db!.insert(schema.aiSpendReconciliations).values({ aiSpendId: ligne!.id, reservedMicros: 80_000, billedMicros: 60_000, currency: 'USD', providerRef: 'inv_123', reason: 'facture fal du mois', authorId: ids.uF, idempotencyKey: 'cle-rapprochement-1', createdAt: avant(60 * MIN) });
});
afterEach(() => { h.session = null; vi.useRealTimers(); });


/* ───────────────────────── lecture du DOM ───────────────────────── */

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
type Page = { default: (p: { searchParams?: Promise<Record<string, string>>; params?: Promise<Record<string, string>> }) => Promise<React.ReactElement> };
const PAGES: Record<string, () => Promise<unknown>> = {
  taches: () => import('../app/(spatial)/sp/admin/taches/page'),
  audit: () => import('../app/(spatial)/sp/admin/audit/page'),
  incidents: () => import('../app/(spatial)/sp/admin/incidents/page'),
  equipe: () => import('../app/(spatial)/sp/admin/equipe/page'),
};
/** Une page rendue à T0 (horloge figée pendant le rendu). */
const page = async (chemin: string, sp: Record<string, string> = {}) => {
  const m = await PAGES[chemin]!() as Page;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0);
  try { return dom(renderToStaticMarkup(avecSpatial(await m.default({ searchParams: Promise.resolve(sp) })))); } finally { vi.useRealTimers(); }
};
const exporter = async (e: Parameters<typeof exporterTourAction>[0]) => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0);
  try { return await exporterTourAction(e); } finally { vi.useRealTimers(); }
};
/** Les cellules d'une ligne de tâche, sans la colonne des gestes. */
const lignesTaches = (d: HTMLElement) => [...d.querySelectorAll('[data-table="taches"] [data-tache]')].map((r) => [...r.children].filter((c) => !c.hasAttribute('data-gestes')).map((c) => c.textContent ?? ''));
const idsTaches = (d: HTMLElement) => [...d.querySelectorAll('[data-table="taches"] [data-tache]')].map((r) => r.getAttribute('data-tache'));
const lignesRegistre = (d: HTMLElement) => [...d.querySelectorAll('[data-table="registre"] [data-evenement]')].map((r) => [...r.children].map((c) => c.textContent ?? ''));
const puces = (d: HTMLElement, attr: string) => Object.fromEntries([...d.querySelectorAll(`[${attr}]`)].map((b) => [b.getAttribute(attr), b.textContent]));
const relire = (csv: string) => parseCsv(csv.replace(/^﻿/, ''), ';');

describe('Tâches de génération · segments calculés à l’horloge injectée', () => {
  it('chaque état dans son segment · « bloquée » au-delà de 30 min, pas à 30 min pile', async () => {
    h.session = fondateur();
    const d = await page('taches');
    expect(puces(d, 'data-segment-tache')).toEqual({
      tous: 'Toutes · 7', echec: 'En échec · 1', bloquees: 'Bloquées · 1', 'en-cours': 'En cours · 2', rapprochement: 'Coût à rapprocher · 1', annulees: 'Annulées · 1', terminees: 'Terminées · 1',
    });
    expect(idsTaches(await page('taches', { segment: 'bloquees' })), 'bloquée · 30 min et une seconde').toEqual([ids.bloquee]);
    expect(idsTaches(await page('taches', { segment: 'en-cours' })), 'en cours · 30 min pile et 5 min').toEqual([ids.recente, ids.limite]);
    expect(idsTaches(await page('taches', { segment: 'echec' }))).toEqual([ids.echec]);
    expect(idsTaches(await page('taches', { segment: 'rapprochement' }))).toEqual([ids.rapprocher]);
    expect(idsTaches(await page('taches', { segment: 'annulees' }))).toEqual([ids.annulee]);
    expect(idsTaches(await page('taches', { segment: 'terminees' }))).toEqual([S.jobReel]);
    const b = (await page('taches', { segment: 'bloquees' })).querySelector(`[data-tache="${ids.bloquee}"]`)!;
    expect(b.textContent).toContain('En cours · bloquée');
    expect(b.textContent).toContain('30 min');
    expect(d.textContent).toContain('Bloquées');
  });

  it('libellé jamais brut · la vraie tâche se dit « Génération · Image », coût LU au registre (réglé)', async () => {
    h.session = fondateur();
    const d = await page('taches');
    expect(d.innerHTML, 'le code brut de l’opération s’affiche').not.toContain('studio.generation');
    const reelle = lignesTaches(d)[idsTaches(d).indexOf(S.jobReel)]!;
    expect(reelle.slice(0, 4)).toEqual(['Génération · Image', 'Terminé', 'Sérum · suivi opérationnel', 'Espace A']);
    const reg = await db!.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, S.jobReel));
    const regle = reg.find((m) => m.kind === 'settle')!;
    expect(reelle[5]).toBe(`Réglé · ${(Number(regle.usdMicros) / 1e6).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} $ · ${regle.credits} crédit${regle.credits > 1 ? 's' : ''}`);
    const e = lignesTaches(d)[idsTaches(d).indexOf(ids.echec)]!;
    expect(e[5]).toBe('Rendu · rien de réglé');
    expect(e[6]).toContain('refus certain du fournisseur');
    for (const s of SECRETS) expect(d.innerHTML, `fuite à l’écran · ${s}`).not.toContain(s);
  });

  it('recherche pliée · « lumiere » trouve « =1+1 Lumière », « eclat bloquee » la seule tâche bloquée de Maison Éclat', async () => {
    h.session = fondateur();
    expect(idsTaches(await page('taches', { q: 'lumiere' }))).toHaveLength(6);
    expect(idsTaches(await page('taches', { q: 'ECLAT bloquée' }))).toEqual([ids.bloquee]);
    expect((await page('taches', { q: 'introuvable' })).textContent).toContain('Aucune tâche ne correspond à ce filtre.');
  });

  it('lecture seule · seuls gestes, des LIENS · « Déclarer un incident » sur l’échec, « Rapprocher le coût » sur l’interrompue', async () => {
    h.session = fondateur();
    const d = await page('taches');
    expect([...d.querySelectorAll('[data-declarer]')].map((a) => [a.getAttribute('data-declarer'), a.getAttribute('href')])).toEqual([[ids.echec, `/admin/incidents?tache=${ids.echec}#declarer`]]);
    expect([...d.querySelectorAll('[data-rapprocher]')].map((a) => [a.getAttribute('data-rapprocher'), a.getAttribute('href')])).toEqual([[ids.rapprocher, '/admin/depenses#a-reconcilier']]);
    expect(d.querySelectorAll('[data-section="taches"] form, [data-table="taches"] button'), 'un bouton ou un formulaire dans la table').toHaveLength(0);
  });

  it('export = la table affichée, cellule par cellule · « =1+1 » neutralisé, aucun secret, le filtre suivi', async () => {
    h.session = fondateur();
    const d = await page('taches');
    const r = await exporter({ ecran: 'taches' });
    if (!r.ok) throw new Error(r.message);
    const [entete, ...lignes] = relire(r.csv);
    expect(entete).toEqual(['Tâche', 'État', 'Projet', 'Espace', 'Âge', 'Coût engagé', 'Dernière erreur']);
    expect(lignes, 'l’export n’est pas la table affichée').toEqual(lignesTaches(d).map((l) => l.map(celluleSansFuite)));
    expect(r.csv).toMatch(/;'=1\+1 Lumière;/);
    expect(r.csv).not.toMatch(/;=1\+1/);
    expect(r.csv).not.toContain('studio.generation');
    for (const s of SECRETS) expect(r.csv, `fuite dans l’export · ${s}`).not.toContain(s);
    expect(r.nom).toBe('tour-de-controle_taches-tous_2026-01-15.csv');
    const f = await exporter({ ecran: 'taches', segment: 'bloquees' });
    expect(f.ok && relire(f.csv).slice(1).map((l) => l[1])).toEqual(['En cours · bloquée']);
  });
});

describe('« Déclarer un incident » depuis une tâche en échec · pré-rempli, rien écrit avant le clic', () => {
  it('le formulaire de #1070 arrive rempli · aucun incident en base tant que « Déclarer » n’est pas cliqué', async () => {
    h.session = fondateur();
    const d = await page('incidents', { tache: ids.echec });
    const titre = (d.querySelector('#incident-titre') as HTMLInputElement).value;
    const constat = (d.querySelector('#incident-constat') as HTMLTextAreaElement).value;
    expect(titre).toBe('Tâche en échec · Génération · Image · Maison Éclat');
    expect(constat).toContain(ids.echec);
    expect(constat).toContain('refus certain du fournisseur');
    for (const s of SECRETS) expect(constat, `fuite dans le constat · ${s}`).not.toContain(s);
    expect(d.querySelector('[data-prerempli]')!.textContent).toContain('rien n’est enregistré avant « Déclarer l’incident »');
    expect(await db!.select().from(schema.platformIncidents), 'la visite a écrit un incident').toHaveLength(0);
    // Une tâche inconnue ou mal formée · formulaire vide, rien lu de plus.
    expect(((await page('incidents', { tache: 'pas-un-uuid' })).querySelector('#incident-titre') as HTMLInputElement).value).toBe('');
    // Le clic · la MÊME action que la déclaration à la main.
    const o = await ouvrirIncidentAction({ titre, gravite: 'majeure', cause: '', constat });
    expect(o.ok).toBe(true);
    expect(await db!.select().from(schema.platformIncidents)).toHaveLength(1);
  });
});

describe('Registre d’audit · portée, actions sensibles, recherche, export', () => {
  it('la portée · gestes de plateforme, interrupteurs, sensibles d’espace, rapprochement · jamais le bruit des espaces', async () => {
    h.session = fondateur();
    const d = await page('audit');
    const lignes = lignesRegistre(d);
    expect(lignes.map((l) => l[3])).toEqual(['prompt.release.publier', 'prompt.version.brouillon', 'equipe.membre.role', 'studios.interrupteurs', 'depense.rapprochement']);
    expect(d.innerHTML, 'le bruit d’un espace entre au registre').not.toContain('hors-registre');
    expect(d.innerHTML).not.toMatch(/job\.(queued|completed|enqueue)/);
    expect(lignes[0]!.slice(1, 3)).toEqual(['Kevin', 'a publié une release']);
    expect(lignes[2]!.slice(1, 6)).toEqual(['Membre sans nom', 'a changé le rôle d’un membre', 'equipe.membre.role', `Membre · ${ids.ciblE3.slice(0, 8)}`, 'Maison Éclat']);
    expect(lignes[4]!.slice(1, 6)).toEqual(['Kevin', 'a rapproché une dépense IA de sa facture', 'depense.rapprochement', lignes[4]![4], 'Plateforme']);
    for (const s of SECRETS) expect(d.innerHTML, `fuite à l’écran · ${s}`).not.toContain(s);
    expect(lignes[0]![7]).toContain('"token":"[masqué]"');
  });

  it('« Actions sensibles » = la liste fermée · effectifs sur les puces, la liste dite en entier', async () => {
    h.session = fondateur();
    const d = await page('audit', { segment: 'sensibles' });
    expect(puces(d, 'data-segment-audit')).toEqual({ tous: 'Tout le registre · 5', sensibles: 'Actions sensibles · 4' });
    expect(lignesRegistre(d).map((l) => l[3])).toEqual(['prompt.release.publier', 'equipe.membre.role', 'studios.interrupteurs', 'depense.rapprochement']);
    expect([...d.querySelectorAll('[data-sensible]')].map((x) => x.getAttribute('data-sensible'))).toEqual([...ACTIONS_SENSIBLES]);
    expect(d.querySelector('[data-segment-audit="sensibles"]')!.getAttribute('aria-current')).toBe('page');
  });

  it('recherche · acteur (« elodie » trouve « Élodie »), action (« publie »), cible (identifiant entier)', async () => {
    h.session = fondateur();
    expect(lignesRegistre(await page('audit', { q: 'elodie' })).map((l) => l[3])).toEqual(['prompt.version.brouillon']);
    expect(lignesRegistre(await page('audit', { q: 'publié' })).map((l) => l[3])).toEqual(['prompt.release.publier']);
    expect(lignesRegistre(await page('audit', { q: ids.ciblE3 })).map((l) => l[3])).toEqual(['equipe.membre.role']);
    expect(lignesRegistre(await page('audit', { q: 'jarvis.chat' })).map((l) => l[3])).toEqual(['prompt.version.brouillon']);
  });

  it('export = le registre affiché · « =1+1 » neutralisé, détails bornés, secrets et adresses masqués', async () => {
    h.session = fondateur();
    const d = await page('audit');
    const r = await exporter({ ecran: 'audit' });
    if (!r.ok) throw new Error(r.message);
    const [entete, ...lignes] = relire(r.csv);
    expect(entete).toEqual(['Quand', 'Acteur', 'Action', 'Code', 'Cible', 'Espace', 'Motif', 'Détails']);
    expect(lignes, 'l’export n’est pas le registre affiché').toEqual(lignesRegistre(d).map((l) => l.map(celluleSansFuite)));
    expect(r.csv).toContain(";'=1+1 mise en production · voir [adresse masquée];");
    for (const s of SECRETS) expect(r.csv, `fuite dans l’export · ${s}`).not.toContain(s);
    const s = await exporter({ ecran: 'audit', segment: 'sensibles', q: 'kevin' });
    expect(s.ok && relire(s.csv).slice(1).map((l) => l[3])).toEqual(['prompt.release.publier', 'depense.rapprochement']);
  });

  it('« Rôles & droits » · « Journal complet » mène au registre, seulement quand la session en ouvre la porte', async () => {
    const equipe = { role: 'adminplus', matrice: {}, plateformeAdmissible: true };
    h.session = fondateur(equipe);
    expect((await page('equipe')).querySelector('[data-journal]')!.getAttribute('href')).toBe('/admin/audit');
    h.session = { ...fondateur(equipe), user: { id: ids.uE, email: 'elodie@exemple.invalid', name: 'Élodie' } };
    expect((await page('equipe')).querySelector('[data-journal]'), 'porte fermée montrée (SEC-10)').toBeNull();
  });
});

describe('La tuile « Tâches » du projet · la même règle, jamais le code brut', () => {
  it('« Génération · Image », pas « studio.generation »', async () => {
    h.session = session(ids as unknown as IdsStudios, 'ua', { plan: 'plus' });
    const { default: ProjetSpatial } = await import('../app/(spatial)/sp/studio/projets/[id]/page');
    const el = await ProjetSpatial({ params: Promise.resolve({ id: S.projetA }), searchParams: Promise.resolve({}) });
    // L'onglet Créations (celui que l'ancre `#taches` ouvre) · la VRAIE vue du projet, ses vraies props, rien d'autre de changé.
    const html = renderToStaticMarkup(avecSpatial(cloneElement(el as ReactElement<{ ongletInitial?: string }>, { ongletInitial: 'crea' })));
    const d = dom(html);
    const tuile = d.querySelector(`[data-tache="${S.jobReel}"]`);
    expect(tuile, 'la tâche réelle n’est pas dans la tuile').not.toBeNull();
    expect(tuile!.textContent).toContain('Génération · Image · lancée le');
    expect(d.querySelector('#taches')!.textContent).not.toContain('studio.generation');
  });
});

describe('Refus · seul le fondateur, admin de son espace, lit les tâches et le registre', () => {
  const REFUS = 'Réservé au fondateur (plateforme) · rien n’a été lu ni modifié.';
  const nonAdmis = [
    ['admin d’espace non fondateur', () => ({ user: { id: ids.ub, email: 'ub@studios.test', name: 'B' }, workspaceId: ids.wsB, workspaceName: 'Maison Éclat', plan: 'business', role: 'admin', equipe: null })],
    ['fondateur sans rôle admin dans l’espace', () => ({ ...fondateur(), role: 'member' })],
    ['sans session', () => null],
  ] as const;

  it.each(nonAdmis)('%s · pages renvoyées avant toute lecture, exports refusés sans rien citer', async (_nom, s) => {
    h.session = s();
    const attendu = s() ? 'redirect:/dashboard' : 'redirect:/login';
    for (const chemin of ['taches', 'audit']) await expect(page(chemin), chemin).rejects.toThrow(attendu);
    await expect(page('incidents', { tache: ids.echec })).rejects.toThrow(attendu);
    for (const ecran of ['taches', 'audit'] as const) {
      for (const segment of [undefined, 'echec', 'sensibles']) expect(await exporter({ ecran, segment }), `export ${ecran} accepté hors porte`).toEqual({ ok: false, message: REFUS });
    }
  });
});
