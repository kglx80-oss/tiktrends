// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * L'import Résultats dit ce qu'il a lu et refuse ce qu'il ne comprend pas · la
 * VRAIE `exportAdsCsvAction` → la VRAIE `previewImportAction` /
 * `applyImportAction`, sur une vraie base (pglite), puis l'écran Importer rendu
 * avec les vraies actions.
 *
 *  · un export réimporté écrivait `https://app…/api/adsmap/<ancien id>/apercu`
 *    dans `asset_url` / `brief_url` de la NOUVELLE ad (lien vers l'ancienne) ·
 *    l'ad importée porte désormais l'adresse en base de la source (même marque,
 *    même espace), ou rien (autre marque, autre espace), et une autre origine
 *    n'est jamais résolue ;
 *  · un fichier mal découpé est refusé avant l'aperçu, rien n'est écrit ;
 *  · l'écran dit comment le fichier a été lu ;
 *  · un refus dit QUOI corriger · intitulés lus et colonnes attendues absentes
 *    à l'écran, rendus comme texte, « Télécharger le modèle » qui télécharge
 *    l'en-tête de l'export ; un aperçu accepté dit les colonnes absentes.
 */

const etat = vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  const ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u() };
  return { ids, ws: ids.wsA as string, brand: { id: ids.brandA1 as string, name: 'Marque A1' } };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.import.test', region: 'gra', bucket: 'tt-prive', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://stockage.import.test/tt-prive' }));
const APP = 'https://app.import.test';

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG }));
vi.mock('../lib/adsmap-guard', () => ({
  adsmapGuard: async () => ({
    s: { user: { id: etat.ws, email: 'admin@test.local', name: null }, workspaceId: etat.ws, workspaceName: 'Agence', role: 'admin', plan: 'business' },
    brand: { ...etat.brand, workspaceId: etat.ws },
  }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/adsmap/import', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { db, schema, eq } from '@tiktrends/db';
import { modeleImport, sousNavResultats } from '@tiktrends/core';
import { exportAdsCsvAction } from '../app/actions/adsmap';
import { applyImportAction, previewImportAction } from '../app/actions/adsmap-import';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Importer } from '../spatial/vues/resultats/Importer';

const ids = etat.ids;
const objet = (n: string) => `${CFG.publicBaseUrl}/assets/${ids.wsA}/${n}`;
const MEDIA = objet('1700000000001-11111111-gagnante.png');
const BRIEF = objet('1700000000002-22222222-brief.pdf');
let source = '';
let csv = '';

function sous(ws: string, brandId: string) { etat.ws = ws; etat.brand = { id: brandId, name: 'Marque' }; }

/** Les ads de l'espace créées par l'import · toutes sauf la source. */
async function importees(ws: string) {
  const lignes = await db!.select({ id: schema.ads.id, assetUrl: schema.ads.assetUrl, briefUrl: schema.ads.briefUrl }).from(schema.ads).where(eq(schema.ads.workspaceId, ws));
  return lignes.filter((l) => l.id !== source);
}

beforeAll(async () => {
  vi.stubEnv('APP_URL', APP);
  await db!.insert(schema.workspaces).values([{ id: ids.wsA, name: 'Agence A' }, { id: ids.wsB, name: 'Agence B' }]);
  await db!.insert(schema.brands).values([
    { id: ids.brandA1, workspaceId: ids.wsA, name: 'Marque A1' }, { id: ids.brandA2, workspaceId: ids.wsA, name: 'Marque A2' },
    { id: ids.brandB1, workspaceId: ids.wsB, name: 'Marque B1' },
  ]);
  const [pe] = await db!.insert(schema.personas).values({ brandId: ids.brandA1, name: 'P' }).returning();
  const [de] = await db!.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Confiance' }).returning();
  const [an] = await db!.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Preuve', mechanism: 'demo' }).returning();
  const [co] = await db!.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: 'Avant après' }).returning();
  const [ad] = await db!.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: co!.id, variantCode: 'v1', hypothesis: 'La preuve d’abord', assetUrl: MEDIA, briefUrl: BRIEF }).returning();
  source = ad!.id;

  sous(ids.wsA, ids.brandA1);
  const r = await exportAdsCsvAction({}, true);
  expect(r.error).toBeUndefined();
  csv = r.csv ?? '';
});

