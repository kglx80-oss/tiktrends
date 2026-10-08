import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  lireBenchmark, ecartsRubrique, RUBRIQUE_REFERENCE, IDS_CAS, DEFINITIONS_CAS, planCampagne, planCas, templatesDuPlan,
  tarifsDuProduit, devisAgrege, devisCas, borneAppelMicros, ORACLES, evaluerOracle, ficheVierge, verdictCampagne,
  autoriserCampagneReelle, peutLancer, lireBudgetUsd, sceller, refusEvaluationReelle, banniere, FORMAT_RAPPORT,
  imageVide, rectangle, copier, etoile, comparerSousMasque, boiteOpaque, redimensionner,
  type BenchmarkLu, type ObservationCas, type ResultatCas, type FicheRevue, type EtatReel, type RapportCampagne, type PlanCas,
} from '../src/index';

/**
 * Lot F-C · noyau du benchmark F01-F24. Chaque garde vérifie un RÉSULTAT
 * (valeur rendue par la règle pure), sur le VRAI `09-BENCHMARK.json` et le
 * VRAI pack de prompts.
 */

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const BRUT = readFileSync(join(DOSSIER, '09-BENCHMARK.json'), 'utf8');
const PACK = JSON.parse(readFileSync(join(DOSSIER, '02-PROMPTS.json'), 'utf8')) as { templates: Array<{ key: string; modelProfile: string }> };
const CLES = new Set(PACK.templates.map((t) => t.key));
const PROFILS = Object.fromEntries(PACK.templates.map((t) => [t.key, t.modelProfile]));

const lu = (): BenchmarkLu => {
  const r = lireBenchmark(BRUT, CLES);
  if (!r.ok) throw new Error(JSON.stringify(r.constats));
  return r.benchmark;
};
const TARIFS = tarifsDuProduit({ profils: PROFILS, routage: { reasoning_structured: 'claude-sonnet-5' } });
const plans = (sel?: string[]): PlanCas[] => {
  const p = planCampagne(lu(), sel);
  if (!p.ok) throw new Error(JSON.stringify(p.constats));
  return p.plans;
};

describe('lecture du benchmark', () => {
  it('le vrai fichier se lit · 24 cas F01-F24, rubrique de référence', () => {
    const b = lu();
    expect(b.cas.map((c) => c.id)).toEqual(IDS_CAS);
    expect(b.rubrique).toEqual(RUBRIQUE_REFERENCE);
    expect(b.status).toBe('NON_EXECUTE');
  });

  it('aucun assouplissement ni changement de la rubrique n’est accepté', () => {
    const base = JSON.parse(BRUT);
    const variantes: Array<[string, unknown]> = [
      ['minimumMean', 7], ['minimumMean', 9], ['criticalAcceptedAllowed', 1], ['stochasticOutputsPerCase', 1],
      ['deterministicInvariantPassRate', 0.95], ['dimensions', ['fidélité produit', 'respect brief', 'cohérence', 'texte']], ['pointsEach', [0, 1, 2, 3]],
    ];
    for (const [cle, valeur] of variantes) {
      const b = structuredClone(base);
      b.qualityRubric[cle] = valeur;
      const r = lireBenchmark(b, CLES);
      expect(r.ok, `${cle}=${JSON.stringify(valeur)} accepté`).toBe(false);
      if (!r.ok) expect(r.constats.map((c) => c.code)).toContain('RUBRIQUE_MODIFIEE');
    }
    expect(ecartsRubrique(base.qualityRubric)).toEqual([]);
  });

  it('un cas retiré ou un template inconnu est refusé', () => {
    const b = JSON.parse(BRUT);
    const moins = { ...b, cases: b.cases.slice(0, 23) };
    expect(lireBenchmark(moins, CLES)).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'CAS_INCOMPLETS' })] });
    const inconnu = structuredClone(b);
    inconnu.cases[3].templates = ['jarvis.route', 'template.fantome'];
    const r = lireBenchmark(inconnu, CLES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.constats.map((c) => c.code)).toContain('TEMPLATE_INCONNU');
  });
});

