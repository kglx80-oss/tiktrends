import { describe, expect, it } from 'vitest';
import { attendreEtat, BORNE_ATTENTE_MS, sondeDomInchange } from './helpers/attendre-etat';

/**
 * L'utilitaire commun « attendre un état » (`test/helpers/attendre-etat.ts`) · on lit ce qu'il
 * REND (délai, sondages) et ce qu'il DIT quand l'état ne vient pas, jamais qu'il a été appelé.
 * Les horloges sont réelles · les délais sont choisis loin des intervalles pour rester sûrs sous
 * charge (un état qui arrive « vers 30 ms » est seulement affirmé arrivé, jamais à l'heure).
 */

const apres = (ms: number) => { const t0 = performance.now(); return () => performance.now() - t0 >= ms; };

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
  it('un état stable · accepté après exactement N sondages, au moins (N - 1) × intervalle', async () => {
    const r = await attendreEtat('stable', () => true, { stabilite: 6, intervalleMs: 10 });
    expect(r.sondages).toBe(6);
    expect(r.ms).toBeGreaterThanOrEqual(50);
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
