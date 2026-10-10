// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L5-B · éditeur de calques sur une VRAIE base (pglite, migrations réelles).
 *
 * On édite avec le noyau (les mêmes opérations que l'écran), on enregistre par
 * la vraie action `enregistrerDocument`, puis on LIT la base : versions
 * immuables et leur filiation, contenu stocké (le texte reste un calque texte),
 * version source intacte, médias intacts, et aucune ligne de devis, job,
 * réserve, dépense, trace de prompt ou plan d'impact après toute la suite
 * d'éditions. Le 409 et la réapplication se jouent à deux « onglets ».
 * La page est rendue en HTML (serveur) pour chaque profil.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); }, useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { db, schema, eq } from '@tiktrends/db';
import {
  ajouterTexte, documentInitial, historiqueInitial, appliquerOperation, annulerEtape, retablirEtape, modifierTexte,
  transformerCalque, definirVerrou, patchDocument, reappliquerModifications, jsonCanonique, contenuVide,
  type ContenuVersion, type DocumentStudio, type ResultatOperation,
} from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { creerProjet, enregistrerDocument } from '../app/actions/studios/projets';
import { relireDocumentEditeur } from '../lib/studios/editeur/actions';
import { lireEditeurPour } from '../lib/studios/editeur/lecture';
import { gardeStudio } from '../lib/studios/garde';
import EditeurImagePage from '../app/(app)/studio/projets/[id]/image/page';

const ids = h.ids;
const qui = (q: 'ua' | 'uv' | 'ur' | 'ub') => { h.session = session(ids, q); };
const ok = (r: ResultatOperation) => { if (!r.ok) throw new Error(r.message); return r; };
const canon = (x: unknown) => jsonCanonique(x);

let projet = '';
let projetA2 = '';
let assetProduit = '';
let assetProjet = '';
let assetAutreProjet = '';

const asset = async (brandId: string, projectId: string | null, w: number, hgt: number, cle: string) => {
  const [a] = await db.insert(schema.studioAssets).values({
    workspaceId: ids.wsA, brandId, projectId, storageKey: `studios/${cle}.png`, mime: 'image/png', bytes: 1234,
    width: w, height: hgt, sha256: 'a'.repeat(64), origin: 'upload', storageState: 'stored',
  }).returning();
  return a!.id;
};

/** Toutes les lignes qui diraient qu'on a généré, devisé, réservé ou dépensé. */
async function lignesDeDepense() {
  const n = async (t: any) => (await db.select().from(t)).length;
  return {
    devis: await n(schema.studioQuotes), approbations: await n(schema.studioApprovals), jobs: await n(schema.studioJobs),
    tentatives: await n(schema.studioJobAttempts), registre: await n(schema.studioBudgetLedger), outbox: await n(schema.studioOutbox),
    credits: await n(schema.creditLedger), depense: await n(schema.aiSpend), traces: await n(schema.studioPromptRuns),
    plansImpact: await n(schema.studioImpactPlans), propositions: await n(schema.studioProposals),
  };
}
const versions = async (p = projet) => db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, p));
const courante = async (p = projet) => {
  const r = await relireDocumentEditeur(p);
  if (!r.ok) throw new Error(r.code);
  return r;
};
async function enregistrer(baseVersionId: string, avant: DocumentStudio | null, apres: DocumentStudio) {
  return enregistrerDocument({ projectId: projet, baseVersionId, changes: patchDocument(avant, apres), raison: 'Éditeur de calques · test' });
}
const page = async (id: string) => {
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(await EditeurImagePage({ params: Promise.resolve({ id }) }));
  return d;
};

beforeAll(async () => {
  await semer(db, schema, ids);
  qui('ua');
  assetProduit = await asset(ids.brandA1, null, 1200, 1600, 'produit');
  const contenu: ContenuVersion = { ...contenuVide(), brief: { objective: 'Tester une accroche', formats: ['Visuel fixe', 'Story 9:16'] }, productRef: { productId: 'p_serum', assetId: assetProduit } };
  const c = await creerProjet({ brandId: ids.brandA1, kind: 'image', title: 'Sérum · visuel story', contenu });
  if (!c.ok) throw new Error(`${c.code} ${JSON.stringify(c.violations)}`);
  projet = c.projet.id;
  const c2 = await creerProjet({ brandId: ids.brandA2, kind: 'image', title: 'Projet A2', contenu: contenuVide() });
  if (!c2.ok) throw new Error(c2.code);
  projetA2 = c2.projet.id;
  assetProjet = await asset(ids.brandA1, projet, 800, 600, 'decor');
  assetAutreProjet = await asset(ids.brandA2, projetA2, 500, 500, 'autre');
});

