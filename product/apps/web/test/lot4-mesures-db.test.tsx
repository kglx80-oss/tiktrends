// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 4 V5 · les mesures arrivent dans les lots.
 *
 * Base RÉELLE (pglite + migrations), actions RÉELLES, vues RÉELLES :
 *  · la page Importer (`/adsmap/import`) montée dans le DOM · on y dépose un
 *    export Ads Manager en FRANÇAIS puis en ANGLAIS (en-têtes construits
 *    d'après la documentation publique · voir `mesures-csv.ts`), on lit
 *    l'aperçu (rattachées, ambiguë, non rattachée, avec leur raison), on clique
 *    « Écrire les mesures », on lit l'écran et la base ;
 *  · réimporter le même fichier · rien n'est doublé ;
 *  · une ligne d'une autre marque n'est jamais rattachée · l'ad homonyme de
 *    l'autre marque ne reçoit rien ;
 *  · une ligne ambiguë est signalée, non écrite ;
 *  · la fiche du lot (`/adsmap/lots/[id]`) rendue · les dépenses mesurées et la
 *    conclusion du lot (« Hypothèse confirmée ») · le témoin, avant tout import,
 *    se tait ;
 *  · Connexions · la remontée planifiée, sa dernière erreur (jeton Meta
 *    expiré, journalisée par le VRAI « Mesurer maintenant »), son réglage.
 * Seul Meta est simulé (aucun réseau). Aucun modèle, aucune dépense.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return {
    ids: { ws: u(), user: u(), brandA: u(), brandB: u() },
    marque: '' as string,
    metaErreur: 'Meta : Error validating access token: Session has expired on Saturday',
  };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('@tiktrends/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiktrends/integrations')>()),
  decryptSecret: (v: string | null) => (v ? 'jeton-factice' : null),
  metaDailySync: async () => { throw new Error(h.metaErreur); },
  metaAdsetsSync: async () => [],
}));
vi.mock('../lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth')>()),
  getSession: async () => ({ user: { id: h.ids.user, email: 'admin@lot4.test', name: null }, workspaceId: h.ids.ws, workspaceName: 'Agence', role: 'admin', plan: 'business', equipe: null }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  usePathname: () => '/adsmap/import', useRouter: () => ({ refresh: () => {}, push: () => {} }), useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));

import { db, schema, eq, inArray } from '@tiktrends/db';
import { conclusionLot, etatLotSpatial, referenceConclusion } from '@tiktrends/core';
import ImportSpatial from '../app/(spatial)/sp/adsmap/import/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import ConnexionsSpatiales from '../app/(spatial)/sp/connections/page';
import { chargerLots } from '../app/(spatial)/sp/adsmap/donnees';
import { syncAdsMapAction } from '../app/actions/adsmap';
import { reglerRemonteeNocturneAction } from '../app/actions/adsmap-mesures';
import { runAdsMapSync } from '../lib/adsmap-sync';
import { avecSpatial } from './spatial/fournisseur';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ids = h.ids;
const JOUR = 86_400_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const LANCEMENT = Date.now() - 20 * JOUR;
const J = (k: number) => ymd(LANCEMENT + k * JOUR);
const S = { lot1: '', lot2: '', a1: [] as string[], a2: [] as string[], doublons: [] as string[], autreMarque: '' };
const ID_META = (k: number) => `12020000000010${k}`;
const NOM = (lot: number, k: number) => `Truefords_B${lot}_Avant-apres_v${k + 1}_hook`;

