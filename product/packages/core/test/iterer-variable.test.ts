import { describe, expect, it } from 'vitest';
import {
  boucleIterationLots, hypotheseParDefaut, iterationDepuisPrompt, iterationPlan, lienIterationVariable, lienPreparationIteration, lireIterationDemandee,
  lireContexteNouveauProjet, lireValeurVariable, lireVariableChoisie, lireVariableDemandee, noeudsIterationProjet, noteDemandeIteration, parentDepuisPlan,
  raisonGelee, raisonStructurelle, raisonUsee, variableInitiale, variablesDuPlan, variablesIteration, verifierChoixVariable,
  RAISON_AUCUNE_ADMISE, RAISON_HORS_PLAN, RAISON_NON_GAGNANTE, RAISON_TEMOIN, RAISON_UNE_SEULE, RAISON_VALEUR_MANQUANTE, RAISON_VARIABLE_INCONNUE,
  VARIABLES_ECRAN, VIDE_ITERATION_SANS_ADSMAP, VIDE_ITERATION_SANS_GAGNANTE,
  type IterationInput, type LignePlanVariable, type ParentIteration, type TestedVariable,
} from '../src/index';

/**
 * Lot 2 · itérer en CHOISISSANT la variable. La règle est lue sur le plan
 * d’itération RÉEL du moteur (`iterationPlan`), pas sur des propositions écrites
 * à la main · ce que l’écran admet est ce que le moteur tient pour libre.
 */

const plan = (e: Partial<IterationInput> & { adId: string }): LignePlanVariable[] =>
  iterationPlan([{ label: e.adId, verdict: 'winner', comparable: true, failedStage: null, ...e }]).map((t) => ({
    adId: t.adId, changedVariable: t.changedVariable, mode: t.mode, freeze: t.freeze, stageTargeted: t.stageTargeted, edgeLegal: t.edgeLegal,
    parentVerdict: e.verdict ?? 'winner', parentComparable: e.comparable ?? true, lineageChanged: e.lineageChanged ?? [],
  }));
const parent = (e: Partial<IterationInput> & { adId: string }): ParentIteration => parentDepuisPlan(plan(e), e.adId)!;
const admises = (p: ParentIteration) => variablesIteration(p).options.filter((o) => o.admise).map((o) => o.variable);
const option = (p: ParentIteration, v: TestedVariable) => variablesIteration(p).options.find((o) => o.variable === v)!;

describe('variables admises pour une gagnante', () => {
  it('une gagnante prouvée · tout ce que le moteur laisse libre est admis, l’accroche et l’offre gelées, angle et désir structurels', () => {
    const p = parent({ adId: 'g' });
    expect(admises(p)).toEqual(['opening_visual', 'format', 'body', 'length', 'audio', 'avatar_on_screen', 'proof', 'cta', 'landing']);
    expect(option(p, 'hook')).toMatchObject({ admise: false, motif: 'gelee', raison: raisonGelee('hook') });
    expect(option(p, 'offer')).toMatchObject({ admise: false, motif: 'gelee', raison: raisonGelee('offer') });
    expect(option(p, 'angle')).toMatchObject({ admise: false, motif: 'structurelle', raison: raisonStructurelle('angle') });
    expect(option(p, 'desire')).toMatchObject({ admise: false, motif: 'structurelle' });
    expect(raisonGelee('hook')).toBe('C’est ce qui a gagné · changer l’accroche testerait une autre pub, pas une déclinaison.');
  });

  it('chaque variable fermée porte une raison écrite · aucune admise n’en porte', () => {
    for (const o of variablesIteration(parent({ adId: 'g' })).options) {
      if (o.admise) expect(o.raison, o.variable).toBeNull();
      else expect(o.raison?.length ?? 0, o.variable).toBeGreaterThan(20);
    }
  });

  it('la variable proposée par défaut est celle du plan · « Conseillée » ne marque qu’elle', () => {
    const c = variablesIteration(parent({ adId: 'g' }));
    expect(c.defaut).toBe('opening_visual');
    expect(c.options.filter((o) => o.conseillee).map((o) => o.variable)).toEqual(['opening_visual']);
  });

  it('une variable que la lignée a usée deux fois est fermée, et le défaut passe à la suivante du plan', () => {
    const p = parent({ adId: 'g', lineageChanged: ['opening_visual', 'opening_visual'] });
    expect(option(p, 'opening_visual')).toMatchObject({ admise: false, motif: 'usee', raison: raisonUsee('opening_visual', 2) });
    expect(variablesIteration(p).defaut).toBe('format');
    expect(option(parent({ adId: 'g', lineageChanged: ['format'] }), 'format').admise).toBe(true);
  });

  it('une piste non prouvée (non comparable, perdante) · tout est fermé avec la raison du plan, aucun défaut', () => {
    for (const p of [parent({ adId: 'r', comparable: false }), parent({ adId: 'p', verdict: 'loser', failedStage: 'click' })]) {
      const c = variablesIteration(p);
      expect(c.ferme).toBe(RAISON_NON_GAGNANTE);
      expect(c.defaut).toBeNull();
      expect(c.options.every((o) => !o.admise && o.raison === RAISON_NON_GAGNANTE)).toBe(true);
    }
  });

  it('coût trop élevé sur une gagnante · l’offre redevient admise (le plan la propose) et c’est elle le défaut', () => {
    const p = parent({ adId: 'c', killFlag: 'cost' });
    expect(option(p, 'offer').admise).toBe(true);
    expect(variablesIteration(p).defaut).toBe('offer');
    expect(option(p, 'hook').admise).toBe(false);
  });

  it('tout usé · plus rien d’admis, la phrase le dit', () => {
    const tout = VARIABLES_ECRAN.flatMap((v) => [v, v]);
    const c = variablesIteration(parent({ adId: 'u', lineageChanged: tout }));
    expect(c.options.some((o) => o.admise)).toBe(false);
    expect(c.ferme).toBe(RAISON_AUCUNE_ADMISE);
  });

  it('variablesDuPlan · une entrée par pub, toutes ses propositions lues', () => {
    const rows = [...plan({ adId: 'a' }), ...plan({ adId: 'c', killFlag: 'cost' })];
    const v = variablesDuPlan(rows);
    expect(Object.keys(v)).toEqual(['c', 'a'].sort((x, y) => rows.findIndex((r) => r.adId === x) - rows.findIndex((r) => r.adId === y)));
    expect(v.c!.defaut).toBe('offer');
  });
});

