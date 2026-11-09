import { describe, expect, it } from 'vitest';
import {
  EFFET_POURQUOI, LIBELLE_CHOIX_VARIABLE, MESURE_EXTRACTION_JARVIS, RAISON_AUCUNE_ADMISE, RAISON_AUTRE_SANS_PUB, RAISON_POURQUOI_SANS_PUB, VARIABLES_ECRAN,
  candidatsIterationProjet, dejaTesteesSurPub, gesteIterationProjet, iterationDepuisReponse, lienIterationJarvis, lireGesteIteration, mesurerExtractionJarvis,
  ordreVariablesSuivantes, preparationAutreVariable, questionPourquoi, suiteReponseJarvis, variableDesignee, variableSuivante, variablesIteration,
  type CandidatIteration, type ChoixVariablesIteration, type TestedVariable,
} from '../src';
import { CORPUS_CONTROLE_JARVIS, CORPUS_REPONSES_JARVIS } from './fixtures/jarvis-reponses';

/**
 * Lot 5 ter V5 · Jarvis, la suite · la RÈGLE pure.
 *  · l'ORDRE de la variable suivante (« Autre variable », G07) · admises
 *    seulement, jamais testées d'abord, le conseil du plan en tête, puis le
 *    tunnel après la désignée · sans suite, la raison ;
 *  · « Pourquoi ? » · une question sur la pub de départ, préparée seulement ;
 *  · le panneau d'un projet (E35) · le geste n'existe que si une variante
 *    gagnante est désignée SÛREMENT ;
 *  · le banc de mesure · le tableau du module est refait ici.
 */

const AD1 = '22222222-2222-4222-8222-222222222222';
const AD2 = '33333333-3333-4333-8333-333333333333';
const LOT = '11111111-1111-4111-8111-111111111111';
const REP = '55555555-5555-4555-8555-555555555555';
const PROJ = '66666666-6666-4666-8666-666666666666';

/** Une gagnante · le plan propose `propose`, gèle `gel`, sa lignée a changé `lignee`. */
const choix = (o: { adId?: string; propose?: TestedVariable; gel?: TestedVariable[]; lignee?: TestedVariable[] } = {}): ChoixVariablesIteration => variablesIteration({
  adId: o.adId ?? AD1, verdict: 'winner', comparable: true, lignee: o.lignee ?? [],
  propositions: [{ variable: o.propose ?? 'offer', mode: 'more', freeze: o.gel ?? [], stage: 'hook', edgeLegal: true }],
});
const cand = (c: ChoixVariablesIteration, dejaTestees: TestedVariable[] = [], variante = 'V1'): CandidatIteration => ({ adId: c.adId, variante, variables: c, dejaTestees });

describe('« Autre variable » · l’ordre de la variable suivante', () => {
  it('le conseil du plan en tête, puis le tunnel juste après la désignée, en boucle · seules les admises, jamais la désignée', () => {
    const c = choix({ propose: 'offer' });
    const admises = c.options.filter((o) => o.admise).map((o) => o.variable);
    expect(admises, 'préalable · angle, désir et témoin fermés').not.toContain('angle');
    const ordre = ordreVariablesSuivantes(c, 'format');
    expect(ordre[0], 'le conseil du plan d’abord').toBe('offer');
    expect(ordre.slice(1, 4), 'puis le tunnel après « format »').toEqual(['body', 'length', 'audio']);
    expect(ordre.at(-1), 'en boucle · le visuel d’ouverture revient en dernier').toBe('opening_visual');
    expect(ordre).not.toContain('format');
    expect(new Set(ordre)).toEqual(new Set(admises.filter((v) => v !== 'format')));
    expect(ordreVariablesSuivantes(c, 'offer')[0], 'la désignée EST le conseil · la suivante du tunnel').toBe('landing');
  });

  it('ce qui a déjà été testé sur la pub passe après · la variable testée et la lignée', () => {
    const c = choix({ propose: 'offer', lignee: ['body'] });
    const deja = dejaTesteesSurPub('length', ['body']);
    expect(deja).toEqual(['length', 'body']);
    const ordre = ordreVariablesSuivantes(c, 'format', deja);
    expect(ordre.slice(0, 2)).toEqual(['offer', 'audio']);
    expect(ordre.slice(-2), 'les déjà testées, dans l’ordre du tunnel').toEqual(['body', 'length']);
    expect(dejaTesteesSurPub('pas une variable', []), 'une colonne libre ne compte pas').toEqual([]);
    expect(ordreVariablesSuivantes(choix({ propose: 'offer' }), 'none_control')[1], 'le témoin · le tunnel depuis le début').toBe('hook');
  });

  it('une variable désignée mais fermée (structurelle) · la suivante est la première admise', () => {
    const s = variableSuivante(cand(choix({ propose: 'hook' })), 'angle');
    expect(s.variable, 'le conseil du plan').toBe('hook');
  });

  it('cas sans suite · la raison, aucune variable', () => {
    // Tout est gelé sauf l'accroche (proposée) · la seule admise est celle que Jarvis désigne.
    const gel = VARIABLES_ECRAN.filter((v) => v !== 'hook');
    const c = choix({ propose: 'hook', gel });
    expect(c.options.filter((o) => o.admise).map((o) => o.variable), 'préalable · une seule admise').toEqual(['hook']);
    const s = variableSuivante(cand(c), 'hook');
    expect(s.variable).toBeNull();
    expect(s.variable === null && s.raison).toBe('aucune autre variable n’est admise pour V1 · les autres sont acquises, structurelles ou déjà essayées assez de fois.');
    const ferme = variablesIteration({ adId: AD1, verdict: 'winner', comparable: true, lignee: ['hook', 'hook', 'hook'], propositions: [{ variable: 'hook', mode: 'more', freeze: gel, stage: 'hook', edgeLegal: true }] });
    const f = variableSuivante(cand(ferme), 'hook');
    expect([f.variable, f.variable === null && f.raison]).toEqual([null, RAISON_AUCUNE_ADMISE]);
  });
});