async function chaine(brandId: string, titre: string) {
  const [pe] = await db!.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
const PAGE: Record<string, { offre: string; page: string }> = {};
async function cadre(brandId: string) {
  if (PAGE[brandId]) return PAGE[brandId]!;
  const [o] = await db!.insert(schema.offers).values({ workspaceId: ids.ws, brandId, label: 'Offre' }).returning({ id: schema.offers.id });
  const [p] = await db!.insert(schema.landingPages).values({ workspaceId: ids.ws, brandId, url: 'https://boutique.test/p', label: 'Fiche' }).returning({ id: schema.landingPages.id });
  return (PAGE[brandId] = { offre: o!.id, page: p!.id });
}
async function ad(conceptId: string, code: string, o: Partial<typeof schema.ads.$inferInsert>, brandId: string = ids.brandA) {
  const c = await cadre(brandId);
  const [a] = await db!.insert(schema.ads).values({
    workspaceId: ids.ws, conceptId, variantCode: code, status: 'live', testedVariable: 'hook', offerId: c.offre, landingPageId: c.page,
    hypothesis: 'Si on montre l’avant-après, alors on convertit, parce que la preuve rassure.', launchedAt: new Date(LANCEMENT), ...o,
  }).returning({ id: schema.ads.id });
  return a!.id;
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'business' });
  await db!.insert(schema.users).values({ id: ids.user, email: 'admin@lot4.test' });
  await db!.insert(schema.workspaceMembers).values({ workspaceId: ids.ws, userId: ids.user, role: 'admin' });
  await db!.insert(schema.brands).values([
    { id: ids.brandA, workspaceId: ids.ws, name: 'Truefords', metaAdAccountId: 'act_1', metaToken: 'chiffre' },
    { id: ids.brandB, workspaceId: ids.ws, name: 'Autre' },
  ]);
  const [l1, l2] = await db!.insert(schema.batches).values([
    { workspaceId: ids.ws, brandId: ids.brandA, number: 1, status: 'testing', launchedAt: new Date(LANCEMENT) },
    { workspaceId: ids.ws, brandId: ids.brandA, number: 2, status: 'testing', launchedAt: new Date(LANCEMENT), goal: 'L’avant-après en accroche' },
  ]).returning({ id: schema.batches.id });
  S.lot1 = l1!.id; S.lot2 = l2!.id;
  const c = await chaine(ids.brandA, 'Avant-après');
  for (let k = 0; k < 4; k++) S.a1.push(await ad(c, `v${k + 1}`, { batchId: S.lot1, generatedName: NOM(1, k) }));
  for (let k = 0; k < 4; k++) S.a2.push(await ad(c, `v${k + 1}`, { batchId: S.lot2, generatedName: NOM(2, k) }));
  // Deux ads hors lot portent le même nom régie (donnée réelle possible) · une ligne de ce nom est ambiguë.
  const c2 = await chaine(ids.brandA, 'Doublon');
  S.doublons.push(await ad(c2, 'd1', { generatedName: 'Truefords_B9_Doublon_v1_hook' }));
  S.doublons.push(await ad(c2, 'd2', { generatedName: 'Truefords_B9_Doublon_v1_hook' }));
  // L'autre marque · une ad dont le nom figure dans l'export · elle ne doit RIEN recevoir.
  const cb = await chaine(ids.brandB, 'Autre');
  S.autreMarque = await ad(cb, 'v1', { generatedName: 'Autre_B3_Secret_v1_hook' }, ids.brandB);
}, 180_000);

/** Export FR (Excel français · point-virgule, virgule décimale), une période d'un bloc par annonce. */
function exportFr(lignes: Array<{ nom: string; id?: string; depense: string; imp: string; achats: string; ensemble: string }>) {
  const t = 'Début des rapports;Fin des rapports;Nom de la campagne;Nom de l’ensemble de publicités;Nom de la publicité;Identifiant de la publicité;Diffusion de la publicité;Résultats;Indicateur de résultats;Couverture;Impressions;Montant dépensé (EUR);Clics sur un lien;Achats;Valeur de conversion des achats;Budget de l’ensemble de publicités;Type de budget de l’ensemble de publicités';
  return '﻿' + [t, ...lignes.map((l) => [J(0), J(6), '[ADSMAP] TEST Truefords B1', l.ensemble, l.nom, l.id ?? '', 'Terminée', l.achats, 'actions:offsite_conversion.fb_pixel_purchase', '15000', l.imp, l.depense, '310', l.achats, '0', '20', 'Quotidien'].join(';'))].join('\r\n') + '\r\n';
}
/** Export EN, ventilé par jour (« Day »), à la virgule. */
function exportEn(lignes: Array<{ nom: string; depenseJour: number; achatsJour: number[]; ensemble: string }>) {
  const t = 'Day,Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,Ad delivery,Results,Result indicator,Reach,Impressions,Amount spent (EUR),Link clicks,Purchases,Purchases conversion value,Ad set budget,Ad set budget type';
  const rows: string[] = [];
  for (const l of lignes) for (let k = 0; k < 7; k++) {
    rows.push([J(k), J(k), J(k), '[ADSMAP] TEST Truefords B2', l.ensemble, l.nom, 'Active', l.achatsJour[k]!, 'purchase', 2500, 3000, l.depenseJour.toFixed(2), 45, l.achatsJour[k]!, l.achatsJour[k]! * 39, 45, 'Daily'].join(','));
  }
  return [t, ...rows].join('\n') + '\n';
}

