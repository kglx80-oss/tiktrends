import { describe, it, expect } from 'vitest';
import { SHEET_COLUMNS, COMPUTED_COLUMNS, COL_HYPOTHESIS, toCsv, csvCell, sheetDate, sheetNumber, SHEET_VERDICT } from '../src/adsmap/sheet';

/**
 * L'export doit rester un remplaçant exact du tableur : c'est la porte de sortie
 * de l'équipe si ADSMAP ne convainc pas, et donc la condition pour qu'elle
 * accepte de l'essayer.
 */

describe('colonnes', () => {
  it('les 19 colonnes du Sheet, dans l’ordre', () => {
    expect(SHEET_COLUMNS).toHaveLength(19);
    expect(SHEET_COLUMNS[0]).toBe('Status');
    expect(SHEET_COLUMNS[18]).toBe('Plateforme');
    // Intitulés relevés sur le fichier réel, pas sur la description du §1.1.
    expect(SHEET_COLUMNS[4]).toBe('📎 Désire');
    expect(SHEET_COLUMNS[14]).toBe('Ad Variable');
    expect(SHEET_COLUMNS[17]).toBe('Date de lancement');
  });

  it('les colonnes calculées viennent APRÈS, jamais entre', () => {
    const ligne = toCsv([], { withComputed: true }).split('\r\n')[0]!.replace('﻿', '');
    const cols = ligne.split(';');
    expect(cols.slice(0, 19)).toEqual([...SHEET_COLUMNS]);
    expect(cols.slice(19)).toEqual([...COMPUTED_COLUMNS]);
  });

  it('sans les calculées, le fichier est un Sheet strict', () => {
    const cols = toCsv([]).split('\r\n')[0]!.replace('﻿', '').split(';');
    expect(cols).toHaveLength(19);
  });
});

describe('échappement CSV', () => {
  it('protège le séparateur, les guillemets et les sauts de ligne', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('il a dit "non"')).toBe('"il a dit ""non"""');
    expect(csvCell('ligne1\nligne2')).toBe('"ligne1\nligne2"');
  });
  it('laisse le texte simple intact', () => {
    expect(csvCell('Winning Ad')).toBe('Winning Ad');
    expect(csvCell(42)).toBe('42');
  });
  it('rend une cellule vide pour une valeur absente · jamais « null »', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('une hypothèse contenant un point-virgule ne casse pas la ligne', () => {
    const csv = toCsv([{ [COL_HYPOTHESIS]: 'Hook question ; cible 30 % de hook rate', Status: 'Prête' }]);
    const lignes = csv.replace('﻿', '').split('\r\n');
    expect(lignes).toHaveLength(3);          // en-tête + 1 ligne + fin
    expect(lignes[1]).toContain('"Hook question ; cible 30 % de hook rate"');
  });
});

describe('compatibilité tableur', () => {
  it('BOM UTF-8 par défaut · sinon Excel massacre les accents', () => {
    expect(toCsv([]).startsWith('﻿')).toBe(true);
    expect(toCsv([], { bom: false }).startsWith('﻿')).toBe(false);
  });
  it('fins de ligne CRLF', () => {
    expect(toCsv([{ Status: 'Terminé' }])).toContain('\r\n');
  });
  it('séparateur point-virgule par défaut, surchargeable', () => {
    expect(toCsv([]).includes(';')).toBe(true);
    expect(toCsv([], { delimiter: ',' }).includes(',')).toBe(true);
  });
});

describe('formatage des valeurs', () => {
  it('une date absente ou corrompue donne une cellule vide', () => {
    expect(sheetDate(null)).toBe('');
    expect(sheetDate('pas une date')).toBe('');
    expect(sheetDate(new Date('2026-05-14T00:00:00Z'))).toMatch(/14\/05\/2026/);
  });
  it('un nombre absent donne une cellule vide · jamais NaN', () => {
    expect(sheetNumber(null)).toBe('');
    expect(sheetNumber(Infinity)).toBe('');
    expect(sheetNumber(NaN)).toBe('');
    expect(sheetNumber(25.456)).toBe('25,46');
  });
  it('les verdicts reprennent le vocabulaire de l’équipe', () => {
    expect(SHEET_VERDICT.winner).toBe('Winning Ad');
    expect(SHEET_VERDICT.baby_winner).toBe('Baby Wining');
  });
});

describe('lignes complètes', () => {
  it('une ligne partielle reste alignée sur 19 colonnes', () => {
    const csv = toCsv([{ Status: 'Prête', 'BATCH #': 4 }]);
    const ligne = csv.replace('﻿', '').split('\r\n')[1]!;
    expect(ligne.split(';')).toHaveLength(19);
  });
  it('aucune valeur technique ne fuit dans l’export', () => {
    const csv = toCsv([{ Status: 'Terminé', 'Verdict calculé': undefined, CPA: null }], { withComputed: true });
    expect(csv).not.toMatch(/undefined|null|NaN|\[object/);
  });
});