describe('lecture · format du brief, photo produit, médias du SEUL projet', () => {
  it('format 9:16 lu dans le brief, photo produit aux dimensions stockées, médias filtrés par projet et portée', async () => {
    const g = await gardeStudio('studio.read');
    if (!g.ok) throw new Error(g.code);
    const r = await lireEditeurPour(g.ctx, projet);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.donnees.formatPropose).toEqual({ format: '9:16', depuisBrief: true, texte: 'Story 9:16' });
    expect(r.donnees.produit).toEqual({ assetId: assetProduit, sourceWidth: 1200, sourceHeight: 1600, nom: 'Photo produit' });
    expect(r.donnees.medias.map((m) => m.assetId)).toEqual([assetProjet]);
    expect(r.donnees.medias[0]).toMatchObject({ width: 800, height: 600, nom: 'Import · 800 × 600' });
    expect(r.donnees.document).toBeNull();
    expect(r.donnees.peutEnregistrer).toBe(true);
    expect(r.donnees.medias.map((m) => m.assetId)).not.toContain(assetAutreProjet);
  });

  it('page · état vide qui propose de créer le document au format du brief', async () => {
    qui('ua');
    const d = await page(projet);
    expect(d.querySelector('[data-etat="document-vide"]')?.textContent).toContain('Ce projet n’a pas encore de document image');
    expect(d.querySelector('[data-format-source]')?.textContent).toBe('Format lu dans le brief : « Story 9:16 ».');
    expect(d.querySelector('input[name="format-document"][value="9:16"]')?.hasAttribute('checked')).toBe(true);
    expect(d.textContent).toContain('Poser la photo produit du projet, centrée, à 55 % de la largeur');
  });
});

