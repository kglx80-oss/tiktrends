import { describe, it, expect } from 'vitest';
import {
  hookFingerprint, buildHookLibrary, formatHooksForPrompt, countHooks, summarizeHooks,
  type HookSource,
} from '../src/adsmap/hook-library';

const h = (o: Partial<HookSource> = {}): HookSource =>
  ({ text: 'Tu perds tes cheveux et personne ne te le dit', origin: 'brand', ...o });

describe('hookFingerprint', () => {
  it('regroupe deux relevés de la même phrase', () => {
    expect(hookFingerprint('Tu perds tes cheveux ?')).toBe(hookFingerprint('tu perds tes cheveux'));
  });

  it('respecte l’ordre des mots · deux phrases inversées ne sont pas la même', () => {
    expect(hookFingerprint('le froid abîme ta peau')).not.toBe(hookFingerprint('ta peau abîme le froid'));
  });
});

describe('buildHookLibrary', () => {
  it('classe par niveau de preuve', () => {
    const lib = buildHookLibrary([
      h({ text: 'Une accroche jamais testée du tout', verdict: null }),
      h({ text: 'Une accroche qui a franchement gagné', verdict: 'winner' }),
      h({ text: 'Une accroche de concurrent bien connue', origin: 'market', advertiser: 'X' }),
      h({ text: 'Une accroche testée et clairement perdante', verdict: 'loser' }),
    ]);
    expect(lib.map((e) => e.evidence)).toEqual(['proven', 'market', 'untested', 'refuted']);
  });

  it('garde la MEILLEURE preuve quand la même phrase a deux issues', () => {
    // Une accroche qui a gagné une fois reste une accroche qui a gagné · c'est
    // l'existence du succès qui informe, pas sa fréquence.
    const lib = buildHookLibrary([h({ verdict: 'loser' }), h({ verdict: 'winner' })]);
    expect(lib).toHaveLength(1);
    expect(lib[0]!.evidence).toBe('proven');
    expect(lib[0]!.occurrences).toBe(2);
  });

  it('compte les annonceurs distincts et la plus longue diffusion', () => {
    const lib = buildHookLibrary([
      h({ origin: 'market', advertiser: 'A', daysRunning: 20 }),
      h({ origin: 'market', advertiser: 'B', daysRunning: 90 }),
    ]);
    expect(lib[0]!.advertisers).toBe(2);
    expect(lib[0]!.maxDaysRunning).toBe(90);
  });

  it('écarte les fragments et les pavés', () => {
    expect(buildHookLibrary([h({ text: 'Salut' })])).toHaveLength(0);
    expect(buildHookLibrary([h({ text: 'a'.repeat(300) })])).toHaveLength(0);
  });

  it('trie le marché par durée de diffusion', () => {
    const lib = buildHookLibrary([
      h({ text: 'Accroche concurrente numéro un', origin: 'market', advertiser: 'A', daysRunning: 30 }),
      h({ text: 'Accroche concurrente numéro deux', origin: 'market', advertiser: 'B', daysRunning: 120 }),
    ]);
    expect(lib[0]!.maxDaysRunning).toBe(120);
  });
});

describe('formatHooksForPrompt', () => {
  const lib = buildHookLibrary([
    h({ text: 'Une accroche qui a franchement gagné', verdict: 'winner' }),
    h({ text: 'Une accroche testée et clairement perdante', verdict: 'loser' }),
    h({ text: 'Une accroche de concurrent bien connue', origin: 'market', advertiser: 'X', daysRunning: 60 }),
  ]);

  it('interdit explicitement de recopier une accroche de concurrent', () => {
    // Sans cette consigne, un modèle à qui on tend des phrases toutes faites les
    // reprend · et on diffuse la publicité d'un concurrent sous notre marque.
    const bloc = formatHooksForPrompt(lib);
    expect(bloc).toContain('INTERDIT de les recopier');
    expect(bloc).toContain('MÉCANIQUE');
  });

  it('dit que les accroches du marché ne sont pas prouvées', () => {
    expect(formatHooksForPrompt(lib)).toContain('PAS des accroches dont on sait');
  });

  it('sépare ce qu’il faut reprendre de ce qu’il ne faut pas reproposer', () => {
    const bloc = formatHooksForPrompt(lib);
    expect(bloc).toContain('QUI ONT GAGNÉ');
    expect(bloc).toContain('ne les repropose pas');
  });

  it('reste vide sans matière', () => {
    expect(formatHooksForPrompt([])).toBe('');
    // Les non testées seules n'apprennent rien · elles ne justifient pas un bloc.
    expect(formatHooksForPrompt(buildHookLibrary([h({ verdict: null })]))).toBe('');
  });

  it('borne le nombre injecté · un prompt de quarante accroches se dilue', () => {
    const beaucoup = Array.from({ length: 30 }, (_, i) =>
      h({ text: `Accroche gagnante numéro ${i} qui fonctionne`, verdict: 'winner' }));
    const bloc = formatHooksForPrompt(buildHookLibrary(beaucoup), { maxProven: 3 });
    expect(bloc.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(3);
  });
});

describe('summarizeHooks', () => {
  it('dit quoi faire quand la bibliothèque est vide', () => {
    expect(summarizeHooks(countHooks([]))).toContain('Aucune accroche relevée');
  });

  it('invite à arbitrer quand il n’y a que du marché', () => {
    const lib = buildHookLibrary([h({ origin: 'market', advertiser: 'A' })]);
    expect(summarizeHooks(countHooks(lib))).toContain('arbitre tes tests');
  });

  it('annonce les gagnantes quand il y en a', () => {
    const lib = buildHookLibrary([h({ verdict: 'winner' })]);
    expect(summarizeHooks(countHooks(lib))).toContain('gagnante');
  });
});
