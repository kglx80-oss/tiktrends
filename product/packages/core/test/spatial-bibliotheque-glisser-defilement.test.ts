import { describe, expect, it } from 'vitest';
import {
  annonceSurvol, BANDE_DEFILEMENT_PX, defilementApres, GAIN_DEFILEMENT_PX_S, REFUS_DEPOT, VEILLE_DEFILEMENT_MS, vitesseDefilement,
  type ZoneDefilement,
} from '../src';

/**
 * Bibliothèque · glisser-déposer · le défilement automatique près du bord et
 * l'annonce de la raison d'un refus · règles pures. Les valeurs viennent de la
 * source de VS Code (`listView.ts` · bande 35 px, 0,3 px/image par px
 * d'enfoncement, veille 1 000 ms), comparée à GTK (30 px), Qt (16 px) et
 * Chromium (20 px) dans le module.
 */

// Une zone de 600 px de haut, au milieu de sa course.
const Z: ZoneDefilement = { haut: 100, bas: 700, defile: 500, max: 2000 };

describe('défilement automatique · la bande et la vitesse', () => {
  it('les valeurs relues dans la source de référence · bande 35 px, 18 px/s par px (0,3 px/image à 60 images/s), veille 1 000 ms', () => {
    expect([BANDE_DEFILEMENT_PX, GAIN_DEFILEMENT_PX_S, VEILLE_DEFILEMENT_MS]).toEqual([35, 18, 1000]);
  });

  it('au bord exact · la vitesse maximale, 0,3 × 35 × 60 = 630 px/s · vers le haut en haut, vers le bas en bas', () => {
    expect([vitesseDefilement(Z.haut, Z), vitesseDefilement(Z.bas, Z)]).toEqual([-630, 630]);
  });

  it('proportionnelle à l’enfoncement dans la bande, nulle à son bord intérieur (pas d’à-coup en y entrant)', () => {
    expect([
      vitesseDefilement(Z.haut + 10, Z), vitesseDefilement(Z.haut + 34, Z), vitesseDefilement(Z.haut + 35, Z),
      vitesseDefilement(Z.bas - 10, Z), vitesseDefilement(Z.bas - 34, Z), vitesseDefilement(Z.bas - 35, Z),
    ]).toEqual([-450, -18, 0, 450, 18, 0]);
  });

  it('hors de la bande, au milieu · immobile', () => {
    expect([vitesseDefilement(Z.haut + 36, Z), vitesseDefilement(400, Z), vitesseDefilement(Z.bas - 36, Z)]).toEqual([0, 0, 0]);
  });

  it('pointeur au-delà du bord · ramené au bord, la vitesse ne dépasse pas 630 px/s', () => {
    expect([vitesseDefilement(Z.haut - 500, Z), vitesseDefilement(Z.bas + 500, Z)]).toEqual([-630, 630]);
  });
});

describe('défilement automatique · les arrêts', () => {
  it('à la limite du sens demandé · arrêt (en haut à 0, en bas à max), l’autre sens reste ouvert', () => {
    const enHaut = { ...Z, defile: 0 }, enBas = { ...Z, defile: Z.max };
    expect([vitesseDefilement(Z.haut, enHaut), vitesseDefilement(Z.bas, enHaut)]).toEqual([0, 630]);
    expect([vitesseDefilement(Z.bas, enBas), vitesseDefilement(Z.haut, enBas)]).toEqual([0, -630]);
  });

  it('une zone qui ne défile pas (contenu pas plus haut qu’elle) · immobile', () => {
    expect([vitesseDefilement(Z.haut, { ...Z, max: 0, defile: 0 }), vitesseDefilement(Z.bas, { ...Z, max: 0, defile: 0 })]).toEqual([0, 0]);
  });

  it('une zone trop basse pour deux bandes sans chevauchement · immobile (aucun endroit immobile où viser)', () => {
    const basse = { ...Z, bas: Z.haut + 2 * BANDE_DEFILEMENT_PX - 1 };
    const juste = { ...Z, bas: Z.haut + 2 * BANDE_DEFILEMENT_PX };
    expect([vitesseDefilement(basse.haut, basse), vitesseDefilement(basse.bas, basse)]).toEqual([0, 0]);
    // Témoin · à deux bandes pile, elle défile.
    expect([vitesseDefilement(juste.haut, juste), vitesseDefilement(juste.bas, juste)]).toEqual([-630, 630]);
  });

  it('une hauteur de pointeur absurde (NaN) · immobile', () => {
    expect(vitesseDefilement(Number.NaN, Z)).toBe(0);
  });

  it('la position après un pas · vitesse × durée, jamais au-delà de 0 ni de max', () => {
    expect([
      defilementApres(Z, 630, 100), defilementApres(Z, -630, 100),
      defilementApres({ defile: 10, max: 2000 }, -630, 100), defilementApres({ defile: 1990, max: 2000 }, 630, 100),
      defilementApres(Z, 630, -50),
    ]).toEqual([563, 437, 0, 2000, 500]);
  });
});

describe('annonce du survol · la raison d’un refus, une fois par cible', () => {
  const refus = { ok: false as const, raison: REFUS_DEPOT.dossierIci };
  const autre = { ok: false as const, raison: REFUS_DEPOT.cible };
  const accepte = { ok: true as const, destination: 'x', nom: 'X' };

  it('une cible qui refuse · la phrase du verdict', () => {
    expect(annonceSurvol(null, 'a', refus)).toEqual({ cible: 'a', texte: REFUS_DEPOT.dossierIci });
  });

  it('la même cible survolée encore · la MÊME annonce (rien n’est réécrit, rien n’est redit)', () => {
    const a = annonceSurvol(null, 'a', refus);
    expect(annonceSurvol(a, 'a', refus)).toBe(a);
  });

  it('une autre cible qui refuse · nouvelle annonce, même quand la phrase est identique', () => {
    const a = annonceSurvol(null, 'a', refus);
    const b = annonceSurvol(a, 'b', refus);
    expect(b).toEqual({ cible: 'b', texte: REFUS_DEPOT.dossierIci });
    expect(b).not.toBe(a);
    expect(annonceSurvol(b, 'b', autre)).toEqual({ cible: 'b', texte: REFUS_DEPOT.cible });
  });

  it('une cible qui accepte, ou la source elle-même · rien n’est dit', () => {
    const a = annonceSurvol(null, 'a', refus);
    expect([annonceSurvol(a, 'b', accepte), annonceSurvol(a, 'a', null), annonceSurvol(null, 'c', accepte)]).toEqual([null, null, null]);
  });
});