// Lot 1 · la référence de la marque · 4 perdantes (150 €, aucun achat). Avec les identifiants Meta.
const FR = exportFr([
  ...[0, 1, 2, 3].map((k) => ({ nom: NOM(1, k), id: ID_META(k), depense: '150,00', imp: '21 000', achats: '0', ensemble: `ES B1 v${k + 1}` })),
  { nom: 'Truefords_B9_Doublon_v1_hook', depense: '12,00', imp: '900', achats: '0', ensemble: 'ES doublon' },
  { nom: 'Autre_B3_Secret_v1_hook', depense: '33,00', imp: '2 000', achats: '1', ensemble: 'ES autre' },
]);
// Lot 2 · 4 gagnantes (300 € sur 7 jours, 20 achats · CPA 15 € contre une cible de 35 €), par jour.
const EN = exportEn([0, 1, 2, 3].map((k) => ({ nom: NOM(2, k), depenseJour: 300 / 7, achatsJour: [3, 3, 3, 3, 3, 3, 2], ensemble: `AS B2 v${k + 1}` })));

/* ───────────────────────────── DOM ───────────────────────────── */

async function pageImporter() {
  h.marque = ids.brandA;
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const root = createRoot(hote);
  const el = await ImportSpatial();
  await act(async () => { root.render(avecSpatial(el)); });
  return { hote, fin: () => { act(() => root.unmount()); hote.remove(); } };
}
async function deposer(hote: HTMLElement, texte: string, nom: string) {
  await act(async () => {
    const ev = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: { files: File[] } };
    Object.defineProperty(ev, 'dataTransfer', { value: { files: [new File([texte], nom, { type: 'text/csv' })] } });
    hote.querySelector('.drop')!.dispatchEvent(ev);
  });
}
const ecrire = (hote: HTMLElement) => hote.querySelector<HTMLButtonElement>('button[data-geste="ecrire-mesures"]');
const lignesAnnonces = (hote: HTMLElement) => [...hote.querySelectorAll('[data-tableau="annonces"] .mrow[data-etat]')].map((r) => ({ etat: r.getAttribute('data-etat'), texte: r.textContent ?? '' }));
const mesuresDe = async (adIds: string[]) => db!.select().from(schema.mesuresCsv).where(inArray(schema.mesuresCsv.adId, adIds));

async function ficheLot(id: string) {
  h.marque = ids.brandA;
  const el = await LotSpatial({ params: Promise.resolve({ id }) });
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(avecSpatial(el));
  return d;
}

/* ───────────────────────────── témoin ───────────────────────────── */

describe('témoin · avant tout import, aucune mesure, le lot ne conclut pas', () => {
  it('la fiche du lot 2 se tait · « Pas encore de conclusion »', async () => {
    const d = await ficheLot(S.lot2);
    expect(d.textContent, 'le lot conclut sans aucune mesure').not.toContain('Hypothèse confirmée');
    const l = (await chargerLots(ids.ws, ids.brandA)).lots.find((x) => x.id === S.lot2)!;
    expect(l.ads.every((a) => a.verdict === null)).toBe(true);
  });
});

/* ───────────────────────────── export FR ───────────────────────────── */

