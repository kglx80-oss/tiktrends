import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * ADMIN « IA et Studios » · ce qu'on VOIT, rendu en HTML, et ce que les
 * commandes font en base, selon qui appelle (SEC-09).
 *
 * Vraie base (pglite), vraie page serveur, vraies actions. Seule la session
 * est posée par le test.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), brand: randomUUID(), user: randomUUID() };
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
import AdminBackstage from '../app/(app)/admin/page';
import * as actions from '../app/actions/studios/prompts';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { acteurPlateforme } from './l2-outils';

const base = (o: Record<string, unknown>) => ({ user: { id: ids.user, email: 'quelquun@client.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', plan: 'business', ...o });
// SEC-10 / E5 · l'équipe n'obtient les permissions plateforme que si son compte est admissible.
const EQUIPE = () => base({ role: 'owner', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } });
const REFUSES: Array<[string, () => unknown]> = [
  ['owner d’espace (client)', () => base({ role: 'owner', equipe: null })],
  ['admin d’espace (client)', () => base({ role: 'admin', equipe: null })],
  ['lecteur', () => base({ role: 'client_viewer', equipe: null })],
  ['manager d’équipe (sans accès total)', () => base({ role: 'owner', equipe: { role: 'manager', matrice: {} } })],
  ['adminplus non admissible (E5, compte créé après son entrée staff)', () => base({ role: 'owner', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: false } })],
];

async function page(sp: Record<string, string> = {}) {
  return renderToStaticMarkup(await IaStudiosPage({ searchParams: Promise.resolve(sp) }));
}
const pointeur = async () => (await depot.lirePointeur())?.releaseId ?? null;

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'Démo', plan: 'business' });
  await db.insert(schema.users).values({ id: ids.user, email: 'quelquun@client.test' });
  await db.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Neva' });
});
beforeEach(() => { h.session = EQUIPE(); });

describe('accès refusé · aucune donnée du registre', () => {
  for (const [nom, s] of REFUSES) {
    it(`${nom} · écran de refus`, async () => {
      await depot.importerPack(acteurPlateforme());
      h.session = s();
      const html = await page({ onglet: 'prompts' });
      expect(html).toContain('Accès réservé à l’équipe de la plateforme.');
      for (const secret of ['jarvis.route', 'brief.build', 'Importer en brouillon', 'Publier']) expect(html).not.toContain(secret);
    });
  }
  it('sans session · renvoi à la connexion', async () => {
    h.session = null;
    await expect(page()).rejects.toThrow('REDIRECT /login');
  });
});

describe('SEC-09 · les commandes refusent un admin d’espace, au résultat', () => {
  it('publier, revenir, importer, évaluer, créer · refusés, rien ne bouge', async () => {
    const id = (await (async () => {
      const a = acteurPlateforme();
      for (const l of await depot.listerVersions()) if (l.status === 'draft') await depot.validerVersion(a, { id: l.id });
      const r = await depot.creerRelease(a, { motif: 'rendu' });
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.id;
    })());
    for (const [, s] of REFUSES) {
      h.session = s();
      const reponses = [
        await actions.publierReleaseAction({ releaseId: id, attendue: null, confirme: true }),
        await actions.rollbackReleaseAction({ releaseId: id, attendue: null, confirme: true }),
        await actions.importerPackAction(),
        await actions.evaluerReleaseAction({ releaseId: id }),
        await actions.creerReleaseAction({ motif: 'x' }),
      ];
      for (const r of reponses) {
        expect(r.ok).toBe(false);
        expect(!r.ok && r.message).toMatch(/Réservé à l’équipe de la plateforme|rôle ne permet pas/);
      }
    }
    expect(await pointeur()).toBeNull();
    expect((await db.select().from(schema.studioPromptEvaluations)).filter((e) => e.releaseId === id)).toEqual([]);
  });

  it('une publication non confirmée est refusée même pour l’équipe', async () => {
    const [r] = await depot.listerReleases();
    const x = await actions.publierReleaseAction({ releaseId: r!.id, attendue: null, confirme: false });
    expect(x).toMatchObject({ ok: false, message: 'Confirme la publication avant de l’envoyer.' });
    expect(await pointeur()).toBeNull();
  });
});