describe('export → import · les liens de l’application', () => {
  it('l’export écrit bien la route ABSOLUE de l’ad source (le cas à réimporter)', () => {
    expect(csv).toContain(`;${APP}/api/adsmap/${source}/apercu?media=brief;${APP}/api/adsmap/${source}/apercu;`);
    expect(csv, 'l’export a écrit l’adresse brute du stockage').not.toContain(CFG.publicBaseUrl);
  });

  it('même marque, même espace · l’ad importée porte l’adresse canonique de la source', async () => {
    sous(ids.wsA, ids.brandA1);
    const p = await previewImportAction(csv);
    expect(p.error).toBeUndefined();
    expect([p.report?.liensAppResolus, p.report?.liensAppEcartes], 'l’aperçu ne dit pas les liens résolus').toEqual([2, 0]);
    expect(p.report?.warnings.join(' ')).toContain('2 lien(s) de l\'application (export repris) remplacé(s) par l\'adresse du média de l\'ad d\'origine');
    expect(JSON.stringify(p), 'l’aperçu a montré l’adresse brute du stockage au navigateur').not.toContain(CFG.publicBaseUrl);
    expect(await importees(ids.wsA), 'l’aperçu a écrit').toEqual([]);

    const a = await applyImportAction(csv);
    expect(a.error).toBeUndefined();
    const [nouvelle, ...autres] = await importees(ids.wsA);
    expect(autres).toEqual([]);
    expect([nouvelle!.assetUrl, nouvelle!.briefUrl], 'la nouvelle ad ne porte pas les adresses en base de la source (lien vers l’ancienne ad recopié ?)').toEqual([MEDIA, BRIEF]);
  });

  it.each([
    ['autre marque du même espace', ids.wsA, ids.brandA2],
    ['autre espace', ids.wsB, ids.brandB1],
  ])('%s · la valeur est écartée, rien n’est écrit dans les liens, et le rapport le dit', async (_n, ws, brandId) => {
    sous(ws, brandId);
    const avant = (await importees(ws)).map((l) => l.id);
    const a = await applyImportAction(csv);
    expect(a.error).toBeUndefined();
    expect([a.report?.liensAppResolus, a.report?.liensAppEcartes], 'des liens hors de portée ont été résolus').toEqual([0, 2]);
    expect(a.report?.warnings.join(' ')).toContain('2 lien(s) de l\'application écarté(s) · ils désignaient une ad d\'une autre marque ou d\'un autre espace');
    const neuves = (await importees(ws)).filter((l) => !avant.includes(l.id));
    expect(neuves).toHaveLength(1);
    expect([neuves[0]!.assetUrl, neuves[0]!.briefUrl], 'une ad hors de portée a livré son adresse, ou le lien de l’ancienne ad a été recopié').toEqual([null, null]);
  });

  it('une autre origine que l’application n’est jamais résolue · la valeur reste ce qu’elle était', async () => {
    sous(ids.wsA, ids.brandA1);
    const avant = (await importees(ids.wsA)).map((l) => l.id);
    const force = csv.split(APP).join('https://evil.example');
    const a = await applyImportAction(force);
    expect(a.error).toBeUndefined();
    expect(a.report?.liensAppResolus, 'une origine étrangère a été résolue').toBe(0);
    const [neuve] = (await importees(ids.wsA)).filter((l) => !avant.includes(l.id));
    expect(neuve!.assetUrl, 'une origine étrangère a livré l’adresse en base de la source').toBe(`https://evil.example/api/adsmap/${source}/apercu`);
    expect(neuve!.briefUrl).toBe(`https://evil.example/api/adsmap/${source}/apercu?media=brief`);
  });
});

/** Chaque ligne entourée de guillemets · tout tombe dans une seule cellule. */
const malDecoupe = () => csv.replace(/^﻿/, '').split('\r\n').filter(Boolean).map((l) => `"${l.split('"').join('""')}"`).join('\r\n') + '\r\n';