describe('export Meta en français · aperçu, puis écriture sur les bonnes ads', () => {
  it('l’aperçu dit tout et n’écrit rien · 4 rattachées, une ambiguë, une non rattachée (autre marque)', async () => {
    const { hote, fin } = await pageImporter();
    try {
      expect(hote.textContent, 'l’écran ne s’ouvre pas sur l’export Meta').toContain('Déposer un export Meta Ads (CSV)');
      await deposer(hote, FR, 'export-fr.csv');
      const texte = hote.textContent ?? '';
      expect(texte, 'l’aperçu ne dit pas comment le fichier a été lu').toContain('Fichier lu au point-virgule · en-tête en français');
      expect(texte).toContain('Ce qui sera écrit · rien n’est encore écrit');
      expect(texte, 'la règle de priorité n’est pas à l’écran').toContain('la connexion Meta l’emporte sur le fichier');
      const rangs = lignesAnnonces(hote);
      expect(rangs.map((r) => r.etat), 'classement des lignes · une ligne ambiguë ou d’une autre marque a été rattachée').toEqual(['rattachee', 'rattachee', 'rattachee', 'rattachee', 'ambigue', 'non_rattachee']);
      expect(rangs[0]!.texte).toContain('Lot #1 · v1');
      // Premier import · aucune ad n'est encore épinglée, le nom régie rattache (l'identifiant sera épinglé).
      expect(rangs[0]!.texte).toContain('par le nom régie');
      expect(rangs[4]!.texte, 'la ligne ambiguë ne dit pas pourquoi').toContain('2 ads de la marque portent ce nom');
      expect(rangs[5]!.texte, 'la ligne de l’autre marque ne dit pas pourquoi').toContain('aucune ad de la marque ne porte ce nom ni cet identifiant');
      expect(ecrire(hote)?.textContent).toBe('Écrire les mesures de 4 annonces');
      expect(await mesuresDe([...S.a1, ...S.doublons, S.autreMarque]), 'l’aperçu a écrit').toEqual([]);

      await act(async () => { ecrire(hote)!.click(); });
      expect(hote.textContent, 'l’écran ne dit pas que les mesures sont écrites').toContain('Mesures écrites.');
      expect(hote.textContent).toContain('4 variantes · 4 journées nouvelles');
      expect(hote.querySelector('a[href^="/adsmap/lots/"]')?.textContent).toBe('Ouvrir le lot #1');
    } finally { fin(); }

    const ecrites = await mesuresDe(S.a1);
    expect(ecrites.map((m) => [m.dateDebut, m.dateFin, m.spend, m.impressions, m.purchases]).sort()).toEqual([0, 1, 2, 3].map(() => [J(0), J(6), 150, 21000, 0]));
    expect(ecrites.every((m) => m.brandId === ids.brandA && m.fichier === 'export-fr.csv'), 'mauvaise marque ou fichier non noté').toBe(true);
    expect(await mesuresDe(S.doublons), 'une ligne ambiguë a été écrite').toEqual([]);
    expect(await mesuresDe([S.autreMarque]), 'l’ad de l’autre marque a reçu des mesures').toEqual([]);
    // Les identifiants lus sont épinglés · la synchro ne devinera plus.
    const pins = await db!.select({ id: schema.ads.id, ext: schema.ads.externalIds }).from(schema.ads).where(inArray(schema.ads.id, S.a1));
    expect(new Map(pins.map((p) => [p.id, (p.ext as { ad_id?: string } | null)?.ad_id]))).toEqual(new Map(S.a1.map((id, k) => [id, ID_META(k)])));
    // Le verdict est calculé sur ces mesures · visible dans la fiche du lot.
    const l1 = (await chargerLots(ids.ws, ids.brandA)).lots.find((x) => x.id === S.lot1)!;
    expect(l1.ads.map((a) => [a.verdict?.calcule, a.verdict?.depense])).toEqual([0, 1, 2, 3].map(() => ['loser', 150]));
  });

  it('réimporter le même fichier · rien n’est doublé, l’écran le dit', async () => {
    const { hote, fin } = await pageImporter();
    try {
      await deposer(hote, FR, 'export-fr.csv');
      expect(hote.textContent).toContain('0 journée nouvelle, 4 déjà importées à l’identique, 0 remplacée');
      await act(async () => { ecrire(hote)!.click(); });
      expect(hote.textContent).toContain('4 déjà là à l’identique (rien n’est doublé)');
    } finally { fin(); }
    expect(await mesuresDe(S.a1), 'le réimport a doublé des lignes').toHaveLength(4);
  });
});

/* ───────────────────────────── export EN ───────────────────────────── */

