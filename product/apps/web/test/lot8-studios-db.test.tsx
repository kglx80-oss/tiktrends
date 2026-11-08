// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 8 V5 · Studios · sur une VRAIE base (pglite + migrations du dépôt), par
 * les VRAIES actions (garde relue · session, rôle, portée de marque) et les
 * VRAIES pages rendues · on lit le DOM, jamais la présence d'un appel.
 *
 *  · créations filtrables · la grille de l'onglet Créations (lots réels,
 *    sortie retenue, lot en file) · un filtre ne garde QUE les créations
 *    attendues, le dit, et se réinitialise ;
 *  · contrôle humain avant export · fermé tant que la relecture n'est pas
 *    validée (écran ET serveur, aucune trace d'export), ouvert ensuite, avec
 *    qui et quand · lié à LA version (une nouvelle version la redemande) ;
 *  · renommer · le nouveau nom partout (liste, fiche, export) ;
 *  · dupliquer · « Copie de … » dans la MÊME marque, la structure seule ·
 *    aucune génération, variante, test, export ni relecture copiés ;
 *  · refus · autre marque (membre restreint), rôle lecteur, autre espace.
 * 0 $ · fournisseur et stockage simulés, aucun appel réseau, aucune dépense.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
const nav = vi.hoisted(() => ({ refresh: () => {}, push: (_: string) => {} }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/navigation', () => ({ useRouter: () => nav, usePathname: () => '/studio/projets', redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null, listBrands: async () => [] }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { contenuVide, empreinteContenu, ACTION_AUDIT_RELECTURE_EXPORT, SCHEMA_VERSION_CONTENU, type ContenuVersion, type DocumentStudio } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { png } from './l5a-outils';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest, briefCanonique } from './l4c-harnais';
import { TOUS_LES_POINTS } from './relecture-export-outils';
import { avecSpatial } from './spatial/fournisseur';
import { injecterLecteurMedias } from '../lib/studios/rendu/medias';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { enregistrerVersion } from '../lib/studios/depot';
import { exporterVersion, lireExportProjet, validerRelectureExport } from '../app/actions/studios/export';
import { dupliquerProjet, renommerProjet } from '../app/actions/studios/projets';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import PageExport from '../app/(spatial)/sp/studio/projets/[id]/export/page';
import PageStudios from '../app/(spatial)/sp/studio/projets/page';
import { Projet } from '../spatial/vues/projet/Projet';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ids = etat.ids;
const qui = (q: 'ua' | 'uv' | 'ur' | 'ub') => { etat.session = session(ids, q); };
const stockage = new Map<string, Uint8Array>();
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const texte = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const scene = { lots: '', retenue: '', s1: '', s2: '', s3: '', exp: '', expV1: '', a2: '', fond: '', logo: '' };

async function poser(cle: string, octets: Uint8Array): Promise<string> {
  stockage.set(cle, octets);
  const [a] = await db.insert(schema.studioAssets).values({
    workspaceId: ids.wsA, brandId: ids.brandA1, storageKey: cle, mime: 'image/png', bytes: octets.length, sha256: sha(octets), origin: 'upload', storageState: 'stored',
  }).returning();
  return a!.id;
}

const doc = (o: { fond: string; logo: string; gen?: string }): DocumentStudio => ({
  width: 1080, height: 1080, colorSpace: 'sRGB',
  fonts: { f_titre: { family: 'Sans Bold', assetId: null } },
  layers: {
    fond: { id: 'fond', kind: 'image', name: 'Décor', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1080, rotationDeg: 0, opacity: 1, z: 0, assetId: o.fond, sourceWidth: 1080, sourceHeight: 1080, mask: null },
    ...(o.gen ? { gen: { id: 'gen', kind: 'image' as const, name: 'Scène générée', visible: true, locked: false, x: 100, y: 100, width: 600, height: 600, rotationDeg: 0, opacity: 1, z: 5, assetId: o.gen, sourceWidth: 1080, sourceHeight: 1350, mask: null } } : {}),
    titre: { id: 'titre', kind: 'text', name: 'Titre', visible: true, locked: false, x: 60, y: 60, width: 960, height: 150, rotationDeg: 0, opacity: 1, z: 20, text: 'La crème qui tient 24 h', fontId: 'f_titre', fontSizePx: 64, color: '#ffffff', align: 'center', lineHeight: 1.1 },
    logo: { id: 'logo', kind: 'logo', name: 'Logo', visible: true, locked: false, x: 900, y: 960, width: 120, height: 60, rotationDeg: 0, opacity: 1, z: 22, assetId: o.logo },
  },
});

async function projetImage(titre: string, brand = ids.brandA1): Promise<{ projectId: string; versionId: string }> {
  const contenu: ContenuVersion = { ...contenuVide(), brief: briefCanonique({ objective: 'Faire acheter la crème' }), document: doc({ fond: scene.fond, logo: scene.logo }) };
  const [p] = await db.insert(schema.studioProjects).values({ workspaceId: ids.wsA, brandId: brand, kind: 'image', title: titre, ownerId: ids.ua }).returning();
  const [v] = await db.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: ids.wsA, brandId: brand, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test',
  }).returning();
  await db.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return { projectId: p!.id, versionId: v!.id };
}

/** Ce qu'un projet porte de PRODUIT ou de MESURÉ · générations, médias, devis, variantes, tests, exports, relectures. */
async function produitDuProjet(projectId: string) {
  const versions = (await db.select({ id: schema.studioProjectVersions.id }).from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, projectId))).map((v) => v.id);
  const variantes = await db.select({ id: schema.studioVariants.id }).from(schema.studioVariants).where(eq(schema.studioVariants.projectId, projectId));
  const E = schema.studioAuditEvents;
  const audits = versions.length ? await db.select({ action: E.action }).from(E).where(and(eq(E.targetType, 'studio_project_version'), inArray(E.targetId, versions))) : [];
  return {
    jobs: (await db.select({ id: schema.studioJobs.id }).from(schema.studioJobs).where(eq(schema.studioJobs.projectId, projectId))).length,
    devis: (await db.select({ id: schema.studioQuotes.id }).from(schema.studioQuotes).where(eq(schema.studioQuotes.projectId, projectId))).length,
    medias: (await db.select({ id: schema.studioAssets.id }).from(schema.studioAssets).where(eq(schema.studioAssets.projectId, projectId))).length,
    variantes: variantes.length,
    tests: variantes.length ? (await db.select({ id: schema.studioTestLinks.id }).from(schema.studioTestLinks).where(inArray(schema.studioTestLinks.variantId, variantes.map((v) => v.id)))).length : 0,
    exports: audits.filter((a) => a.action === 'project.export').length,
    relectures: audits.filter((a) => a.action === ACTION_AUDIT_RELECTURE_EXPORT).length,
  };
}

