// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MESURE_SEUIL_TAG, SEUIL_TAG_RECURRENT, ANNONCEURS_MIN_TAG_RECURRENT, propositionHypotheseTag } from '@tiktrends/core';
import { fragmentReference } from './spatial/parite';

/**
 * Lot 6 bis V5 · le seuil « tag récurrent » (`SEUIL_TAG_RECURRENT`) est
 * MESURÉ · ce test refait le comptage du module sur les fragments de la
 * maquette (`docs/spatial/reference/`) et échoue si le tableau écrit ment, ou
 * si le seuil retenu n'est plus la plus petite valeur sans fausse proposition
 * qui garde tous les motifs.
 */

const doc = (route: string) => { const t = document.createElement('template'); t.innerHTML = fragmentReference(route); return t.content; };
const compter = (labels: string[]) => { const m = new Map<string, number>(); for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1); return m; };
const resume = (m: Map<string, number>) => ({ etiquettes: m.size, a1: [...m.values()].filter((n) => n === 1).length, a2: [...m.values()].filter((n) => n === 2).length, a3: [...m.values()].filter((n) => n >= 3).length });

describe('seuil d’un tag récurrent · refait sur la maquette', () => {
  const veille = [...doc('veille').querySelectorAll('article.xa')].map((a) => ({
    annonceur: a.querySelector('.xn strong')?.textContent?.trim() ?? '',
    etiquette: a.querySelector('.xt.st')?.textContent?.trim() ?? '',
  })).filter((x) => x.etiquette);
  const sauvegardes = [...doc('sauvegardes').querySelectorAll('article.vitem')].flatMap((a) => [...a.querySelectorAll('.row .pill')].map((p) => p.textContent!.trim()));
  const formats = [...doc('formats').querySelectorAll('.fh .pill')].map((p) => p.textContent!.trim());
  const cV = compter(veille.map((x) => x.etiquette)); const cS = compter(sauvegardes); const cF = compter(formats);

  it('les trois échantillons donnent le tableau écrit dans le module', () => {
    expect(veille).toHaveLength(24);
    expect(formats).toHaveLength(28);
    expect(resume(cV)).toEqual(MESURE_SEUIL_TAG.sansMotif);
    expect(resume(cS)).toEqual(MESURE_SEUIL_TAG.sauvegardes);
    expect(resume(cF)).toEqual(MESURE_SEUIL_TAG.formats);
  });

  it('ce que chaque seuil aurait proposé · et N retenu est le plus petit sans fausse proposition qui garde les 7 motifs', () => {
    const motifs = [...[...cS.entries()].filter(([l]) => l === 'Tourne longtemps'), ...cF.entries()];
    expect(motifs).toHaveLength(7);
    const parSeuil = [2, 3, 4, 5].map((n) => ({ n, fausses: [...cV.values()].filter((x) => x >= n).length, motifs: motifs.filter(([, x]) => x >= n).length }));
    expect(parSeuil).toEqual(MESURE_SEUIL_TAG.parSeuil);
    const retenu = parSeuil.find((x) => x.fausses === 0 && x.motifs === motifs.length)!.n;
    expect(SEUIL_TAG_RECURRENT, 'le seuil n’est plus celui que la mesure désigne').toBe(retenu);
  });

  it('les paires de l’échantillon sans motif sont à deux annonceurs · c’est l’effectif qui les écarte, et la règle se tait sur elles', () => {
    const paires = [...cV.entries()].filter(([, n]) => n === 2).map(([l]) => l);
    for (const l of paires) {
      const ss = veille.filter((x) => x.etiquette === l).map((x, i) => ({ id: `${l}-${i}`, annonceur: x.annonceur }));
      expect(new Set(ss.map((s) => s.annonceur)).size).toBe(ANNONCEURS_MIN_TAG_RECURRENT);
      expect(propositionHypotheseTag({ cle: l, nom: l }, ss), `« ${l} » ne devrait rien proposer`).toBeNull();
    }
  });
});
