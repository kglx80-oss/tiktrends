import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildImportPlan, parseCsv, parseSheetDate, splitDesire, stripEmoji,
  findHeaderRow, inferMechanism, inferVariable, parseVerdict,
} from '../src/adsmap/import-sheet';

/**
 * Écrit contre un extrait du fichier TrueFords réel, pas contre sa description :
 * chaque ligne de la fixture reproduit un piège rencontré dans le vrai fichier.
 */
const CSV = readFileSync(join(__dirname, 'fixtures/sheet-truefords.csv'), 'utf8');
const AUJOURD_HUI = new Date('2026-08-27');
const plan = () => buildImportPlan(CSV, { today: AUJOURD_HUI });

describe('lecture du fichier', () => {
  it('trouve l’en-tête en ligne 2 · la ligne 1 porte les blocs', () => {
    expect(findHeaderRow(parseCsv(CSV))).toBe(1);
  });

  it('ne perd aucune ligne de données', () => {
    const p = plan();
    expect(p.report.rowsRead).toBe(18);
    expect(p.ads).toHaveLength(18);   // une ad par ligne, aucune fusion silencieuse
  });

  it('ignore les lignes vides sans les compter comme perdues', () => {
    expect(plan().report.rowsSkipped).toBe(2);
  });

  it('retire les émojis des valeurs', () => {
    expect(stripEmoji('🎬 Video')).toBe('Video');
    expect(stripEmoji('🔄 Iteration')).toBe('Iteration');
    expect(stripEmoji('🖼️ Static')).toBe('Static');
  });

  it('lit les champs entre guillemets contenant une virgule', () => {
    const r = parseCsv('a,"b,c",d\n');
    expect(r[0]).toEqual(['a', 'b,c', 'd']);
  });
});

describe('lignes identiques → variantes · défaut D1', () => {
  it('quatre lignes identiques donnent un concept et quatre variantes', () => {
    const p = plan();
    const lot1 = p.ads.filter((a) => a.batchNumber === 1);
    expect(lot1.map((a) => a.variantCode)).toEqual(['v1', 'v2', 'v3', 'v4']);
    expect(new Set(lot1.map((a) => a.conceptKey)).size).toBe(1);
  });

  it('chaque variante garde SON verdict · c’est tout l’intérêt', () => {
    const lot1 = plan().ads.filter((a) => a.batchNumber === 1);
    expect(lot1.map((a) => a.verdict)).toEqual(['loser', 'loser', 'loser', 'baby_winner']);
  });

  it('le même titre sous deux angles donne deux concepts', () => {
    // Un concept n'a qu'un angle (hiérarchie stricte du §2.4).
    const c = plan().concepts.filter((x) => x.title === '3 reasons why (to adopt)');
    expect(c.length).toBeGreaterThan(1);
    expect(new Set(c.map((x) => x.angleLabel)).size).toBe(c.length);
  });
});

describe('dates abîmées · défaut D7', () => {
  it('répare « 07/052026 », dont il manque une barre', () => {
    const d = parseSheetDate('07/052026', AUJOURD_HUI);
    expect(d.date).toBe('2026-05-07');
    expect(d.repaired).toBe(true);
  });

  it('rejette les années incrémentées ligne à ligne', () => {
    expect(parseSheetDate('14/05/2014', AUJOURD_HUI).rejected).toBe(true);
    expect(parseSheetDate('13/05/2032', AUJOURD_HUI).rejected).toBe(true);   // dans le futur
  });

  it('garde ce qui est plausible', () => {
    expect(parseSheetDate('14/05/2026', AUJOURD_HUI).date).toBe('2026-05-14');
  });

  it('une date absente n’est pas une date rejetée', () => {
    const d = parseSheetDate('', AUJOURD_HUI);
    expect(d.rejected).toBe(false);
    expect(d.date).toBeNull();
  });

  it('le rapport compte réparations et rejets séparément', () => {
    const r = plan().report;
    expect(r.datesRepaired).toBe(4);
    expect(r.datesRejected).toBe(3);
  });
});

describe('désirs composites · défaut D6', () => {
  const connus = new Set(['Frustration + fatigue accumulée', 'Ne plus devoir repasser', 'Ne plus repasser']);

  it('ne coupe PAS « Frustration + fatigue accumulée » · c’est un seul désir', () => {
    expect(splitDesire('Frustration + fatigue accumulée', connus)).toEqual(['Frustration + fatigue accumulée']);
  });

  it('coupe après un désir connu, pas au premier « + » venu', () => {
    expect(splitDesire('Frustration + fatigue accumulée + Être avisé (promesses)', connus))
      .toEqual(['Frustration + fatigue accumulée', 'Être avisé (promesses)']);
  });

  it('coupe toujours sur « // » · aucun désir n’en contient légitimement', () => {
    expect(splitDesire('Trust envers la marque // limiter les frictions', connus))
      .toEqual(['Trust envers la marque', 'limiter les frictions']);
  });

  it('dans le doute, ne coupe pas · un désir inventé pollue la carte', () => {
    expect(splitDesire('Porter une chemise parfaite + no more ironing focus', connus))
      .toEqual(['Porter une chemise parfaite + no more ironing focus']);
  });

  it('« et » n’est pas un séparateur', () => {
    expect(splitDesire('Ne plus devoir repasser et économie du temps', connus))
      .toEqual(['Ne plus devoir repasser et économie du temps']);
  });
});