let hote: HTMLDivElement; let root: Root | null = null;
async function monter(el: ReactElement) {
  if (root) act(() => root!.unmount());
  hote?.remove();
  hote = document.createElement('div'); document.body.appendChild(hote);
  root = createRoot(hote);
  await act(async () => { root!.render(avecSpatial(el)); });
}
const attendre = async () => { await act(async () => { for (let i = 0; i < 30; i += 1) await new Promise((r) => setTimeout(r, 5)); }); };
const cliquer = async (el: Element | null | undefined) => { if (!el) throw new Error('élément absent'); await act(async () => { (el as HTMLElement).click(); }); await attendre(); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const ecranExport = async (projectId: string, versionId?: string) =>
  PageExport({ params: Promise.resolve({ id: projectId }), searchParams: Promise.resolve(versionId ? { version: versionId } : {}) }) as Promise<ReactElement>;
const ecranStudios = async () => PageStudios({ searchParams: Promise.resolve({ toutes: '1' }) }) as Promise<ReactElement>;

beforeAll(async () => {
  await semer(db, schema, ids);
  // ── Un projet à lots RÉELS (devis → approbation → worker simulé) · une sortie retenue, un test, un lot encore en file.
  const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · lots du lot 8' });
  scene.lots = p.projectId;
  const job = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, KEYFRAMES(3));
  await executer(db, job);
  const s = await sortiesDuJob(db, job);
  scene.s1 = s['keyframe:s1']!; scene.s2 = s['keyframe:s2']!; scene.s3 = s['keyframe:s3']!;
  // Les dimensions RÉELLES des fichiers livrés · deux 4:5 et un 9:16 (le fournisseur simulé n'en écrit pas toujours).
  await db.update(schema.studioAssets).set({ width: 1080, height: 1350 }).where(inArray(schema.studioAssets.id, [scene.s1, scene.s2]));
  await db.update(schema.studioAssets).set({ width: 1080, height: 1920 }).where(eq(schema.studioAssets.id, scene.s3));
  const v = await creerVariante(ctxDe(ids, 'ua'), { assetId: scene.s1 });
  if (!v.ok) throw new Error(v.code);
  scene.retenue = v.variante.id;
  const l = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v.variante.id, saisie: saisieTest() });
  if (!l.ok) throw new Error(l.code);
  await db.insert(schema.verdicts).values({ adId: l.lien.adsmapAdId, workspaceId: ids.wsA, computed: 'inconclusive', comparable: true });
  await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, KEYFRAMES(1)); // reste en file

  // ── Les médias de la marque (import) · lus par le même lecteur que l'aperçu et l'export.
  injecterLecteurMedias({ lire: async (m) => stockage.get(m.storageKey) ?? null });
  scene.fond = await poser('studios/l8/fond.png', await png(1080, 1080, (x, y) => [20, Math.round((y / 1080) * 120), 160 + Math.round((x / 1080) * 80), 255]));
  scene.logo = await poser('studios/l8/logo.png', await png(240, 120, () => [255, 255, 255, 255]));
  // Le projet à lots reçoit un document · un calque montre une sortie GÉNÉRÉE (payée).
  const [cour] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, p.projectId));
  const e = await enregistrerVersion(ctxDe(ids, 'ua'), {
    projectId: p.projectId, baseVersionId: cour!.id,
    changes: [{ op: 'replace', path: '/document', newValue: doc({ fond: scene.fond, logo: scene.logo, gen: scene.s2 }), reason: 'composition' }], allowedPaths: ['/document'], raison: 'Composition',
  });
  if (!e.ok) throw new Error(JSON.stringify(e));

  const x = await projetImage('Crème · export relu');
  scene.exp = x.projectId; scene.expV1 = x.versionId;
  scene.a2 = (await projetImage('Projet de la marque A2', ids.brandA2)).projectId;
});
afterAll(() => { injecterLecteurMedias(null); if (root) act(() => root!.unmount()); });
beforeEach(() => qui('ua'));