describe('fichier mal découpé · refusé avant l’aperçu, rien n’est écrit', () => {
  it('aperçu et import renvoient la phrase, aucune ad n’est créée', async () => {
    sous(ids.wsA, ids.brandA1);
    const avant = (await importees(ids.wsA)).length;
    const p = await previewImportAction(malDecoupe());
    expect(p.error ?? '', 'le fichier mal découpé passe à l’aperçu').toMatch(/^Colonnes non reconnues · tout l'en-tête tient dans une seule cellule/);
    expect(p.sample, 'un aperçu a été montré').toBeUndefined();
    const a = await applyImportAction(malDecoupe());
    expect(a.error ?? '', 'le fichier mal découpé a été importé').toMatch(/^Colonnes non reconnues · /);
    expect((await importees(ids.wsA)).length).toBe(avant);
  });
});

const CTX: CtxSpatial = {
  utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 10, dotation: 10, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Monte l'écran, dépose le fichier, rend le texte affiché · `puis` agit sur l'écran avant démontage. */
async function deposer(texte: string, puis?: (hote: HTMLElement) => Promise<void>): Promise<{ texte: string; html: string; boutons: string[] }> {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const root = createRoot(hote);
  act(() => root.render(<FournisseurSpatial value={CTX}><Importer sousNav={sousNavResultats({ admin: true })} meta={{ connecte: false, mesure: null }} remontees={[]} /></FournisseurSpatial>));
  // L'écran s'ouvre sur l'export Meta (lot 4 V5, comme la maquette) · ce fichier éprouve le TABLEAU, choisi d'abord.
  act(() => { [...hote.querySelectorAll('button')].find((b) => b.textContent === 'Tableau')!.click(); });
  await act(async () => {
    const ev = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: { files: File[] } };
    Object.defineProperty(ev, 'dataTransfer', { value: { files: [new File([texte], 'tableau.csv', { type: 'text/csv' })] } });
    hote.querySelector('.drop')!.dispatchEvent(ev);
  });
  const out = { texte: hote.textContent ?? '', html: hote.innerHTML, boutons: [...hote.querySelectorAll('button')].map((b) => b.textContent ?? '') };
  if (puis) await puis(hote);
  act(() => root.unmount());
  hote.remove();
  return out;
}

describe('écran Importer · rendu avec les vraies actions', () => {
  it.each([
    ['l’export tel quel', () => csv, 'Fichier lu au point-virgule · 1 lignes lues'],
    ['l’export réenregistré à la virgule', () => csv.replace(/^﻿/, '').split('\r\n').map((l) => l.split(';').map((v) => (v.includes(',') ? `"${v}"` : v)).join(',')).join('\r\n'), 'Fichier lu à la virgule · 1 lignes lues'],
    ['l’export en tabulations', () => csv.split(';').join('\t'), 'Fichier lu à la tabulation · 1 lignes lues'],
  ])('%s · l’aperçu dit comment le fichier a été lu', async (_n, texte, attendu) => {
    sous(ids.wsA, ids.brandA1);
    const r = await deposer(texte());
    expect(r.texte, 'l’aperçu ne dit pas le séparateur retenu').toContain(attendu);
    expect(r.boutons.some((b) => /^Importer 1 variantes$/.test(b))).toBe(true);
  });

  it('un fichier mal découpé · la phrase de refus à l’écran, pas d’aperçu ni de bouton d’import', async () => {
    sous(ids.wsA, ids.brandA1);
    const r = await deposer(malDecoupe());
    expect(r.texte, 'l’écran ne dit pas pourquoi le fichier est refusé').toContain('Colonnes non reconnues · tout l\'en-tête tient dans une seule cellule');
    expect(r.texte, 'un aperçu a été montré pour un fichier refusé').not.toContain('Ce qui sera créé');
    expect(r.boutons.some((b) => /^Importer \d+ variantes$/.test(b)), 'le bouton d’import est proposé').toBe(false);
  });
});

/** Un export Meta Ads (en-tête type) · étranger au tableau, refusé. */
const META = 'Début des rapports,Fin des rapports,Nom de la campagne,Nom de l’ensemble de publicités,Nom de la publicité,Diffusion de la publicité,Résultats,Indicateur de résultat,Couverture,Impressions,Coût par résultat,Montant dépensé (EUR)\n2026-10-01,2026-10-07,C,E,P,active,12,achats,1000,2000,3,36\n';
const corriger = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.querySelector('section[aria-label="Ce qu’il faut corriger"]');
};

