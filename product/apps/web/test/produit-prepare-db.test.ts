import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Le produit arrive au modèle mieux décrit et mieux montré · vraie base
 * (pglite, migrations réelles), VRAIES actions serveur de la fiche produit
 * (`definirFicheProduit`, `controlerCompilation`, `compilerConsigneImage`,
 * `retenirConsigneImage`) et vraie construction des références jusqu'au corps
 * fal (`requeteFalImage`). Adaptateur texte SIMULÉ (aucun appel réel, 0 $).
 *
 * On lit ce qui SORT : la version écrite, le contexte que le modèle texte a
 * reçu, la consigne attestée et l'ordre des `image_urls`.
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as import('./studios-semis').IdsStudios,
  session: null as unknown,
  adaptateur: null as unknown,
}));
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
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../lib/studios/textes/dependances', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/studios/textes/dependances')>();
  return { ...actual, dependancesTextesProduction: () => ({ adaptateur: etat.adaptateur, environnement: 'test', plafondAtteint: async () => false }) };
});

import { db, schema, eq } from '@tiktrends/db';
import {
  consigneDuContenu, parametresDepuisConsigne, requeteFalImage, lireReferenceEpinglee,
  type ContenuVersion, type MediaResolu,
} from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import * as produit from '../app/actions/studios/produit';
import * as image from '../app/actions/studios/image';
import { semer, session } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, compter, delta, PHOTOS, type Catalogue } from './l5c-outils';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';

const ids = etat.ids;
const O = { veilleOuverte: true, maintenant: new Date('2026-10-08T10:00:00Z') };
let lier: (referenceIds: string[]) => Array<{ referenceId: string; role: string; scope: string }> = () => [];
const texte = adaptateurSimule((a: AppelModele) => {
  const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
  return {
    status: 'ready', questions: [], warnings: [], evidenceIds: [],
    result: {
      generationInstruction: 'Coureur portant les lunettes et le bandeau, piste au lever du jour.', negativeConstraints: [],
      needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'], referenceBindings: lier(ti.referenceIds),
    },
  };
});
etat.adaptateur = texte;
let cat: Catalogue;

const FICHE = {
  tailleReelle: '15 cm de large', echelle: 'main', echelleDetail: 'un peu plus large que la paume',
  nonMontre: 'les branches portent le logo gravé à l’intérieur', contenuAchat: '1 paire de lunettes et son bandeau', emballage: 'étui rigide noir',
};
const ATTENDUS = [
  'Taille réelle du produit : 15 cm de large · comparée à une main : un peu plus large que la paume. Garder cette échelle face à toute main, personne ou objet de la scène · ni agrandi, ni rapetissé.',
  'Ce que les photos du produit ne montrent pas : les branches portent le logo gravé à l’intérieur. Si cette partie paraît, elle suit cette description · rien d’autre n’est inventé.',
  'Ce qu’un achat contient : 1 paire de lunettes et son bandeau. Montrer au plus ce contenu · jamais un article en plus.',
  'Emballage : étui rigide noir. Il fait partie du produit, ce n’est pas un autre produit · jamais présenté comme un second article ni dédoublé.',
];
const PREFIXES = ['Taille réelle du produit', 'Ce que les photos du produit', 'Ce qu’un achat contient', 'Emballage :'];

const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p!.currentVersionId!));
  return v!;
};

async function photosDe(projectId: string) {
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projectId, O);
  if (!c.ok) throw new Error(c.code);
  return {
    lunettes: c.catalogue.produits.find((x) => x.produit.id === cat.produit.id)!.photos.map((f) => f.assetId),
    casquette: c.catalogue.produits.find((x) => x.produit.name === 'Casquette')!.photos[0]!.assetId,
    urls: new Map([...c.catalogue.fichiers.values()].map((f) => [f.assetId, f.url] as const)),
  };
}

async function projetEpingle(position = 5): Promise<string> {
  const p = await projetStatique(db, ids, cat);
  const { lunettes } = await photosDe(p.projectId);
  const r = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: (await courante(p.projectId)).id, productId: cat.produit.id, photoId: lunettes[position - 1]!, composants: ['lunettes', 'bandeau'] }, O);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return p.projectId;
}