/* ───────────────────────────── 1 · créations filtrables ───────────────────────────── */

describe('lot 8 · les créations se filtrent localement, l’état du filtre se lit', () => {
  const montrerCreations = async () => {
    const r = await chargerProjet(etat.session as never, scene.lots);
    if (!r.ok) throw new Error(JSON.stringify(r.raison));
    await monter(<Projet {...r.props} ongletInitial="crea" />);
  };
  const figures = () => [...hote.querySelectorAll('.lib2 figure')].map((f) => f.querySelector('strong')?.textContent ?? '');

  it('les axes viennent des créations RÉELLES · format du fichier, état, retenue', async () => {
    await montrerCreations();
    expect(figures()).toHaveLength(4); // trois sorties livrées + le lot en file
    const axes = [...hote.querySelectorAll('[data-filtres-creations] .seg')].map((g) => [g.getAttribute('data-axe'), [...g.querySelectorAll('button')].map((b) => b.textContent)]);
    expect(axes).toEqual([
      ['format', ['Tous formats', '4:5 · 2', '9:16 · 1']],
      ['etat', ['Tous états', 'Prêtes · 3', 'En préparation · 1']],
      ['retenue', ['Toutes', 'Retenues · 1', 'Non retenues · 2']],
    ]);
  });

  it('filtrer ne garde QUE les créations attendues · cumuler, le dire, réinitialiser', async () => {
    await montrerCreations();
    await cliquer(hote.querySelector('[data-axe="format"] button[data-valeur="4:5"]'));
    expect(figures()).toEqual(['Lot 1 · Image 1 du lot 1', 'Lot 1 · Image 2 du lot 1']);
    expect(hote.querySelector('[data-resume-filtres]')?.textContent).toContain('2 créations sur 4 · Format 4:5');
    await cliquer(hote.querySelector('[data-axe="retenue"] button[data-valeur="retenue"]'));
    expect(figures()).toEqual(['Lot 1 · Image 1 du lot 1']);
    expect(hote.querySelector('.lib2 figure .pill.g')?.textContent).toBe('Variante');
    expect(hote.querySelector('[data-resume-filtres]')?.textContent).toContain('1 création sur 4 · Format 4:5 · Variante Retenues');
    await cliquer(hote.querySelector('[data-axe="format"] button[data-valeur="9:16"]'));
    expect(figures()).toEqual([]);
    expect(hote.querySelector('[data-filtres-vide]')?.textContent).toContain('Aucune création ne passe ces filtres');
    await cliquer(hote.querySelector('[data-geste="reinitialiser-filtres"]'));
    expect(figures()).toHaveLength(4);
    expect(hote.querySelector('[data-resume-filtres]')).toBeNull();
    await cliquer(hote.querySelector('[data-axe="etat"] button[data-valeur="en_cours"]'));
    expect(figures()).toEqual(['Lot 2']);
  });
});