describe('écran Importer · un refus dit quoi corriger', () => {
  it('export Meta · intitulés lus, « Ad Concept » obligatoire absente, autres colonnes absentes, modèle, pas de bouton d’import', async () => {
    sous(ids.wsA, ids.brandA1);
    let modele = '';
    let attributs: { minHeight: string; type: string } | null = null;
    const r = await deposer(META, async (hote) => {
      const bouton = [...hote.querySelectorAll('button')].find((b) => b.textContent === 'Télécharger le modèle');
      if (!bouton) return;   // dit plus bas, après la zone elle-même
      attributs = { minHeight: bouton!.style.minHeight, type: bouton!.type };
      const blobs: Blob[] = [];
      // jsdom n'a pas d'URL d'objet · posées le temps du clic, retirées ensuite.
      const u = URL as unknown as Record<string, unknown>;
      u.createObjectURL = (b: Blob) => { blobs.push(b); return 'blob:modele'; };
      u.revokeObjectURL = () => {};
      const telecharges: string[] = [];
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { telecharges.push(this.download); });
      try {
        act(() => { bouton!.click(); });
      } finally {
        clic.mockRestore(); delete u.createObjectURL; delete u.revokeObjectURL;
      }
      expect(telecharges, 'le modèle n’est pas téléchargé').toEqual(['modele-import-resultats.csv']);
      // Les octets tels quels · `text()` avalerait le BOM qu'Excel attend.
      modele = blobs[0] ? new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blobs[0].arrayBuffer()) : '';
    });
    const zone = corriger(r.html);
    expect(zone, 'aucune zone « Ce qu’il faut corriger » sur un refus').not.toBeNull();
    const texte = zone!.textContent ?? '';
    expect(r.texte, 'la phrase de refus n’est plus là').toContain('Colonnes non reconnues · 1 colonne(s) du tableau retrouvée(s) sur 19');
    for (const lu of ['« Début des rapports »', '« Nom de l’ensemble de publicités »', '« Montant dépensé (EUR) »']) {
      expect(texte, `l’intitulé lu ${lu} n’est pas à l’écran`).toContain(lu);
    }
    expect(texte, 'la colonne obligatoire absente n’est pas dite').toContain('Colonne obligatoire absente« Ad Concept »');
    expect(texte, 'les autres colonnes absentes ne sont pas dites').toContain('Autres colonnes du tableau absentes« Status »« BATCH # »« Autheur »');
    expect(texte, '« Résultats » est lue, elle est dite absente').not.toMatch(/absentes.*« Résultats »/);
    expect(r.boutons.some((b) => /^Importer \d+ variantes$/.test(b)), 'le bouton d’import est proposé sur un refus').toBe(false);
    expect(r.texte, 'un aperçu a été montré pour un fichier refusé').not.toContain('Ce qui sera créé');
    expect(attributs, 'pas de bouton « Télécharger le modèle » sur un refus').not.toBeNull();
    expect(attributs, 'le bouton du modèle n’offre pas une cible de 44 px').toEqual({ minHeight: '44px', type: 'button' });
    expect(modele, 'le fichier téléchargé n’est pas le modèle du noyau').toBe(modeleImport());
    expect(modele.startsWith('\uFEFFStatus;BATCH #;Autheur;Ad Concept;'), 'le modèle n’est pas l’en-tête de l’export, BOM compris').toBe(true);
  });

  it('un intitulé saisi s’affiche comme texte · formule, signe, arobase et balise restent tels quels', async () => {
    sous(ids.wsA, ids.brandA1);
    const csv = '"=HYPERLINK(""https://x.test"",""clic"")",+cmd,-2+3,@SOMME(A1),<b>gras</b><img src=x onerror=alert(1)>\n1,2,3,4,5\n';
    const r = await deposer(csv);
    const zone = corriger(r.html);
    expect(zone, 'aucune zone « Ce qu’il faut corriger » sur un refus').not.toBeNull();
    expect(zone!.querySelector('b, img'), 'un intitulé a été interprété comme balisage').toBeNull();
    const texte = zone!.textContent ?? '';
    for (const lu of ['« =HYPERLINK("https://x.test","clic") »', '« +cmd »', '« -2+3 »', '« @SOMME(A1) »', '« <b>gras</b><img src=x onerror=alert(1)> »']) {
      expect(texte, `l’intitulé ${lu} n’est pas montré tel quel`).toContain(lu);
    }
    expect(r.html, 'la balise n’est pas échappée').toContain('&lt;b&gt;gras&lt;/b&gt;');
  });

  it('accepté avec des colonnes absentes · la mention à l’écran, l’import reste proposé', async () => {
    sous(ids.wsA, ids.brandA1);
    const r = await deposer('Status,BATCH #,Ad Concept,Date de lancement\nTerminé,7,Concept guide,01/08/2026\n');
    expect(r.texte, 'l’aperçu accepté ne dit pas les colonnes absentes').toContain('15 colonnes du tableau absentes du fichier · rien n\'en sera importé : « Autheur », « Désire », « Angle(s) »');
    expect(r.texte).toContain('« Plateforme ». L’import n’est pas bloqué.');
    expect(r.boutons.some((b) => /^Importer 1 variantes$/.test(b)), 'l’import est bloqué par des colonnes optionnelles absentes').toBe(true);
    expect(corriger(r.html), 'la zone de refus est montrée sur un aperçu accepté').toBeNull();
  });

  it('accepté complet (l’export) · aucune mention de colonnes absentes', async () => {
    sous(ids.wsA, ids.brandA1);
    const r = await deposer(csv);
    expect(r.texte).toContain('Ce qui sera créé');
    expect(r.texte, 'une colonne est dite absente d’un export complet').not.toContain('absente');
  });
});