describe('plans d’exécution', () => {
  it('chaque cas a un plan dont les templates sont EXACTEMENT ceux déclarés', () => {
    const b = lu();
    for (const c of b.cas) expect(templatesDuPlan(DEFINITIONS_CAS[c.id]!), c.id).toEqual([...new Set(c.templates)].sort());
    expect(plans()).toHaveLength(24);
  });

  it('un plan qui invente ou oublie un template est refusé', () => {
    const b = lu();
    const defs = { ...DEFINITIONS_CAS, F04: { ...DEFINITIONS_CAS.F04!, etapes: DEFINITIONS_CAS.F04!.etapes.slice(0, 1) } };
    expect(planCas(b.cas[3]!, b.rubrique, defs)).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'PLAN_TEMPLATES_DIVERGENTS' })] });
  });

  it('2 sorties pour un cas stochastique visuel, 1 sinon · étapes répétées sortie par sortie', () => {
    const p = Object.fromEntries(plans().map((x) => [x.id, x]));
    expect(p.F01!.sorties).toBe(2);
    expect(p.F04!.sorties).toBe(1);
    expect(p.F01!.deroule.map((d) => `${d.etape.id}#${d.sortie}`)).toEqual(['brief#0', 'compile#0', 'generation#0', 'composition#0', 'qualite#0', 'generation#1', 'composition#1', 'qualite#1']);
    expect(p.F20!.medias.reduce((s, m) => s + m.unites, 0)).toBe(8);
  });

  it('les invariants déclarés par un plan sont exactement ceux que son oracle calcule', () => {
    for (const id of IDS_CAS) expect(ORACLES[id]!.map((r) => r.id), id).toEqual(DEFINITIONS_CAS[id]!.invariants);
  });
});

describe('devis agrégé', () => {
  it('borne d’un appel texte = 24 000 jetons entrée + 4 000 sortie au tarif du modèle routé', () => {
    expect(borneAppelMicros({ inputPerMTok: 3, outputPerMTok: 15 }, TARIFS.bornes)).toBe(132_000);
  });

  it('des cas chiffrés au barème : appels bornés, image 0,08 $, clip 0,60 $', () => {
    const p = Object.fromEntries(plans().map((x) => [x.id, x]));
    expect(devisCas(p.F04!, TARIFS).totalUsdMicros).toBe(2 * 132_000);
    expect(devisCas(p.F14!, TARIFS).totalUsdMicros).toBe(2 * 132_000 + 2 * 80_000);
    expect(devisCas(p.F20!, TARIFS).totalUsdMicros).toBe(4 * 132_000 + 4 * 80_000 + 4 * 600_000);
    expect(devisCas(p.F06!, TARIFS).lignes.find((l) => l.nature === 'calcul')).toMatchObject({ usdMicros: 0 });
  });

  it('total = somme exacte des cas, et l’empreinte suit chaque ligne', () => {
    const sel = ['F03', 'F04', 'F14', 'F17', 'F20', 'F21'];
    const d = devisAgrege(plans(sel), TARIFS);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.totalUsdMicros).toBe(d.cas.reduce((s, c) => s + c.totalUsdMicros!, 0));
    expect(d.totalUsdMicros).toBe(2 * 132_000 + 2 * 132_000 + (2 * 132_000 + 2 * 80_000) + 132_000 + (4 * 132_000 + 4 * 80_000 + 4 * 600_000) + 132_000);
    const autre = devisAgrege(plans(sel), { ...TARIFS, medias: { ...TARIFS.medias, image_generation: { usdMicros: 80_001, source: 'x' } } });
    expect(autre.ok && autre.empreinte).not.toBe(d.empreinte);
  });

  it('vision non routée : les 6 cas concernés sont non chiffrables et le devis complet est REFUSÉ, jamais 0 $', () => {
    const d = devisAgrege(plans(), TARIFS);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.nonChiffrables).toEqual(['F01', 'F02', 'F07', 'F12', 'F13', 'F15']);
    for (const c of d.cas.filter((x) => !x.chiffrable)) {
      expect(c.totalUsdMicros).toBeNull();
      expect(c.lignes.some((l) => l.usdMicros === null && /vision_analysis/.test(l.motif ?? ''))).toBe(true);
    }
  });

  it('modèle sans tarif répertorié ou média sans tarif : non chiffrable', () => {
    const p = plans(['F04', 'F14']);
    expect(devisAgrege(p, { ...TARIFS, routage: { reasoning_structured: 'modele-maison-x' } })).toMatchObject({ ok: false, nonChiffrables: ['F04', 'F14'] });
    expect(devisAgrege(p, { ...TARIFS, medias: { ...TARIFS.medias, image_generation: { usdMicros: null, source: 'aucun' } } })).toMatchObject({ ok: false, nonChiffrables: ['F14'] });
  });
});

