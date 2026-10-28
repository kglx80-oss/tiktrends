// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Spatial · fiche projet · onglet « Créations » · le HTML rendu à partir de
 * données RÉELLES (pglite, lots produits par le chemin L3 simulé, test Adsmap,
 * verdict). On lit le HTML, pas la présence d'un appel.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
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
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => '/studio/projets/p', redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null, listBrands: async () => [] }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest, briefCanonique } from './l4c-harnais';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { enregistrerVersion } from '../lib/studios/depot';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import { Projet } from '../spatial/vues/projet/Projet';
import { avecSpatial } from './spatial/fournisseur';

const ids = etat.ids;
const scene = { projectId: '', vide: '', v1: '', image3: '' };
/** L'onglet « Créations » de la fiche Spatiale · même lecture serveur que la page. */
const crea = async (qui: 'ua' | 'uv' = 'ua', projectId = scene.projectId) => {
  etat.session = session(ids, qui);
  const r = await chargerProjet(etat.session as never, projectId);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  return renderToStaticMarkup(avecSpatial(<Projet {...r.props} ongletInitial="crea" />));
};
const texteVisible = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/\s+/g, ' ');

beforeAll(async () => {
  await semer(db, schema, ids);
  const vide = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Projet vide' });
  scene.vide = vide.projectId;
  const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum anti-boutons' });
  scene.projectId = p.projectId;
  scene.v1 = p.versionId;
  for (const ops of [['keyframe:s1'], ['keyframe:s2'], ['keyframe:s1'], KEYFRAMES(4)]) await executer(db, await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, ops));
  const jobs = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.projectId, p.projectId));
  const lot4 = jobs.find((j) => Object.keys(((j.result as { assets?: object }).assets) ?? {}).length === 4)!;
  const s = await sortiesDuJob(db, lot4.id);
  const v = await creerVariante(ctxDe(ids, 'ua'), { assetId: s['keyframe:s3'] });
  if (!v.ok) throw new Error(v.code);
  scene.image3 = v.variante.id;
  const l = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v.variante.id, saisie: saisieTest() });
  if (!l.ok) throw new Error(l.code);
  await db.insert(schema.verdicts).values({ adId: l.lien.adsmapAdId, workspaceId: ids.wsA, computed: 'inconclusive', comparable: true });
  // Le brief change ensuite (v2) · les sorties de v1 restent dans leur branche.
  const v2 = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: p.versionId, changes: [{ op: 'replace', path: '/brief', newValue: briefCanonique({ texts: ['Fini les boutons'] }), reason: 'texte' }] });
  if (!v2.ok) throw new Error(v2.code);
  await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, KEYFRAMES(2)); // reste en file · génération active
}, 60_000);

describe('Spatial · Créations · variantes, versions, statuts, test, apprentissage (porté de L4-C)', () => {
  it('l’image 3 du lot 4 est nommée, rangée dans sa version antérieure, statuts technique et qualité séparés ; la branche antérieure le dit', async () => {
    const h = await crea();
    const t = texteVisible(h);
    const debut = h.indexOf(`data-variante="${scene.image3}"`);
    const carte = texteVisible(h.slice(debut, h.indexOf('data-essai', debut)));
    expect(carte).toContain('Image 3 du lot 4 · Version 1');
    expect(carte).toContain('Fichier enregistré · À relire');
    expect(carte).toContain('Rangée dans Version 1 · la version courante n’est pas modifiée.');
    expect(t).toContain('Version 1 · Branche antérieure · ses résultats restent rangés ici et ne remplacent jamais la version courante.');
  });

  it('le test et sa fiche Adsmap · objectif, période, métrique, lien profond', async () => {
    const h = await crea();
    const t = texteVisible(h);
    expect(t).toContain('Objectif · Baisser le CPA sous 30 €');
    expect(t).toContain('Période · du 2026-10-12 au 2026-10-19');
    expect(t).toContain('Métrique · Coût par achat (CPA)');
    expect(h).toMatch(/href="\/adsmap\?ad=[0-9a-f-]{36}&amp;depuis=studio"/);
  });

  it('résultat insuffisant · « Inconclusif » dit comme tel, prudence causale, prochaine variable', async () => {
    const t = texteVisible(await crea());
    expect(t).toMatch(/Inconclusif · non concluant : pas assez de données/);
    expect(t).toContain('une association, pas une preuve de cause');
    expect(t).toContain('Prochaine variable proposée · l’accroche');
  });

  it('relecture IA · « Relire » n’appelle rien, ouvre la confirmation avec le coût annoncé ; sans release, confirmer reste inactif avec la raison', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    etat.session = session(ids, 'ua');
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const r = await chargerProjet(etat.session as never, scene.projectId);
    if (!r.ok) throw new Error('fiche');
    const root = createRoot(hote);
    await act(async () => { root.render(avecSpatial(<Projet {...r.props} ongletInitial="crea" />)); });
    const relire = [...hote.querySelectorAll('button')].find((b) => b.textContent?.endsWith('Relire'))!;
    await act(async () => { relire.click(); });
    const confirmer = [...hote.querySelectorAll('button')].find((b) => b.textContent === 'Confirmer la relecture')!;
    expect(confirmer.disabled).toBe(r.props.creations.relecture.disponible ? false : true);
    expect(hote.textContent).toContain('Jarvis relit le test et propose l’apprentissage · ');
    if (!r.props.creations.relecture.disponible) expect(hote.textContent).toContain(r.props.creations.relecture.raison!);
    act(() => root.unmount());
    hote.remove();
  });

  it('génération active, sorties à retenir, déjà retenue, itérer sans génération', async () => {
    const h = await crea();
    const t = texteVisible(h);
    expect(t).toContain('2 sorties en préparation');
    expect(h).toMatch(/title="Retenir cette sortie comme variante · aucun coût"/);
    expect(h.match(/>Variante<\/span>/g)).toHaveLength(1);
    expect(t).toContain('Itérer');
  });

  it('les tâches du projet · état réel, date de lancement et de fin', async () => {
    const t = texteVisible(await crea());
    expect(t).toMatch(/lancée le \d\d\/\d\d \d\d:\d\d · terminée le/);
  });

  it('lecteur · la fiche est refusée, aucune donnée du projet', async () => {
    etat.session = session(ids, 'uv');
    const r = await chargerProjet(etat.session as never, scene.projectId);
    expect(r.ok).toBe(false);
  });

  it('vide et premier usage', async () => {
    expect(texteVisible(await crea('ua', scene.vide))).toContain('Aucune variante · retiens une sortie livrée pour la tester.');
  });

  it('aucun tiret cadratin, aucune marque tierce à l’écran', async () => {
    const h = await crea();
    expect(h).not.toContain('—');
    expect(h.toLowerCase()).not.toContain('trendtrack');
  });
});
