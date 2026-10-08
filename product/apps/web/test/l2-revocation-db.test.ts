import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Recette du 8 octobre · « la révocation d'une release n'est pas propagée à
 * tous les chemins ». `releaseDeLigne` ignorait `evaluation.revocation` : le
 * noyau ne voyait jamais une release révoquée (seul l'épinglage L3 la lisait).
 *
 * On publie A, on la RÉVOQUE par la commande ADMIN, puis on constate le
 * résultat sur chaque chemin, en base et dans ce que reçoit le fournisseur :
 * tâche studio (pointeur), job épinglé sur A, nouveau devis, Jarvis,
 * publication et rollback vers A, réévaluation.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as import('./studios-semis').IdsStudios }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));

import { db, schema, eq } from '@tiktrends/db';
import { vueReleases } from '../app/(app)/admin/ia-studios/donnees';
import { EcranReleases } from '../app/(app)/admin/ia-studios/Ecrans';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { executerTache, epinglerDevis, resoudreConversationJarvis, type DemandeTache } from '../lib/studios/prompts/resolveur';
import { semer } from './studios-semis';
import { acteurPlateforme, acteurSans, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule, SORTIE_JARVIS_ROUTE, ENTREE_JARVIS_ROUTE } from './l2-adaptateur-simule';

const ids = etat.ids;
const A = acteurPlateforme();
let appels = 0;
const fournisseur = adaptateurSimule(() => { appels += 1; return SORTIE_JARVIS_ROUTE; });
const demande = (o: Partial<DemandeTache> = {}): DemandeTache => ({
  templateKey: 'jarvis.route', portee: { workspaceId: ids.wsA, brandId: ids.brandA1 }, acteur: { userId: ids.ua, traceId: `st_${Math.random()}` },
  taskInputs: ENTREE_JARVIS_ROUTE, contexte: {}, adaptateur: fournisseur, environnement: 'test', ...o,
});
const codes = (r: { ok: boolean; constats?: Array<{ code: string }> }) => (r.ok ? [] : (r.constats ?? []).map((c) => c.code));
let relA = '';

beforeAll(async () => {
  await semer(db, schema, ids);
  relA = await publierRegistreDeTest(depot, A);
  // Avant révocation : A sert tout le monde (et entre dans le cache des releases).
  expect((await executerTache(demande())).ok).toBe(true);
  expect((await resoudreConversationJarvis())).toMatchObject({ ok: true, origine: 'release' });
});

describe('révocation · commande ADMIN', () => {
  it('sans permission ⇒ refus, rien écrit ; sans motif ⇒ refus', async () => {
    expect(codes(await depot.revoquerRelease(acteurSans(), { releaseId: relA, motif: 'x' }))).toEqual(['FORBIDDEN']);
    expect(codes(await depot.revoquerRelease(A, { releaseId: relA, motif: '  ' }))).toEqual(['INVALID_SCHEMA']);
    expect((await depot.releaseActive())!.noyau.revocation).toBeUndefined();
  });

  it('révoquer A ⇒ écrit dans l’évaluation, audité ; deuxième révocation ⇒ déjà', async () => {
    const r = await depot.revoquerRelease(A, { releaseId: relA, motif: 'consigne fautive' });
    expect(r).toMatchObject({ ok: true, deja: false });
    expect(await depot.revoquerRelease(A, { releaseId: relA, motif: 'encore' })).toMatchObject({ ok: true, deja: true });
    const audits = (await db.select().from(schema.studioAuditEvents)).filter((e) => e.action === 'prompt.release.revoquer');
    expect(audits).toHaveLength(1);
  });
});