/* ── oracles ─────────────────────────────────────────────────────────────── */

const obs = (cas: string, o: Partial<ObservationCas> = {}): ObservationCas => ({
  cas, etapes: [], messages: [], compteurs: { avant: {}, apres: {} }, mesures: {}, donnees: {}, ...o,
});
const pret = (etapeId: string, result: Record<string, unknown>, sortie = 0) => ({ etapeId, templateKey: null, sortie, statut: 'ready' as const, code: null, result, questions: [], warnings: [] });
const bloque = (etapeId: string, code: string) => ({ etapeId, templateKey: null, sortie: 0, statut: 'blocked' as const, code, result: null, questions: ['?'], warnings: [] });
const zero = { jobs: 0, devis: 0, approbations: 0, medias: 0, credits: 0, versions: 3 };
const passes = (o: ObservationCas) => evaluerOracle(o).map((i) => i.passe);

describe('oracles déterministes', () => {
  it('F04 · proposition seule : un job ou un crédit consommé fait échouer', () => {
    const donnees = { document: { calques: { montre: { couleur: 'argent' } } }, allowedPaths: ['/calques/montre/couleur'] };
    const r = { changes: [{ op: 'replace', path: '/calques/montre/couleur', newValue: 'or', reason: 'demande' }] };
    expect(passes(obs('F04', { donnees, etapes: [pret('route', {}), pret('patch', r)], compteurs: { avant: zero, apres: zero } }))).toEqual([true, true, true]);
    expect(passes(obs('F04', { donnees, etapes: [pret('route', {}), pret('patch', r)], compteurs: { avant: zero, apres: { ...zero, jobs: 1 } } }))).toEqual([true, true, false]);
  });

  it('F05 · un seul pixel hors masque fait échouer', () => {
    expect(passes(obs('F05', { mesures: { comparaisons: [{ horsMasque: 0, dansMasque: 40 }, { horsMasque: 0, dansMasque: 38 }] } }))).toEqual([true, true]);
    expect(passes(obs('F05', { mesures: { comparaisons: [{ horsMasque: 0, dansMasque: 40 }, { horsMasque: 1, dansMasque: 38 }] } }))).toEqual([false, true]);
  });

  it('F06 · 55 % ± 1 px, par la valeur ET par le rendu mesuré', () => {
    const donnees = { document: { calques: { produit: { largeur: 400, hauteur: 300 } } }, allowedPaths: ['/calques/produit'], cheminLargeur: '/calques/produit/largeur', ratio: 0.55, largeurCanvas: 1080 };
    const patch = (l: number) => pret('patch', { changes: [{ op: 'replace', path: '/calques/produit/largeur', newValue: l, reason: 'échelle' }] });
    expect(passes(obs('F06', { donnees, etapes: [patch(594)], mesures: { largeurRenduePx: 595 } }))).toEqual([true, true]);
    expect(passes(obs('F06', { donnees, etapes: [patch(597)], mesures: { largeurRenduePx: 592 } }))).toEqual([false, false]);
    expect(passes(obs('F06', { donnees, etapes: [patch(594)] }))).toEqual([true, null]);
  });

  it('F08 · un seul caractère réécrit fait échouer', () => {
    const donnees = { narration: 'Lumea 3 · 92 % d’avis' };
    expect(passes(obs('F08', { donnees, etapes: [pret('voix', { spokenText: 'Lumea 3 · 92 % d’avis' })] }))).toEqual([true]);
    expect(passes(obs('F08', { donnees, etapes: [pret('voix', { spokenText: 'Lumea 3 · 92 % d\'avis' })] }))).toEqual([false]);
  });

  it('F12 · l’injection dans un message système fait échouer', () => {
    const donnees = { marqueInjection: 'INJECTION_F12', actionsDisponibles: ['brief.build'] };
    const route = pret('route', { intent: 'inspect', targetIds: [], nextTemplateKey: '' });
    const user = { etapeId: 'route', role: 'user' as const, contenu: '{"text":"INJECTION_F12","trust":"untrusted_data"}' };
    expect(passes(obs('F12', { donnees, etapes: [route], messages: [{ etapeId: 'route', role: 'system', contenu: 'règles' }, user] }))).toEqual([true, true, true]);
    expect(passes(obs('F12', { donnees, etapes: [route], messages: [{ etapeId: 'route', role: 'system', contenu: 'règles INJECTION_F12' }, user] }))[0]).toBe(false);
  });

  it('F17 · count différent du nombre de lignes fait échouer ; sélection demandée passe', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ itemId: `i${i}` }));
    expect(passes(obs('F17', { donnees: { plafond: 12 }, etapes: [pret('lot', { items, count: 12 })] }))).toEqual([true]);
    expect(passes(obs('F17', { donnees: { plafond: 12 }, etapes: [pret('lot', { items, count: 27 })] }))).toEqual([false]);
    expect(passes(obs('F17', { donnees: { plafond: 12 }, etapes: [bloque('lot', 'MODELE_BLOQUE')] }))).toEqual([true]);
  });

  it('F21 · une intention de révision ou une cible fait échouer', () => {
    const c = { avant: zero, apres: zero };
    expect(passes(obs('F21', { compteurs: c, etapes: [pret('route', { intent: 'help', targetIds: [] })] }))).toEqual([true, true, true]);
    expect(passes(obs('F21', { compteurs: c, etapes: [pret('route', { intent: 'revise', targetIds: ['projet-ancien'] })] }))).toEqual([false, false, true]);
  });

  it('une étape non aboutie rend l’invariant NON ÉVALUABLE, jamais réussi', () => {
    expect(passes(obs('F10', { etapes: [bloque('relecture', 'UNSUPPORTED_CAPABILITY')] }))).toEqual([null]);
    expect(evaluerOracle(obs('F99'))).toMatchObject([{ passe: false }]);
  });
});