describe('IMG-07 · IMG-08 · éditions enregistrées, aucune génération', () => {
  let v2 = '';
  let doc2: DocumentStudio;

  it('créer le document (9:16, photo produit à 55 %) · une version, rien d’autre', async () => {
    const avant = await lignesDeDepense();
    const [v1] = await versions();
    doc2 = documentInitial('9:16', { produit: { assetId: assetProduit, sourceWidth: 1200, sourceHeight: 1600 } });
    doc2 = ok(ajouterTexte(doc2, { texte: 'Découvre le sérum' })).document;
    const r = await enregistrer(v1!.id, null, doc2);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    v2 = r.version.id;
    expect(r.version.n).toBe(2);
    const relu = await courante();
    expect(canon(relu.document)).toBe(canon(doc2));
    expect(relu.document!.layers.produit).toMatchObject({ x: 243, width: 594, height: 792, assetId: assetProduit, sourceWidth: 1200, sourceHeight: 1600 });
    expect(await lignesDeDepense()).toEqual(avant);
  });

  it('IMG-07 · déplacer le CTA et changer sa typo · version 3, le calque stocké reste un TEXTE éditable, aucune ligne de dépense', async () => {
    const avant = await lignesDeDepense();
    let d = ok(transformerCalque(doc2, 'texte_1', { x: 120, y: 1500 })).document;
    d = ok(modifierTexte(d, 'texte_1', { fontId: 'sans-gras', fontSizePx: 72, color: '#ff5c8a' })).document;
    const r = await enregistrer(v2, doc2, d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [ligne] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, r.version.id));
    const stocke = (ligne!.content as ContenuVersion).document!.layers.texte_1!;
    expect(stocke).toMatchObject({ kind: 'text', text: 'Découvre le sérum', fontId: 'sans-gras', fontSizePx: 72, color: '#ff5c8a', x: 120, y: 1500 });
    // L'audit nomme les champs touchés · des identifiants, jamais des positions.
    const audits = await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.versionAfter, r.version.id));
    expect((audits[0]!.details as { chemins: string[] }).chemins.sort()).toEqual([
      '/document/fonts/sans-gras', '/document/layers/texte_1/color', '/document/layers/texte_1/fontId', '/document/layers/texte_1/fontSizePx',
      '/document/layers/texte_1/x', '/document/layers/texte_1/y',
    ]);
    expect(await lignesDeDepense()).toEqual(avant);
  });

  it('IMG-08 · suite d’éditions, annuler, rétablir, enregistrer, relire · document cohérent, versions sources intactes', async () => {
    const avant = await lignesDeDepense();
    const actuelle = await courante();
    const v1 = (await versions()).find((v) => v.n === 1)!;
    const v2Ligne = (await versions()).find((v) => v.n === 2)!;
    const empreintesAvant = (await versions()).map((v) => [v.id, v.contentHash, canon(v.content)]);
    const assetsAvant = JSON.stringify(await db.select().from(schema.studioAssets));

    const d0 = actuelle.document!;
    let hist = historiqueInitial(d0);
    hist = appliquerOperation(hist, transformerCalque(hist.present, 'produit', { rotationDeg: 8 }));
    hist = appliquerOperation(hist, modifierTexte(hist.present, 'texte_1', { text: '-20 % ce soir' }));
    hist = appliquerOperation(hist, definirVerrou(hist.present, 'produit', true));
    hist = appliquerOperation(hist, ajouterTexte(hist.present, { texte: 'Livraison offerte' }));
    hist = annulerEtape(annulerEtape(hist)); // retire l'ajout et le verrou
    hist = retablirEtape(hist); // remet le verrou
    const attendu = hist.present;
    expect(attendu.layers.produit).toMatchObject({ locked: true, rotationDeg: 8 });
    expect(attendu.layers.texte_2).toBeUndefined();

    const r = await enregistrer(actuelle.version.id, d0, attendu);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Rechargement (seconde lecture, comme une nouvelle session) · même document.
    const relu = await courante();
    expect(relu.version).toEqual({ id: r.version.id, n: 4 });
    expect(canon(relu.document)).toBe(canon(attendu));
    // Filiation et immuabilité · les versions d'avant n'ont pas bougé d'un octet.
    expect(r.version.parentId).toBe(actuelle.version.id);
    const apres = await versions();
    for (const [id, hash, contenu] of empreintesAvant) {
      const v = apres.find((x) => x.id === id)!;
      expect([v.contentHash, canon(v.content)]).toEqual([hash, contenu]);
    }
    expect((v1.content as ContenuVersion).document).toBeNull();
    expect((v2Ligne.content as ContenuVersion).document!.layers.produit).toMatchObject({ rotationDeg: 0, locked: false });
    // Les médias (sources) sont intacts.
    expect(JSON.stringify(await db.select().from(schema.studioAssets))).toBe(assetsAvant);
    expect(await lignesDeDepense()).toEqual(avant);
    expect(avant).toEqual({ devis: 0, approbations: 0, jobs: 0, tentatives: 0, registre: 0, outbox: 0, credits: 0, depense: 0, traces: 0, plansImpact: 0, propositions: 0 });
  });
});

describe('FLOW-06 · deux onglets sur la même version', () => {
  it('le second reçoit 409 avec les différences, rien n’est écrit ; champs disjoints → réappliqué sur la courante', async () => {
    const base = await courante();
    const d = base.document!;
    // Onglet 1 · déplace le texte.
    const un = ok(transformerCalque(d, 'texte_1', { x: 300 })).document;
    const r1 = await enregistrer(base.version.id, d, un);
    expect(r1.ok).toBe(true);
    // Onglet 2 · change la couleur, sur la base périmée.
    const deux = ok(modifierTexte(d, 'texte_1', { color: '#00ff00' })).document;
    const nAvant = (await versions()).length;
    const r2 = await enregistrer(base.version.id, d, deux);
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.code).toBe('VERSION_CONFLICT');
    expect(r2.status).toBe(409);
    expect(r2.conflit?.differences).toEqual([{ chemin: '/document/layers/texte_1/x', base: 120, courant: 300 }]);
    expect((await versions()).length).toBe(nAvant);
    const relu = await courante();
    expect(relu.document!.layers.texte_1).toMatchObject({ x: 300, color: '#ff5c8a' });
    // « Recharger et réappliquer » · rejoué sur la version courante, puis enregistré explicitement.
    const re = reappliquerModifications(d, deux, relu.document);
    expect(re.ok).toBe(true);
    if (!re.ok) return;
    const r3 = await enregistrer(relu.version.id, relu.document, re.document);
    expect(r3.ok).toBe(true);
    expect((await courante()).document!.layers.texte_1).toMatchObject({ x: 300, color: '#00ff00' });
  });

  it('même champ des deux côtés · 409 puis réapplication refusée · la version courante garde la valeur de l’autre', async () => {
    const base = await courante();
    const d = base.document!;
    const r1 = await enregistrer(base.version.id, d, ok(transformerCalque(d, 'texte_1', { y: 100 })).document);
    expect(r1.ok).toBe(true);
    const mien = ok(transformerCalque(d, 'texte_1', { y: 900 })).document;
    const r2 = await enregistrer(base.version.id, d, mien);
    expect(!r2.ok && r2.code).toBe('VERSION_CONFLICT');
    const relu = await courante();
    expect(reappliquerModifications(d, mien, relu.document)).toMatchObject({ ok: false, conflits: ['/document/layers/texte_1/y'] });
    expect(relu.document!.layers.texte_1!.y).toBe(100);
  });
});

