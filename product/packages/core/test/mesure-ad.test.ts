import { describe, expect, it } from 'vitest';
import { texteAdModifie, sansMesure, CLES_MESURE_AD } from '../src/mesure-ad';

/**
 * S20 · une mesure ne vaut que pour le texte sur lequel elle a été calculée.
 * On vérifie le RÉSULTAT : changer un texte est détecté, réappliquer le même
 * ne l'est pas, et `sansMesure` retire exactement les clés de mesure sans
 * toucher au reste.
 */
describe('S20 · immuabilité de la mesure d’une pub', () => {
  const base = { headline: 'Offre du jour', cta: 'Acheter', subhead: '', kicker: undefined, badge: undefined, sceneUrl: 'x', jarvisScore: { score: 82 } };

  it('détecte un texte modifié', () => {
    expect(texteAdModifie(base, { ...base, headline: 'Nouvelle accroche' })).toBe(true);
    expect(texteAdModifie(base, { ...base, cta: 'Commander' })).toBe(true);
    expect(texteAdModifie(base, { ...base, badge: '-20 %' })).toBe(true);
  });

  it('ne signale rien quand le texte est identique (espaces compris)', () => {
    expect(texteAdModifie(base, { ...base })).toBe(false);
    expect(texteAdModifie(base, { ...base, headline: '  Offre du jour  ' })).toBe(false);
    // un champ absent et un champ vide sont le même « pas de texte »
    expect(texteAdModifie(base, { ...base, subhead: undefined })).toBe(false);
  });

  it('sansMesure retire toutes les clés de mesure et garde le reste', () => {
    const mesuree = { ...base, copieConforme: { resume: 'ok' }, produitFidele: true, ecartsProduit: ['a'], texteLisible: true, problemesLisibilite: [] };
    const propre = sansMesure(mesuree);
    for (const k of CLES_MESURE_AD) expect(propre, `${k} devrait avoir disparu`).not.toHaveProperty(k);
    expect(propre.headline).toBe('Offre du jour');
    expect(propre.sceneUrl).toBe('x');
    // l'original n'est pas muté (copie)
    expect(mesuree).toHaveProperty('jarvisScore');
  });
});