describe('mécanisme d’angle · défaut D6', () => {
  it('se déduit du titre du concept, qui le porte réellement', () => {
    expect(inferMechanism('3 reasons why (to adopt)', 'Prix attractif').mechanism).toBe('listicle');
    expect(inferMechanism('Démonstration - Valise 10h', 'Gain de temps').mechanism).toBe('demo');
    expect(inferMechanism("Don't Buy This Shirt (Reverse)", 'x').mechanism).toBe('reverse');
    expect(inferMechanism('Storytelling - Veuf', 'x').mechanism).toBe('story');
    expect(inferMechanism('Rareté - Tailles épuisées', 'x').mechanism).toBe('scarcity');
  });

  it('signale quand il n’a rien pu déduire, au lieu de faire semblant', () => {
    const m = inferMechanism('CLAY STYLE', 'Gain de temps');
    expect(m.inferred).toBe(false);
    expect(m.mechanism).toBe('demo');   // valeur neutre, pas une invention
    // Le fichier réel en compte neuf sur trente-six.
    expect(plan().report.anglesWithoutMechanism).toBe(1);
  });
});

describe('itérations · défaut D5', () => {
  it('déduit la variable testée du motif en texte libre', () => {
    expect(inferVariable('Potentiel Winner - ITERATION HOOK 2 Uniquement')).toBe('hook');
    expect(inferVariable('Testing timing à 15 Sec _ ITER')).toBe('length');
    expect(inferVariable('Reprise body v96')).toBe('body');
    expect(inferVariable('')).toBeNull();
  });

  it('ne rattache qu’à un titre ayant produit un gagnant', () => {
    // Itérer un perdant reproduit ce qui n'a pas marché : l'invariant l'interdit.
    const p = plan();
    const timing = p.ads.find((a) => a.iterationReason?.includes('timing à 15'));
    expect(timing!.iterationParentTitle).toBe('3 reasons why (to adopt)');
  });

  it('laisse sans parent ce qu’il ne peut pas déduire, et le compte', () => {
    const p = plan();
    const hook = p.ads.find((a) => a.iterationReason?.includes('HOOK 2'));
    expect(hook!.iterationParentTitle).toBeNull();
    expect(p.report.iterationsUnlinked).toBe(1);
  });
});

describe('invariant non rétroactif · §17.1', () => {
  it('« Prête » et « Test en cours » sans hypothèse redescendent en brouillon', () => {
    const p = plan();
    const prete = p.ads.find((a) => a.batchNumber === 11)!;
    expect(prete.status).toBe('draft');
    expect(prete.legacyFlags).toContain('legacy_missing_hypothesis');
    expect(p.report.demotedToDraft).toBe(3);
  });

  it('« Terminé » reste terminé · l’invariant ne vise que ce qui va tourner', () => {
    expect(plan().ads.find((a) => a.batchNumber === 1)!.status).toBe('done');
  });
});

describe('verdicts', () => {
  it('reconnaît le vocabulaire du fichier, faute de frappe comprise', () => {
    expect(parseVerdict('Winning Ad')).toBe('winner');
    expect(parseVerdict('Baby Wining Ad')).toBe('baby_winner');   // « Wining » est dans le fichier
    expect(parseVerdict('Losing Ad')).toBe('loser');
    expect(parseVerdict('')).toBeNull();
  });
});

describe('rapport', () => {
  it('dit ce qu’il faut aller regarder, en français', () => {
    const w = plan().report.warnings;
    expect(w.length).toBeGreaterThan(3);
    for (const m of w) {
      expect(m).not.toMatch(/null|undefined|NaN|_flag|\[object/);
      expect(m.length).toBeGreaterThan(30);
    }
  });

  it('les totaux se recoupent · aucune entité fantôme', () => {
    const p = plan();
    expect(p.report.ads).toBe(p.ads.length);
    expect(p.report.concepts).toBe(p.concepts.length);
    expect(p.report.desires).toBe(p.desires.length);
    expect(p.report.concepts + p.report.conceptsMerged).toBe(p.report.rowsRead);
  });
});