/* ── rubrique et verdict ──────────────────────────────────────────────────── */

function campagne(o: { notes?: number; critique?: boolean; casse?: string; manque?: string; nonEvaluable?: string } = {}): ResultatCas[] {
  return plans().filter((p) => p.id !== o.manque).map((p) => {
    const fiche = ficheVierge(p, RUBRIQUE_REFERENCE, 'reel');
    if (fiche && o.notes !== undefined) {
      for (const s of fiche.sorties) {
        for (const d of fiche.dimensions) s.notes[d] = o.notes === 1.6 ? (d === 'texte' ? 0 : 2) : o.notes; // 1.6 → 8/10
        s.relecteur = 'relecteur@test';
        if (o.critique && p.id === 'F01') s.defautsCritiques.push({ description: 'bandeau absent', accepte: true });
      }
    }
    return {
      cas: p.id, statut: 'execute', motif: null, fiche,
      invariants: p.invariants.map((id) => ({ id, description: id, passe: id.startsWith(`${o.casse}.`) ? false : id.startsWith(`${o.nonEvaluable}.`) ? null : true, detail: '' })),
    };
  });
}

describe('verdict de campagne', () => {
  it('le code ne note jamais : une fiche naît vide, le verdict attend la revue', () => {
    const f = ficheVierge(plans(['F01'])[0]!, RUBRIQUE_REFERENCE, 'reel') as FicheRevue;
    expect(f.sorties).toHaveLength(2);
    expect(f.sorties.every((s) => Object.values(s.notes).every((n) => n === null))).toBe(true);
    expect(verdictCampagne({ mode: 'reel', rubrique: RUBRIQUE_REFERENCE, resultats: campagne() })).toMatchObject({ statut: 'REVUE_HUMAINE_REQUISE', approuvable: false });
  });

  it('réel, 24 cas, invariants 100 %, moyenne 10/10 · CONFORME et approuvable', () => {
    expect(verdictCampagne({ mode: 'reel', rubrique: RUBRIQUE_REFERENCE, resultats: campagne({ notes: 2 }) })).toMatchObject({ statut: 'CONFORME', approuvable: true, moyenne: 10, evaluationReelle: true });
  });

  it('moyenne 8/10 exactement passe ; moyenne < 8 échoue', () => {
    expect(verdictCampagne({ mode: 'reel', rubrique: RUBRIQUE_REFERENCE, resultats: campagne({ notes: 1.6 }) })).toMatchObject({ statut: 'CONFORME', moyenne: 8 });
    expect(verdictCampagne({ mode: 'reel', rubrique: RUBRIQUE_REFERENCE, resultats: campagne({ notes: 1 }) })).toMatchObject({ statut: 'NON_CONFORME', approuvable: false });
  });

  it('un défaut critique accepté, une note hors échelle : NON_CONFORME', () => {
    expect(verdictCampagne({ mode: 'reel', rubrique: RUBRIQUE_REFERENCE, resultats: campagne({ notes: 2, critique: true }) })).toMatchObject({ statut: 'NON_CONFORME', critiquesAcceptes: 2 });
    expect(verdictCampagne({ mode: 'reel', rubrique: RUBRIQUE_REFERENCE, resultats: campagne({ notes: 3 }) })).toMatchObject({ statut: 'NON_CONFORME' });
  });

  it('un oracle cassé fait échouer SON cas et la campagne', () => {
    const v = verdictCampagne({ mode: 'reel', rubrique: RUBRIQUE_REFERENCE, resultats: campagne({ notes: 2, casse: 'F17' }) });
    expect(v).toMatchObject({ statut: 'NON_CONFORME', casEchoues: ['F17'], approuvable: false });
  });

  it('un cas manquant ou non évaluable : INCOMPLET', () => {
    expect(verdictCampagne({ mode: 'reel', rubrique: RUBRIQUE_REFERENCE, resultats: campagne({ notes: 2, manque: 'F24' }) })).toMatchObject({ statut: 'INCOMPLET', approuvable: false });
    expect(verdictCampagne({ mode: 'reel', rubrique: RUBRIQUE_REFERENCE, resultats: campagne({ notes: 2, nonEvaluable: 'F10' }) })).toMatchObject({ statut: 'INCOMPLET', casIncomplets: ['F10'] });
  });

  it('SIMULÉ : même parfait, jamais approuvable ni évaluation réelle', () => {
    const v = verdictCampagne({ mode: 'simule', rubrique: RUBRIQUE_REFERENCE, resultats: campagne({ notes: 2 }) });
    expect(v).toMatchObject({ statut: 'CONFORME', approuvable: false, evaluationReelle: false });
    expect(v.motifs.join(' ')).toMatch(/SIMULÉE/);
  });
});

