import { describe, expect, it } from 'vitest';
import {
  BASCULE_FORFAIT_V2, DROITS_ACTUELS, DROITS_V2, RANG_FORFAIT, droitsDuForfait, lignesDroits, refusCloneVideo, refusDureeVideo,
  refusNouveauConcurrent, refusNouvelleMarque,
} from '../src';

/** Droits échelonnés (décision du 29/10, point 6) · et droits actuels INCHANGÉS (point 5). */
describe('offre · droits par forfait', () => {
  it('V2 · marques 1·3·20, concurrents 1·5·20, vidéo 15·30·60 s, clone vidéo dès Pro, support e-mail·prioritaire·dédié', () => {
    const v = (['essentiel', 'pro', 'agence'] as const).map((k) => DROITS_V2[k]);
    expect(v.map((d) => d.marques)).toEqual([1, 3, 20]);
    expect(v.map((d) => d.concurrentsParMarque)).toEqual([1, 5, 20]);
    expect(v.map((d) => d.videoMaxSecondes)).toEqual([15, 30, 60]);
    expect(v.map((d) => d.cloneVideo)).toEqual([false, true, true]);
    expect(v.map((d) => d.support)).toEqual(['email', 'prioritaire', 'dedie']);
    expect(v.every((d) => d.controleVisuelActivable)).toBe(true);
  });

  it('les forfaits actuels ne perdent rien · aucune limite de marques ni de concurrents, vidéo à 90 s, clone vidéo ouvert', () => {
    for (const k of ['starter', 'core', 'plus', 'business'] as const) {
      expect(refusNouvelleMarque(k, 500)).toBeNull();
      expect(refusNouveauConcurrent(k, 500)).toBeNull();
      expect(refusDureeVideo(k, 90_000)).toBeNull();
      expect(refusCloneVideo(k)).toBeNull();
      expect(DROITS_ACTUELS[k].videoMaxSecondes).toBe(90);
    }
  });

  it('le refus tombe à la limite exacte, pas avant', () => {
    expect(refusNouvelleMarque('essentiel', 0)).toBeNull();
    expect(refusNouvelleMarque('essentiel', 1)).toBe('Votre forfait inclut 1 marque. Passez au forfait supérieur pour en ajouter.');
    expect(refusNouvelleMarque('pro', 2)).toBeNull();
    expect(refusNouvelleMarque('pro', 3)).toContain('3 marques');
    expect(refusNouveauConcurrent('pro', 4)).toBeNull();
    expect(refusNouveauConcurrent('pro', 5)).toBe('Votre forfait suit 5 concurrents par marque. Passez au forfait supérieur pour en suivre davantage.');
    expect(refusDureeVideo('essentiel', 15_000)).toBeNull();
    expect(refusDureeVideo('essentiel', 15_001)).toContain('15 s');
    expect(refusDureeVideo('agence', 60_000)).toBeNull();
    expect(refusCloneVideo('essentiel')).toContain('dès le forfait Pro');
    expect(refusCloneVideo('pro')).toBeNull();
  });

  it('bascule à l’échéance · même rang d’accès', () => {
    for (const [ancien, v2] of Object.entries(BASCULE_FORFAIT_V2)) expect(RANG_FORFAIT[v2]).toBe(RANG_FORFAIT[ancien as 'core']);
  });

  it('les lignes de la carte disent les droits réels', () => {
    expect(lignesDroits(droitsDuForfait('essentiel'))).toEqual([
      '1 marque', '1 concurrent suivi par marque', 'Vidéo jusqu’à 15 s', 'Clone de pubs image', 'Contrôle visuel activable', 'Support par e-mail',
    ]);
    expect(lignesDroits(droitsDuForfait('agence'))[1]).toBe('20 concurrents suivis par marque');
  });
});
