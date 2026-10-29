import { describe, expect, it } from 'vitest';
import { bilanAvanceAccueil, diversiteCreative, metriquesMetaAnalytics, prixQuestionAssistant, variationMeta } from '../src';

const KPI = { spend: 1200, cpa: 20, roas: 2.5, revenue: 3000, aov: 50, cpcAll: 1, cpcLink: 1.5, cpm: 10 };

describe('Spatial · Accueil · assistant · le prix dit avant l’envoi', () => {
  it('le coût du barème, débité à l’envoi et remboursé en cas d’échec · rien pour un compte illimité', () => {
    expect(prixQuestionAssistant({ cout: 1, illimite: false })).toBe('1 crédit par question, débité à l’envoi · remboursé si la réponse échoue');
    expect(prixQuestionAssistant({ cout: 3, illimite: false })).toBe('3 crédits par question, débités à l’envoi · remboursés si la réponse échoue');
    expect(prixQuestionAssistant({ cout: 1, illimite: true })).toBe('Compte illimité · aucune question n’est débitée');
  });
});

describe('Spatial · Analytics · KPI Meta (calcul de l’ancienne vue)', () => {
  it('variation à une décimale, aucune sans période précédente', () => {
    expect(variationMeta(1200, 1000)).toBe(20);
    expect(variationMeta(1, 3)).toBe(-66.7);
    expect(variationMeta(5, 0)).toBeNull();
  });
  it('les autres indicateurs du compte (les chiffres clés viennent de chiffresClesMeta, D2), sens de la variation, répartitions et top créas', () => {
    const m = metriquesMetaAnalytics({ accountName: 'Compte', currency: '€', window: KPI, previous: { ...KPI, spend: 1000, cpa: 25, cpm: 0 },
      topAds: [{ name: 'A', spend: 400, roas: 1.5, cpa: 12 }], breakdowns: { platform: [{ key: 'instagram', spend: 800, roas: 2.4 }, { key: 'facebook', spend: 200, roas: 0 }], ageGender: [] } }, new Date(2026, 9, 20), 'Meta Ads · synchronisé hier');
    expect(m.sous).toBe('Meta Ads · synchronisé hier · 30 j vs 30 j précédents · Compte · KPI du 20 oct.');
    // Dépense, CPA, ROAS et Valeur d'achat ne sont plus ici · un seul endroit les calcule pour les quatre écrans.
    expect(m.kpis.map((k) => k.libelle)).toEqual(['Panier moyen', 'CPC (tous)', 'CPC (lien)', 'CPM']);
    expect(m.kpis.find((k) => k.libelle === 'CPC (lien)')).toEqual({ libelle: 'CPC (lien)', valeur: '1,50 €', variation: '+0 %', ton: 'bon' });
    expect(m.kpis.find((k) => k.libelle === 'CPM')).toEqual({ libelle: 'CPM', valeur: '10,00 €', variation: null, ton: null });
    const baisse = metriquesMetaAnalytics({ window: KPI, previous: { ...KPI, cpm: 12, cpcAll: 3 } }, null, 'x');
    expect(baisse.kpis.find((k) => k.libelle === 'CPM')).toEqual({ libelle: 'CPM', valeur: '10,00 €', variation: '-16,7 %', ton: 'bon' });
    expect(m.repartitions).toEqual([{ titre: 'Par plateforme', lignes: [{ cle: 'instagram', texte: '800 € · 2,4×', part: 1 }, { cle: 'facebook', texte: '200 €', part: 0.25 }] }]);
    expect(m.topAds).toEqual([{ nom: 'A', roas: '1,5×', roasBon: false, cpa: '12,00 €', depense: '400,00 €' }]);
  });
});

describe('Spatial · Analytics · diversité créative (calcul de l’ancienne vue)', () => {
  it('moitié variété des gabarits (sur 7), moitié unicité des accroches · tags en minuscules, top 14', () => {
    const d = diversiteCreative([{ template: 'ugc', headline: 'A' }, { template: 'ugc', headline: 'a ' }, { template: 'offer', headline: 'B' }, {}], [['Plage', 'été'], ['plage'], null]);
    // 2 gabarits / 7 → 0,2857 ; 2 accroches uniques / 4 → 0,5 · (0,1429 + 0,25) × 100 = 39.
    expect(d!.score).toBe(39);
    expect(d!.niveau).toBe('faible');
    expect(d!.total).toBe(4);
    expect(d!.gabarits).toEqual([{ cle: 'ugc', libelle: 'UGC', n: 2, part: 1 }, { cle: 'offer', libelle: 'Offre', n: 1, part: 0.5 }]);
    expect(d!.tags).toEqual([{ tag: 'plage', n: 2, part: 1 }, { tag: 'été', n: 1, part: 0.5 }]);
  });
  it('rien à dire sans génération ni tag · null (aucun score inventé)', () => {
    expect(diversiteCreative([], [])).toBeNull();
    expect(diversiteCreative([], [[], null])).toBeNull();
  });
});

describe('Spatial · Analytics · bilan avancé de Jarvis', () => {
  const g = (wins: number, n: number) => ({ wins, n });
  it('un résultat ne se colore que s’il est tranché · le manque et les exclus se disent', () => {
    const b = bilanAvanceAccueil({
      marque: 'Neva',
      tendance: { days: 30, summary: 'Mieux', liftPoints: 0.2, conclusive: true },
      attribution: { overall: { summary: 'Pas encore', liftPoints: 0.1, conclusive: false, excluded: 2 }, total: 3, parts: [
        { part: 'measured', label: 'Mémoire mesurée', liftPoints: -0.15, conclusive: true, withIt: g(1, 8), withoutIt: g(4, 8) },
        { part: 'hooks', label: 'Accroches', liftPoints: null, conclusive: false, withIt: g(0, 0), withoutIt: g(0, 0) },
      ] },
      erreur: null,
    });
    expect(b.tendance).toEqual({ jours: '30 jours', resume: 'Mieux', ton: 'bon' });
    expect(b.attribution.ton).toBeNull();
    expect(b.attribution.manque).toContain('3 test(s) arbitré(s) alimentent la comparaison');
    expect(b.attribution.exclus).toMatch(/^2 test\(s\) arbitré\(s\) sont écartés/);
    expect(b.attribution.parts).toEqual([{ cle: 'measured', libelle: 'Mémoire mesurée', ecart: '-15 pt', ton: 'mauvais', detail: '1/8 contre 4/8' }]);
  });
  it('une erreur de lecture se dit, en rouge · sans attribution, « Lecture indisponible. »', () => {
    expect(bilanAvanceAccueil({ marque: 'N', tendance: null, attribution: null, erreur: 'Accès refusé' }).attribution).toEqual({ resume: 'Accès refusé', ton: 'mauvais', manque: null, exclus: null, parts: [] });
    expect(bilanAvanceAccueil({ marque: 'N', tendance: null, attribution: null, erreur: null }).attribution.resume).toBe('Lecture indisponible.');
  });
});