/* ───────────────────────────── 2 · contrôle humain avant export ───────────────────────────── */

describe('lot 8 · l’export reste fermé tant que la relecture humaine n’est pas validée', () => {
  const exportsDe = async (projectId: string) => (await produitDuProjet(projectId)).exports;

  it('sans relecture · boutons fermés avec leur raison, et le serveur refuse au clic (aucune trace d’export)', async () => {
    await monter(await ecranExport(scene.exp));
    expect(hote.querySelector('[data-preflight]')?.getAttribute('data-preflight')).toBe('ok');
    expect(hote.querySelector('[data-relecture-humaine]')?.getAttribute('data-relecture-humaine')).toBe('a-faire');
    expect((hote.querySelector('[data-format="png"]') as HTMLButtonElement).disabled).toBe(true);
    expect(hote.querySelector('[data-raison-ferme=""]')?.textContent).toBe('Les deux formats s’ouvrent dès que la relecture humaine de cette version est validée (cinq points ci-dessus).');
    // Le serveur ne croit pas l'écran · appelé directement, il refuse, rien n'est écrit.
    const e = await exporterVersion({ projectId: scene.exp, format: 'png' });
    expect(!e.ok && e.code).toBe('QUALITY_REVIEW_REQUIRED');
    expect(!e.ok && e.message).toContain('la relecture humaine de cette version n’est pas validée');
    expect(await exportsDe(scene.exp)).toBe(0);
    // Valider avec quatre points seulement · refusé, rien d'enregistré.
    const r = await validerRelectureExport({ projectId: scene.exp, points: TOUS_LES_POINTS.slice(0, 4) });
    expect(!r.ok && r.code).toBe('INVALID_SCHEMA');
    expect((await produitDuProjet(scene.exp)).relectures).toBe(0);
  });

  it('cocher les cinq points ouvre « Valider » · la relecture est enregistrée (qui, quand), puis l’export part', async () => {
    await monter(await ecranExport(scene.exp));
    const valider = () => hote.querySelector('[data-geste="valider-relecture"]') as HTMLButtonElement;
    expect(valider().disabled).toBe(true);
    expect(hote.querySelector('[data-raison-ferme="relecture"]')?.textContent).toBe('Encore 5 points à cocher · la validation s’ouvre quand les cinq sont relus.');
    for (const cle of TOUS_LES_POINTS.slice(0, 4)) await cliquer(hote.querySelector(`[data-point="${cle}"] input`));
    expect(valider().disabled).toBe(true);
    await cliquer(hote.querySelector('[data-point="diffusion"] input'));
    expect(valider().disabled).toBe(false);
    await cliquer(valider());
    // L'écran le dit tout de suite · « toi » pour la personne qui a relu.
    expect(hote.querySelector('[data-relecture="faite"]')?.textContent).toMatch(/^Relue Relue par toi le \d\d\/\d\d\/\d{4} à \d\d:\d\d · version 1$/);
    expect((hote.querySelector('[data-format="png"]') as HTMLButtonElement).disabled).toBe(false);
    expect(hote.querySelector('[data-raison-ferme=""]')).toBeNull();
    // Enregistré par le journal existant · acteur, version, cinq points.
    const [a] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.action, ACTION_AUDIT_RELECTURE_EXPORT), eq(schema.studioAuditEvents.targetId, scene.expV1)));
    expect(a).toMatchObject({ actorId: ids.ua, brandId: ids.brandA1, targetType: 'studio_project_version' });
    expect((a!.details as { points: string[] }).points).toEqual(TOUS_LES_POINTS);
    // Un autre membre lit QUI a relu et QUAND · la page relue du serveur.
    qui('ur');
    const h = renderToStaticMarkup(avecSpatial(await ecranExport(scene.exp)));
    expect(texte(h)).toMatch(/Relue par ua@studios\.test le \d\d\/\d\d\/\d{4} à \d\d:\d\d · version 1/);
    qui('ua');
    // L'export part, maintenant · une trace d'export.
    const e = await exporterVersion({ projectId: scene.exp, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    expect(await exportsDe(scene.exp)).toBe(1);
  });

  it('la relecture vaut pour UNE version · la version suivante est de nouveau fermée', async () => {
    const v2 = await enregistrerVersion(ctxDe(ids, 'ua'), {
      projectId: scene.exp, baseVersionId: scene.expV1,
      changes: [{ op: 'replace', path: '/document/layers/titre/text', newValue: 'Nouvelle accroche', reason: 'V2' }], allowedPaths: ['/document'], raison: 'V2',
    });
    if (!v2.ok) throw new Error(JSON.stringify(v2));
    const vue = await lireExportProjet({ projectId: scene.exp });
    expect(vue.ok && vue.vue.relecture).toBeNull();
    const e = await exporterVersion({ projectId: scene.exp, format: 'png' });
    expect(!e.ok && e.code).toBe('QUALITY_REVIEW_REQUIRED');
    // La V1 relue reste exportable.
    const v1 = await lireExportProjet({ projectId: scene.exp, versionId: scene.expV1 });
    expect(v1.ok && v1.vue.relecture?.versionN).toBe(1);
  });

  it('refus · lecteur (pas de `studio.export`), autre espace, membre restreint hors de sa marque', async () => {
    qui('uv');
    expect(((await validerRelectureExport({ projectId: scene.exp, points: TOUS_LES_POINTS })) as { code?: string }).code).toBe('FORBIDDEN');
    const h = renderToStaticMarkup(avecSpatial(await ecranExport(scene.exp, scene.expV1)));
    expect(h).not.toContain('data-geste="valider-relecture"');
    qui('ub');
    expect(((await validerRelectureExport({ projectId: scene.exp, points: TOUS_LES_POINTS })) as { code?: string }).code).toBe('NOT_FOUND');
    qui('ur');
    expect(((await validerRelectureExport({ projectId: scene.a2, points: TOUS_LES_POINTS })) as { code?: string }).code).toBe('NOT_FOUND');
    expect((await produitDuProjet(scene.a2)).relectures).toBe(0);
  });
});