/** Compile par l'action produit (chemin attesté), retient, puis construit le corps fal depuis la consigne de la version. */
async function jusquAuCorpsFal(projectId: string) {
  const base = await courante(projectId);
  const c = await produit.compilerConsigneImage({ projectId, mode: 'generative_scene' });
  if (!c.ok || c.statut !== 'compilee') throw new Error(JSON.stringify(c));
  const r = await image.retenirConsigneImage({ projectId, baseVersionId: base.id, runId: c.runId });
  if (!r.ok) throw new Error(`${r.code} · ${r.message}`);
  const consigne = consigneDuContenu((await courante(projectId)).content as ContenuVersion)!;
  const { urls } = await photosDe(projectId);
  const medias: MediaResolu[] = consigne.references.map((x) => ({ assetId: x.assetId, etat: 'autorise', url: urls.get(x.assetId)!, sha256: x.sha256 }));
  const q = requeteFalImage({ operations: [{ operation: 'keyframe:s_image', profil: 'image_generation' }], parametres: parametresDepuisConsigne(consigne), medias, modeles: { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit' } });
  if (!q.ok) throw new Error(q.motif);
  const corps = q.corps as { image_urls: string[]; prompt: string };
  return { contexte: texte.recues[texte.recues.length - 1]!.messages.map((m) => m.contenu).join('\n'), consigne, imageUrls: corps.image_urls, prompt: corps.prompt };
}

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  await publierRegistreDeTest(depotPrompts, acteurPlateforme());
});
beforeEach(() => {
  etat.session = session(ids, 'ua');
  texte.recues.length = 0;
  // Le modèle simulé ne lie QUE la photo épinglée et les autres rôles · le serveur doit lier les autres vues lui-même.
  lier = (refIds) => refIds.slice(0, 1).map((id) => ({ referenceId: id, role: 'product', scope: 'product' }));
});

describe('fiche produit · vraie action, une version, 0 $', () => {
  it('enregistre la fiche et les vues choisies · /productRef seul, une version, aucun appel, aucune dépense', async () => {
    const projectId = await projetEpingle(5);
    const { lunettes } = await photosDe(projectId);
    const avant = await compter(db);
    const base = await courante(projectId);
    const r = await produit.definirFicheProduit({ projectId, baseVersionId: base.id, fiche: FICHE, vues: [lunettes[2], lunettes[1]] });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true, inchange: false });
    const d = delta(avant, await compter(db));
    expect({ appels: texte.recues.length, versions: d.versions, depenses: d.depenses, credits: d.credits, jobs: d.jobs, devis: d.devis, produits: d.produits }).toEqual({ appels: 0, versions: 1, depenses: undefined, credits: undefined, jobs: undefined, devis: undefined, produits: undefined });
    const v = await courante(projectId);
    const ref = lireReferenceEpinglee((v.content as ContenuVersion).productRef)!;
    expect(ref.fiche).toEqual(FICHE);
    expect(ref.vuesChoisies).toEqual([lunettes[2], lunettes[1]]);
    expect((v.content as ContenuVersion).brief).toEqual((base.content as ContenuVersion).brief);
  });

  it('fiche → contexte réellement envoyé à image.compile · chaque attribut, et les trois vues dans l’ordre jusqu’au corps fal', async () => {
    const projectId = await projetEpingle(5);
    const { lunettes } = await photosDe(projectId);
    const w = await produit.definirFicheProduit({ projectId, baseVersionId: (await courante(projectId)).id, fiche: FICHE, vues: [lunettes[2], lunettes[1]] });
    expect(w.ok).toBe(true);
    const ctl = await produit.controlerCompilation({ projectId, mode: 'generative_scene' });
    expect(ctl.ok && ctl.preparation.invariants).toEqual(expect.arrayContaining(ATTENDUS));
    expect(ctl.ok && ctl.preparation.vuesProduit.map((x) => [x.position, x.origine])).toEqual([[5, 'epinglee'], [3, 'choisie'], [2, 'choisie']]);
    const r = await jusquAuCorpsFal(projectId);
    for (const a of ATTENDUS) expect(r.contexte, a.slice(0, 40)).toContain(a);
    // Trois vues · le contexte ET le corps disent qu'elles montrent UN article.
    expect(r.contexte).toContain('Les photos produit 1 à 3 sont des vues du même article · un seul exemplaire à l’image, sauf le contenu d’achat déclaré.');
    expect(r.prompt).toContain('Plusieurs exemplaires du produit : les photos produit 1 à 3 sont des vues du même article');
    expect(r.consigne.references.slice(0, 3).map((x) => x.assetId)).toEqual([lunettes[4], lunettes[2], lunettes[1]]);
    expect(r.imageUrls.slice(0, 3)).toEqual([PHOTOS[4], PHOTOS[2], PHOTOS[1]]);
  });

  it('sans fiche ni choix · aucun attribut de fiche, l’épinglée SEULE part (6 et 7 sont proposées), jamais la casquette, pas de phrase « un seul article »', async () => {
    const projectId = await projetEpingle(5);
    const { lunettes, casquette } = await photosDe(projectId);
    const ctl = await produit.controlerCompilation({ projectId, mode: 'generative_scene' });
    expect(ctl.ok && ctl.preparation.vuesProposees.map((x) => x.position)).toEqual([6, 7]);
    const r = await jusquAuCorpsFal(projectId);
    for (const p of [...PREFIXES, 'vues du même article']) expect(r.contexte).not.toContain(p);
    expect(r.prompt).not.toContain('vues du même article');
    expect(r.consigne.references.filter((x) => x.assetId.startsWith('pph_')).map((x) => x.assetId)).toEqual([lunettes[4]]);
    expect(r.consigne.references.map((x) => x.assetId)).not.toContain(casquette);
    expect(r.imageUrls.filter((u) => (PHOTOS as readonly string[]).includes(u))).toEqual([PHOTOS[4]]);
  });

  it('fiche vidée · les invariants redeviennent EXACTEMENT ceux d’avant la fiche', async () => {
    const projectId = await projetEpingle(5);
    const avant = await produit.controlerCompilation({ projectId, mode: 'generative_scene' });
    await produit.definirFicheProduit({ projectId, baseVersionId: (await courante(projectId)).id, fiche: FICHE });
    await produit.definirFicheProduit({ projectId, baseVersionId: (await courante(projectId)).id, fiche: { tailleReelle: '', echelle: '', nonMontre: '', contenuAchat: '', emballage: '' } });
    const apres = await produit.controlerCompilation({ projectId, mode: 'generative_scene' });
    expect(apres.ok && apres.preparation.invariants).toEqual(avant.ok && avant.preparation.invariants);
    expect('fiche' in lireReferenceEpinglee(((await courante(projectId)).content as ContenuVersion).productRef)!).toBe(false);
  });

  it('refus · vue d’un autre produit, troisième vue, repère manquant, lecteur · rien d’écrit, la raison est dite', async () => {
    const projectId = await projetEpingle(5);
    const { lunettes, casquette } = await photosDe(projectId);
    const base = await courante(projectId);
    const avant = await compter(db);
    expect(await produit.definirFicheProduit({ projectId, baseVersionId: base.id, fiche: null, vues: [casquette] }))
      .toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ raison: 'une vue est une autre photo de CE produit · jamais celle d’un autre produit' }] });
    expect(await produit.definirFicheProduit({ projectId, baseVersionId: base.id, fiche: null, vues: [lunettes[0], lunettes[1], lunettes[2]] }))
      .toMatchObject({ ok: false, violations: [{ raison: '2 vues au plus en plus de la photo épinglée' }] });
    expect(await produit.definirFicheProduit({ projectId, baseVersionId: base.id, fiche: { tailleReelle: '15 cm' } }))
      .toMatchObject({ ok: false, violations: [{ raison: 'choisis à quoi comparer la taille réelle : une main, une personne ou un objet courant' }] });
    etat.session = session(ids, 'uv');
    expect(await produit.definirFicheProduit({ projectId, baseVersionId: base.id, fiche: FICHE })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(delta(avant, await compter(db))).toEqual({});
  });

  it('changer de photo épinglée du même produit garde la fiche · la nouvelle épinglée sort des vues choisies', async () => {
    const projectId = await projetEpingle(5);
    const { lunettes } = await photosDe(projectId);
    await produit.definirFicheProduit({ projectId, baseVersionId: (await courante(projectId)).id, fiche: FICHE, vues: [lunettes[2], lunettes[1]] });
    const r = await produit.epinglerProduit({ projectId, baseVersionId: (await courante(projectId)).id, productId: cat.produit.id, photoId: lunettes[2], composants: ['lunettes', 'bandeau'] });
    expect(r.ok).toBe(true);
    const ref = lireReferenceEpinglee(((await courante(projectId)).content as ContenuVersion).productRef)!;
    expect([ref.photo.position, ref.fiche, ref.vuesChoisies]).toEqual([3, FICHE, [lunettes[1]]]);
  });
});