describe('une seule variable à la fois', () => {
  it('deux variables, en liste ou en texte, sont refusées en toutes lettres', () => {
    expect(lireVariableChoisie(['format', 'length'])).toEqual({ ok: false, raison: RAISON_UNE_SEULE });
    expect(lireVariableChoisie('format,length')).toEqual({ ok: false, raison: RAISON_UNE_SEULE });
    expect(lireVariableChoisie('format + length')).toEqual({ ok: false, raison: RAISON_UNE_SEULE });
    expect(RAISON_UNE_SEULE).toBe('Une itération ne change qu’une variable à la fois · choisis-en une seule.');
  });
  it('une seule variable connue passe · le reste est inconnu', () => {
    expect(lireVariableChoisie(' format ')).toEqual({ ok: true, variable: 'format' });
    expect(lireVariableChoisie('typo')).toEqual({ ok: false, raison: RAISON_VARIABLE_INCONNUE });
    expect(lireVariableChoisie(null)).toEqual({ ok: false, raison: RAISON_VARIABLE_INCONNUE });
    expect(lireVariableChoisie({ variable: 'format' })).toEqual({ ok: false, raison: RAISON_VARIABLE_INCONNUE });
  });
  it('le serveur rejoue la règle · fermée ⇒ la même raison qu’à l’écran ; admise ⇒ mode et étape', () => {
    const p = parent({ adId: 'g' });
    const c = variablesIteration(p);
    expect(verifierChoixVariable(c, p, 'hook')).toEqual({ ok: false, raison: raisonGelee('hook') });
    expect(verifierChoixVariable(c, p, 'none_control')).toEqual({ ok: false, raison: RAISON_TEMOIN });
    expect(verifierChoixVariable(c, p, 'opening_visual')).toEqual({ ok: true, mode: 'more', etape: 'hook' });
    expect(verifierChoixVariable(c, p, 'cta')).toEqual({ ok: true, mode: 'more', etape: 'click' });
    const nc = parent({ adId: 'r', comparable: false });
    expect(verifierChoixVariable(variablesIteration(nc), nc, 'format')).toEqual({ ok: false, raison: RAISON_NON_GAGNANTE });
  });
  it('la valeur est obligatoire et bornée', () => {
    expect(lireValeurVariable('  ')).toEqual({ ok: false, raison: RAISON_VALEUR_MANQUANTE });
    expect(lireValeurVariable(42)).toEqual({ ok: false, raison: RAISON_VALEUR_MANQUANTE });
    expect(lireValeurVariable(' Vidéo   9:16 ')).toEqual({ ok: true, valeur: 'Vidéo 9:16' });
    expect((lireValeurVariable('x'.repeat(400)) as { valeur: string }).valeur).toHaveLength(300);
  });
});

