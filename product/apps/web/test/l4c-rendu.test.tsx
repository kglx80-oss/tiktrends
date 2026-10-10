import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L4-C · ce qu'on VOIT · le HTML rendu de « Variantes et tests » à partir de
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import { db, schema, eq } from '@tiktrends/db';
import { erreurStudio, type DonneesVariantes } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest, briefCanonique } from './l4c-harnais';
import { creerVariante, listerVariantes } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { enregistrerVersion } from '../lib/studios/depot';
import { PanneauVariantes } from '../components/studios/variantes/PanneauVariantes';
import { VariantesEtTests } from '../components/studios/VariantesEtTests';

const ids = etat.ids;
const scene = { projectId: '', vide: '', v1: '', image3: '' };
const RELECTURE_OFF = { disponible: false, raison: 'La relecture IA n’est pas encore activée (aucune release de prompts publiée).', coutMaxUsd: 0.14 };

async function donnees(qui: 'ua' | 'uv' = 'ua', projectId = scene.projectId, o: Partial<{ adsmapAcces: boolean; relecture: DonneesVariantes['relecture'] }> = {}): Promise<DonneesVariantes> {
  const r = await listerVariantes(ctxDe(ids, qui), { projectId }, { adsmapAcces: o.adsmapAcces ?? true, relecture: o.relecture ?? RELECTURE_OFF });
  if (!r.ok) throw new Error(r.code);
  return r.donnees;
}
const html = (d: DonneesVariantes, recette = {}) => renderToStaticMarkup(<PanneauVariantes donnees={d} recette={recette} />);
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

describe('Rendu · variantes, versions, statuts, test, apprentissage', () => {
  it('l’image 3 du lot 4 est nommée, rangée dans sa version antérieure, statuts technique et qualité séparés', async () => {
    const h = html(await donnees());
    const t = texteVisible(h);
    // La CARTE de la variante elle-même (pas les lots) porte les deux statuts, séparés.
    const debut = h.indexOf(`data-variante="${scene.image3}"`);
    const carte = texteVisible(h.slice(debut, h.indexOf('</article>', debut)));
    expect(carte).toContain('Technique · Fichier enregistré');
    expect(carte).toContain('Qualité · À relire');
    expect(t).toContain('Image 3 du lot 4');
    expect(t).toContain('Version 1 · antérieure');
    expect(t).toContain('Rangée dans Version 1 · la version courante n’est pas modifiée.');
    expect(t).toContain('Technique · Fichier enregistré');
    expect(t).toContain('Qualité · À relire');
    expect(t).toContain('Branche antérieure · ses résultats restent rangés ici et ne remplacent jamais la version courante.');
  });

  it('le test et sa fiche Adsmap · objectif, période, métrique, lien profond', async () => {
    const h = html(await donnees());
    const t = texteVisible(h);
    expect(t).toContain('Baisser le CPA sous 30 €');
    expect(t).toContain('du 2026-10-12 au 2026-10-19');
    expect(t).toContain('Coût par achat (CPA)');
    expect(h).toMatch(/href="\/adsmap\?ad=[0-9a-f-]{36}&amp;depuis=studio"/);
  });

  it('résultat insuffisant · « Inconclusif » dit comme tel, prudence causale, prochaine variable', async () => {
    const h = html(await donnees());
    const t = texteVisible(h);
    expect(h).toContain('data-lecture="inconclusif"');
    expect(t).toMatch(/Inconclusif · non concluant : pas assez de données/);
    expect(t).toContain('une association, pas une preuve de cause');
    expect(t).toContain('Prochaine variable proposée · l’accroche');
  });

  it('relecture IA sans release · aucun bouton payant, la raison est dite ; disponible · le coût est sur le bouton', async () => {
    const off = texteVisible(html(await donnees()));
    expect(off).not.toContain('Relire avec l’IA');
    expect(off).toContain('Relecture IA indisponible');
    const on = texteVisible(html(await donnees('ua', scene.projectId, { relecture: { disponible: true, raison: null, coutMaxUsd: 0.14 } })));
    expect(on).toContain('Relire avec l’IA · environ 0,14 $ (estimation) sur le plafond IA, aucun crédit');
  });

  it('génération active, sorties à choisir, itérer sans génération', async () => {
    const t = texteVisible(html(await donnees()));
    expect(t).toContain('1 lot en cours');
    expect(t).toContain('2 sorties en préparation');
    expect(t).toContain('Choisir comme variante');
    expect(t).toContain('Déjà choisie comme variante.');
    expect(t).toContain('Itérer · nouveau brief, sans génération');
  });

  it('lecteur · lecture seule, aucun geste', async () => {
    const t = texteVisible(html(await donnees('uv')));
    expect(t).toContain('Lecture seule');
    expect(t).not.toContain('Choisir comme variante');
    expect(t).not.toContain('Rattacher au test');
    expect(t).not.toContain('Itérer');
  });

  it('vide et premier usage', async () => {
    expect(texteVisible(html(await donnees('ua', scene.vide)))).toContain('Aucune sortie pour l’instant.');
  });

  it('formulaire après erreur · valeurs conservées, champs fautifs reliés à leur message, identifiant support', async () => {
    const d = await donnees();
    const autre = d.variantes.find((v) => v.id === scene.image3)!;
    // Une variante sans test pour que le formulaire s'ouvre.
    const sansTest: DonneesVariantes = { ...d, variantes: [{ ...autre, test: null, lecture: null }] };
    const err = erreurStudio('INVALID_SCHEMA', { traceId: 'st_trace_rendu', violations: [{ chemin: 'objectif', raison: 'Indique l’objectif du test (3 à 500 caractères).' }] });
    const h = html(sansTest, { formulaireOuvert: autre.id, erreurFormulaire: err });
    expect(h).toContain('role="alert"');
    expect(texteVisible(h)).toContain('Tes saisies sont conservées. Identifiant support · st_trace_rendu');
    expect(h).toMatch(/aria-invalid="true" aria-describedby="[^"]+-err-objectif"/);
    expect(h).toContain('Une accroche douleur fait mieux cliquer qu’une accroche bénéfice</textarea>');
    expect(h).toMatch(/<select[^>]*name="variable"[^>]*>.*<option value="hook" selected="">/s);
  });

  it('hors ligne · gestes suspendus, dit en mots', async () => {
    const h = html(await donnees(), { horsLigne: true });
    expect(texteVisible(h)).toContain('Hors ligne · les gestes sont suspendus, rien n’est envoyé.');
    expect(h).toMatch(/<button type="button" disabled=""[^>]*>Choisir comme variante/);
  });

  it('composant serveur · hors portée ⇒ message neutre ; sans session ⇒ reconnexion', async () => {
    etat.session = session(ids, 'ub');
    const t = texteVisible(renderToStaticMarkup(await VariantesEtTests({ projectId: scene.projectId })));
    expect(t).toContain('Projet introuvable');
    expect(t).not.toContain('Sérum');
    etat.session = null;
    expect(texteVisible(renderToStaticMarkup(await VariantesEtTests({ projectId: scene.projectId })))).toContain('Ta session a expiré');
    etat.session = session(ids, 'ua', { plan: 'plus' });
    expect(texteVisible(renderToStaticMarkup(await VariantesEtTests({ projectId: scene.projectId })))).toContain('Image 3 du lot 4');
  });

  it('aucun tiret cadratin, aucune marque tierce à l’écran', async () => {
    const h = html(await donnees(), {});
    expect(h).not.toContain('—');
    expect(h.toLowerCase()).not.toContain('trendtrack');
  });
});