/* ───────────────────────────── 3 · renommer ───────────────────────────── */

describe('lot 8 · renommer un projet · le nouveau nom partout', () => {
  it('depuis la carte · « Renommer », le champ, « Enregistrer » · la vraie action, puis la liste, la fiche et l’export le disent', async () => {
    await monter(await ecranStudios());
    const carte = () => hote.querySelector(`[data-projet="${scene.exp}"]`)!;
    expect(carte().querySelector('h3')?.textContent).toBe('Crème · export relu');
    await cliquer(carte().querySelector('button[data-geste="renommer"]'));
    const champ = hote.querySelector(`form[data-renommer="${scene.exp}"] input`) as HTMLInputElement;
    expect(champ.value).toBe('Crème · export relu');
    await saisir(champ, '   ');
    await act(async () => { (hote.querySelector(`form[data-renommer="${scene.exp}"]`) as HTMLFormElement).requestSubmit(); });
    await attendre();
    expect(hote.querySelector(`form[data-renommer="${scene.exp}"]`)?.textContent).toContain('Donne un nom au projet');
    await saisir(hote.querySelector(`form[data-renommer="${scene.exp}"] input`) as HTMLInputElement, 'Crème · rentrée des clubs');
    await act(async () => { (hote.querySelector(`form[data-renommer="${scene.exp}"]`) as HTMLFormElement).requestSubmit(); });
    await attendre();
    expect(hote.querySelector(`form[data-renommer="${scene.exp}"]`)).toBeNull();
    expect(carte().querySelector('h3')?.textContent).toBe('Crème · rentrée des clubs');
    // Relu du serveur · la liste, la fiche, l'écran d'export, le nom du fichier exporté.
    const liste = renderToStaticMarkup(avecSpatial(await ecranStudios()));
    expect(texte(liste)).toContain('Crème · rentrée des clubs');
    expect(texte(liste)).not.toContain('Crème · export relu');
    const f = await chargerProjet(etat.session as never, scene.exp);
    expect(f.ok && f.props.projet.titre).toBe('Crème · rentrée des clubs');
    const vue = await lireExportProjet({ projectId: scene.exp, versionId: scene.expV1 });
    expect(vue.ok && vue.vue.projet.title).toBe('Crème · rentrée des clubs');
    const e = await exporterVersion({ projectId: scene.exp, versionId: scene.expV1, format: 'jpeg' });
    expect(e.ok && e.export.nomFichier).toBe('creme-rentree-des-clubs-v1-jpeg.jpg');
    // L'audit dit l'avant et l'après · les versions n'ont pas bougé.
    const [a] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.action, 'project.rename'), eq(schema.studioAuditEvents.targetId, scene.exp)));
    expect(a!.details).toEqual({ avant: 'Crème · export relu', apres: 'Crème · rentrée des clubs' });
  });

  it('refus · lecteur, autre espace, autre marque · le titre ne bouge pas', async () => {
    qui('uv');
    expect(((await renommerProjet({ projectId: scene.exp, titre: 'Volé' })) as { code?: string }).code).toBe('FORBIDDEN');
    qui('ub');
    expect(((await renommerProjet({ projectId: scene.exp, titre: 'Volé' })) as { code?: string }).code).toBe('NOT_FOUND');
    qui('ur');
    expect(((await renommerProjet({ projectId: scene.a2, titre: 'Volé' })) as { code?: string }).code).toBe('NOT_FOUND');
    const titres = await db.select({ t: schema.studioProjects.title }).from(schema.studioProjects).where(inArray(schema.studioProjects.id, [scene.exp, scene.a2]));
    expect(titres.map((x) => x.t).sort()).toEqual(['Crème · rentrée des clubs', 'Projet de la marque A2']);
  });
});

