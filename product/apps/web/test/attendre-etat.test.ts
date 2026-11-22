// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { attendreEtat, attendreMontageStable, BORNE_ATTENTE_MS, sondeDomInchange } from './helpers/attendre-etat';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * L'utilitaire commun « attendre un état » (`test/helpers/attendre-etat.ts`) · on lit ce qu'il
 * REND (délai, sondages) et ce qu'il DIT quand l'état ne vient pas, jamais qu'il a été appelé.
 * Les horloges sont réelles · les délais sont choisis loin des intervalles pour rester sûrs sous
 * charge (un état qui arrive « vers 30 ms » est seulement affirmé arrivé, jamais à l'heure).
 */

/**
 * Vraie `ms` après son PREMIER sondage · l'horloge part dans la sonde, jamais avant l'appel ·
 * `attendreEtat` prend son départ (`debut`) avant ce premier sondage, donc `r.ms` couvre au moins
 * `ms`. Partie à la création de la sonde, elle laissait `r.ms` à 30 ms moins l'écart entre la
 * création et l'appel (quelques µs) · excédent mesuré sur 300 passages au mieux de 0,07 ms, assez
 * près pour qu'un passage sur quelques centaines tombe sous 30.
 */
const apres = (ms: number) => { let t0: number | null = null; return () => { const t = performance.now(); t0 ??= t; return t - t0 >= ms; }; };

/**
 * Le grain des minuteries de Node · une minuterie de `ms` part d'une horloge de boucle tronquée à
 * la milliseconde et se déclenche quand cette horloge a avancé de `ms` · mesurée par
 * `performance.now()` (sous-milliseconde), elle peut finir jusqu'à 1 ms plus tôt. Le défaut ne
 * s'ajoute pas d'une minuterie à l'autre · chaque échéance tombe sur la même grille, donc N pauses
 * enchaînées perdent au plus 1 ms en tout, pas N. Mesuré le 22/11/2026, machine de 4 cœurs ·
 * `attendreEtat(…, { stabilite: 6, intervalleMs: 10 })`, cible (6 - 1) × 10 = 50 ms :
 *
 *   régime                    passages   sous 50 ms   déficit max   min        p50        max
 *   au repos                    300         12          0,385 ms     49,615     50,865     98,485
 *   au repos (2e série)         300          9          0,267 ms     49,733     50,911    191,187
 *   12 boucles CPU actives      300          9          0,280 ms     49,720     51,001    159,377
 *   stabilité 21 × 2 ms (40)    300          0          aucun        40,849     43,315    122,083
 *
 * 30 passages sur 900 (3,3 %) sous 50 ms · d'où le rouge du run 45035270381 (49,869). Aucun sous
 * 49 · le déficit le plus grand mesuré (0,385 ms) tient 2,6 fois dans le grain. La garde exige
 * donc plus de (N - 1) × intervalle - 1 ms · une pause sautée (40 ms) ou toutes (0 ms) tombe.
 */
const GRAIN_MINUTERIE_MS = 1;

describe('attendreEtat · sonde une condition jusqu’à ce qu’elle tienne', () => {
  it('condition déjà vraie · un seul sondage, aucun délai', async () => {
    const r = await attendreEtat('vraie d’emblée', () => true);
    expect(r.sondages).toBe(1);
    expect(r.ms).toBeLessThan(BORNE_ATTENTE_MS);
  });

  it('condition qui devient vraie · attendue, plusieurs sondages, rend le délai observé', async () => {
    const pret = apres(30);
    const r = await attendreEtat('vraie après 30 ms', pret, { intervalleMs: 5 });
    expect(pret()).toBe(true);
    expect(r.sondages).toBeGreaterThan(1);
    expect(r.ms).toBeGreaterThanOrEqual(30);
  });

  it('une sonde asynchrone, ou un `expect` qui tombe, compte comme « pas encore »', async () => {
    let n = 0;
    await attendreEtat('troisième lecture', async () => { n += 1; await Promise.resolve(); return n >= 3; }, { intervalleMs: 1 });
    expect(n).toBe(3);
    let m = 0;
    await attendreEtat('expect tenu au troisième sondage', () => { m += 1; expect(m).toBe(3); return true; }, { intervalleMs: 1 });
    expect(m).toBe(3);
  });

  it('non atteinte · échoue à la borne, en nommant la condition et le dernier constat (message de l’expect)', async () => {
    const t0 = performance.now();
    const e = await attendreEtat('la ligne est écrite en base', () => { expect(2, 'aucune ligne lue').toBe(1); return true; }, { borneMs: 60, intervalleMs: 10 }).catch((x: Error) => x);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toMatch(/^attendreEtat · « la ligne est écrite en base » non atteinte en \d+ ms \(\d+ sondages, toutes les 10 ms\) · dernier constat : aucune ligne lue: expected 2 to be 1 \/\/ Object.is equality$/);
    expect(performance.now() - t0).toBeGreaterThanOrEqual(60);
  });

  it('non atteinte · une valeur fausse rendue est citée telle quelle', async () => {
    const e = await attendreEtat('le compte vaut 2', () => null, { borneMs: 20, intervalleMs: 5 }).catch((x: Error) => x);
    expect((e as Error).message).toContain('« le compte vaut 2 » non atteinte');
    expect((e as Error).message).toContain('dernier constat : null');
  });
});

describe('attendreEtat · stabilité · l’état doit TENIR N sondages d’affilée', () => {
  it('un état stable · accepté après exactement N sondages, au moins (N - 1) × intervalle, au grain des minuteries près', async () => {
    const r = await attendreEtat('stable', () => true, { stabilite: 6, intervalleMs: 10 });
    expect(r.sondages).toBe(6);
    expect(r.ms, 'cinq pauses de 10 ms entre les six sondages').toBeGreaterThan((6 - 1) * 10 - GRAIN_MINUTERIE_MS);
  });

  it('un état atteint puis DÉFAIT remet le compte à zéro · attendu jusqu’à ce qu’il tienne', async () => {
    // vrai, vrai, faux, puis vrai pour de bon · avec stabilité 4, il faut 4 vrais APRÈS le faux.
    const suite = [true, true, false];
    let i = 0;
    const r = await attendreEtat('tient après une rechute', () => (i < suite.length ? suite[i++] : (i++, true)), { stabilite: 4, intervalleMs: 1 });
    expect(r.sondages).toBe(3 + 4);
  });

  it('un état qui retombe toujours · échec qui dit la meilleure tenue et ce qui l’a fait tomber', async () => {
    let i = 0;
    const e = await attendreEtat('le focus reste sur « Générer »', () => { i += 1; if (i % 3 === 0) throw new Error('le focus est retombé sur <body>'); return true; }, { stabilite: 5, intervalleMs: 2, borneMs: 80 }).catch((x: Error) => x);
    expect((e as Error).message).toMatch(/« le focus reste sur « Générer » » non atteinte en \d+ ms/);
    expect((e as Error).message).toContain('tenue au mieux 2/5 sondages d’affilée');
    expect((e as Error).message).toContain('le focus est retombé sur <body>');
  });

  it('une stabilité qui ne tient pas sous la borne est refusée d’emblée, nommée', async () => {
    await expect(attendreEtat('impossible', () => true, { stabilite: 11, intervalleMs: 10, borneMs: 100 })).rejects.toThrow('« impossible » · 11 sondages toutes les 10 ms ne tiennent pas sous la borne de 100 ms');
  });
});

describe('attendreEtat · le pas · on laisse passer le temps par la fonction donnée', () => {
  it('chaque attente entre deux sondages passe par `pas`, avec l’intervalle demandé', async () => {
    const pas: number[] = [];
    let n = 0;
    await attendreEtat('quatrième', () => ++n >= 4, { intervalleMs: 7, pas: async (ms) => { pas.push(ms); } });
    expect(pas).toEqual([7, 7, 7]);
  });
});

describe('sondeDomInchange · « rendu et ne bouge plus »', () => {
  it('vide · jamais tenu · rendu puis identique · tenu dès la deuxième lecture · un changement remet à zéro', () => {
    const racine = { innerHTML: '' };
    const sonde = sondeDomInchange(() => racine as unknown as Element);
    expect([sonde(), sonde()], 'rien de rendu').toEqual([false, false]);
    racine.innerHTML = '<p>a</p>';
    expect([sonde(), sonde(), sonde()], 'rendu, puis inchangé').toEqual([false, true, true]);
    racine.innerHTML = '<p>b</p>';
    expect([sonde(), sonde()], 'un rendu tardif').toEqual([false, true]);
  });

  it('avec la stabilité · un DOM qui change encore est attendu jusqu’à ce qu’il se fige', async () => {
    const racine = { innerHTML: '<p>0</p>' };
    let n = 0;
    const sonde = sondeDomInchange(() => { n += 1; if (n <= 5) racine.innerHTML = `<p>${n}</p>`; return racine as unknown as Element; });
    const r = await attendreEtat('figé', sonde, { stabilite: 3, intervalleMs: 1 });
    // Cinq lectures qui changent, la sixième identique à la cinquième ouvre le compte · 6, 7, 8.
    expect(r.sondages).toBe(8);
  });
});

describe('attendreEtat · le dernier constat voyage comme `cause` · la pile de l’`expect` reste lisible', () => {
  it('non atteinte · `cause` est l’erreur de l’expect elle-même', async () => {
    const e = await attendreEtat('cause gardée', () => { expect(2, 'la ligne manque').toBe(1); return true; }, { borneMs: 20, intervalleMs: 5 }).catch((x: Error) => x);
    const cause = (e as Error).cause as Error;
    expect(cause).toBeInstanceOf(Error);
    expect(cause.message).toContain('la ligne manque');
    expect(cause.stack).toContain('attendre-etat.test.ts');
  });
});

describe('attendreEtat · `echecImmediat` · une absence violée échoue tout de suite', () => {
  it('tenue tout du long · acceptée après la fenêtre', async () => {
    const r = await attendreEtat('rien ne part', () => true, { stabilite: 5, intervalleMs: 2, echecImmediat: true });
    expect(r.sondages).toBe(5);
  });

  it('violée au troisième sondage · échec immédiat, bien avant la borne, qui nomme la condition, le sondage et le constat', async () => {
    let n = 0;
    const t0 = performance.now();
    const e = await attendreEtat('plus aucune requête', () => { n += 1; if (n === 3) throw new Error('2 requêtes au lieu d’une'); return true; }, { stabilite: 21, intervalleMs: 2, echecImmediat: true }).catch((x: Error) => x);
    expect(performance.now() - t0, 'aucune attente de la borne').toBeLessThan(2_000);
    expect((e as Error).message).toMatch(/^attendreEtat · « plus aucune requête » violée au sondage 3\/21, après \d+ ms \(toutes les 2 ms\) · constat : 2 requêtes au lieu d’une$/);
    expect(((e as Error).cause as Error).message).toBe('2 requêtes au lieu d’une');
  });

  it('sans l’option · la même rechute est attendue jusqu’à ce que l’état tienne (aucun échec immédiat)', async () => {
    let n = 0;
    const r = await attendreEtat('tient après une rechute', () => { n += 1; return n !== 3; }, { stabilite: 4, intervalleMs: 1 });
    expect(r.sondages).toBe(3 + 4);
  });
});

describe('attendreMontageStable · `#app` doit porter un rendu · `document.body` n’est jamais vide', () => {
  it('un composant qui rend `null` (#app vide, #orn présent) n’est pas « monté » · échec nommé', async () => {
    document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
    const e = await attendreMontageStable(undefined, 80).catch((x: Error) => x);
    expect((e as Error).message).toMatch(/^attendreEtat · « la page montée est rendue \(#app non vide\) et ne bouge plus » non atteinte en \d+ ms/);
  });

  it('#app rendu et immobile · accepté', async () => {
    document.body.innerHTML = '<div id="app"><main>Fiche</main></div><div id="orn" hidden></div>';
    const r = await attendreMontageStable();
    expect(r.sondages).toBe(4);
  });
});
