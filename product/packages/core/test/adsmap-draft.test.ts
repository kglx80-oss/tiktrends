import { describe, it, expect } from 'vitest';
import {
  draftPrompt, reviewDraft, isUsableDraft, MAX_REECRITURES,
  type DraftRequest, type DraftPromptContext,
} from '../src/adsmap/draft';
import type { PrelaunchBrief, PrelaunchFlag } from '../src/adsmap/prelaunch';

const ctx: DraftPromptContext = { brandName: 'TrueFords', memory: '' };

const req = (o: Partial<DraftRequest> = {}): DraftRequest => ({
  origin: 'blank', intent: 'Une créa pour le rangement de garage', ...o,
});

const brief = (flags: PrelaunchFlag[]): PrelaunchBrief => ({
  flags, recommendation: 'go', summary: '',
  score: { band: 'med', pHookOk: 0.4, pConclusiveWin: 0.3, drivers: [], thin: false },
});

const flag = (kind: PrelaunchFlag['kind'], tone: PrelaunchFlag['tone']): PrelaunchFlag => ({
  kind, tone, message: `message ${kind}`,
});

describe('la consigne dit ce qui rend une accroche utilisable', () => {
  it('exige une situation précise, pas une catégorie', () => {
    const p = draftPrompt(req(), ctx);
    expect(p).toContain('situation précise');
    expect(p).toContain('optimise ton espace');
  });

  it('interdit le chiffre inventé et la sur-promesse', () => {
    const p = draftPrompt(req(), ctx);
    expect(p).toContain('chiffre inventé');
    expect(p).toContain('sur-promet');
  });

  it('distingue une hypothèse d’un résumé', () => {
    const p = draftPrompt(req(), ctx);
    expect(p).toContain('n’est pas une hypothèse');
    expect(p).toContain('peut se révéler fausse');
  });

  it('sans mémoire, interdit d’invoquer un résultat passé', () => {
    expect(draftPrompt(req(), ctx)).toContain('n’invoque aucun résultat passé');
  });
});

describe('le gel ferme la consigne · c’est la contrainte qu’un modèle oublie', () => {
  it('il est injecté quand il existe', () => {
    const p = draftPrompt(req({ freeze: ['l’accroche', 'l’angle'] }), ctx);
    expect(p).toContain('INTERDIT DE TOUCHER');
    expect(p).toContain('l’accroche');
    expect(p).toContain('il est faux · recommence');
  });

  it('il passe APRÈS la mission · un modèle retient mieux la fin', () => {
    const p = draftPrompt(req({ intent: 'MISSION_ICI', freeze: ['GEL_ICI'] }), ctx);
    expect(p.indexOf('GEL_ICI')).toBeGreaterThan(p.indexOf('MISSION_ICI'));
  });

  it('les règles maison ferment quand même la consigne', () => {
    const p = draftPrompt(req({ freeze: ['GEL_ICI'] }), { ...ctx, rules: 'REGLE_ICI' });
    expect(p.indexOf('REGLE_ICI')).toBeGreaterThan(p.indexOf('GEL_ICI'));
  });

  it('rien n’est ajouté sans gel', () => {
    expect(draftPrompt(req(), ctx)).not.toContain('INTERDIT DE TOUCHER');
  });
});

describe('l’origine change ce qu’on demande', () => {
  it('depuis une suite, une seule variable change', () => {
    const p = draftPrompt(req({ origin: 'suite', changedVariable: 'l’offre' }), ctx);
    expect(p).toContain('UNE seule chose : l’offre');
    expect(p).toContain('à cette variable et à aucune autre');
  });

  it('depuis le radar, on reprend le ressort et pas les mots', () => {
    const p = draftPrompt(req({ origin: 'radar', marketMechanic: 'démonstration en une prise' }), ctx);
    expect(p).toContain('démonstration en une prise');
    expect(p).toContain('n’a rien\nen commun avec la sienne');
  });

  it('une origine libre n’ajoute pas de contrainte inventée', () => {
    const p = draftPrompt(req({ origin: 'blank' }), ctx);
    expect(p).not.toContain('UNE seule chose');
    expect(p).not.toContain('Mécanique observée');
  });
});

describe('Jarvis se relit avant de parler', () => {
  it('une accroche réfutée déclenche une réécriture', () => {
    const r = reviewDraft(brief([flag('hook_refuted', 'stop')]), 1);
    expect(r.rewrite).toBe(true);
    expect(r.instruction).toContain('DÉJÀ PERDU');
    expect(r.instruction).toContain('change l’angle d’attaque');
  });

  it('une seule réécriture · au-delà il tourne en rond', () => {
    const r = reviewDraft(brief([flag('hook_refuted', 'stop')]), MAX_REECRITURES + 1);
    expect(r.rewrite).toBe(false);
    expect(r.warning).toContain('a réécrit une fois');
  });

  it('un profil faible ne déclenche PAS de réécriture', () => {
    // La mémoire éclaire, elle n'interdit pas · et un concept neuf a par
    // construction un profil qu'on ne connaît pas.
    const r = reviewDraft(brief([flag('market_contradicts', 'warn')]), 1);
    expect(r.rewrite).toBe(false);
    expect(r.warning).toBe('message market_contradicts');
  });

  it('un brouillon propre ne dit rien', () => {
    const r = reviewDraft(brief([flag('hook_proven', 'good')]), 1);
    expect(r.rewrite).toBe(false);
    expect(r.warning).toBeNull();
  });

  it('la réécriture garde le reste du concept', () => {
    expect(reviewDraft(brief([flag('hook_refuted', 'stop')]), 1).instruction)
      .toContain('Garde le reste du concept');
  });
});

describe('un brouillon vide poli n’est pas un brouillon', () => {
  const bon = {
    headline: 'Ton garage est encore plein le dimanche soir',
    beats: ['Le désordre', 'Le geste', 'Le résultat'],
    hypothesis: 'Montrer le désordre avant le produit retient plus longtemps.',
  };

  it('accepte un brouillon complet', () => {
    expect(isUsableDraft(bon)).toBe(true);
  });

  it('refuse une accroche trop courte', () => {
    expect(isUsableDraft({ ...bon, headline: 'Court' })).toBe(false);
  });

  it('refuse moins de trois temps', () => {
    expect(isUsableDraft({ ...bon, beats: ['un', 'deux'] })).toBe(false);
  });

  it('ne compte pas les temps vides', () => {
    expect(isUsableDraft({ ...bon, beats: ['un', '  ', 'trois'] })).toBe(false);
  });

  it('refuse une hypothèse qui n’en est pas une', () => {
    expect(isUsableDraft({ ...bon, hypothesis: 'Ça marche' })).toBe(false);
  });

  it('refuse le vide et le null', () => {
    expect(isUsableDraft(null)).toBe(false);
    expect(isUsableDraft({})).toBe(false);
  });
});