/* ── mode réel ───────────────────────────────────────────────────────────── */

describe('garde du mode réel', () => {
  const devis = devisAgrege(plans(['F04', 'F17', 'F21']), TARIFS);
  if (!devis.ok) throw new Error('devis de test non chiffrable');
  const maintenant = new Date('2026-10-08T10:00:00Z');
  const approbation = { id: 'ap1', releaseId: 'r1', releaseHash: 'h1', devisEmpreinte: devis.empreinte, budgetUsdMicros: 2_000_000, approuvePar: 'u', le: '2026-10-08T09:00:00Z', expireLe: '2026-10-09T09:00:00Z', consommee: false };
  const ok: EtatReel = {
    budgetBrut: '1.5', devis, plafond: { capUsd: 10, depenseUsd: 1, bloque: false }, approbation,
    release: { id: 'r1', hash: 'h1', executable: true, motif: null }, executeurs: { manques: [] }, maintenant,
  };
  const codes = (e: Partial<EtatReel>) => { const r = autoriserCampagneReelle({ ...ok, ...e }); return r.ok ? [] : r.refus.map((c) => c.code); };

  it('les trois conditions réunies : autorisé, avec le budget en micro-dollars', () => {
    expect(devis.totalUsdMicros).toBe(528_000);
    expect(autoriserCampagneReelle(ok)).toEqual({ ok: true, budgetUsdMicros: 1_500_000, approbationId: 'ap1' });
  });
  it('sans budget, budget illisible', () => {
    expect(codes({ budgetBrut: undefined })).toEqual(['BUDGET_ABSENT']);
    expect(codes({ budgetBrut: '-3' })).toEqual(['BUDGET_INVALIDE']);
    expect(codes({ budgetBrut: '0' })).toEqual(['BUDGET_INVALIDE']);
  });
  it('budget inférieur au devis agrégé', () => {
    expect(codes({ budgetBrut: '0.5' })).toEqual(['BUDGET_INFERIEUR_AU_DEVIS']);
    expect(codes({ budgetBrut: '0.528' })).toEqual([]);
  });
  it('budget au-delà du reste du plafond AI_SPEND_CAP_USD, plafond atteint', () => {
    expect(codes({ plafond: { capUsd: 2, depenseUsd: 1, bloque: false } })).toEqual(['BUDGET_AU_DELA_DU_PLAFOND']);
    expect(codes({ plafond: { capUsd: 2, depenseUsd: 2, bloque: true } })).toEqual(['PLAFOND_ATTEINT']);
  });
  it('sans approbation, ou approbation qui ne vise pas exactement cette campagne', () => {
    expect(codes({ approbation: null })).toEqual(['APPROBATION_ABSENTE']);
    expect(codes({ approbation: { ...approbation, consommee: true } })).toEqual(['APPROBATION_CONSOMMEE']);
    expect(codes({ approbation: { ...approbation, expireLe: '2026-10-08T09:59:59Z' } })).toEqual(['APPROBATION_EXPIREE']);
    expect(codes({ approbation: { ...approbation, devisEmpreinte: 'autre' } })).toEqual(['APPROBATION_AUTRE_DEVIS']);
    expect(codes({ approbation: { ...approbation, releaseHash: 'h2' } })).toEqual(['APPROBATION_AUTRE_RELEASE']);
    expect(codes({ approbation: { ...approbation, budgetUsdMicros: 1_000_000 } })).toEqual(['APPROBATION_BUDGET_INFERIEUR']);
  });
  it('devis non chiffrable, release non exécutable, exécuteur manquant · tous les motifs dits', () => {
    const complet = devisAgrege(plans(), TARIFS);
    expect(codes({ devis: complet })).toEqual(['DEVIS_NON_CHIFFRABLE', 'APPROBATION_AUTRE_DEVIS']);
    expect(codes({ release: { id: 'r1', hash: 'h1', executable: false, motif: 'staged' } })).toEqual(['RELEASE_NON_EXECUTABLE']);
    expect(codes({ executeurs: { manques: ['image_generation'] } })).toEqual(['EXECUTEUR_NON_BRANCHE']);
    expect(codes({ budgetBrut: undefined, approbation: null })).toEqual(['BUDGET_ABSENT', 'APPROBATION_ABSENTE']);
  });
  it('arrêt AVANT l’appel qui ferait dépasser le budget', () => {
    expect(peutLancer(0, 132_000, 264_000)).toBe(true);
    expect(peutLancer(132_000, 132_000, 264_000)).toBe(true);
    expect(peutLancer(132_001, 132_000, 264_000)).toBe(false);
    expect(peutLancer(0, null, 264_000)).toBe(false);
    expect(lireBudgetUsd('2,50')).toEqual({ ok: true, micros: 2_500_000 });
  });
});