describe('profils · lecture seule, hors portée', () => {
  it('lecteur client · accès refusé (le studio demande un rôle Membre)', async () => {
    qui('uv');
    const d = await page(projet);
    expect(d.querySelector('[data-etat="acces-refuse"]')?.textContent).toContain('Ton rôle ne permet pas d’ouvrir les projets du Studio');
    expect(d.querySelector('[data-editeur="calques"]')).toBeNull();
  });

  it('lecteur d’équipe (studio.read sans studio.propose) · page en lecture seule, enregistrement FORBIDDEN, rien écrit', async () => {
    h.session = session(ids, 'uv', { equipe: { role: 'membre', matrice: { membre: ['studio'] } } } as never);
    const d = await page(projet);
    expect(d.querySelector('[data-editeur="calques"]'), d.innerHTML.slice(0, 400)).not.toBeNull();
    expect(d.querySelector('[data-etat="lecture-seule"]')?.textContent ?? '', 'bandeau « Lecture seule » absent pour un rôle sans studio.propose').toContain('Lecture seule');
    expect(d.querySelector('[data-action="enregistrer"]')).toBeNull();
    expect(d.querySelector('[aria-label="Ajouter un calque"]')).toBeNull();
    const base = await courante();
    const n = (await versions()).length;
    const r = await enregistrer(base.version.id, base.document, ok(transformerCalque(base.document!, 'texte_1', { x: 1 })).document);
    expect(!r.ok && r.code).toBe('FORBIDDEN');
    expect((await versions()).length).toBe(n);
  });

  it('autre espace, marque restreinte · introuvable neutre, aucun titre ni identifiant', async () => {
    qui('ub');
    let d = await page(projet);
    expect(d.querySelector('[data-etat="introuvable"]')).not.toBeNull();
    expect(d.textContent).not.toContain('Sérum');
    expect(d.innerHTML).not.toContain(projet);
    qui('ur');
    d = await page(projetA2);
    expect(d.querySelector('[data-etat="introuvable"]')).not.toBeNull();
    expect((await relireDocumentEditeur(projetA2)).ok).toBe(false);
  });

  it('membre · la page rend la surface du document aux bonnes proportions, le texte en texte, la photo servie par la route média', async () => {
    qui('ua');
    const d = await page(projet);
    const s = d.querySelector('[data-surface="document"]')!;
    expect([s.getAttribute('data-largeur'), s.getAttribute('data-hauteur')]).toEqual(['1080', '1920']);
    expect(s.getAttribute('style')).toContain('aspect-ratio:1080 / 1920');
    const t = s.querySelector('[data-calque="texte_1"] [data-texte="editable"]');
    expect(t?.textContent).toBe('-20 % ce soir');
    expect(t?.getAttribute('style'), 'aperçu avec crénage, le rendu L5-A n’en applique aucun').toContain('font-kerning:none');
    // Intégration L5 · la photo produit (média studio) est servie par la route L5-A, le texte reste du texte.
    expect([...s.querySelectorAll('img')].map((i) => [i.getAttribute('alt'), i.getAttribute('src')])).toEqual([['Photo produit', `/api/studios/media/${assetProduit}`]]);
    expect(s.querySelector('[data-calque="produit"] [data-apercu="absent"]')).toBeNull();
    expect(d.querySelector('[data-statut]')?.textContent).toBe('Enregistré');
  });
});