/* ───────────────────────────── 4 · dupliquer ───────────────────────────── */

describe('lot 8 · dupliquer · « Copie de … », même marque, la structure sans rien de produit', () => {
  it('le projet à lots · aucune génération, variante, test ni export copiés · le calque d’image générée est retiré', async () => {
    const avant = await produitDuProjet(scene.lots);
    expect(avant).toMatchObject({ jobs: 2, variantes: 1, tests: 1 });
    expect(avant.medias).toBeGreaterThan(0);
    await monter(await ecranStudios());
    await cliquer(hote.querySelector(`[data-projet="${scene.lots}"] button[data-geste="dupliquer"]`));
    const bandeau = hote.querySelector('[data-copie]');
    expect(bandeau?.textContent).toContain('« Copie de Sérum · lots du lot 8 » créé à partir de « Sérum · lots du lot 8 »');
    const copie = bandeau!.getAttribute('data-copie')!;
    const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, copie));
    expect(p).toMatchObject({ brandId: ids.brandA1, workspaceId: ids.wsA, kind: 'ads', title: 'Copie de Sérum · lots du lot 8', ownerId: ids.ua, status: 'active' });
    expect(await produitDuProjet(copie)).toEqual({ jobs: 0, devis: 0, medias: 0, variantes: 0, tests: 0, exports: 0, relectures: 0 });
    // La source est intacte.
    expect(await produitDuProjet(scene.lots)).toEqual(avant);
    // La version 1 · le brief et le document de la courante, sans le calque de la sortie générée.
    const [source] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, (await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, scene.lots)))[0]!.currentVersionId!));
    const [v1] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, copie));
    const c = v1!.content as ContenuVersion; const s = source!.content as ContenuVersion;
    expect(v1!.n).toBe(1);
    expect(c.brief).toEqual(s.brief);
    expect(Object.keys(s.document!.layers)).toContain('gen');
    expect(Object.keys(c.document!.layers).sort()).toEqual(['fond', 'logo', 'titre']);
    expect(c.shots.order).toEqual(s.shots.order);
    expect(v1!.reason).toContain('Copie de « Sérum · lots du lot 8 » (version 2) · structure seule, sans générations, exports, tests ni mesures · 1 calque d’image produite retiré');
    // La fiche de la copie · aucune création, aucune variante.
    const f = await chargerProjet(etat.session as never, copie);
    if (!f.ok) throw new Error('fiche de la copie');
    expect(f.props.creations.lots).toEqual([]);
    expect(f.props.creations.variantes).toEqual([]);
    // La liste relue la montre.
    expect(texte(renderToStaticMarkup(avecSpatial(await ecranStudios())))).toContain('Copie de Sérum · lots du lot 8');
  });

  it('le projet exporté et relu · la copie n’a ni historique d’export ni relecture · son export reste fermé', async () => {
    const r = await dupliquerProjet({ projectId: scene.exp });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.projet.title).toBe('Copie de Crème · rentrée des clubs');
    expect(r.projet.brandId).toBe(ids.brandA1);
    const vue = await lireExportProjet({ projectId: r.projet.id });
    if (!vue.ok) throw new Error(vue.code);
    expect(vue.vue.historique).toEqual([]);
    expect(vue.vue.relecture).toBeNull();
    expect(vue.vue.preflight.ok).toBe(true);
    const e = await exporterVersion({ projectId: r.projet.id, format: 'png' });
    expect(!e.ok && e.code).toBe('QUALITY_REVIEW_REQUIRED');
    expect((await produitDuProjet(scene.exp)).exports).toBe(2);
  });

  it('refus · lecteur, autre espace, autre marque · aucun projet créé', async () => {
    const n = async () => (await db.select({ id: schema.studioProjects.id }).from(schema.studioProjects)).length;
    const avant = await n();
    qui('uv');
    expect(((await dupliquerProjet({ projectId: scene.exp })) as { code?: string }).code).toBe('FORBIDDEN');
    qui('ub');
    expect(((await dupliquerProjet({ projectId: scene.exp })) as { code?: string }).code).toBe('NOT_FOUND');
    qui('ur');
    expect(((await dupliquerProjet({ projectId: scene.a2 })) as { code?: string }).code).toBe('NOT_FOUND');
    // Le membre restreint duplique dans SA marque · la copie y reste.
    const ok = await dupliquerProjet({ projectId: scene.exp });
    expect(ok.ok && ok.projet.brandId).toBe(ids.brandA1);
    expect(await n()).toBe(avant + 1);
    // La liste du membre porte « Renommer » et « Dupliquer » (le lecteur n'ouvre pas la liste des Studios · refus de la page).
    qui('ua');
    const membre = renderToStaticMarkup(avecSpatial(await ecranStudios()));
    expect(membre).toMatch(/data-geste="renommer"/);
    expect(membre).toMatch(/data-geste="dupliquer"/);
  });
});
