import { describe, expect, it } from 'vitest';
import {
  ECHECS_ETAPE_MAX, RECUL_ETAPE_BASE_MS, RECUL_ETAPE_MAX_MS, SEUIL_TACHE_BLOQUEE_MIN, DELAI_VIDEO_HISTORIQUE_MS,
  DUREE_URL_FOURNISSEUR_S, MARGE_URL_FOURNISSEUR,
  reculEtapeMs, lireEchecsEtape, suiteEchecEtape, transitionJob,
} from '../src';

/** Studios · I1 et I5 · règles pures · on lit les VALEURS rendues. */

const t0 = new Date('2026-11-16T10:00:00Z');

describe('recul d’une étape en échec · exponentiel, borné', () => {
  it('20 s, 40 s, 80 s… plafonné à 10 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 30].map(reculEtapeMs)).toEqual([20_000, 40_000, 80_000, 160_000, 320_000, 600_000, 600_000, 600_000]);
    expect([RECUL_ETAPE_BASE_MS, RECUL_ETAPE_MAX_MS]).toEqual([20_000, 600_000]);
    expect(reculEtapeMs(Number.NaN)).toBe(20_000);
  });

  it(`N = ${ECHECS_ETAPE_MAX} · le plus petit nombre d’échecs dont les reculs couvrent le seuil « bloquée » (30 min)`, () => {
    const cumul = (n: number) => Array.from({ length: n - 1 }, (_, i) => reculEtapeMs(i + 1)).reduce((s, x) => s + x, 0);
    expect(cumul(ECHECS_ETAPE_MAX)).toBeGreaterThanOrEqual(SEUIL_TACHE_BLOQUEE_MIN * 60_000);
    expect(cumul(ECHECS_ETAPE_MAX - 1)).toBeLessThan(SEUIL_TACHE_BLOQUEE_MIN * 60_000);
    expect(ECHECS_ETAPE_MAX).toBe(8);
  });
});

describe('suiteEchecEtape · reculer, puis échouer avec la bonne issue', () => {
  it('sous la borne · reculer, prochain essai = maintenant + recul', () => {
    expect(suiteEchecEtape({ erreur: null, etat: 'running', preuve: 'acceptee', maintenant: t0 })).toEqual({ suite: 'reculer', echecs: 1, prochainEssai: new Date(t0.getTime() + 20_000) });
    expect(suiteEchecEtape({ erreur: { echecsEtape: 3 }, etat: 'running', preuve: 'acceptee', maintenant: t0 })).toEqual({ suite: 'reculer', echecs: 4, prochainEssai: new Date(t0.getTime() + 160_000) });
  });

  it('à la borne · failed seulement sans envoi possible, en persistance ou en rapprochement · facturé si l’envoi a pu partir', () => {
    const e = { echecsEtape: ECHECS_ETAPE_MAX - 1 };
    const cas = [
      ['claimed', 'aucune', 'worker', 'echec_sans_frais'],
      ['running', 'aucune', 'worker', 'echec_sans_frais'],
      ['cancel_requested', 'aucune', 'worker', 'echec_sans_frais'],
      ['persisting', 'acceptee', 'finaliseur', 'facture_sans_livrable'],
      ['reconciliation_required', 'possible', 'reconciliateur', 'facture_sans_livrable'],
      ['reconciliation_required', 'aucune', 'reconciliateur', 'facture_sans_livrable'],
    ] as const;
    for (const [etat, preuve, acteur, issue] of cas) {
      const s = suiteEchecEtape({ erreur: e, etat, preuve, maintenant: t0 });
      expect(s, etat).toMatchObject({ suite: 'echouer', echecs: ECHECS_ETAPE_MAX, acteur, issue });
      expect(s.suite === 'echouer' && transitionJob(etat, 'failed', s.acteur).ok, `${etat} → failed refusé`).toBe(true);
    }
  });

  it('à la borne, envoi possible ou accepté en running / cancel_requested / claimed · RAPPROCHEMENT, jamais un échec direct (doctrine #1100)', () => {
    const e = { echecsEtape: ECHECS_ETAPE_MAX - 1 };
    for (const [etat, preuve] of [['running', 'acceptee'], ['running', 'possible'], ['cancel_requested', 'acceptee'], ['claimed', 'possible']] as const) {
      const s = suiteEchecEtape({ erreur: e, etat, preuve, maintenant: t0 });
      expect(s, `${etat}/${preuve}`).toEqual({ suite: 'rapprocher', echecs: ECHECS_ETAPE_MAX, acteur: 'worker' });
      expect(transitionJob(etat, 'reconciliation_required', 'worker').ok).toBe(true);
    }
  });

  it('lit le compteur dans l’erreur · absent ou illisible vaut 0', () => {
    expect(lireEchecsEtape(null)).toBe(0);
    expect(lireEchecsEtape({ echecsEtape: 'x' })).toBe(0);
    expect(lireEchecsEtape({ code: 'PERSISTENCE_FAILED', echecsEtape: 2 })).toBe(2);
  });
});

describe('I5 · durée des adresses signées remises à fal', () => {
  it('3 600 s · la marge 4 fois la plus longue attente acceptée d’un clip de la file fal (15 min, ancien studio vidéo)', () => {
    expect(MARGE_URL_FOURNISSEUR).toBe(4);
    expect(DUREE_URL_FOURNISSEUR_S).toBe((MARGE_URL_FOURNISSEUR * DELAI_VIDEO_HISTORIQUE_MS) / 1000);
    expect(DUREE_URL_FOURNISSEUR_S).toBe(3_600);
  });
});
