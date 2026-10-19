import { describe, it, expect } from 'vitest';
import {
  etapeRequiertProjet, etapeStrategieRenseignee, etapeDirectionRenseignee, etatRailProjet,
  changementAngleManuel, changementStyleManuel, changementHypotheseRetenue, briefAvecHypothese,
  demandeAnglesDepuisBrief, demandeDirectionDepuisBrief, construireBriefV5, saisieBriefVide,
  ALLOWED_PATHS_BRIEF,
} from '../src/studios/ux/assistant-projet';
import { validerFormeBrief, type BriefCanonique } from '../src/studios/brief';
import { appliquerPatch } from '../src/studios/patch';
import type { HypotheseTest } from '../src/studios/sources/hypotheses';

/**
 * Raccord V5 · Lot 2b · les règles PURES des étapes stratégie et direction, au
 * RÉSULTAT. On vérifie ce que les fonctions RENDENT (complétude mesurée sur le
 * brief relu, et surtout que le CHANGEMENT produit s'applique VRAIMENT au brief
 * et donne un brief bien formé · un appel n'est jamais pris pour un résultat).
 * Chaque assertion a été éprouvée par mutation (note en fin de fichier).
 */

const base = (): BriefCanonique => construireBriefV5({ ...saisieBriefVide(), intention: 'Vendre les lunettes aux parents', audience: 'Parents' });

const hyp = (sourceIds: string[]): HypotheseTest => ({
  id: 'hyp_1',
  statement: 'Montrer le plongeon augmente le clic',
  sourceIds,
  variable: 'accroche',
  control: 'accroche produit',
  treatment: 'accroche émotion',
  invariants: [],
  metric: 'CTR',
  decisionRule: 'garder si +10 %',
  limitations: ['échantillon court'],
});

/** Applique un changement de proposition comme le ferait le serveur, borné à /brief. */
const appliquer = (brief: BriefCanonique, changement: unknown) =>
  appliquerPatch({ brief } as Record<string, unknown>, [changement], ALLOWED_PATHS_BRIEF);

describe('périmètre · stratégie/direction opèrent sur un projet créé', () => {
  it('etapeRequiertProjet · vrai après le brief, faux avant', () => {
    expect(etapeRequiertProjet('start')).toBe(false);
    expect(etapeRequiertProjet('brief')).toBe(false);
    expect(etapeRequiertProjet('strategie')).toBe(true);
    expect(etapeRequiertProjet('direction')).toBe(true);
    expect(etapeRequiertProjet('format')).toBe(true);
  });
});

describe('complétude mesurée sur le brief RELU (restitution)', () => {
  it('stratégie renseignée · un angle OU une hypothèse retenue', () => {
    expect(etapeStrategieRenseignee(base())).toBe(false);
    expect(etapeStrategieRenseignee({ ...base(), angle: 'Le premier plongeon' })).toBe(true);
    expect(etapeStrategieRenseignee({ ...base(), hypothesisId: 'hyp_1' })).toBe(true);
    // un angle vide (espaces) ne compte pas
    expect(etapeStrategieRenseignee({ ...base(), angle: '   ' })).toBe(false);
  });

  it('direction renseignée · une intention de style écrite', () => {
    expect(etapeDirectionRenseignee(base())).toBe(false);
    expect(etapeDirectionRenseignee({ ...base(), styleIntent: 'Lumière douce, été' })).toBe(true);
  });

  it('état du rail · une étape renseignée est « done », même courante ailleurs', () => {
    const renseigne = { ...base(), angle: 'A', styleIntent: 'S' };
    expect(etatRailProjet('strategie', 'direction', renseigne)).toBe('done');
    expect(etatRailProjet('strategie', 'direction', base())).toBe('done'); // positionnel : strategie < direction
    // courante = strategie, non renseignée · reste current (pas « done » fabriqué)
    expect(etatRailProjet('strategie', 'strategie', base())).toBe('current');
    // sans brief relu, l'état reste positionnel
    expect(etatRailProjet('direction', 'strategie', null)).toBe('todo');
    expect(etatRailProjet('format', 'strategie', renseigne)).toBe('todo'); // format est câblé (Lot 2c), positionnel à venir
    expect(etatRailProjet('creation', 'strategie', renseigne)).toBe('bientot'); // creation reste « bientôt »
  });
});

