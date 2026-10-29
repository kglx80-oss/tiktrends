import { describe, expect, it } from 'vitest';
import {
  BASCULE_FORFAIT_V2, DROITS_ACTUELS, DROITS_V2, RANG_FORFAIT, droitsDuForfait, lignesDroits, refusCloneVideo, refusDureeVideo,
  refusNouveauConcurrent, refusNouvelleMarque, forfaitDesDroits, forfaitQuiDebloque, messageLimiteConcurrents,
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
    expect(refusNouvelleMarque('essentiel', 1)).toBe('Ton forfait Essentiel inclut 1 marque. Le forfait Pro en ouvre 3 · change de forfait depuis Réglages · Forfaits.');
    expect(refusNouvelleMarque('pro', 2)).toBeNull();
    expect(refusNouvelleMarque('pro', 3)).toContain('3 marques');
    expect(refusNouveauConcurrent('pro', 4)).toBeNull();
    expect(refusNouveauConcurrent('pro', 5)).toBe('Ton forfait Pro suit 5 concurrents par marque. Le forfait Agence en suit 20 · change de forfait depuis Réglages · Forfaits.');
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

  it('le refus nomme le forfait qui débloque · et le plus grand forfait le dit honnêtement', () => {
    expect(refusNouvelleMarque('pro', 3)).toContain('Le forfait Agence en ouvre 20');
    expect(refusNouvelleMarque('agence', 20)).toBe('Ton forfait Agence inclut 20 marques. C’est le plus grand forfait · écris-nous depuis Support pour aller au-delà.');
    expect(refusDureeVideo('essentiel', 22_000)).toBe('Ton forfait Essentiel monte les vidéos jusqu’à 15 s, celle-ci en dure 22. Raccourcis le montage, ou passe au forfait Pro (30 s) · change de forfait depuis Réglages · Forfaits.');
    expect(refusDureeVideo('essentiel', 45_000)).toContain('passe au forfait Agence (60 s)');
    expect(refusDureeVideo('agence', 61_000)).toBe('Ton forfait Agence monte les vidéos jusqu’à 60 s, celle-ci en dure 61. Raccourcis le montage.');
    expect(refusCloneVideo('essentiel')).toBe('Le clone de pubs en vidéo est inclus dès le forfait Pro · ton forfait Essentiel clone en image. Pour la vidéo, change de forfait depuis Réglages · Forfaits.');
    expect(forfaitQuiDebloque('essentiel', (d) => d.cloneVideo)).toBe('pro');
    expect(messageLimiteConcurrents('essentiel')).toContain('Ton forfait Essentiel suit 1 concurrent par marque. Le forfait Pro en suit 5');
    expect(messageLimiteConcurrents('core')).toBeNull();
  });

  it('TARIFS_V2 absent · un forfait V2 se lit comme le forfait actuel qu’il remplace, aucune limite (comportement d’aujourd’hui)', () => {
    expect((['essentiel', 'pro', 'agence'] as const).map((k) => forfaitDesDroits(k, false))).toEqual(['core', 'plus', 'business']);
    expect((['essentiel', 'pro', 'agence'] as const).map((k) => forfaitDesDroits(k, true))).toEqual(['essentiel', 'pro', 'agence']);
    expect(forfaitDesDroits('plus', true)).toBe('plus');
    expect(forfaitDesDroits('inconnu', true)).toBe('starter');
    expect(refusNouvelleMarque(forfaitDesDroits('essentiel', false), 50)).toBeNull();
    expect(refusCloneVideo(forfaitDesDroits('essentiel', false))).toBeNull();
    expect(refusDureeVideo(forfaitDesDroits('essentiel', false), 90_000)).toBeNull();
    expect(refusNouvelleMarque(forfaitDesDroits('essentiel', true), 1)).not.toBeNull();
  });
});