describe('les gestes de la suite sous une réponse · « Autre variable » et « Pourquoi ? »', () => {
  const ctx = { type: 'lot' as const, id: LOT };
  const c1 = cand(choix({ adId: AD1, propose: 'offer' }), ['hook'], 'V1');
  const c2 = cand(choix({ adId: AD2, propose: 'offer' }), [], 'V2');

  it('une variable désignée · le lien vers Itérer (`autre=1`), libellé de la suivante · « Pourquoi ? » prépare la question', () => {
    const r = suiteReponseJarvis({ texte: 'La V1 gagne. Teste une nouvelle accroche.', reponse: REP, contexte: ctx, candidats: [c1] })!;
    expect(r.autre).toEqual({ libelle: `Autre variable · ${LIBELLE_CHOIX_VARIABLE.offer}`, href: lienIterationJarvis(ctx, REP, { autre: true }), variable: 'offer' });
    expect(new URL(`http://x${(r.autre as { href: string }).href}`).searchParams.get('autre')).toBe('1');
    expect(r.pourquoi).toEqual({ question: 'Pourquoi la variante « V1 » a-t-elle gagné, et pourquoi changer l’accroche plutôt qu’une autre variable ? Appuie-toi sur ses chiffres.' });
    expect(EFFET_POURQUOI).toMatch(/rien n’est envoyé sans ton clic/);
  });

  it('aucune variable désignée · « Autre variable » absent (rien à proposer) · « Pourquoi ? » sur la pub seule', () => {
    const r = suiteReponseJarvis({ texte: 'Bravo, la V1 coûte deux fois moins par achat.', reponse: REP, contexte: ctx, candidats: [c1] })!;
    expect(r.autre).toBeNull();
    expect(r.pourquoi).toEqual({ question: 'Pourquoi la variante « V1 » a-t-elle gagné ? Qu’est-ce qui, dans ses chiffres, l’explique ?' });
    expect(suiteReponseJarvis({ texte: 'Teste une accroche et une offre.', reponse: REP, contexte: ctx, candidats: [c1] })!.autre, 'plusieurs variables · aucune désignée').toBeNull();
  });

  it('pas de pub de départ sûre · les deux disent pourquoi', () => {
    const r = suiteReponseJarvis({ texte: 'Teste une nouvelle accroche.', reponse: REP, contexte: ctx, candidats: [c1, c2] })!;
    expect(r.autre).toEqual({ raison: RAISON_AUTRE_SANS_PUB });
    expect(r.pourquoi).toEqual({ raison: RAISON_POURQUOI_SANS_PUB });
    expect(suiteReponseJarvis({ texte: 'Décline la V2 avec une accroche.', reponse: REP, contexte: ctx, candidats: [c1, c2] })!.pourquoi).toMatchObject({ question: expect.stringContaining('« V2 »') });
  });

  it('sans suite · la phrase dit pourquoi, aucun lien', () => {
    const seule = cand(choix({ propose: 'hook', gel: VARIABLES_ECRAN.filter((v) => v !== 'hook') }));
    const r = suiteReponseJarvis({ texte: 'Teste une nouvelle accroche.', reponse: REP, contexte: ctx, candidats: [seule] })!;
    expect(r.autre).toEqual({ raison: 'Aucune autre variable n’est admise pour V1 · les autres sont acquises, structurelles ou déjà essayées assez de fois.' });
  });

  it('réponse sans identifiant lisible, contexte sans Itérer · aucun geste', () => {
    expect(suiteReponseJarvis({ texte: 'Teste une accroche.', reponse: 'local-1', contexte: ctx, candidats: [c1] })).toBeNull();
    expect(suiteReponseJarvis({ texte: 'Teste une accroche.', reponse: REP, contexte: { type: 'resultats', id: 'ensemble' }, candidats: [c1] })).toBeNull();
  });

  it('injection · la question ne reprend que le code fermé, nettoyé', () => {
    const q = questionPourquoi({ variante: 'V1 — [[x]] https://p.example' }, null);
    expect(q).not.toMatch(/—|\[\[|https?:/);
    expect(questionPourquoi({ variante: 'V1' }, 'none_control'), 'le témoin n’est pas une variable à changer').not.toMatch(/changer/);
  });

  it('Itérer par « Autre variable » · la pub par la même règle, la suivante cochée, la note le dit', () => {
    const p = preparationAutreVariable('La V1 gagne. Teste une nouvelle accroche.', [c1]);
    expect([p.adId, p.variable]).toEqual([AD1, 'offer']);
    expect(p.note).toBe('Préparé depuis Jarvis · pub de départ · V1, la seule gagnante du contexte · Autre variable · Offre, à la place de l’accroche que Jarvis proposait. Rien n’est créé sans ton clic sur « Créer l’itération ».');
    const rien = preparationAutreVariable('Bravo.', [c1]);
    expect([rien.adId, rien.variable]).toEqual([AD1, null]);
    expect(rien.note).toMatch(/la réponse ne désigne aucune variable, il n’y a pas de suivante · rien n’est coché/);
    expect(preparationAutreVariable('Teste une accroche.', [c1, c2]).adId, 'pub ambiguë · rien').toBeNull();
  });
});

describe('le panneau Jarvis d’un projet · « Créer l’itération » seulement sur une variante désignée sûrement (E35)', () => {
  const variante = (id: string, libelle: string, adId: string, validated: 'winner' | 'loser' | null, comparable = true) => ({ id, libelle, test: { adsmapAdId: adId, variable: 'hook', verdict: validated === null ? null : { validated, comparable } } });
  const cands = candidatsIterationProjet([
    variante('va', 'Image 1 du lot 1', AD1, 'winner'),
    variante('vb', 'Image 2 du lot 1', AD2, 'winner'),
    variante('vc', 'Image 3 du lot 1', '77777777-7777-4777-8777-777777777777', 'loser'),
    variante('vd', 'Image 1 du lot 2', '88888888-8888-4888-8888-888888888888', 'winner', false),
    variante('ve', 'Image 4 du lot 1', AD1, 'winner'),
  ]);
  it('les candidates · les gagnantes arbitrées comparables, une fois par pub', () => {
    expect(cands.map((c) => c.libelle)).toEqual(['Image 1 du lot 1', 'Image 2 du lot 1']);
  });
  it('nommée seule · le geste, lien vers Itérer avec le projet joint', () => {
    const g = gesteIterationProjet({ texte: 'L’image 2 du lot 1 gagne. Décline-la en testant une autre offre.', reponse: REP, projectId: PROJ, candidats: cands })!;
    expect(g).toEqual({ libelle: 'Créer l’itération', href: lienIterationJarvis({ type: 'projet', id: PROJ }, REP), varianteId: 'vb', variante: 'Image 2 du lot 1' });
    expect(lireGesteIteration(Object.fromEntries(new URL(`http://x${g.href}`).searchParams))).toEqual({ etat: 'ok', reponse: REP, contexte: { type: 'projet', id: PROJ } });
  });
  it('rien de sûr · aucun geste', () => {
    for (const texte of [
      'Teste une autre offre.', // deux gagnantes, aucune nommée
      'L’image 1 du lot 1 et l’image 2 du lot 1 se valent.', // deux nommées
      'Ta direction artistique est solide, le brief est complet.',
      'Décline l’image 3 du lot 1.', // perdante · hors de la liste
      'Décline l’image 1 du lot 12.', // un autre nom
    ]) expect(gesteIterationProjet({ texte, reponse: REP, projectId: PROJ, candidats: cands }), texte).toBeNull();
    const une = [cands[0]!];
    expect(gesteIterationProjet({ texte: 'Ton brief manque d’une cible précise.', reponse: REP, projectId: PROJ, candidats: une }), 'la seule gagnante, sans conseil · rien').toBeNull();
    expect(gesteIterationProjet({ texte: 'Teste une nouvelle accroche sur ta gagnante.', reponse: REP, projectId: PROJ, candidats: une })?.varianteId, 'la seule gagnante ET un conseil').toBe('va');
    expect(gesteIterationProjet({ texte: 'Teste une accroche.', reponse: 'local-1', projectId: PROJ, candidats: une }), 'réponse en cours d’écriture').toBeNull();
    expect(gesteIterationProjet({ texte: 'Teste une accroche.', reponse: REP, projectId: PROJ, candidats: [] })).toBeNull();
  });
});

describe('une AUTRE variante du contexte nommée seule · aucune gagnante prise d’office à sa place', () => {
  const c1 = cand(choix({ adId: AD1 }), [], 'V1');
  it('la perdante nommée dans le conseil · rien de présélectionné, la note le dit', () => {
    const r = iterationDepuisReponse('La V2 perd. Décline la V2 en testant un autre format.', [c1], { exclus: ['V2'] });
    expect([r.adId, r.variable]).toEqual([null, null]);
    expect(r.note).toMatch(/Jarvis parle de V2, qui n’est pas une gagnante arbitrée de ce contexte · rien n’est présélectionné/);
    expect(iterationDepuisReponse('La V2 perd. Décline la V1 en testant un autre format.', [c1], { exclus: ['V2'] }).adId, 'la gagnante nommée dans le conseil').toBe(AD1);
    expect(iterationDepuisReponse('La V1 gagne, la V2 perd : teste un autre format.', [c1], { exclus: ['V2'] }).adId, 'les deux nommées dans le même conseil · rien').toBeNull();
    expect(iterationDepuisReponse('Teste un autre format.', [c1], { exclus: ['V2'] }).adId, 'aucune nommée · la seule gagnante').toBe(AD1);
  });
});

describe('adresse « Autre variable » · rien du modèle n’y entre', () => {
  it('`autre=1` seulement · une autre valeur refuse l’adresse entière', () => {
    expect(lireGesteIteration({ reponse: REP, contexte: 'lot', id: LOT, autre: '1' })).toEqual({ etat: 'ok', reponse: REP, contexte: { type: 'lot', id: LOT }, autre: true });
    for (const a of ['0', 'oui', 'offer', '']) expect(lireGesteIteration({ reponse: REP, contexte: 'lot', id: LOT, autre: a }), a).toEqual({ etat: 'refus' });
    expect(lienIterationJarvis({ type: 'lot', id: LOT }, REP, { autre: true })).toBe(`/studio/iterer?reponse=${REP}&contexte=lot&id=${LOT}&autre=1`);
  });
});

describe('banc de mesure · le tableau du module est celui que l’extraction donne', () => {
  const table = (m: ReturnType<typeof mesurerExtractionJarvis>) => Object.fromEntries([...m.lignes, m.total].map(({ genre, ...x }) => [genre, x]));
  it('corpus de réglage et corpus de contrôle · mesure refaite = `MESURE_EXTRACTION_JARVIS`', () => {
    expect(table(mesurerExtractionJarvis(CORPUS_REPONSES_JARVIS))).toEqual(MESURE_EXTRACTION_JARVIS.reglage);
    expect(table(mesurerExtractionJarvis(CORPUS_CONTROLE_JARVIS))).toEqual(MESURE_EXTRACTION_JARVIS.controle);
  });
  it('aucun pré-choix FAUX sur les deux corpus · le défaut qui coûte', () => {
    for (const c of [CORPUS_REPONSES_JARVIS, CORPUS_CONTROLE_JARVIS]) expect(mesurerExtractionJarvis(c).total.fausse).toBe(0);
  });
  it('une analyse au passé n’est pas un conseil (le défaut mesuré)', () => {
    expect(variableDesignee('La musique tendance n’a rien changé.')).toBeNull();
    expect(variableDesignee('La V1 a changé d’accroche et a gagné.')).toBeNull();
    expect(variableDesignee('Change l’accroche.')).toBe('hook');
    expect(variableDesignee('Teste une durée plus courte.'), 'le participe ne touche pas le vocabulaire (« durée »)').toBe('length');
  });
});
