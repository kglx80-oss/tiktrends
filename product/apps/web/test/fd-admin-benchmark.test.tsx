import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot F-D · ADMIN « IA et Studios », onglet Évaluations · ce qu'on VOIT (HTML
 * rendu de la vraie page serveur) et ce que les commandes font en base selon
 * qui appelle. Vraie base (pglite) ; seule la session est posée par le test.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), user: randomUUID() };
});
const h = vi.hoisted(() => ({ session: null as unknown }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { db, schema } from '@tiktrends/db';
import IaStudiosPage from '../app/(app)/admin/ia-studios/page';
import { approuverBenchmarkAction } from '../app/actions/studios/prompts';
import { approuverBudgetBenchmarkAction, joindreFichesBenchmarkAction } from '../lib/studios/benchmark/actions';
import { lancerCampagneSimulee } from '../lib/studios/benchmark/programme';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { acteurPlateforme } from './l2-outils';

const base = (o: Record<string, unknown>) => ({ user: { id: ids.user, email: 'equipe@plateforme.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', plan: 'business', ...o });
const EQUIPE = () => base({ role: 'owner', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } });
const REFUSES: Array<[string, () => unknown]> = [
  ['owner d’espace', () => base({ role: 'owner', equipe: null })],
  ['admin d’espace', () => base({ role: 'admin', equipe: null })],
  ['lecteur', () => base({ role: 'client_viewer', equipe: null })],
];
const page = async () => renderToStaticMarkup(await IaStudiosPage({ searchParams: Promise.resolve({ onglet: 'evaluations' }) }));
const evaluations = async () => (await db.select().from(schema.studioPromptEvaluations)).length;
let staged = '';

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'Démo', plan: 'business' });
  await db.insert(schema.users).values({ id: ids.user, email: 'equipe@plateforme.test' });
  // Une campagne SIMULÉE jointe (recette locale) · elle publie sa release de recette.
  const sim = await lancerCampagneSimulee({ cas: ['F04'], racine: null, env: { STUDIOS_PROMPTS_RECETTE_LOCALE: '1', DATABASE_URL: 'postgres://postgres@127.0.0.1:5433/fd' } });
  if (!sim.ok) throw new Error(JSON.stringify(sim.refus));
  // Puis une release candidate en attente (staged) : un titre retouché, une nouvelle version validée.
  const a = acteurPlateforme(ids.user);
  const v = (await depot.listerVersions()).find((l) => l.key === 'jarvis.route' && l.status === 'validated')!;
  const b = await depot.enregistrerBrouillon(a, { baseId: v.id, champs: { title: 'Routage Jarvis (candidate)' }, motif: 'Candidate F-D' });
  if (!b.ok) throw new Error(JSON.stringify(b));
  if (!(await depot.validerVersion(a, { id: b.id })).ok) throw new Error('validation');
  const r = await depot.creerRelease(a, { motif: 'candidate' });
  if (!r.ok || r.existante) throw new Error(JSON.stringify(r));
  staged = r.id;
  if (!(await depot.evaluerRelease(a, { releaseId: staged })).ok) throw new Error('évaluation structurelle');
}, 120_000);
beforeEach(() => { h.session = EQUIPE(); });

describe('ce que voit l’équipe plateforme', () => {
  it('devis par cas et total AVANT tout clic, approbation, rapport SIMULÉ marqué, geste indisponible sans évaluation réelle', async () => {
    const html = await page();
    expect(html).toContain('Benchmark F01-F24 · devis');
    expect(html).toContain('<b>Total · 9,925 $</b>');
    expect(html).toContain('Devis par cas (24)');
    expect(html).toMatch(/F07<\/td><td[^>]*>1<\/td><td[^>]*>0<\/td><td[^>]*>0,218 \$/);
    expect(html).not.toContain('non chiffrable ·');
    expect(html).toContain('Approuver ce budget…');
    expect(html).toContain('Devis du benchmark complet : <b>9,925 $</b> au plus.');
    expect(html).toMatch(/aria-label="Rapport SIMULÉ [^"]+"/);
    expect(html).toContain('SIMULÉ · exécution sur fournisseurs simulés, aucune évaluation réelle de la qualité');
    expect(html).toContain('Ne vaut pas évaluation');
    expect(html).toContain('Joindre les fiches');
    expect(html).toContain('Benchmark non approuvé');
    expect(html).toContain('le geste est indisponible');
    expect(html).not.toContain('Benchmark approuvé…');
  });

  it('approbation enregistrée par la commande : listée avec son budget, son devis et son usage', async () => {
    const r = await approuverBudgetBenchmarkAction({ releaseId: staged, budgetUsd: '10', motif: 'Campagne de la release candidate' });
    expect(r).toMatchObject({ ok: true });
    const html = await page();
    expect(html).toMatch(/budget 10,000 \$ pour un devis de 9,925 \$ · [^·]+· non utilisée/);
  });

  it('le geste « Benchmark approuvé » exige la confirmation, puis une évaluation réelle avec fiches · rien ne bouge sinon', async () => {
    const avant = (await depot.lireReleaseParId(staged))!.evaluation;
    expect(await approuverBenchmarkAction({ releaseId: staged, evaluationId: staged, motif: 'x', confirme: false })).toMatchObject({ ok: false, message: 'Confirme l’approbation du benchmark avant de l’envoyer.' });
    const r = await approuverBenchmarkAction({ releaseId: staged, evaluationId: '00000000-0000-4000-8000-000000000000', motif: 'Revue', confirme: true });
    expect(r).toMatchObject({ ok: false, constats: [{ code: 'EVALUATION_ABSENTE' }] });
    expect((await depot.lireReleaseParId(staged))!.evaluation).toEqual(avant);
  });
});

describe('SEC-09 · un administrateur d’espace n’obtient aucun de ces pouvoirs', () => {
  for (const [nom, s] of REFUSES) {
    it(`${nom} · écran de refus, et chaque commande refusée sans rien écrire`, async () => {
      h.session = s();
      const html = await page();
      expect(html).toContain('Accès réservé à l’équipe de la plateforme.');
      for (const x of ['Benchmark F01-F24', 'Approuver ce budget', 'Joindre les fiches', 'SIMULÉ']) expect(html).not.toContain(x);
      const n = await evaluations();
      const avant = (await depot.lireReleaseParId(staged))!.evaluation;
      const reponses = [
        await approuverBudgetBenchmarkAction({ releaseId: staged, budgetUsd: '10', motif: 'tentative' }),
        await joindreFichesBenchmarkAction({ releaseId: staged, rapport: '{}', fiches: '[]' }),
        await approuverBenchmarkAction({ releaseId: staged, evaluationId: staged, motif: 'tentative', confirme: true }),
      ];
      expect(reponses.map((x) => x.ok)).toEqual([false, false, false]);
      expect(reponses.every((x) => !x.ok && /équipe de la plateforme/.test(String((x as { message?: string }).message)))).toBe(true);
      expect(await evaluations()).toBe(n);
      expect((await depot.lireReleaseParId(staged))!.evaluation).toEqual(avant);
    });
  }
});