describe('export Meta en anglais (par jour) · le lot 2 mesuré, sa conclusion parle', () => {
  it('l’aperçu lit l’anglais, l’écriture pose 28 journées sur les 4 ads du lot 2', async () => {
    const { hote, fin } = await pageImporter();
    try {
      await deposer(hote, EN, 'export-en.csv');
      expect(hote.textContent).toContain('Fichier lu à la virgule · en-tête en anglais');
      expect(lignesAnnonces(hote).map((r) => r.etat)).toEqual(['rattachee', 'rattachee', 'rattachee', 'rattachee']);
      await act(async () => { ecrire(hote)!.click(); });
      expect(hote.textContent).toContain('4 variantes · 28 journées nouvelles');
    } finally { fin(); }
    const m = await mesuresDe(S.a2);
    expect(m).toHaveLength(28);
    expect(m.every((x) => x.dateDebut === x.dateFin)).toBe(true);
  });

  it('la fiche du lot 2 · dépenses mesurées et « Hypothèse confirmée » contre la référence du lot 1', async () => {
    const d = await chargerLots(ids.ws, ids.brandA);
    const l2 = d.lots.find((x) => x.id === S.lot2)!;
    expect(l2.ads.map((a) => [a.verdict?.calcule, a.verdict?.comparable, Math.round(a.verdict?.depense ?? 0)]), 'verdicts du lot 2 · pas gagnants, pas comparables au protocole, ou dépense non mesurée').toEqual([0, 1, 2, 3].map(() => ['winner', true, 300]));
    const etat = etatLotSpatial(l2, d.ctx);
    expect(etat).toBe('a_conclure');
    expect(conclusionLot(l2, etat, referenceConclusion(d.lots, l2.id)).conclusion).toBe('confirmee');
    const fiche = await ficheLot(S.lot2);
    expect(fiche.textContent, 'la fiche du lot ne dit pas la conclusion').toContain('Hypothèse confirmée');
    expect(fiche.textContent).toContain('4 gagnantes sur 4 variantes tranchées');
  });

  it('page Importer · « Dernières remontées » lit le journal (deux imports d’export)', async () => {
    const { hote, fin } = await pageImporter();
    try {
      expect(hote.textContent).toContain('CSV · Lot #2 · 4 variantes · 28 journées');
      expect(hote.textContent).toContain('CSV · Lot #1 · 4 variantes · 4 journées');
    } finally { fin(); }
  });
});

/* ───────────────────────────── Connexions ───────────────────────────── */

describe('Connexions · la remontée planifiée, sa dernière erreur, son réglage', () => {
  it('le vrai « Mesurer maintenant » échoue (jeton expiré) · journalisé en code, dit sur la carte Meta', async () => {
    vi.stubEnv('CRON_SECRET', 'present');
    const r = await syncAdsMapAction();
    expect(r.error).toBeTruthy();
    const [j] = await db!.select().from(schema.remontees).where(eq(schema.remontees.source, 'meta'));
    expect(j, 'journal · l’échec du bouton n’est pas inscrit').toBeDefined();
    expect([j!.ok, j!.motif, j!.declencheur], 'journal · l’échec du bouton n’est pas inscrit, ou pas classé « jeton »').toEqual([false, 'jeton', 'bouton']);
    expect(JSON.stringify(j), 'le message brut de Meta a été gardé').not.toContain('Session has expired');
    h.marque = ids.brandA;
    const d = document.createElement('div');
    d.innerHTML = renderToStaticMarkup(avecSpatial(await ConnexionsSpatiales()));
    const carte = d.querySelector('[data-connexion="meta"]')!;
    expect(carte.querySelector('[data-remontee]')?.textContent).toMatch(/^Remontée chaque nuit · prochaine .+ · aucune remontée réussie pour l’instant$/);
    expect(carte.querySelector('[data-remontee-erreur]')?.textContent).toBe('Dernière remontée en échec · le jeton Meta a expiré ou a été révoqué · reconnecte Meta Ads');
  });

  it('suspendre la remontée nocturne · la nuit saute la marque (rien n’est appelé chez Meta), la carte le dit', async () => {
    expect((await reglerRemonteeNocturneAction(false)).ok).toBe(true);
    const avant = (await db!.select().from(schema.remontees)).length;
    const rapport = await runAdsMapSync();
    expect(rapport.brands, 'la marque suspendue a été mesurée').toBe(0);
    expect((await db!.select().from(schema.remontees)).length).toBe(avant);
    const d = document.createElement('div');
    d.innerHTML = renderToStaticMarkup(avecSpatial(await ConnexionsSpatiales()));
    expect(d.querySelector('[data-connexion="meta"] [data-remontee]')?.getAttribute('data-remontee')).toBe('suspendue');

    expect((await reglerRemonteeNocturneAction(true)).ok).toBe(true);
    const r2 = await runAdsMapSync();
    expect(r2.brands).toBe(1);
    const nuit = await db!.select().from(schema.remontees).where(eq(schema.remontees.declencheur, 'nuit'));
    expect(nuit.map((x) => [x.ok, x.motif])).toEqual([[false, 'jeton']]);
  });

  it('sans clé de déclenchement · la remontée est dite inactive, sa raison écrite', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const d = document.createElement('div');
    d.innerHTML = renderToStaticMarkup(avecSpatial(await ConnexionsSpatiales()));
    expect(d.querySelector('[data-connexion="meta"] [data-remontee]')?.getAttribute('data-remontee')).toBe('inactive');
    vi.unstubAllEnvs();
  });
});