describe('adresses, défauts et départs', () => {
  const AD = '0b8a4f2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
  it('l’adresse porte la pub et la variable, relues bornées', () => {
    const href = lienIterationVariable({ adId: AD.toUpperCase(), variable: 'format' });
    expect(href).toBe(`/studio/iterer?iter=${AD}&variable=format`);
    const sp = Object.fromEntries(new URL(href, 'http://x').searchParams);
    expect(lireIterationDemandee(sp)).toBe(AD);
    expect(lireVariableDemandee(sp)).toBe('format');
    expect(lireVariableDemandee({ variable: 'none_control' })).toBeNull();
    expect(lienIterationVariable({ adId: 'pas-un-id', variable: 'none_control' })).toBe('/studio/iterer');
  });
  it('la variable demandée est cochée si admise · sinon le défaut, et la phrase dit pourquoi', () => {
    const c = variablesIteration(parent({ adId: 'g' }));
    expect(variableInitiale(c, 'length')).toEqual({ variable: 'length', note: null });
    expect(variableInitiale(c, 'hook')).toEqual({ variable: 'opening_visual', note: `Accroche n’est pas admise pour cette pub · ${raisonGelee('hook')}` });
    expect(variableInitiale(c, null)).toEqual({ variable: 'opening_visual', note: null });
  });
  it('l’hypothèse par défaut nomme la variable et la valeur · « si… alors… parce que »', () => {
    expect(hypotheseParDefaut({ titre: 'Concept · V1', variable: 'format', valeur: ' 9:16 ' }))
      .toBe('Si on change seulement le format de Concept · V1 (9:16), alors elle fera au moins aussi bien, parce que tout ce qui a gagné reste intact.');
  });
  it('la préparation reprend le test PARENT et porte la variable choisie dans l’objectif', () => {
    const href = lienPreparationIteration({ parentAdId: AD, code: 'V1-i1', variable: 'format', valeur: '9:16' });
    const c = lireContexteNouveauProjet(Object.fromEntries(new URL(href, 'http://x').searchParams));
    expect(c.iter).toBe(AD);
    expect(c.type).toBe('ads');
    expect(c.objectif).toBe('Itération V1-i1 · on change le format : 9:16');
  });
  it('un prompt ne se lance en itération que s’il vise une variable admissible', () => {
    expect(iterationDepuisPrompt('hook')).toEqual({ href: '/studio/iterer?variable=hook', raison: null });
    expect(iterationDepuisPrompt(null).href).toBeNull();
    expect(iterationDepuisPrompt('angle').raison).toBe('Ce prompt ne vise aucune variable · une itération en change exactement une.');
  });
  it('la pub demandée hors plan est dite, avec sa raison', () => {
    const choix = [{ adId: 'a', selectionnable: true, raison: 'r' }, { adId: 'b', selectionnable: false, raison: RAISON_NON_GAGNANTE }];
    expect(noteDemandeIteration(choix, 'a')).toBeNull();
    expect(noteDemandeIteration(choix, 'b')).toBe(`La pub demandée ne peut pas être itérée ici · ${RAISON_NON_GAGNANTE}`);
    expect(noteDemandeIteration(choix, 'z')).toBe(`La pub demandée ne peut pas être itérée ici · ${RAISON_HORS_PLAN}`);
    expect(noteDemandeIteration(choix, null)).toBeNull();
  });
});

describe('couloir Itération et boucle des lots', () => {
  const vt = (id: string, validated: 'winner' | 'loser' | null, comparable = true) => ({ id, libelle: `Lot 1 · ${id}`, test: { adsmapAdId: `ad-${id}`, verdict: { validated, comparable } } });
  it('un nœud par variante testée GAGNANTE prouvée · son geste ouvre Itérer, pub présélectionnée', () => {
    const r = noeudsIterationProjet([vt('a', 'winner'), vt('b', 'loser'), vt('c', 'winner', false), vt('a2', null), { id: 'x', libelle: 'x', test: null }], { adsmap: true });
    expect(r.vide).toBeNull();
    expect(r.noeuds.map((n) => [n.id, n.titre, n.lien?.libelle, n.lien?.forme])).toEqual([['iterer:ad-a', 'À décliner · Lot 1 · a', 'Itérer · choisir la variable', 'bouton']]);
    expect(r.noeuds[0]!.lien!.href).toBe(lienIterationVariable({ adId: 'ad-a' }));
  });
  it('vide, il dit pourquoi · sans gagnante, sans Résultats, ou sans test (le défaut du couloir)', () => {
    expect(noeudsIterationProjet([vt('b', 'loser')], { adsmap: true })).toEqual({ noeuds: [], vide: VIDE_ITERATION_SANS_GAGNANTE });
    expect(noeudsIterationProjet([vt('a', 'winner')], { adsmap: false })).toEqual({ noeuds: [], vide: VIDE_ITERATION_SANS_ADSMAP });
    expect(noeudsIterationProjet([], { adsmap: true })).toEqual({ noeuds: [], vide: null });
  });
  it('la boucle compte les gagnantes PROUVÉES distinctes du plan · fermée, elle dit pourquoi', () => {
    const rows = [...plan({ adId: 'a' }), ...plan({ adId: 'c', killFlag: 'cost' }), ...plan({ adId: 'n', comparable: false })];
    expect(boucleIterationLots(rows)).toEqual({ libelle: 'Itérer · 2 itérations conseillées', href: '/studio/iterer', raison: null });
    expect(boucleIterationLots(plan({ adId: 'a' })).libelle).toBe('Itérer · 1 itération conseillée');
    expect(boucleIterationLots(plan({ adId: 'n', comparable: false }))).toMatchObject({ href: null, raison: expect.stringMatching(/^Aucune gagnante arbitrée/) });
  });
});