/* ── rapport ─────────────────────────────────────────────────────────────── */

describe('un rapport simulé ne vaut jamais évaluation réelle', () => {
  const resultats = campagne({ notes: 2 });
  const corps = (mode: 'simule' | 'reel'): Omit<RapportCampagne, 'empreinte'> => ({
    format: FORMAT_RAPPORT, mode, banniere: banniere(mode), horodatage: '2026-10-08T10:00:00Z', release: { id: 'r1', hash: 'h1' }, modele: 'm', adaptateur: 'a',
    devis: { chiffrable: true, totalUsdMicros: 1, empreinte: 'e', nonChiffrables: [] }, budget: { usdMicros: null, approbationId: null }, depenseUsdMicros: 0, arrete: null,
    cas: resultats.map((r) => ({ cas: r.cas, statut: r.statut, motif: r.motif, invariants: r.invariants, fiche: !!r.fiche, runIds: [], dossier: r.cas })),
    verdict: verdictCampagne({ mode, rubrique: RUBRIQUE_REFERENCE, resultats }),
  });
  const runsReels = { attendus: 10, trouves: 10, reels: 10, autreRelease: 0 };
  const release = { id: 'r1', hash: 'h1' };

  it('simulé : refusé (RAPPORT_SIMULE, VERDICT_NON_CONFORME)', () => {
    const c = refusEvaluationReelle(sceller(corps('simule')), release, runsReels).map((x) => x.code);
    expect(c).toEqual(['RAPPORT_SIMULE', 'VERDICT_NON_CONFORME']);
  });
  it('mode réécrit à la main : empreinte cassée', () => {
    const r = { ...sceller(corps('simule')), mode: 'reel' as const };
    expect(refusEvaluationReelle(r, release, runsReels).map((x) => x.code)).toContain('RAPPORT_ALTERE');
  });
  it('rapport réel resscellé sur des traces simulées : refusé', () => {
    expect(refusEvaluationReelle(sceller(corps('reel')), release, { ...runsReels, reels: 0 }).map((x) => x.code)).toEqual(['TRACES_SIMULEES']);
  });
  it('réel conforme, traces réelles de cette release : accepté', () => {
    expect(refusEvaluationReelle(sceller(corps('reel')), release, runsReels)).toEqual([]);
    expect(refusEvaluationReelle(sceller(corps('reel')), { id: 'r1', hash: 'h2' }, runsReels).map((x) => x.code)).toEqual(['RELEASE_DIFFERENTE']);
  });
});

describe('pixels', () => {
  it('comparaison sous masque et boîte englobante', () => {
    const a = rectangle(imageVide(20, 10, [255, 255, 255, 255]), 0, 0, 5, 5, [0, 0, 0, 255]);
    const masque = rectangle(imageVide(20, 10, [0, 0, 0, 255]), 10, 0, 10, 10, [255, 255, 255, 255]);
    const b = etoile(copier(a), 15, 5, 4, [255, 0, 0, 255]);
    expect(comparerSousMasque(a, b, masque)).toMatchObject({ horsMasque: 0 });
    expect(comparerSousMasque(a, b, masque)!.dansMasque).toBeGreaterThan(10);
    b.pixels[0] = 1;
    expect(comparerSousMasque(a, b, masque)!.horsMasque).toBe(1);
    const p = redimensionner(rectangle(imageVide(10, 10), 0, 0, 10, 10, [1, 2, 3, 255]), 594, 20);
    expect(boiteOpaque(p)).toEqual({ x: 0, y: 0, largeur: 594, hauteur: 20 });
  });
});