describe('écrans remplis', () => {
  it('Prompts · liste des clés, détail, variables, schémas, éditeur, diff', async () => {
    const html = await page({ onglet: 'prompts', cle: 'template:brief.build' });
    expect(html).toContain('brief.build · 1.0.0');
    expect(html).toContain('Consignes de tâche');
    expect(html).toContain('{{context}} · {{taskInputs}}');
    expect(html).toContain('brief_build_input → brief_build_output');
    expect(html).toContain('contrat, non modifiable ici');
    expect(html).toContain('Créer un brouillon (nouvelle version)');
    expect(html).toContain('jarvis.conversation');
  });

  it('Prompts · différences entre deux versions d’une clé', async () => {
    const a = acteurPlateforme();
    const v1 = (await depot.listerVersions()).find((l) => l.key === 'jarvis.route')!;
    const b = await depot.enregistrerBrouillon(a, { baseId: v1.id, champs: { title: 'Orientation Jarvis · révisée' }, motif: 'Titre plus clair' });
    if (!b.ok) throw new Error(JSON.stringify(b));
    const html = await page({ onglet: 'prompts', cle: 'template:jarvis.route', v: b.id, comparer: v1.id });
    expect(html).toContain('Différences · 1.0.0 → 1.0.1');
    expect(html).toContain('+ Orientation Jarvis · révisée');
    expect(html).toContain('Hors pack source · à reporter');
    expect(html).toContain('Valider cette version');
  });

  it('Releases · release en attente, évaluer et publier proposés, règle de l’environnement dite', async () => {
    const html = await page({ onglet: 'releases' });
    expect(html).toContain('En attente');
    expect(html).toContain('Évaluer');
    expect(html).toContain('Publier la release');
    expect(html).toContain('Non exécuté · budget requis');
    expect(html).toMatch(/Production · une release sans benchmark approuvé/);
  });

  it('Recettes · les huit recettes du pack', async () => {
    const html = await page({ onglet: 'recettes' });
    for (const id of ['photo_clean', 'clay_playful', 'technical_demo']) expect(html).toContain(id);
    expect(html).not.toContain('brief.build');
  });

  it('Routage · lecture seule, registre de capacités absent dit', async () => {
    const html = await page({ onglet: 'routage' });
    expect(html).toContain('Le registre de capacités (profils logiques → fournisseurs configurés) n’existe pas encore');
    expect(html).toContain('reasoning_structured');
    expect(html).toContain('non branché');
  });

  it('Connaissances · lien vers l’espace existant, pas de copie', async () => {
    const html = await page({ onglet: 'connaissances' });
    expect(html).toContain('href="/admin/connaissances"');
  });

  it('Exécutions · vide, puis trace expurgée sans texte de prompt', async () => {
    expect(await page({ onglet: 'executions' })).toContain('Aucune exécution tracée.');
    const [r] = await db.insert(schema.studioPromptRuns).values({ workspaceId: ids.ws, brandId: ids.brand, templateKey: 'jarvis.conversation', compiledHash: 'c'.repeat(64), contextSnapshotHash: 'd'.repeat(64), model: 'modele-test', status: 'succeeded', sourceRefs: [{ type: 'connaissance', id: 'k1', version: 'Kk1-v1', titre: 'Ton maison' }], config: { releaseHash: 'e'.repeat(64), secretInterne: 'NE_PAS_MONTRER' } }).returning();
    const html = await page({ onglet: 'executions', run: r!.id });
    expect(html).toContain('Trace expurgée');
    expect(html).toContain('Ton maison');
    expect(html).toContain('c'.repeat(64));
    expect(html).not.toContain('NE_PAS_MONTRER');
  });
});

describe('hub ADMIN', () => {
  it('une carte « IA et Studios » mène à l’espace', async () => {
    h.session = { ...EQUIPE(), user: { id: ids.user, email: 'kguilbaux@agence-glx.fr', name: null } };
    const html = renderToStaticMarkup(await AdminBackstage());
    expect(html).toContain('href="/admin/ia-studios"');
    expect(html).toContain('IA et Studios');
  });
});
