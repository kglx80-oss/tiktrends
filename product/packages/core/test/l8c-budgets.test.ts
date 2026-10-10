import { describe, it, expect } from 'vitest';
import { contenuEchelle } from '../src/studios/perf/synthetique';
import {
  CHEMINS_MESURES, MESURES, AVANT_OPTIMISATION, MARGE_GARDE, budgetGarde, cibleTenue, margeSurCible, type EchelleMesure, type IdChemin,
} from '../src/studios/perf/mesures';
import { CHEMINS_CHAUDS, chronometrer } from './l8c-chemins';

/**
 * L8-C · GARDES DE TEMPS TOLÉRANTES (UX-06).
 *
 * ⚠ Budgets de temps, donc sensibles à la machine : chaque garde compare le
 * p95 du temps CPU de 20 tirages au p95 MESURÉ × 3 (`MARGE_GARDE`, plancher 25 ms). Elles
 * ne prétendent pas tenir la cible au milliseconde près : elles attrapent un
 * changement d'ORDRE de grandeur (un parcours devenu quadratique, un graphe
 * reconstruit par plan, une empreinte recalculée en boucle). La cible
 * elle-même est prouvée par le tableau mesuré (`perf/mesures.ts`) et par le
 * test pur « la mesure tient la cible avec la marge ».
 */

const TIRAGES = 20;
const ids = Object.keys(CHEMINS_MESURES) as IdChemin[];

describe('le tableau mesuré tient chaque cible du cahier', () => {
  it.each(ids.flatMap((id) => (['petit', 'grand'] as const).map((e) => [id, e] as const)))('%s · %s', (id, e) => {
    const m = MESURES[id][e];
    expect(m.p95Ms, 'chemin mesuré').toBeGreaterThan(0);
    expect(m.medianeMs).toBeLessThanOrEqual(m.p95Ms);
    expect(m.p95Ms, `p95 ${m.p95Ms} ms contre cible ${CHEMINS_MESURES[id].cible[e]} ms (${CHEMINS_MESURES[id].source})`).toBeLessThanOrEqual(CHEMINS_MESURES[id].cible[e]);
    expect(cibleTenue(id, e)).toBe(true);
  });

  it('l’optimisation visait ce qui sortait de la cible · la lecture vidéo à 200 plans y rentre', () => {
    expect(AVANT_OPTIMISATION.lecture_video.grand.medianeMs).toBeGreaterThan(CHEMINS_MESURES.lecture_video.cible.grand);
    expect(cibleTenue('lecture_video', 'grand')).toBe(true);
    expect(margeSurCible('lecture_video', 'grand')).toBeGreaterThanOrEqual(10);
  });

  it('les gestes interactifs à l’échelle de stress gardent au moins ×2 de marge (règle du choix des limites)', () => {
    for (const id of ['geste_editeur', 'geste_video', 'impact_texte', 'impact_video_ordre', 'calque_ajout', 'calque_deplacement', 'operation_ordre', 'operation_narration'] as const) {
      expect(margeSurCible(id, 'grand'), id).toBeGreaterThanOrEqual(2);
    }
  });

  it('chaque chemin chaud du noyau a sa ligne mesurée, et réciproquement', () => {
    const noyau = ids.filter((id) => CHEMINS_MESURES[id].ou === 'noyau').sort();
    expect(CHEMINS_CHAUDS.map((c) => c.id).sort()).toEqual(noyau);
  });
});

describe.each(['petit', 'grand'] as EchelleMesure[])('BUDGET DE TEMPS TOLÉRANT (p95 mesuré × 3) · échelle %s', (e) => {
  const contenu = contenuEchelle(e);
  it.each(CHEMINS_CHAUDS.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const { cpu: r, mur } = chronometrer(c.preparer(contenu), TIRAGES, 2);
    const budget = budgetGarde(id as IdChemin, e);
    expect(r.p95Ms, `${c.libelle} · p95 CPU ${r.p95Ms} ms (médiane ${r.medianeMs}, mur p95 ${mur.p95Ms}) pour un budget de ${budget} ms (mesuré ${MESURES[id as IdChemin][e].p95Ms} ms × ${MARGE_GARDE})`).toBeLessThanOrEqual(budget);
  }, 60_000);
});