describe('« écrire mon angle » · un CHANGEMENT qui s’applique vraiment', () => {
  it('angle absent · `add`, et le brief obtenu porte l’angle et reste bien formé', () => {
    const b = base();
    expect('angle' in b).toBe(false);
    const ch = changementAngleManuel(b, '  Le premier plongeon  ');
    expect(ch).toMatchObject({ op: 'add', path: '/brief/angle', newValue: 'Le premier plongeon' });
    const r = appliquer(b, ch);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const brief = (r.resultat as { brief: BriefCanonique }).brief;
    expect(brief.angle).toBe('Le premier plongeon');
    expect(validerFormeBrief(brief)).toEqual([]);
  });

  it('angle présent · `replace` (un `add` serait refusé par le serveur)', () => {
    const b = { ...base(), angle: 'Ancien angle' };
    const ch = changementAngleManuel(b, 'Nouvel angle');
    expect(ch.op).toBe('replace');
    const r = appliquer(b, ch);
    expect(r.ok && (r.resultat as { brief: BriefCanonique }).brief.angle).toBe('Nouvel angle');
  });
});

describe('« écrire le style » · styleIntent (toujours présent) → replace', () => {
  it('le brief obtenu porte le style et reste bien formé', () => {
    const ch = changementStyleManuel('Lumière douce, palette pastel');
    expect(ch).toMatchObject({ op: 'replace', path: '/brief/styleIntent' });
    const r = appliquer(base(), ch);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const brief = (r.resultat as { brief: BriefCanonique }).brief;
    expect(brief.styleIntent).toBe('Lumière douce, palette pastel');
    expect(etapeDirectionRenseignee(brief)).toBe(true);
    expect(validerFormeBrief(brief)).toEqual([]);
  });
});

describe('« retenir une hypothèse » · sourceIds préservés, forme valide', () => {
  it('le brief obtenu porte hypothesisId, la variable et les faits avec LEURS sourceIds', () => {
    const b = base();
    const h = hyp(['src-neva-1', 'src-neva-2']);
    const nouveau = briefAvecHypothese(b, h);
    expect(nouveau.hypothesisId).toBe('hyp_1');
    expect(nouveau.testedVariable).toBe('accroche');
    expect(nouveau.variables).toContain('accroche');
    const faitPrincipal = nouveau.facts.find((f) => f.id === 'hyp_1');
    expect(faitPrincipal?.kind).toBe('hypothesis');
    // les sourceIds de l'hypothèse sont PRÉSERVÉS tels quels (pas de fuite, pas d'invention)
    expect(faitPrincipal?.sourceIds).toEqual(['src-neva-1', 'src-neva-2']);
    expect(nouveau.facts.every((f) => f.sourceIds.every((s) => h.sourceIds.includes(s)))).toBe(true);
    expect(validerFormeBrief(nouveau)).toEqual([]);

    // et le changement correspondant s'applique au brief
    const r = appliquer(b, changementHypotheseRetenue(b, h));
    expect(r.ok && (r.resultat as { brief: BriefCanonique }).brief.hypothesisId).toBe('hyp_1');
  });

  it('ré-appliquer la même hypothèse ne duplique pas ses faits de protocole', () => {
    const h = hyp(['s1']);
    const une = briefAvecHypothese(base(), h);
    const deux = briefAvecHypothese(une, h);
    const protocole = deux.facts.filter((f) => f.id.startsWith('hyp_1'));
    expect(protocole.length).toBe(une.facts.filter((f) => f.id.startsWith('hyp_1')).length);
  });
});

describe('demandes Jarvis par défaut · dérivées du brief, bornées', () => {
  it('les angles reprennent objectif, audience et angle actuel', () => {
    const d = demandeAnglesDepuisBrief({ ...base(), angle: 'Le plongeon' });
    expect(d).toContain('Objectif : Vendre les lunettes aux parents');
    expect(d).toContain('Audience : Parents');
    expect(d).toContain('Angle actuel à dépasser : Le plongeon');
  });

  it('la direction reprend angle, concept et style actuel', () => {
    const d = demandeDirectionDepuisBrief({ ...base(), angle: 'A', concept: 'C', styleIntent: 'S' });
    expect(d).toContain('Angle : A');
    expect(d).toContain('Concept : C');
    expect(d).toContain('Style actuel à faire évoluer : S');
  });
});

/*
 * Mutations éprouvées (cassées → test rouge sur la bonne assertion → restaurées) :
 *  · changementAngleManuel forçant op:'replace' quand l'angle est absent → le serveur
 *    refuse (appliquerPatch rend ok:false) · « angle absent · add » tombe.
 *  · briefAvecHypothese remplaçant les sourceIds par [] → « sourceIds préservés » tombe.
 *  · etapeStrategieRenseignee ne regardant que l'angle (pas hypothesisId) → le cas hypothèse tombe.
 *  · etatRailProjet ignorant le brief relu → « étape renseignée est done » tombe (rendrait 'todo').
 */