describe('révocation · propagée à tous les chemins (cache compris)', () => {
  it('le noyau la voit, même si A était en cache', async () => {
    expect((await depot.releaseActive())!.noyau.revocation, 'révocation absente du noyau chargé').toEqual({ motif: 'consigne fautive' });
  });

  it('tâche studio servie par le pointeur ⇒ bloquée avant tout appel', async () => {
    const avant = appels;
    expect(codes(await executerTache(demande()))).toEqual(['RELEASE_REVOQUEE']);
    expect(appels, 'le fournisseur a été appelé avec une release révoquée').toBe(avant);
  });

  it('job épinglé sur A ⇒ bloqué ; nouveau devis ⇒ refusé', async () => {
    const avant = appels;
    expect(codes(await executerTache(demande({ epinglage: { promptReleaseId: relA } })))).toEqual(['RELEASE_REVOQUEE']);
    expect(appels).toBe(avant);
    expect(codes(await epinglerDevis())).toEqual(['RELEASE_REVOQUEE']);
  });

  it('Jarvis ⇒ jamais la release révoquée : consigne 1.0.0, origine tracée', async () => {
    const r = await resoudreConversationJarvis();
    expect(r).toMatchObject({ ok: true, origine: 'repli_revocation', release: null });
  });

  it('publication ou rollback vers A ⇒ refusés, pointeur inchangé', async () => {
    const p = await depot.lirePointeur();
    expect(codes(await depot.rollbackRelease(A, { releaseId: relA, attendue: p?.releaseId ?? null, environnement: 'test' }))).toContain('RELEASE_REVOQUEE');
    expect(codes(await depot.publierRelease(A, { releaseId: relA, attendue: p?.releaseId ?? null, environnement: 'test' }))).toContain('RELEASE_REVOQUEE');
    expect(await depot.lirePointeur()).toEqual(p);
    const [l] = await db.select().from(schema.studioPromptReleases).where(eq(schema.studioPromptReleases.id, relA));
    expect((l!.evaluation as { revocation?: { motif: string } }).revocation?.motif).toBe('consigne fautive');
  });

  it('réévaluer une release révoquée (staged) ⇒ l’évaluation est écrite, la révocation reste', async () => {
    const base = (await depot.listerVersions()).filter((v) => v.key === 'photo_clean' && v.status === 'validated').sort((x, y) => y.version - x.version)[0]!;
    const b = await depot.enregistrerBrouillon(A, { baseId: base.id, champs: { lighting: 'lumière rasante' }, motif: 'release B' });
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect((await depot.validerVersion(A, { id: b.id })).ok).toBe(true);
    const relB = await depot.creerRelease(A, { motif: 'B' });
    if (!relB.ok) throw new Error(JSON.stringify(relB));
    expect((await depot.revoquerRelease(A, { releaseId: relB.id, motif: 'B fautive' })).ok).toBe(true);
    const ev = await depot.evaluerRelease(A, { releaseId: relB.id });
    expect(ev.ok, JSON.stringify(ev)).toBe(true);
    const [l] = await db.select().from(schema.studioPromptReleases).where(eq(schema.studioPromptReleases.id, relB.id));
    const evaluation = l!.evaluation as { revocation?: { motif: string }; evaluationId?: string };
    expect(evaluation.evaluationId, 'la réévaluation n’a pas été écrite').toBe(ev.ok ? ev.evaluationId : '');
    expect(evaluation.revocation?.motif, 'la réévaluation a effacé la révocation').toBe('B fautive');
  });
});

describe('révocation · visible dans l’ADMIN', () => {
  it('la release révoquée porte son motif, n’est plus proposée à la publication ni au retour, ni à une nouvelle révocation', async () => {
    const v = await vueReleases();
    const a = v.releases.find((r) => r.id === relA)!;
    expect(a.revocation).toBe('consigne fautive');
    const html = renderToStaticMarkup(EcranReleases({ releases: v.releases, pointee: v.pointee, environnement: 'test', peutPublier: true, peutRevenir: true, peutEvaluer: true, peutCreer: false, selection: v.selection }));
    expect(html).toContain('Révoquée · consigne fautive');
    expect(html).toContain('Pointée · non servie');
    expect(html).not.toContain('>Révoquer<');
    expect(html).not.toContain('Revenir à cette release');
  });
});
